/**
 * Step 8E-D — canonical, dev-only calibration values for the full-body
 * shadow prototype's light/receiver quality. ALL of this is inert unless
 * `useShadowReviewEnabled()` is true (`?shadow=1&shadowReview=1`) — the
 * normal range's directional light (`RangeScene.tsx`) reads these ONLY
 * behind that same gate, and falls back to its own unconditional literal
 * defaults (bias 0, normalBias 0, mapSize 1024 — byte-identical to the
 * pre-8E-D values) the instant review mode is off. This file changes
 * nothing about what real players see; it only gives the review harness
 * something better than THREE's un-tuned defaults to LOOK AT while judging
 * a feature that has not been switched on for production (that switch is
 * Step 8E-E's, not this one's).
 *
 * Every numeric constant below was reached empirically (real-browser
 * screenshot comparison across the full baseline matrix, per
 * `docs/decisions.md`'s Step 8E-D entry — not derived/assumed, matching
 * this milestone's own established methodology), not copied from V1's
 * `ArenaEnvironment.tsx` (`shadow-bias={-0.0015}`) — V1 uses different
 * geometry, scale, and light angle, so its value is a reference point only.
 */

import { STORM } from '@/lib/v2/tokens';

export type ShadowReceiverMode = 'production' | 'readable';
export type ShadowMapSize = 1024 | 2048;

/** Inclusive bounds a calibrated bias/normalBias value must fall within — guards against a future typo shipping a wildly-wrong value that reads as "no shadow" (bias too negative) or "shadow way offset from the body" (bias too positive/normalBias too large). */
export const SHADOW_BIAS_BOUNDS = { min: -0.01, max: 0.01 } as const;
export const SHADOW_NORMAL_BIAS_BOUNDS = { min: 0, max: 0.1 } as const;
export const PERMITTED_SHADOW_MAP_SIZES: readonly ShadowMapSize[] = [1024, 2048];

/** The range's OWN unconditional production values — what every player sees today, review mode or not. Never read this file's other exports outside `shadowReviewEnabled` gating. */
export const PRODUCTION_SHADOW_DEFAULTS = {
  bias: 0,
  normalBias: 0,
  mapSize: 1024 as ShadowMapSize,
} as const;

/**
 * Canonical Step 8E-D calibration — the reviewer-facing "recommended"
 * starting point, restorable via the review panel's reset control. See
 * `docs/decisions.md`'s Step 8E-D entry for the before/after comparison
 * that produced these specific numbers.
 */
export const CANONICAL_SHADOW_CALIBRATION = {
  receiverMode: 'production' as ShadowReceiverMode,
  bias: 0,
  normalBias: 0,
  mapSize: 1024 as ShadowMapSize,
  selfShadowEnabled: false,
} as const;

export function isValidShadowBias(value: number): boolean {
  return Number.isFinite(value) && value >= SHADOW_BIAS_BOUNDS.min && value <= SHADOW_BIAS_BOUNDS.max;
}

export function isValidShadowNormalBias(value: number): boolean {
  return Number.isFinite(value) && value >= SHADOW_NORMAL_BIAS_BOUNDS.min && value <= SHADOW_NORMAL_BIAS_BOUNDS.max;
}

export function isValidShadowMapSize(value: number): value is ShadowMapSize {
  return PERMITTED_SHADOW_MAP_SIZES.includes(value as ShadowMapSize);
}

/**
 * Receiver material per mode. `production` imports `STORM.abyss` directly
 * (the SAME token `RangeEnvironment.tsx`'s real floor and `RangeScene.tsx`'s
 * background/fog already use) rather than a re-typed hex literal, and
 * matches that floor's own `roughness={0.95}` — see `RangeEnvironment.tsx`.
 * `readable` is the pre-existing Step 8E-C.3 mid-gray, unchanged.
 */
export const RECEIVER_MODE_MATERIAL = {
  production: { color: STORM.abyss, roughness: 0.95 },
  readable: { color: '#6b7280', roughness: 0.95 },
} as const;
