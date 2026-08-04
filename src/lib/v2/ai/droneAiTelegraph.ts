import type { DroneAiRuntimeState } from './droneAiTypes';

/**
 * Milestone 9E — pure visual-telegraph resolver. Same guarantee as the rest
 * of `lib/v2/ai/` — no React, no R3F, no Three.js, no Rapier, no Zustand, no
 * calls to the system clock or the built-in random generator (enforced by
 * `droneAiImportGuards.test.ts`). Plain data in, plain data out.
 *
 * RULE 4 (absolute): presentation must NEVER drive combat truth. This module
 * only ever READS one-shot combat facts the pure state machine already
 * produces (`LegacyDroneAiDecision.targetAcquired`/`startWindup`/
 * `fireExactlyOnce`, `LegacyDroneAiRuntime.reactionReadyAtMs`/`windupUntilMs`)
 * — it never writes anything back into `droneAiStateMachine.ts`'s own
 * runtime/decision contract, and nothing in that module ever imports this
 * one. The two stay wired together only inside the adapter (`DroneEnemy.tsx`).
 *
 * WHY THE ADAPTER OWNS THE PULSE/FLASH DEADLINES, NOT THIS MODULE: this
 * resolver is a pure function of its explicit inputs — it cannot "remember"
 * across ticks. The acquire-pulse and fire-flash windows are each anchored
 * to a ONE-SHOT event (`targetAcquired`, `fireExactlyOnce`) that only the
 * state machine knows fired on any given tick; something has to convert
 * "this fired" into "keep showing the cue for N more ms" by holding a small
 * deadline timestamp across ticks. That responsibility sits with the
 * adapter (`DroneEnemy.tsx`'s own `acquirePulseUntilRef`/`fireFlashUntilRef`
 * — plain adapter-owned refs, exactly like `phaseRef`/`positionRef` already
 * are), which then re-supplies the current deadline to this module fresh
 * every tick. This mirrors `LegacyDroneAiRuntime.windupUntilMs`'s own
 * existing pattern (a deadline stored once, re-read every tick) rather than
 * inventing a new one.
 *
 * PHASE PRIORITY (highest first) — `destroyed > hit > fire > windup >
 * acquire/reaction > cooldown > idle`. `acquire` (the brief, difficulty-
 * invariant "spotted" pulse) takes priority over `reaction` (the
 * difficulty-scaled pre-windup hold, only ever visible on Low, since Medium/
 * Max resolve it in 0ms) whenever both windows are simultaneously open —
 * `reaction` only becomes visible on its own once the shorter acquire pulse
 * has already finished fading.
 */

export type DroneTelegraphPhase = 'idle' | 'acquire' | 'reaction' | 'windup' | 'fire' | 'cooldown' | 'hit' | 'destroyed';

export interface DroneTelegraphInput {
  nowMs: number;
  /** `LegacyDroneAiDecision.state` — this tick's already-resolved AI state. */
  state: DroneAiRuntimeState;
  /** Mirrors `TargetUserData.hitFlashUntil` — 0 = no active flash. Highest presentation priority below `destroyed`. */
  hitFlashUntilMs: number;
  /** Adapter-owned deadline, 0 = inactive — set to `now + DRONE_COMBAT_TELEGRAPH.acquirePulseMs` the tick `LegacyDroneAiDecision.targetAcquired` is true; left alone otherwise (never reset early, never re-armed by ordinary engaging ticks or cover-edge flicker). */
  acquirePulseUntilMs: number;
  /** `LegacyDroneAiRuntime.reactionReadyAtMs` passthrough — only consulted while `state === 'engaging'` (once `attacking`, the reaction gate has, by construction, already been satisfied). */
  reactionReadyAtMs: number | null;
  /** `LegacyDroneAiRuntime.windupUntilMs` passthrough — only meaningful while `state === 'attacking'`, exactly mirroring the pure core's own contract. */
  windupUntilMs: number;
  /** The resolved (difficulty-profile) windup duration — always 650ms per Rule 2, supplied explicitly rather than imported, so this module stays a pure function of its inputs only. */
  attackWindupMs: number;
  /** Adapter-owned deadline, 0 = inactive — set to `now + DRONE_COMBAT_TELEGRAPH.fireFlashMs` the tick `LegacyDroneAiDecision.fireExactlyOnce` is true. Also anchors the immediately-following cooldown-settle window: `[fireFlashUntilMs, fireFlashUntilMs + DRONE_COMBAT_TELEGRAPH.cooldownSettleMs)`. */
  fireFlashUntilMs: number;
}

export interface DroneTelegraphOutput {
  phase: DroneTelegraphPhase;
  eyeEmissiveIntensity: number;
  muzzleFlashVisible: boolean;
  /** 0..1 while `muzzleFlashVisible`; 0 otherwise. */
  muzzleFlashProgress: number;
}

