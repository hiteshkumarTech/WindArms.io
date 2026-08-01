import type { ShadowFrustumConfig } from '@/lib/v2/operators/playerCenteredShadowFrustum';

/**
 * Step 8F — `/v2/play`'s own shadow-camera geometry. Mirrors
 * `rangeEnvironmentBounds.ts` (static bounds) and `playerCenteredShadowFrustum.ts`
 * (`PLAYER_CENTERED_SHADOW_FRUSTUM_CONFIG`/`STATIC_FULL_FLOOR_SHADOW_FRUSTUM_CONFIG`)
 * — same `ShadowFrustumConfig` shape, reused unmodified rather than a second
 * type with duplicated `left`/`right`/`top`/`bottom` fields that would need
 * to be hand-kept in sync with `width`/`height` (those four are DERIVED from
 * width/height, exactly as `KaelPlayerCenteredShadowController.tsx`'s own
 * `applyFrustumBounds` already computes them for range).
 *
 * Every numeric value below is measured, not estimated — see Step 8F.0's
 * measurement report (`docs/decisions.md`'s Step 8F.0 entry) for the full
 * per-frame light-space analysis across 140 captured frames spanning normal
 * movement, combat, Wind Lift's complete arc, death/respawn/restart, and
 * pause/resume. Do not change these values without new measured evidence —
 * see this file's own test, which pins every one of them against the actual
 * Step 8F.0 measured worst cases.
 */

/** Play's directional light — confirmed live from the mounted Canvas during Step 8F.0, unchanged by this rollout. */
export const PLAY_SHADOW_LIGHT_POSITION: readonly [number, number, number] = [16, 26, 10];
/** Play's light target — world origin, same as range's canonical target. */
export const PLAY_SHADOW_LIGHT_TARGET: readonly [number, number, number] = [0, 0, 0];

/**
 * Play's pre-existing static full-floor fallback — byte-identical to the
 * `directionalLight` JSX literals `V2PlayScene.tsx` shipped with before this
 * pass (`±30`/`near=1`/`far=80`/`2048²`), now named here instead of
 * duplicated inline, so this is the ONE place either the static JSX
 * literal (rollback state) or `KaelPlayerCenteredShadowController`'s
 * static-mode restoration reads. This is the rollback target: when
 * `PLAY_SHADOW_CASTER_POLICY` is `'fp-arms'`, this is the ONLY shadow
 * configuration `/v2/play` ever uses.
 */
export const PLAY_STATIC_SHADOW_CONFIG: ShadowFrustumConfig = {
  width: 60,
  height: 60,
  mapWidth: 2048,
  mapHeight: 2048,
  near: 1,
  far: 80,
};

/**
 * Play's player-centered configuration — the Step 8F.0-measured candidate.
 * Global worst case across all 140 measured frames: width 2.557m (Wind Lift
 * rise), height 9.427m (Wind Lift rise), near floor 25.916 (restart settle),
 * far ceiling 42.043 (Wind Lift apex). This rectangle carries ~0.94m width /
 * ~2.57m height / ~1.9 near / ~1.96 far margin over those measured worst
 * cases — see `playShadowFrustumConfig.test.ts`.
 *
 * Deliberately NOT range's own `3.5 × 6 / near 20 / far 27` — play's light-
 * to-target geometry and Wind Lift's ~10.6m body-mesh elevation both differ
 * measurably from range (Step 8F's own audit finding, confirmed by Step
 * 8F.0's real measurement). Vertical texel density is ~2× coarser than
 * range's as a result (12m/1024 ≈ 11.719mm vs range's 6m/1024 ≈ 5.859mm) —
 * an accepted, disclosed tradeoff of covering Wind Lift with one static
 * frustum rather than a per-state resize.
 */
export const PLAY_PLAYER_CENTERED_SHADOW_CONFIG: ShadowFrustumConfig = {
  width: 3.5,
  height: 12,
  mapWidth: 1024,
  mapHeight: 1024,
  near: 24,
  far: 44,
};

/**
 * Fixed world Y the ground anchor tracks at — same convention as range
 * (`GROUND_ANCHOR_FIXED_Y`, `KaelPlayerCenteredShadowController.tsx`'s own
 * doc comment): the player's live/airborne Y is never used, so Wind Lift's
 * ~10.6m rise never drags the light rig vertically — the taller
 * `PLAY_PLAYER_CENTERED_SHADOW_CONFIG` frustum absorbs that elevation
 * instead. Matches play's `MAIN_DECK` top surface Y (`spawnConfig.ts`) and
 * the light's own implicit target Y.
 */
export const PLAY_GROUND_ANCHOR_Y = 0;
