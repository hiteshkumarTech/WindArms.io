'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { Vec3, WeaponId } from '@shared/protocol';
import { WEAPONS, WEAPON_ORDER, fireIntervalMs } from '@shared/weapons';
import { effectsBus, fireSignal, viewKick } from '@/lib/game/effectsBus';
import { getSocket } from '@/lib/network/socket';
import { useChatStore } from '@/stores/chatStore';
import { useCombatStore } from '@/stores/combatStore';
import { useMultiplayerStore } from '@/stores/multiplayerStore';
import { useWeaponStore } from '@/stores/weaponStore';

/** Muzzle offset from the eye, in view space (matches the viewmodel). */
const MUZZLE = { right: 0.26, down: 0.16, forward: 0.6 };

/**
 * Firing logic: trigger input, fire-rate gating, spread, ammo and reload,
 * weapon switching (Digit1–7, wheel, R). Shots raycast the visible scene
 * for tracer endpoints (instant local feedback), while the authoritative
 * hit decision comes from the server via `combat:fire` → `combat:hit`.
 * Runs entirely in the frame loop — this component never re-renders.
 */
export default function WeaponSystem() {
  const camera = useThree((state) => state.camera);
  const scene = useThree((state) => state.scene);

  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const scratch = useMemo(
    () => ({
      forward: new THREE.Vector3(),
      right: new THREE.Vector3(),
      up: new THREE.Vector3(),
      dir: new THREE.Vector3(),
      muzzle: new THREE.Vector3(),
      end: new THREE.Vector3(),
    }),
    [],
  );

  const triggerHeld = useRef(false);
  const triggerQueued = useRef(false);
  const lastFireAt = useRef(0);
  const fireSeq = useRef(0);

  // Input bindings (active only while the pointer is captured).
  useEffect(() => {
    const store = useWeaponStore;

    const onMouseDown = (event: MouseEvent) => {
      if (!document.pointerLockElement || event.button !== 0) return;
      if (useChatStore.getState().open) return;
      triggerHeld.current = true;
      triggerQueued.current = true;
    };
    const onMouseUp = (event: MouseEvent) => {
      if (event.button === 0) triggerHeld.current = false;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!document.pointerLockElement || event.repeat) return;
      if (useChatStore.getState().open) return;
      if (event.code.startsWith('Digit')) {
        const slot = Number(event.code.slice(5));
        const weapon = WEAPON_ORDER.find((id) => WEAPONS[id].slot === slot);
        if (weapon) store.getState().switchWeapon(weapon);
        return;
      }
      if (event.code === 'KeyR') {
        const { current, mags, reloadingUntil } = store.getState();
        const def = WEAPONS[current];
        if (reloadingUntil === 0 && mags[current] < def.magSize) {
          store.getState().startReload(performance.now() + def.reloadTimeS * 1000);
        }
      }
    };
    const onWheel = (event: WheelEvent) => {
      if (!document.pointerLockElement) return;
      if (useChatStore.getState().open) return;
      store.getState().cycleWeapon(event.deltaY > 0 ? 1 : -1);
    };

    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mouseup', onMouseUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('wheel', onWheel);
    };
  }, []);

  useFrame(() => {
    const now = performance.now();
    const weaponState = useWeaponStore.getState();
    const def = WEAPONS[weaponState.current];

    // Complete a finished reload.
    if (weaponState.reloadingUntil !== 0 && now >= weaponState.reloadingUntil) {
      weaponState.finishReload();
    }

    if (
      !document.pointerLockElement ||
      !useCombatStore.getState().alive ||
      useChatStore.getState().open
    ) {
      triggerHeld.current = false;
      triggerQueued.current = false;
      return;
    }

    const wantsFire = def.auto ? triggerHeld.current : triggerQueued.current;
    if (!wantsFire) return;
    if (now - lastFireAt.current < fireIntervalMs(def)) return;
    if (weaponState.reloadingUntil !== 0) return;

    const ammo = weaponState.mags[weaponState.current];
    if (ammo <= 0) {
      // Dry trigger: auto-reload instead of firing.
      triggerQueued.current = false;
      weaponState.startReload(now + def.reloadTimeS * 1000);
      return;
    }

    triggerQueued.current = false;
    lastFireAt.current = now;
    weaponState.consumeRound();
    fire(def.id);
  });

  function fire(weaponId: WeaponId): void {
    const def = WEAPONS[weaponId];
    const { forward, right, up, dir, muzzle, end } = scratch;

    camera.getWorldDirection(forward);
    right.setFromMatrixColumn(camera.matrixWorld, 0);
    up.setFromMatrixColumn(camera.matrixWorld, 1);

    muzzle
      .copy(camera.position)
      .addScaledVector(right, MUZZLE.right)
      .addScaledVector(up, -MUZZLE.down)
      .addScaledVector(forward, MUZZLE.forward);

    const spreadTan = Math.tan((def.spreadDeg * Math.PI) / 180);
    const origin: Vec3 = [camera.position.x, camera.position.y, camera.position.z];
    const directions: Vec3[] = [];

    for (let pellet = 0; pellet < def.pellets; pellet++) {
      // Triangular-ish distribution biases pellets toward the center.
      const ox = (Math.random() + Math.random() - 1) * spreadTan;
      const oy = (Math.random() + Math.random() - 1) * spreadTan;
      dir.copy(forward).addScaledVector(right, ox).addScaledVector(up, oy).normalize();
      directions.push([dir.x, dir.y, dir.z]);

      // Local raycast for the tracer endpoint (visuals only — server decides damage).
      raycaster.set(camera.position, dir);
      raycaster.far = def.range;
      const hits = raycaster.intersectObjects(scene.children, true);
      if (hits.length > 0) {
        end.copy(hits[0].point);
        effectsBus.spawnImpact({ at: [end.x, end.y, end.z], color: def.tracerColor });
      } else {
        end.copy(camera.position).addScaledVector(dir, def.range);
      }
      effectsBus.spawnTracer({
        from: [muzzle.x, muzzle.y, muzzle.z],
        to: [end.x, end.y, end.z],
        color: def.tracerColor,
      });
    }

    // Recoil + viewmodel feedback.
    viewKick.pitch += def.recoil.vertical * (0.9 + Math.random() * 0.2);
    viewKick.yaw += def.recoil.horizontal * (Math.random() - 0.5) * 2;
    fireSignal.nonce += 1;

    // Report to the authoritative server when in an online match.
    const session = useMultiplayerStore.getState();
    if (session.mode === 'online' && session.status === 'connected') {
      getSocket().emit('combat:fire', {
        seq: fireSeq.current++,
        weapon: weaponId,
        origin,
        directions,
      });
    }
  }

  return null;
}