/**
 * Source-controlled telegraph timing/intensity config — every value chosen
 * once, within the phase brief's own bounded ranges, and documented here
 * rather than re-tuned ad hoc. `idleEyeIntensity`/`windupEndEyeIntensity`/
 * `hitEyeIntensity` (1.4 / 2.6 / 3.2) exactly match the three values
 * `DroneEnemy.tsx` already rendered before this phase (see that file's own
 * pre-9E inline ternary) — this phase EXTENDS that existing visual language
 * rather than replacing it.
 */
export const DRONE_COMBAT_TELEGRAPH = {
  /** Duration of the one-shot "spotted" pulse fired on every genuine acquisition. */
  acquirePulseMs: 180,
  /** Duration of the muzzle-flash / peak-eye-brightness window immediately after a shot. */
  fireFlashMs: 80,
  /** Duration of the brief post-fire settle back toward idle brightness — purely cosmetic, no gameplay effect. */
  cooldownSettleMs: 180,
  idleEyeIntensity: 1.4,
  acquireEyeIntensity: 2.0,
  windupStartEyeIntensity: 1.8,
  windupEndEyeIntensity: 2.6,
  fireEyeIntensity: 3.0,
  hitEyeIntensity: 3.2,
} as const;

function clamp01(t: number): number {
  if (t < 0) return 0;
  if (t > 1) return 1;
  return t;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function resolvePhase(input: DroneTelegraphInput): DroneTelegraphPhase {
  const { nowMs } = input;
  if (input.state === 'destroyed') return 'destroyed';
  if (nowMs < input.hitFlashUntilMs) return 'hit';
  if (input.fireFlashUntilMs > 0 && nowMs < input.fireFlashUntilMs) return 'fire';
  if (input.state === 'attacking') return 'windup';
  if (input.acquirePulseUntilMs > 0 && nowMs < input.acquirePulseUntilMs) return 'acquire';
  if (input.state === 'engaging' && input.reactionReadyAtMs !== null && nowMs < input.reactionReadyAtMs) return 'reaction';
  if (input.fireFlashUntilMs > 0 && nowMs < input.fireFlashUntilMs + DRONE_COMBAT_TELEGRAPH.cooldownSettleMs) return 'cooldown';
  return 'idle';
}

function resolveEyeEmissiveIntensity(phase: DroneTelegraphPhase, input: DroneTelegraphInput): number {
  switch (phase) {
    case 'hit':
      return DRONE_COMBAT_TELEGRAPH.hitEyeIntensity;
    case 'fire':
      return DRONE_COMBAT_TELEGRAPH.fireEyeIntensity;
    case 'windup': {
      const remaining = input.windupUntilMs - input.nowMs;
      const t = input.attackWindupMs > 0 ? clamp01(1 - remaining / input.attackWindupMs) : 1;
      return lerp(DRONE_COMBAT_TELEGRAPH.windupStartEyeIntensity, DRONE_COMBAT_TELEGRAPH.windupEndEyeIntensity, t);
    }
    case 'acquire':
      return DRONE_COMBAT_TELEGRAPH.acquireEyeIntensity;
    case 'reaction':
      // Holds at the pre-windup floor — a smooth continuity into 'windup'
      // rather than a jump, only ever visible on a difficulty whose
      // acquireReactionDelayMs is non-zero (Low).
      return DRONE_COMBAT_TELEGRAPH.windupStartEyeIntensity;
    case 'cooldown': {
      const t = DRONE_COMBAT_TELEGRAPH.cooldownSettleMs > 0 ? clamp01((input.nowMs - input.fireFlashUntilMs) / DRONE_COMBAT_TELEGRAPH.cooldownSettleMs) : 1;
      return lerp(DRONE_COMBAT_TELEGRAPH.fireEyeIntensity, DRONE_COMBAT_TELEGRAPH.idleEyeIntensity, t);
    }
    case 'destroyed':
    case 'idle':
    default:
      return DRONE_COMBAT_TELEGRAPH.idleEyeIntensity;
  }
}

function resolveMuzzleFlashProgress(phase: DroneTelegraphPhase, input: DroneTelegraphInput): number {
  if (phase !== 'fire' || DRONE_COMBAT_TELEGRAPH.fireFlashMs <= 0) return 0;
  const remaining = input.fireFlashUntilMs - input.nowMs;
  return clamp01(1 - remaining / DRONE_COMBAT_TELEGRAPH.fireFlashMs);
}

/**
 * The one per-tick pure telegraph resolver. Deterministic given identical
 * inputs — no RNG, no clock. Never allocates beyond the returned plain
 * object.
 */
export function resolveDroneTelegraph(input: DroneTelegraphInput): DroneTelegraphOutput {
  const phase = resolvePhase(input);
  return {
    phase,
    eyeEmissiveIntensity: resolveEyeEmissiveIntensity(phase, input),
    muzzleFlashVisible: phase === 'fire',
    muzzleFlashProgress: resolveMuzzleFlashProgress(phase, input),
  };
}
