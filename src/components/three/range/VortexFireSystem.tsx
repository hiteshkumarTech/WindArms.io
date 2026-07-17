'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { WIND_WEAPONS } from '@shared/windWeapons';
import { clamp } from '@/lib/utils';
import { rangeLocalPose } from '@/lib/v2/range/localPose';
import { effectsBus, fireSignal, reloadSignal } from '@/lib/v2/range/effectsBus';
import type { RangeInputSnapshot } from '@/lib/v2/range/useRangeKeyboardInput';
import { playVortexDryFire, playVortexImpact, playVortexReload, playVortexShot, playVortexSpinDown } from '@/lib/v2/range/vortexAudio';
import { viewKick } from '@/lib/v2/range/viewKick';
import { damageAtDistance } from '@/lib/v2/weapons/vortexBallistics';
import { resolveWeaponState } from '@/lib/v2/weapons/vortexWeaponState';
import { useVortexWeaponStore } from '@/lib/v2/weapons/vortexWeaponStore';
import type { TargetUserData } from './RangeTargets';

const def = WIND_WEAPONS.vortex;
const rawStats = def.gameplayStats;
if (!rawStats?.rpm || !rawStats.rangeM || !rawStats.damage) {
  throw new Error('VortexFireSystem requires shared/windWeapons.ts vortex.gameplayStats to be fully populated (damage/rpm/rangeM/...)');
}
/**
 * Explicit non-undefined type (not just a narrowed runtime check) — TS
 * control-flow narrowing on a module-level `const` doesn't persist into the
 * closures below (useFrame/fire()), so `stats` needs its own static type
 * with `undefined` removed, not just a value that happens to be checked.
 */
type RequiredVortexStats = typeof rawStats & { rpm: number; rangeM: number; damage: number };
const stats = rawStats as RequiredVortexStats;

/** Muzzle offset from the eye, in view space — same convention as v1's WeaponSystem.tsx MUZZLE constant. */
const MUZZLE = { right: 0.22, down: 0.15, forward: 0.5 };
const EQUIP_MS = 600;
const INSPECT_MS = 1500;
const FIRING_POSE_MS = 90;
const RELOAD_KEY_BUFFER_MS = 150;
const INSPECT_KEY_BUFFER_MS = 150;

/**
 * Vortex Rifle fire system — headless (returns null), runs entirely in
 * useFrame, mirrors v1's `src/components/game/weapons/WeaponSystem.tsx`
 * (trigger gating, spread cone, local raycast for hit resolution, effects +
 * audio + recoil dispatch) with two real differences: (1) this scene has no
 * server, so the local raycast IS the authoritative hit decision, not a
 * cosmetic preview; (2) fire-rate isn't flat — RPM ramps from
 * `rpmSpinUpFrom` to `rpm` over `rpmSpinUpTimeS` of continuous trigger hold,
 * implementing the weapon's own documented "turbine spin-up" mechanic
 * literally instead of leaving it as marketing copy.
 */
