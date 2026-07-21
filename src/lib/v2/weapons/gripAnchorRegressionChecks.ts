import * as THREE from 'three';
import { VORTEX_RUNTIME_ANCHORS } from './vortexRuntimeAnchors';

/**
 * Development-only defensive checks for the Vortex grip-anchor system
 * (Milestone 7, Phase F, Step 5/12). The Vortex source had a real,
 * previously-shipped axis regression (an inspector bug that misread the
 * model as Z-long instead of X-long — see docs/decisions.md 2026-07-17) —
 * this file exists so a FUTURE regression in that spirit (an edited
 * anchor constant, a rebuilt GLB with a different baked rotation, a
 * mis-ordered Euler) fails loudly in dev instead of silently producing
 * anatomically wrong grip targets that nobody notices until IK is built
 * on top of them.
 *
 * Every check here warns AT MOST ONCE per page load (module-level flags,
 * not per-frame) — this is explicitly required (Step 12: "warnings must
 * occur once, not every frame") and also just good hygiene: a per-frame
 * console.warn would make the dev console useless within a second.
 *
 * Never throws, never blocks production (every export here is a no-op
 * when `process.env.NODE_ENV === 'production'`), and never fails on tiny
 * tolerance differences — these are coarse "is this even in the right
 * universe" checks, not precision validation.
 */

const isDev = process.env.NODE_ENV !== 'production';
const warnedOnce = new Set<string>();

function warnOnce(key: string, message: string): void {
  if (!isDev || warnedOnce.has(key)) return;
  warnedOnce.add(key);
  console.warn(`[grip-anchor-check] ${message}`);
}

/**
 * Static (local-space, geometry-independent) sanity checks on the anchor
 * CONSTANTS themselves — cheap enough to run once at module load, doesn't
 * need a live scene/frame. Exported separately from the per-frame dynamic
 * checks below so tests can call it in isolation.
 */
export function checkStaticAnchorLayout(): void {
  const { muzzleLocal, gripHandLocal, gripSupportLocal } = VORTEX_RUNTIME_ANCHORS;

  // Model long axis / muzzle-forward convention: muzzle should sit near the
  // positive end of the documented 1.0m X-long bounds, not near zero or
  // negative — a flipped or mis-baked model would show up here immediately.
  if (!(muzzleLocal[0] > 0.3 && muzzleLocal[0] < 0.6)) {
    warnOnce('muzzle-x-range', `muzzleLocal.x=${muzzleLocal[0]} is outside the expected ~[0.3, 0.6] range for this model's confirmed 1.0m X-long bounds (docs/forge/vortex-rifle-v0.2.md) — model long axis or muzzle-forward convention may have regressed.`);
  }

  // Right (primary) grip must sit BEHIND the left (support) grip along the
  // weapon-forward axis — a real rifle's trigger hand is never forward of
  // its foregrip hand.
  if (!(gripHandLocal.position[0] < gripSupportLocal.position[0])) {
    warnOnce('grip-order', `gripHandLocal.x=${gripHandLocal.position[0]} is not behind gripSupportLocal.x=${gripSupportLocal.position[0]} — the primary grip should sit further from the muzzle than the support grip.`);
  }

  // Both grips must sit behind the muzzle.
  if (!(gripHandLocal.position[0] < muzzleLocal[0])) {
    warnOnce('grip-hand-behind-muzzle', `gripHandLocal.x=${gripHandLocal.position[0]} is not behind muzzleLocal.x=${muzzleLocal[0]}.`);
  }
  if (!(gripSupportLocal.position[0] < muzzleLocal[0])) {
    warnOnce('grip-support-behind-muzzle', `gripSupportLocal.x=${gripSupportLocal.position[0]} is not behind muzzleLocal.x=${muzzleLocal[0]}.`);
  }

  // Anchors should not sit at the exact model centre (0,0,0) — that's the
  // signature of a placeholder/never-measured value, not a real grip.
  const isNearOrigin = (p: readonly [number, number, number]) => Math.abs(p[0]) < 0.01 && Math.abs(p[1]) < 0.01 && Math.abs(p[2]) < 0.01;
  if (isNearOrigin(gripHandLocal.position)) warnOnce('grip-hand-at-origin', 'gripHandLocal.position is at/near the model origin — looks unmeasured.');
  if (isNearOrigin(gripSupportLocal.position)) warnOnce('grip-support-at-origin', 'gripSupportLocal.position is at/near the model origin — looks unmeasured.');

  // Anchors should not be identical to each other.
  const identical = gripHandLocal.position[0] === gripSupportLocal.position[0]
    && gripHandLocal.position[1] === gripSupportLocal.position[1]
    && gripHandLocal.position[2] === gripSupportLocal.position[2];
  if (identical) warnOnce('grips-identical', 'gripHandLocal and gripSupportLocal have identical positions — right/left hand targets must be distinct.');

  // Anchors should stay within (or very close to) the documented model
  // bounds (±0.5 x, ±0.135 y, ±0.07 z, per the 1.000 × 0.270 × 0.139 m
  // confirmed size) — generous margin (not a tight fit check) since a hand
  // target can reasonably sit just outside the mesh surface.
  const withinBounds = (p: readonly [number, number, number]) => Math.abs(p[0]) <= 0.6 && Math.abs(p[1]) <= 0.25 && Math.abs(p[2]) <= 0.15;
  if (!withinBounds(gripHandLocal.position)) warnOnce('grip-hand-bounds', `gripHandLocal.position=${JSON.stringify(gripHandLocal.position)} is well outside the model's confirmed bounds.`);
  if (!withinBounds(gripSupportLocal.position)) warnOnce('grip-support-bounds', `gripSupportLocal.position=${JSON.stringify(gripSupportLocal.position)} is well outside the model's confirmed bounds.`);
}

