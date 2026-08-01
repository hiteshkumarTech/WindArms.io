/**
 * Step 8E-E / Step 8F — the production shadow-caster ownership policy,
 * route-agnostic. One typed, source-controlled value PER ROUTE
 * (`RANGE_SHADOW_CASTER_POLICY`, `PLAY_SHADOW_CASTER_POLICY`); the smallest
 * possible rollback surface for either route independently. V1 `/play`
 * never imports this module — that absence, not a runtime check here, is
 * what keeps this policy V2-scoped (see this file's own regression test).
 *
 * Originally (Step 8E-E) this module only knew about `/v2/range`. Step 8F
 * generalized `resolveRangeShadowCasterDecision` into the route-agnostic
 * `resolveShadowCasterDecision` below — same exclusivity math, no route name
 * anywhere inside it — so `/v2/play` reuses the identical, already-tested
 * decision logic rather than a second copy. Every consumer (both routes'
 * `KaelFirstPersonArms.tsx` cast-shadow gate, both routes' scene caster-mount
 * decision) reads its OWN route's policy constant; the two can never
 * cross-affect each other since neither constant is derived from the other.
 *
 * ROLLBACK: change `RANGE_SHADOW_CASTER_POLICY` or `PLAY_SHADOW_CASTER_POLICY`
 * (independently) from `'full-body'` back to `'fp-arms'`. Nothing else needs
 * to change for that route — the previous production caster (`KaelFirstPersonArms.tsx`'s
 * own casting path) is never deleted, only conditionally disabled.
 */

export type ShadowCasterPolicy = 'fp-arms' | 'full-body';

/** `/v2/range`'s active production policy. Flip this one literal to roll back range alone. */
export const RANGE_SHADOW_CASTER_POLICY: ShadowCasterPolicy = 'full-body';
/** `/v2/play`'s active production policy. Flip this one literal to roll back play alone — independent of `RANGE_SHADOW_CASTER_POLICY`. */
export const PLAY_SHADOW_CASTER_POLICY: ShadowCasterPolicy = 'full-body';

const VALID_POLICIES: readonly ShadowCasterPolicy[] = ['fp-arms', 'full-body'];

export function isValidShadowCasterPolicy(value: unknown): value is ShadowCasterPolicy {
  return (VALID_POLICIES as readonly unknown[]).includes(value);
}

/**
 * Defensive resolution — falls back to `'fp-arms'` (the pre-rollout
 * production caster, never `'full-body'`) for any value that isn't a
 * recognized policy. Both policy constants above are themselves
 * compile-time-checked literals, so this can never actually receive an
 * invalid value from either — this function exists as defense in depth and
 * to give the fallback behavior a real, tested code path.
 */
export function resolveShadowCasterPolicy(value: unknown): ShadowCasterPolicy {
  return isValidShadowCasterPolicy(value) ? value : 'fp-arms';
}

/** The effective (validated) policy each route's consumers read. */
export const EFFECTIVE_RANGE_SHADOW_CASTER_POLICY: ShadowCasterPolicy = resolveShadowCasterPolicy(RANGE_SHADOW_CASTER_POLICY);
export const EFFECTIVE_PLAY_SHADOW_CASTER_POLICY: ShadowCasterPolicy = resolveShadowCasterPolicy(PLAY_SHADOW_CASTER_POLICY);

export interface ShadowCasterDecisionInput {
  policy: unknown;
  /**
   * Dev-only "force full-body regardless of policy" request, independent of
   * `policy` — range's `?shadow=1` (the standalone shadow-prototype flag,
   * for calibrating the full-body rig without touching the production
   * policy constant). Routes with no such debug concept (play, which has no
   * query-flag debug harness in this milestone) always pass `false`.
   */
  debugFullBodyRequested: boolean;
  /**
   * Dev-only request to activate the player-centered tracking controller
   * without necessarily switching production caster ownership — range's
   * `?shadow=1&shadowReview=1` review harness (lets the frustum be previewed
   * even while `policy` is `'fp-arms'`). Routes with no review UI (play)
   * always pass `false`.
   */
  debugControllerRequested: boolean;
}

export interface ShadowCasterDecision {
  /** The route's visible FP-arms mesh `castShadow` value. */
  fpArmsCastShadow: boolean;
  /** Whether the shared `KaelFirstPersonShadowBody`/`KaelFirstPersonShadowWeapon` should be mounted (shared mount site across every route — never two). */
  fullBodyCasterActive: boolean;
  /** Whether `KaelPlayerCenteredShadowController` should be mounted. */
  playerCenteredControllerActive: boolean;
}

/**
 * The single source of truth for exclusive shadow-caster ownership, shared
 * by every route. Pure function, no route name inside it — each scene calls
 * this once per render with its OWN policy + debug-flag inputs and mounts
 * from the result, rather than duplicating this boolean logic inline.
 * Exhaustively verified (own test file) to never produce
 * `fpArmsCastShadow && fullBodyCasterActive` both true, and never both
 * false, for any input combination — the one invariant this exists to
 * guarantee, for every route that calls it.
 */
export function resolveShadowCasterDecision(input: ShadowCasterDecisionInput): ShadowCasterDecision {
  const policy = resolveShadowCasterPolicy(input.policy);
  const fullBodyCasterActive = input.debugFullBodyRequested || policy === 'full-body';
  return {
    fpArmsCastShadow: !input.debugFullBodyRequested && policy !== 'full-body',
    fullBodyCasterActive,
    playerCenteredControllerActive: input.debugControllerRequested || policy === 'full-body',
  };
}