export default function VortexFireSystem({ inputRef }: { inputRef: React.MutableRefObject<RangeInputSnapshot> }) {
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
  const equipStartedAt = useRef(performance.now());
  const lastReloadKeyHandled = useRef(-Infinity);
  const lastInspectKeyHandled = useRef(-Infinity);

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      if (!document.pointerLockElement) return;
      if (event.button === 0) {
        triggerHeld.current = true;
        triggerQueued.current = true;
      } else if (event.button === 2) {
        useVortexWeaponStore.getState().setAds(true);
      }
    };
    const onMouseUp = (event: MouseEvent) => {
      if (event.button === 0) triggerHeld.current = false;
      else if (event.button === 2) useVortexWeaponStore.getState().setAds(false);
    };
    const onContextMenu = (event: MouseEvent) => {
      if (document.pointerLockElement) event.preventDefault();
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('contextmenu', onContextMenu);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('contextmenu', onContextMenu);
    };
  }, []);

  useFrame(() => {
    const now = performance.now();
    const store = useVortexWeaponStore.getState();
    const hasControl = document.pointerLockElement !== null;
    const equipping = now - equipStartedAt.current < EQUIP_MS;

    if (store.reloadingUntil !== 0 && now >= store.reloadingUntil) {
      store.finishReload();
      reloadSignal.finishNonce += 1;
    }

    if (!hasControl) {
      triggerHeld.current = false;
      triggerQueued.current = false;
    }

    // Manual reload (R) — edge-triggered against the buffered press timestamp, consumed once.
    const input = inputRef.current;
    if (
      hasControl &&
      !equipping &&
      input.reloadPressedAt !== lastReloadKeyHandled.current &&
      now - input.reloadPressedAt < RELOAD_KEY_BUFFER_MS &&
      store.reloadingUntil === 0 &&
      store.ammo < (stats.magSize ?? 30)
    ) {
      lastReloadKeyHandled.current = input.reloadPressedAt;
      store.startReload(now + (stats.reloadTimeS ?? 2.2) * 1000);
      reloadSignal.startNonce += 1;
      playVortexReload();
    }

    // Inspect (F) — same edge-trigger idiom, blocked while reloading (mirrors v1's WeaponViewmodel gate).
    if (
      hasControl &&
      !equipping &&
      input.inspectPressedAt !== lastInspectKeyHandled.current &&
      now - input.inspectPressedAt < INSPECT_KEY_BUFFER_MS &&
      store.reloadingUntil === 0
    ) {
      lastInspectKeyHandled.current = input.inspectPressedAt;
      store.startInspect(now + INSPECT_MS);
    }

    // Turbine spin-up: ramps only while the trigger is continuously held and able to fire.
    const spinUpEligible = hasControl && triggerHeld.current && store.reloadingUntil === 0 && !equipping;
    if (spinUpEligible) {
      if (store.triggerHeldSince === 0) store.setTriggerHeldSince(now);
    } else if (store.triggerHeldSince !== 0) {
      if (now - store.triggerHeldSince > 250) playVortexSpinDown();
      store.setTriggerHeldSince(0);
    }
    const spinUpT =
      store.triggerHeldSince === 0 ? 0 : clamp((now - store.triggerHeldSince) / 1000 / (stats.rpmSpinUpTimeS ?? 1), 0, 1);
    const currentRpm = THREE.MathUtils.lerp(stats.rpmSpinUpFrom ?? stats.rpm ?? 600, stats.rpm ?? 600, spinUpT);
    const fireIntervalMs = 60000 / currentRpm;

    // --- Weapon animation state resolution -------------------------------
    const nextState = resolveWeaponState({
      equipped: !equipping,
      equipping,
      unequipping: false, // real path, never triggered in this single-weapon scene — see the Phase 4 report
      reloading: store.reloadingUntil !== 0,
      inspecting: now < store.inspectingUntil,
      firing: now - lastFireAt.current < FIRING_POSE_MS,
      ads: store.ads,
      sprinting: rangeLocalPose.state === 'sprint',
      moving: rangeLocalPose.horizontalSpeed > 0.5,
    });
    if (nextState !== store.animState) store.setAnimState(nextState);

    // --- Fire gating -------------------------------------------------------
    if (!hasControl || equipping) return;
    const wantsFire = triggerHeld.current || triggerQueued.current;
    if (!wantsFire) return;
    if (now - lastFireAt.current < fireIntervalMs) return;
    if (store.reloadingUntil !== 0) return;

    if (store.ammo <= 0) {
      triggerQueued.current = false;
      store.startReload(now + (stats.reloadTimeS ?? 2.2) * 1000);
      reloadSignal.startNonce += 1;
      playVortexDryFire();
      playVortexReload();
      return;
    }

    triggerQueued.current = false;
    lastFireAt.current = now;
    store.consumeRound();
    store.recordShot();
    fire(spinUpT);
  });

  function fire(spinUpT: number): void {
    const { forward, right, up, dir, muzzle, end, ejectPoint, ejectDir } = scratch;

    camera.getWorldDirection(forward);
    right.setFromMatrixColumn(camera.matrixWorld, 0);
    up.setFromMatrixColumn(camera.matrixWorld, 1);

    muzzle.copy(camera.position).addScaledVector(right, MUZZLE.right).addScaledVector(up, -MUZZLE.down).addScaledVector(forward, MUZZLE.forward);

    ejectPoint.copy(camera.position).addScaledVector(right, MUZZLE.right - 0.05).addScaledVector(up, -MUZZLE.down + 0.12).addScaledVector(forward, MUZZLE.forward - 0.35);
    ejectDir.copy(right).addScaledVector(up, 0.5).addScaledVector(forward, -0.3).normalize();
    effectsBus.spawnCasing({ at: [ejectPoint.x, ejectPoint.y, ejectPoint.z], dir: [ejectDir.x, ejectDir.y, ejectDir.z] });
    // Muzzle flash is rendered locally by VortexViewmodel (fireSignal-driven,
    // always screen-correct relative to the gun) — no world-space queue
    // needed since this is a single-player scene with no other viewers.

    const ads = useVortexWeaponStore.getState().ads;
    const spreadDeg = (stats.spreadDeg ?? 2) * (ads ? (stats.adsSpreadMultiplier ?? 1) : 1);
    const spreadTan = Math.tan((spreadDeg * Math.PI) / 180);
    const ox = (Math.random() + Math.random() - 1) * spreadTan;
    const oy = (Math.random() + Math.random() - 1) * spreadTan;
    dir.copy(forward).addScaledVector(right, ox).addScaledVector(up, oy).normalize();

    raycaster.set(camera.position, dir);
    // See v1's stability-fixes note (docs/versions/v1.md): THREE.Sprite.raycast()
    // dereferences raycaster.camera unconditionally — must be set before
    // intersecting a scene that contains any visible sprite (muzzle flash).
    raycaster.camera = camera;
    raycaster.far = stats.rangeM ?? 60;
    const hits = raycaster.intersectObjects(scene.children, true);

    if (hits.length > 0) {
      const hit = hits[0];
      end.copy(hit.point);
      effectsBus.spawnImpact({ at: [end.x, end.y, end.z], color: def.accent, normal: hit.face ? [hit.face.normal.x, hit.face.normal.y, hit.face.normal.z] : undefined });

      const targetData = findTargetUserData(hit.object);
      if (targetData) {
        const distance = camera.position.distanceTo(hit.point);
        const dmg = damageAtDistance(distance, {
          damage: stats.damage ?? 15,
          falloffStartM: stats.falloffStartM ?? distance,
          falloffEndM: stats.falloffEndM ?? distance,
          minDamageMultiplier: stats.minDamageMultiplier ?? 1,
        });
        targetData.hp -= dmg;
        targetData.hitFlashUntil = performance.now() + 90;
        const destroyed = targetData.hp <= 0 && targetData.destroyedAt === 0;
        if (destroyed) {
          targetData.isTarget = false;
          targetData.destroyedAt = performance.now();
        }
        useVortexWeaponStore.getState().recordHit(destroyed);
      }
      playVortexImpact();
    } else {
      end.copy(camera.position).addScaledVector(dir, stats.rangeM ?? 60);
    }

    effectsBus.spawnTracer({ from: [muzzle.x, muzzle.y, muzzle.z], to: [end.x, end.y, end.z], color: def.accent });

    viewKick.pitch += (stats.recoilVertical ?? 0.006) * (0.9 + Math.random() * 0.2);
    viewKick.yaw += (stats.recoilHorizontal ?? 0.006) * (Math.random() - 0.5) * 2;
    fireSignal.nonce += 1;
    playVortexShot(spinUpT);
  }

  return null;
}

/** Walks up from the raycast hit object to find the target root carrying `userData.isTarget` — RangeTargets sets this directly on the mesh, but intersectObjects can return nested children in general (not here, but this keeps the lookup honest). */
function findTargetUserData(object: THREE.Object3D): TargetUserData | null {
  let node: THREE.Object3D | null = object;
  while (node) {
    if (node.userData && (node.userData as TargetUserData).isTarget) return node.userData as TargetUserData;
    node = node.parent;
  }
  return null;
}