/**
 * Dynamic (per-frame-derived, but self-throttled to warn once) checks that
 * need live values only known at runtime — model scale, resolved world
 * positions, camera position. Call this from `VortexViewmodel.tsx`'s
 * useFrame; internally it's a no-op after the first violation of each
 * specific check, so the per-frame cost after warmup is a handful of
 * `Set.has` calls, not meaningful work.
 */
export function checkDynamicAnchorState(
  modelScale: number,
  rightWorldPosition: THREE.Vector3,
  leftWorldPosition: THREE.Vector3,
  cameraWorldPosition: THREE.Vector3,
): void {
  if (!isDev) return;

  if (!Number.isFinite(modelScale) || modelScale <= 0) {
    warnOnce('model-scale-invalid', `Model runtime scale is invalid (${modelScale}) — grip world positions will be wrong or non-finite.`);
    return;
  }

  const rightDistFromCamera = rightWorldPosition.distanceTo(cameraWorldPosition);
  const leftDistFromCamera = leftWorldPosition.distanceTo(cameraWorldPosition);
  // A first-person weapon's hand targets should sit within roughly arm's
  // reach of the camera — generous 3m ceiling catches a gross unit/scale
  // error (e.g. an anchor accidentally published in un-scaled model units)
  // without false-flagging normal viewmodel sway/recoil/ADS motion.
  if (rightDistFromCamera > 3) warnOnce('grip-hand-far-from-camera', `Right grip world position is ${rightDistFromCamera.toFixed(2)}m from the camera — expected within arm's reach for a first-person weapon.`);
  if (leftDistFromCamera > 3) warnOnce('grip-support-far-from-camera', `Left grip world position is ${leftDistFromCamera.toFixed(2)}m from the camera — expected within arm's reach for a first-person weapon.`);

  if (rightWorldPosition.distanceTo(leftWorldPosition) < 0.02) {
    warnOnce('grip-world-positions-coincide', 'Right and left grip world positions have collapsed to nearly the same point — check for a shared-scratch-object aliasing bug.');
  }
}

/** Test-only: clears the warned-once memory so tests can assert a warning fires. Not exported for production use. */
export function _resetWarnedOnceForTests(): void {
  warnedOnce.clear();
}
