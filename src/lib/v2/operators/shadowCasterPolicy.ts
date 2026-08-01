/**
 * Step 8E-E — the production shadow-caster ownership policy for
 * `/v2/range`. One typed, source-controlled value; the smallest possible
 * rollback surface. `/v2/play` and V1 `/play` never import this module —
 * that absence, not a runtime check here, is what keeps this policy
 * route-scoped (see `RangeScene.tsx`'s own mount-site comment and this
 * file's own regression test asserting neither play scene references it).
 *
 * ROLLBACK: change `RANGE_SHADOW_CASTER_POLICY`'s value from `'full-body'`
 * back to `'fp-arms'`. Nothing else needs to change — every consumer reads
 * this one constant (`KaelFirstPersonArms.tsx`'s cast-shadow gate,
 * `RangeScene.tsx`'s caster-mount decision), and the previous production
 * caster (`KaelFirstPersonArms.tsx`'s own casting path) is never deleted,
 * only conditionally disabled — see `docs/decisions.md`'s Step 8E-E entry.
 */

export type RangeShadowCasterPolicy = 'fp-arms' | 'full-body';

/** The active production policy. Flip this one literal to roll back. */
export const RANGE_SHADOW_CASTER_POLICY: RangeShadowCasterPolicy = 'full-body';

const VALID_POLICIES: readonly RangeShadowCasterPolicy[] = ['fp-arms', 'full-body'];

export function isValidRangeShadowCasterPolicy(value: unknown): value is RangeShadowCasterPolicy {
  return (VALID_POLICIES as readonly unknown[]).includes(value);
}

/**
 * Defensive resolution — falls back to `'fp-arms'` (the pre-8E-E production
 * caster, never `'full-body'`) for any value that isn't a recognized
 * policy. `RANGE_SHADOW_CASTER_POLICY` is itself a compile-time-checked
 * literal, so this can never actually receive an invalid value from that
 * constant — this function exists as defense in depth and to give the
 * fallback behavior a real, tested code path, per this milestone's own
 * "invalid values fail safely" requirement.
 */
export function resolveRangeShadowCasterPolicy(value: unknown): RangeShadowCasterPolicy {
  return isValidRangeShadowCasterPolicy(value) ? value : 'fp-arms';
}

/** The effective, validated policy every consumer reads. */
export const EFFECTIVE_RANGE_SHADOW_CASTER_POLICY: RangeShadowCasterPolicy = resolveRangeShadowCasterPolicy(RANGE_SHADOW_CASTER_POLICY);

export interface RangeShadowCasterDecisionInput {
  /** `useShadowDebugEnabled()` — `?shadow=1`. */
  shadowDebugEnabled: boolean;
  /** `useShadowReviewEnabled()` — `?shadow=1&shadowReview=1`. */
  shadowReviewEnabled: boolean;
  policy: RangeShadowCasterPolicy;
}

export interface RangeShadowCasterDecision {
  /** `KaelFirstPersonArms.tsx`'s mesh `castShadow` value. */
  fpArmsCastShadow: boolean;
  /** Whether `KaelFirstPersonShadowBody`/`KaelFirstPersonShadowWeapon` should be mounted (shared mount site — never two). */
  fullBodyCasterActive: boolean;
  /** Whether `KaelPlayerCenteredShadowController` should be mounted. */
  playerCenteredControllerActive: boolean;
}

/**
 * The single source of truth for exclusive shadow-caster ownership in
 * `/v2/range`. Pure function — `RangeScene.tsx` calls this once per render
 * and mounts from its result, rather than duplicating this boolean logic
 * inline across three separate JSX conditionals. Exhaustively verified
 * (own test file) to never produce `fpArmsCastShadow && fullBodyCasterActive`
 * both true for any input combination — the one invariant this milestone
 * exists to guarantee.
 */
export function resolveRangeShadowCasterDecision(input: RangeShadowCasterDecisionInput): RangeShadowCasterDecision {
  const fullBodyCasterActive = input.shadowDebugEnabled || input.policy === 'full-body';
  return {
    fpArmsCastShadow: !input.shadowDebugEnabled && input.policy !== 'full-body',
    fullBodyCasterActive,
    playerCenteredControllerActive: input.shadowReviewEnabled || input.policy === 'full-body',
  };
}
