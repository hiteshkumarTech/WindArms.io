/**
 * Pure creative-parameter layer for the Vortex Rifle's signature procedural
 * sound (Milestone 7, Phase G, Step 7G). Separates WHAT the sound should be
 * (frequencies, gains, envelope durations — easy to retune, deterministic,
 * testable) from HOW it's produced (Web Audio node graph — `vortexAudio.ts`).
 * No browser/React dependency; every function here is a plain, finite,
 * clamped computation over numbers, same convention as `resolveTriggerGate`/
 * `computeActionPose`.
 *
 * Identity direction (`docs/design/weapons/vortex-rifle.md` §15): a
 * compressed atmospheric-pressure discharge, a sharp electromagnetic snap, a
 * restrained mechanical transient, and a turbine-like sustained-fire energy
 * response — not a gunpowder crack, not a generic laser.
 */

export interface VortexShotRecipe {
  readonly pressureGain: number;
  readonly pressureCutoffHz: number;
  readonly pressureDurationSeconds: number;

  readonly mechanicalGain: number;
  readonly mechanicalPitchHz: number;
  readonly mechanicalDecaySeconds: number;

  readonly emSnapGain: number;
  readonly emSnapStartHz: number;
  readonly emSnapEndHz: number;
  readonly emSnapDurationSeconds: number;

  readonly windTailGain: number;
  readonly windTailCutoffHz: number;
  readonly windTailDurationSeconds: number;
}

export interface VortexShotContext {
  /** Index of this shot within the current held-trigger burst — informational/for-caller-bookkeeping only; variation itself is driven by `randomSeed` so it stays deterministic and testable regardless of how a caller counts shots. */
  readonly shotIndexInBurst: number;
  /** 0..1 — the same "how far into the spin-up ramp" signal `VortexFireSystem.tsx` already computes as `spinUpT` and passes to `playVortexShot`. 0 = a fresh, isolated shot; 1 = fully spun-up sustained fire. */
  readonly sustainedFireAmount: number;
  /** Any integer — feeds the deterministic pseudo-random variation. Same seed always produces the same recipe. */
  readonly randomSeed: number;
  /** 0..1 — informational for offline peak/headroom prediction; the Web Audio layer applies the real master gain separately, this does not double-apply it to the returned gains. */
  readonly masterVolume: number;
}

export interface VortexTurbineTarget {
  readonly gain: number;
  readonly filterCutoffHz: number;
  readonly pitchHz: number;
}

export interface VortexReloadStage {
  readonly gain: number;
  readonly pitchHz: number;
  readonly durationSeconds: number;
  /** Seconds after the reload sequence starts that this stage fires. */
  readonly atSeconds: number;
}

export interface VortexReloadRecipe {
  readonly stages: readonly VortexReloadStage[];
  readonly totalDurationSeconds: number;
}

