/**
 * Fixed-step accumulator for frame-rate-independent MOVEMENT simulation
 * (Skyfront Trial timing cleanup). This is deliberately separate from, and
 * must never be used for, real-time gameplay timers (countdown/match/
 * respawn/cooldowns) — those advance by REAL elapsed time directly (see
 * `matchStore.ts`'s `tick()`), never through this accumulator. This file
 * only exists to make POSITION integration (drones, projectile bolts) keep
 * up with real elapsed time under low frame rates, instead of silently
 * losing distance the way a single `Math.min(rawDelta, cap)` step does.
 *
 * How it works: each call banks the frame's real elapsed time, then drains
 * it in fixed `FIXED_STEP_S` chunks, invoking the caller's `step` once per
 * chunk. At a normal ≥60fps frame rate this runs exactly one substep per
 * call (byte-identical cost to the old single-step code). Under a slow
 * frame, it runs MULTIPLE substeps in the same rendered frame to catch
 * back up — this is what actually fixes the "movement runs in slow
 * motion under low FPS" half of the bug, not just bounding a single step.
 *
 * Spiral-of-death guard: `MAX_SUBSTEPS_PER_FRAME` caps how many substeps
 * one call can run. If a frame's banked time would need more than that
 * (e.g. a multi-second gap from a backgrounded tab), the excess is
 * DROPPED, not queued — the accumulator resets rather than letting an
 * ever-growing backlog force more and more substeps on every subsequent
 * frame (which is how a spiral of death happens: each catch-up frame
 * takes longer to compute, banking even more time, needing even more
 * substeps next frame). This is a deliberate policy, documented in
 * docs/decisions.md: sustained severe frame drops trade simulation
 * fidelity (movement runs somewhat behind real time) for stability. It
 * does NOT desync gameplay timers — those never touch this file.
 */

/** ~60Hz — matches the brief's "fixed step around 1/60" and this project's general target frame budget (see docs/technical/performance.md). */
export const FIXED_STEP_S = 1 / 60;

/**
 * 8 substeps × 1/60s ≈ 133ms of movement processed per rendered frame.
 * Comfortably covers a 10fps frame (100ms) with margin, covers most but
 * not all of a 5fps frame (200ms) — the deliberately-accepted shortfall
 * at the most extreme tier, see the "Chosen" note in decisions.md and the
 * measured numbers in matchTiming.test.ts.
 */
export const MAX_SUBSTEPS_PER_FRAME = 8;

export interface StepAccumulator {
  /** Banked, not-yet-consumed real seconds. Never negative; reset to 0 whenever the substep cap is hit this call. */
  carryS: number;
}

export function createStepAccumulator(): StepAccumulator {
  return { carryS: 0 };
}

/**
 * Banks `realDeltaS` and drains it in `fixedStepS`-sized chunks, calling
 * `step(fixedStepS)` once per chunk (never a variable/partial amount — every
 * call to `step` represents the exact same slice of simulated time,
 * regardless of the real frame rate). Safe to call with an arbitrarily
 * large `realDeltaS` (e.g. a tab-background wake-up spike) — bounded by
 * `maxSubsteps`, excess banked time is discarded rather than accumulating
 * across future frames.
 */
export function stepFixed(
  acc: StepAccumulator,
  realDeltaS: number,
  step: (fixedStepS: number) => void,
  fixedStepS: number = FIXED_STEP_S,
  maxSubsteps: number = MAX_SUBSTEPS_PER_FRAME,
): number {
  acc.carryS += realDeltaS;
  let substeps = 0;
  while (acc.carryS >= fixedStepS && substeps < maxSubsteps) {
    step(fixedStepS);
    acc.carryS -= fixedStepS;
    substeps += 1;
  }
  if (substeps >= maxSubsteps) acc.carryS = 0;
  return substeps;
}
