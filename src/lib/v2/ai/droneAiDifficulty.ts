import { resolveDroneConfig, type ResolvedDroneConfig, type TrialDifficulty } from '../play/difficulty';
import { DRONE } from '../play/enemyConfig';
import { DRONE_PERCEPTION_MEMORY } from './droneAiPerception';

/**
 * Milestone 9E — typed, per-difficulty combat-cadence profile. EXTENDS
 * `ResolvedDroneConfig` (`lib/v2/play/difficulty.ts`'s own resolved-stats
 * shape — HP/damage/fire-interval/aim-spread/bolt-speed/movement speeds),
 * never duplicates it: `resolveDroneAiDifficultyProfile()` below always
 * starts from `resolveDroneConfig()`'s own output and only ADDS the three
 * new fields this phase introduces. `TrialDifficulty`/`TRIAL_DIFFICULTIES`
 * (the actual multiplier table) stay owned entirely by `difficulty.ts` — this
 * module never restates a multiplier or a base `DRONE` constant, it only
 * reuses them.
 *
 * WHY A SEPARATE MODULE, NOT AN EDIT TO `difficulty.ts`: `difficulty.ts` is
 * explicitly protected/shared (matchStore, the HUD, and every non-AI
 * consumer resolve combat numbers through it) and lives outside `lib/v2/ai/`
 * — the pure drone-AI core's own package. Keeping the AI-specific cadence
 * numbers (reaction delay, memory duration, windup) in `lib/v2/ai/` alongside
 * `droneAiStateMachine.ts`/`droneAiPerception.ts` (which already consume
 * them) avoids adding an AI-flavoured field to a file every other v2 system
 * also depends on.
 *
 * THREE NEW FIELDS, each difficulty-tuned within a deliberately bounded range
 * (values chosen the same way `DRONE_PERCEPTION_MEMORY` and
 * `DRONE_LOCAL_SEPARATION` were: picked once, documented, never silently
 * re-tuned):
 *
 * - `acquireReactionDelayMs` — how long, after a GENUINE acquisition
 *   (`searching`→`engaging` or `investigating`→`engaging` — never a
 *   re-engagement from `attacking`, see `droneAiStateMachine.ts`'s own
 *   `reactionReadyAtMs` handling), a drone must wait before it is even
 *   ELIGIBLE to start its first windup. Medium is 0ms — BYTE-IDENTICAL to
 *   every tick's cadence before this phase, since `now >= reactionReadyAtMs`
 *   is trivially true the instant `reactionReadyAtMs` is seeded at
 *   `now + 0`. Low is 350ms — long enough to read as a deliberate,
 *   noticeable hesitation (comfortably longer than one rendered frame, short
 *   enough that it never feels broken/unresponsive) without touching
 *   `fireIntervalMs`/`windupMs`/movement at all. Max is 0ms — "no slower
 *   than Medium," and there is no meaningful way to react FASTER than
 *   immediately, so Max simply matches Medium's already-immediate cadence
 *   here; Max's own differentiation comes entirely from `targetMemoryDurationMs`
 *   below (more persistent, not twitchier).
 * - `targetMemoryDurationMs` — replaces the flat, pre-9E
 *   `DRONE_PERCEPTION_MEMORY.investigateDurationMs` constant as the actual
 *   value `droneAiStateMachine.ts` uses for `investigateUntilMs`. Medium
 *   REUSES `DRONE_PERCEPTION_MEMORY.investigateDurationMs` directly (still
 *   exactly 4500ms — see that module's own doc comment for the full
 *   measurement/reasoning behind that number) rather than restating the
 *   literal `4500` a second time, guaranteeing the two can never silently
 *   drift apart. Low (3500ms) and Max (5250ms) are new per-difficulty
 *   literals within this phase's own allowed ranges (3000-4000ms /
 *   5000-5500ms) — Low gives up on a lost target sooner (less persistent,
 *   matches "hesitates more and forgets sooner"), Max holds on noticeably
 *   longer (more persistent) without becoming permanently omniscient (memory
 *   still always expires).
 * - `attackWindupMs` — ALWAYS exactly `DRONE.WINDUP_MS` (650ms), for every
 *   difficulty, with no exception. This is an absolute rule (not a
 *   candidate/tunable value like the two above): the pre-shot telegraph must
 *   stay equally readable and dodgeable regardless of difficulty, so
 *   difficulty is never allowed to shorten it (harder) or lengthen it
 *   (easier). Reused directly from `DRONE.WINDUP_MS`, never restated as a
 *   second `650` literal, for the same "single source of truth" reason as
 *   `targetMemoryDurationMs` above.
 *
 * `attackWindupMs`'s presence here (duplicated in SHAPE, not value, across
 * every tier) is deliberate: the brief that introduced this module asked for
 * it explicitly, specifically so a consumer holding one `DroneAiDifficultyProfile`
 * never needs a second lookup or an "is this the windup-invariant one"
 * special case — every combat-cadence number a drone needs lives on the one
 * object `DroneSquad.tsx` resolves once and passes down.
 */

export interface DroneAiDifficultyProfile extends ResolvedDroneConfig {
  /** ms a drone must wait, after a genuine acquisition, before it becomes eligible to start its first windup. 0 = immediate (no added delay) — see this module's own doc comment. */
  acquireReactionDelayMs: number;
  /** ms an `investigating` drone keeps steering toward its last-known position before giving up and returning to `searching` — the difficulty-scaled replacement for the old flat `DRONE_PERCEPTION_MEMORY.investigateDurationMs` read. */
  targetMemoryDurationMs: number;
  /** Always exactly `DRONE.WINDUP_MS` (650ms) — identical across every difficulty, by design. Never scaled up or down. */
  attackWindupMs: number;
}

const ACQUIRE_REACTION_DELAY_MS: Record<TrialDifficulty, number> = {
  low: 350,
  medium: 0,
  max: 0,
};

const TARGET_MEMORY_DURATION_MS: Record<TrialDifficulty, number> = {
  low: 3500,
  // Reused, never restated — see this module's own doc comment.
  medium: DRONE_PERCEPTION_MEMORY.investigateDurationMs,
  max: 5250,
};

/**
 * The one function every 9E consumer resolves through — `DroneSquad.tsx`
 * calls this ONCE per difficulty change (never per-frame/per-drone, see that
 * file's own doc comment), then passes the resulting single object to every
 * mounted drone's `update()`. Pure and cheap (plain arithmetic plus two
 * table lookups) — safe to call repeatedly, but callers should still prefer
 * memoizing it against the selected difficulty rather than calling it every
 * frame, exactly as `resolveDroneConfig` itself already was before this
 * phase folded it in here.
 */
export function resolveDroneAiDifficultyProfile(difficulty: TrialDifficulty): DroneAiDifficultyProfile {
  return {
    ...resolveDroneConfig(difficulty),
    acquireReactionDelayMs: ACQUIRE_REACTION_DELAY_MS[difficulty],
    targetMemoryDurationMs: TARGET_MEMORY_DURATION_MS[difficulty],
    attackWindupMs: DRONE.WINDUP_MS,
  };
}
