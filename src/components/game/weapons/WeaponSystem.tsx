'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { Vec3, WeaponId } from '@shared/protocol';
import { WEAPONS, WEAPON_ORDER, fireIntervalMs } from '@shared/weapons';
import { audio } from '@/lib/audio/audioEngine';
import { effectsBus, fireSignal, viewKick } from '@/lib/game/effectsBus';
import { surfaceOf } from '@/lib/game/surfaces';
import { getSocket } from '@/lib/network/socket';
import { useChatStore } from '@/stores/chatStore';
import { useCombatStore } from '@/stores/combatStore';
import { useGraphicsStore } from '@/stores/graphicsStore';
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
      ejectPoint: new THREE.Vector3(),
      ejectDir: new THREE.Vector3(),
    }),
    [],
  );

  const triggerHeld = useRef(false);
  const triggerQueued = useRef(false);
  const lastFireAt = useRef(0);
  const fireSeq = useRef(0);
  /** Builds on auto-weapon shots, decays when not firing — gates the heat-shimmer VFX to sustained fire only. */
  const heat = useRef(0);

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
          audio.reload();
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

  useFrame((_, delta) => {
    const now = performance.now();
    // Decays every frame regardless of fire state, so heat-shimmer only
    // builds during genuinely sustained fire and fades quickly once it stops.
    heat.current = Math.max(0, heat.current - delta * 2.5);
    const weaponState = useWeaponStore.getState();
    const def = WEAPONS[weaponState.current];

    // Complete a finished reload.
    if (weaponState.reloadingUntil !== 0 && now >= weaponState.reloadingUntil) {
      weaponState.finishReload();
    }

    const session = useMultiplayerStore.getState();
    const inIntermission = session.mode === 'online' && session.matchPhase !== 'playing';
    if (
      !document.pointerLockElement ||
      !useCombatStore.getState().alive ||
      useChatStore.getState().open ||
      inIntermission
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
      audio.dryFire();
      audio.reload();
      return;
    }

    triggerQueued.current = false;
    lastFireAt.current = now;
    weaponState.consumeRound();
    fire(def.id);
  });

  function fire(weaponId: WeaponId): void {
    const def = WEAPONS[weaponId];
    const { forward, right, up, dir, muzzle, end, ejectPoint, ejectDir } = scratch;

    camera.getWorldDirection(forward);
    right.setFromMatrixColumn(camera.matrixWorld, 0);
    up.setFromMatrixColumn(camera.matrixWorld, 1);

    muzzle
      .copy(camera.position)
      .addScaledVector(right, MUZZLE.right)
      .addScaledVector(up, -MUZZLE.down)
      .addScaledVector(forward, MUZZLE.forward);

    // Shell casing: one per trigger pull (not per pellet), ejected up and
    // back from the receiver. The energy weapon vents instead of ejecting.
    if (weaponId !== 'energy') {
      ejectPoint
        .copy(camera.position)
        .addScaledVector(right, MUZZLE.right - 0.05)
        .addScaledVector(up, -MUZZLE.down + 0.14)
        .addScaledVector(forward, MUZZLE.forward - 0.4);
      ejectDir.copy(right).addScaledVector(up, 0.55).addScaledVector(forward, -0.35).normalize();
      effectsBus.spawnCasing({
        at: [ejectPoint.x, ejectPoint.y, ejectPoint.z],
        dir: [ejectDir.x, ejectDir.y, ejectDir.z],
        color: weaponId === 'shotgun' ? '#e2793a' : '#d9b563',
      });
    }
    // Muzzle smoke: also once per trigger pull, not per pellet.
    effectsBus.spawnMuzzleSmoke({ at: [muzzle.x, muzzle.y, muzzle.z], energy: weaponId === 'energy' });

    // Heat shimmer only builds on auto weapons and only shows once the barrel's
    // genuinely hot (a few consecutive shots) — see the per-frame decay above.
    // HeatDistortionPool (the only consumer of this queue) only mounts at
    // 'high' quality — gate the producer the same way, or every shot fired
    // at 'low' quality pushes a request nothing will ever drain, growing the
    // queue without bound for the rest of the session.
    if (def.auto) {
      heat.current = Math.min(heat.current + 1, 10);
      if (heat.current >= 3 && useGraphicsStore.getState().quality === 'high') {
        effectsBus.spawnHeatShimmer({ at: [muzzle.x, muzzle.y, muzzle.z], energy: weaponId === 'energy' });
      }
    }

    const spreadTan = Math.tan((def.spreadDeg * Math.PI) / 180);
    const origin: Vec3 = [camera.position.x, camera.position.y, camera.position.z];
    const directions: Vec3[] = [];
    const isEnergy = weaponId === 'energy';
    // One impact sound per trigger pull — a shotgun's 8 pellets shouldn't
    // stack 8 overlapping thunks into a wall of noise.
    let impactSoundPlayed = false;

    for (let pellet = 0; pellet < def.pellets; pellet++) {
      // Triangular-ish distribution biases pellets toward the center.
      const ox = (Math.random() + Math.random() - 1) * spreadTan;
      const oy = (Math.random() + Math.random() - 1) * spreadTan;
      dir.copy(forward).addScaledVector(right, ox).addScaledVector(up, oy).normalize();
      directions.push([dir.x, dir.y, dir.z]);

      // Local raycast for the tracer endpoint (visuals only — server decides damage).
      raycaster.set(camera.position, dir);
      // THREE.Sprite.raycast() dereferences raycaster.camera unconditionally — if it's
      // never set, intersecting a scene that contains ANY visible sprite (muzzle smoke,
      // impact sparks, damage numbers) throws. That throw aborts fire() before it ever
      // reaches audio.shot() below, and — since R3F's frame loop runs every useFrame
      // subscriber in one uncaught loop before calling gl.render() — also skips that
      // frame's render entirely, which is why sustained fire could make weapon audio
      // and on-screen motion (weather included) both drop out together.
      raycaster.camera = camera;
      raycaster.far = def.range;
      const hits = raycaster.intersectObjects(scene.children, true);
      if (hits.length > 0) {
        end.copy(hits[0].point);
        const surface = surfaceOf(hits[0].object);
        effectsBus.spawnImpact({
          at: [end.x, end.y, end.z],
          color: def.tracerColor,
          surface: surface ?? undefined,
          energy: isEnergy,
        });
        if (!impactSoundPlayed && surface && surface !== 'player') {
          audio.impact(isEnergy ? 'energy' : surface);
          impactSoundPlayed = true;
        }
      } else {
        end.copy(camera.position).addScaledVector(dir, def.range);
      }
      effectsBus.spawnTracer({
        from: [muzzle.x, muzzle.y, muzzle.z],
        to: [end.x, end.y, end.z],
        energy: isEnergy,
        color: def.tracerColor,
      });
    }

    // Recoil + viewmodel + audio feedback.
    viewKick.pitch += def.recoil.vertical * (0.9 + Math.random() * 0.2);
    viewKick.yaw += def.recoil.horizontal * (Math.random() - 0.5) * 2;
    fireSignal.nonce += 1;
    audio.shot(weaponId);

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