export interface VortexDryFireRecipe {
  readonly clickGain: number;
  readonly clickPitchHz: number;
  readonly clickDurationSeconds: number;
  readonly failGain: number;
  readonly failPitchHz: number;
  readonly failDurationSeconds: number;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** Deterministic xorshift-based hash → float in [0, 1). Same seed always produces the same value; no `Math.random()` anywhere in this module. */
function hash01(seed: number): number {
  let x = (seed | 0) ^ 0x9e3779b9;
  x ^= x << 13;
  x |= 0;
  x ^= x >>> 17;
  x ^= x << 5;
  x |= 0;
  return ((x >>> 0) % 1_000_000) / 1_000_000;
}

/** Deterministic signed jitter in [-magnitude, +magnitude], derived from `seed` and a `salt` so multiple independent jitter values can be drawn from one seed without correlating. */
function jitter(seed: number, salt: number, magnitude: number): number {
  return (hash01(seed * 7919 + salt) - 0.5) * 2 * magnitude;
}

/** Restrained per-shot pitch/gain variation limits — small enough that repeated shots read as the same weapon, not a randomized cartoon jump. Exported so tests (and the debug panel) can assert actual output never exceeds these by construction. */
export const PITCH_VARIATION_MAX = 0.04; // +/-4%
export const GAIN_VARIATION_MAX = 0.06; // +/-6%
/** How much the sustained-fire ramp is allowed to brighten/raise shot-layer pitch, on top of per-shot jitter — restrained per the brief, not a dramatic pitch runaway. */
const SUSTAIN_PITCH_RISE_MAX = 0.22;

/** Un-jittered, un-sustained base values — exported so tests can assert jitter/sustain bounds against ground truth rather than against another already-jittered sample. */
export const VORTEX_SHOT_BASE = {
  pressureGain: 0.3,
  pressureCutoffHz: 1100,
  mechanicalGain: 0.15,
  mechanicalPitchHz: 2200,
  emSnapGain: 0.1,
  emSnapStartHz: 3200,
  emSnapEndHz: 900,
  windTailGain: 0.08,
  windTailCutoffHz: 1300,
} as const;

/**
 * The single-shot layered recipe: compressed pressure discharge (primary
 * body) + sharp mechanical transient (timing clarity) + brief electromagnetic
 * snap (technology identity) + restrained wind-release tail (pressure
 * escaping through engineered vents). All four fire together; durations are
 * kept short enough that automatic fire at the Vortex's ~900rpm ceiling
 * (66ms/shot) never has to cut a still-sounding shot short.
 */
export function computeVortexShotRecipe(context: VortexShotContext): VortexShotRecipe {
  const sustain = clamp(context.sustainedFireAmount, 0, 1);
  const pitchRise = 1 + sustain * SUSTAIN_PITCH_RISE_MAX;
  const gainJ = 1 + jitter(context.randomSeed, 1, GAIN_VARIATION_MAX);
  const pitchJ = 1 + jitter(context.randomSeed, 2, PITCH_VARIATION_MAX);

  return {
    pressureGain: clamp(VORTEX_SHOT_BASE.pressureGain * gainJ, 0, 1),
    pressureCutoffHz: clamp(VORTEX_SHOT_BASE.pressureCutoffHz * pitchRise * pitchJ, 200, 8000),
    pressureDurationSeconds: clamp(0.055, 0.01, 0.2),

    mechanicalGain: clamp(VORTEX_SHOT_BASE.mechanicalGain * gainJ, 0, 1),
    mechanicalPitchHz: clamp(VORTEX_SHOT_BASE.mechanicalPitchHz * pitchRise * pitchJ, 200, 12000),
    mechanicalDecaySeconds: clamp(0.016, 0.005, 0.05),

    emSnapGain: clamp(VORTEX_SHOT_BASE.emSnapGain * gainJ, 0, 1),
    emSnapStartHz: clamp(VORTEX_SHOT_BASE.emSnapStartHz * pitchRise * pitchJ, 200, 16000),
    emSnapEndHz: clamp(VORTEX_SHOT_BASE.emSnapEndHz * pitchRise, 100, 8000),
    emSnapDurationSeconds: clamp(0.026, 0.01, 0.08),

    windTailGain: clamp(VORTEX_SHOT_BASE.windTailGain * gainJ, 0, 1),
    windTailCutoffHz: clamp(VORTEX_SHOT_BASE.windTailCutoffHz * pitchJ, 200, 6000),
    windTailDurationSeconds: clamp(0.09, 0.02, 0.2),
  };
}

/**
 * Target state for the ONE persistent turbine node chain (never one node per
 * shot — see `vortexAudio.ts`). Called on every accepted shot with the same
 * `sustainedFireAmount` signal that drives shot-layer pitch, so the
 * turbine's smoothed AudioParam ramps chase this target continuously between
 * shots rather than jumping. Gain ceiling stays below a single shot's
 * `pressureGain` by construction (asserted in tests) so it never overpowers
 * individual transients.
 *
 * Deliberately does NOT take a `masterVolume` parameter: the turbine's gain
 * node connects through the same shared `master` gain node every other
 * layer does, which already applies `masterVolume` once at the output
 * stage. Scaling it again here would double-apply volume specifically for
 * the turbine layer (quieter than intended, non-linearly, at any volume
 * below 1) — muting is already guaranteed by the shared master node alone.
 */
export function computeVortexTurbineTarget(sustainedFireAmount: number): VortexTurbineTarget {
  const sustain = clamp(sustainedFireAmount, 0, 1);
  return {
    gain: clamp(0.12 * sustain, 0, 0.2),
    filterCutoffHz: clamp(500 + sustain * 1400, 200, 4000),
    pitchHz: clamp(90 + sustain * 55, 40, 400),
  };
}

/**
 * Restrained internal-servicing reload sequence — deliberately NOT a
 * magazine-drop/insert sound (the Vortex mesh has no separate modeled
 * magazine to visually support that claim, same constraint already
 * documented for the reload/inspect hand-action targets). Reads as pressure
 * cycling and re-arming: release → internal mechanism movement → re-engage
 * lock → a subtle final pressure-ready cue. Stage timings are informational
 * offsets within the sequence, not tied to the actual reload GAMEPLAY
 * duration (`stats.reloadTimeS`) — this module has no knowledge of that and
 * must not: the caller schedules these stages, gameplay timing is untouched.
 */
export function computeVortexReloadRecipe(): VortexReloadRecipe {
  const stages: VortexReloadStage[] = [
    { gain: 0.14, pitchHz: 420, durationSeconds: 0.05, atSeconds: 0 },
    { gain: 0.11, pitchHz: 260, durationSeconds: 0.07, atSeconds: 0.13 },
    { gain: 0.13, pitchHz: 360, durationSeconds: 0.05, atSeconds: 0.29 },
    { gain: 0.09, pitchHz: 560, durationSeconds: 0.06, atSeconds: 0.4 },
  ];
  return { stages, totalDurationSeconds: 0.46 };
}

/**
 * Dry-fire is a failed-pressure click, not a weaker gunshot — no low-mid
 * "body" layer at all (unlike a real shot's `pressureGain`), so it can never
 * read as a successful, just-quieter fire. `failGain` is asserted (in
 * tests) to stay below a real shot's `pressureGain` by a wide margin.
 */
export function computeVortexDryFireRecipe(): VortexDryFireRecipe {
  return {
    clickGain: 0.09,
    clickPitchHz: 900,
    clickDurationSeconds: 0.014,
    failGain: 0.06,
    failPitchHz: 260,
    failDurationSeconds: 0.03,
  };
}
