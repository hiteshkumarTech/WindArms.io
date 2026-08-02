/**
 * Milestone 9B — types for the pure, renderer-independent legacy drone AI
 * core. This module has NO React/R3F/Three.js/Rapier/Zustand import and
 * never will — see `droneAiStateMachine.ts`'s own doc comment for the full
 * "why a pure core" reasoning.
 *
 * SCOPE (deliberate, per the 9B brief): this models exactly the five states
 * `DroneEnemy.tsx` actually assigns to `state.state` today — `spawning`,
 * `searching`, `engaging`, `attacking`, `destroyed`. The wider, pre-existing
 * `DroneAiState` union in `lib/v2/play/types.ts` also declares `'inactive'`
 * and `'stunned'`, but neither is ever assigned at runtime — `'inactive'` is
 * unused entirely, and `'stunned'` is a timed boolean OVERLAY
 * (`now < stunnedUntil`), never a discrete state value. This module
 * deliberately does NOT touch `lib/v2/play/types.ts`'s public union — see
 * `docs/decisions.md`'s Step 9B entry for why that migration is deferred to
 * 9C rather than folded into this behaviour-neutral extraction pass.
 *
 * Also deliberately absent (per the 9B brief's own scope fence): no
 * `investigate`/`recover`/`dead`-as-terminal-target-memory fields, no
 * `assignedSector`, no `stuck` runtime, no `nextAllowedEvadeAt`, no combat
 * node reference. Those belong to 9C onward.
 */

export type LegacyDroneRuntimeState = 'spawning' | 'searching' | 'engaging' | 'attacking' | 'destroyed';

/** Plain vector data — never a `THREE.Vector3` instance. The pure core only ever reads/writes `{x,y,z}` numbers; the adapter owns all real Three.js math. */
export interface Vec3Data {
  x: number;
  y: number;
  z: number;
}

/**
 * Persistent per-drone decision runtime — survives across ticks, mutated
 * only via `decideLegacyDroneAi`'s returned copy (never mutated in place by
 * the pure core itself). Deliberately excludes anything derived fresh every
 * tick (distance, canSeePlayer — see `LegacyDroneAiObservation`) and
 * anything visual-only (hover phase, rotor spin — see `droneAiStateMachine.ts`'s
 * own doc comment on why `phase` stays adapter-owned even though it's
 * gameplay-relevant for search movement).
 */
export interface LegacyDroneAiRuntime {
  state: LegacyDroneRuntimeState;

  /** the system-clock-style timestamp this life last (re)entered `spawning`. */
  spawnedAtMs: number;
  /** the system-clock-style timestamp of the last completed shot. Seeded with a desync jitter at spawn/reset — never reset to 0. */
  lastFireAtMs: number;
  /** 0 = no active/meaningful windup deadline. Deliberately NOT reset to 0 when a windup is aborted — matches the legacy code's own behaviour exactly (a stale value here is harmless: it's only ever read while `state==='attacking'`, and the next real windup start overwrites it). */
  windupUntilMs: number;
  /** 0 = never stunned yet (or the field simply hasn't been touched this life). Never reset except via a full `spawning`-state reset. */
  stunnedUntilMs: number;

  strafeDirection: -1 | 1;
  strafeFlipAtMs: number;

  /** 0 = not destroyed. Set once, the instant destruction is detected; never re-set for the remainder of this life. */
  destroyShrinkFromMs: number;

  /** Bumped on every `spawning`-state reset — feeds `deriveDroneSeed` so a restart's random stream never replays a prior life's sub-sequence. The adapter owns the actual `RandomSource` instance (reseeded whenever this changes) and passes it into every `decideLegacyDroneAi`/`createLegacyDroneRuntime` call explicitly — the runtime struct itself holds no RNG state, since a closure-based generator has nothing meaningful to snapshot here. */
  lifeGeneration: number;
}

export interface LegacyDroneAiObservation {
  nowMs: number;

  /** World-space distance from this drone to the player, computed by the adapter (Three.js math), passed in as a plain number. */
  distance: number;
  /** `distance <= detectRadius && !segmentOccluded(...)` — computed by the adapter; the pure core never calls `segmentOccluded` itself (that function lives in `spawnConfig.ts`, arena-specific, not a "pure AI" concern). */
  canSeePlayer: boolean;

  /** Mirrors `TargetUserData.destroyedAt`'s own convention — 0 = not destroyed, matching the existing contract exactly rather than introducing a null-based translation layer. */
  destroyedAtMs: number;
  /** Mirrors `TargetUserData.hitFlashUntil` — 0 = no active flash. */
  hitFlashUntilMs: number;

  detectRadius: number;
  fireIntervalMs: number;
  spawnDurationMs: number;
  attackWindupMs: number;
  destroyShrinkMs: number;
  stunMs: number;
  /** Degrees — half-cone aim error, matching `ResolvedDroneConfig.aimSpreadDeg` exactly. Consumed only when a shot fires this tick. */
  aimSpreadDeg: number;
}

export type LegacyDroneMovementMode = 'spawn-hold' | 'search' | 'stunned-hold' | 'engage' | 'attack' | 'destroyed-hold';

export interface LegacyDroneAiDecision {
  /** The full new runtime — the adapter replaces its stored runtime with this, never mutates the old one in place. */
  runtime: LegacyDroneAiRuntime;

  state: LegacyDroneRuntimeState;

  /** True exactly once, the tick destruction is first detected — the adapter must call `recordDroneDestroyed()` exactly when this is true, never more than once per life. */
  requestRecordDestroyed: boolean;
  /** 0..1 — `(now - destroyShrinkFromMs) / destroyShrinkMs`, clamped to a minimum presentation floor exactly as the legacy `Math.max(0.001, 1-t)` does. Only meaningful while `state==='destroyed'`. */
  destroyProgress: number;
  /** True exactly once, the tick the shrink animation completes (`t>=1`) — the adapter hides the mesh and reports "destroyed" to the squad on this tick, matching the legacy `return true` timing exactly. */
  completeDestroyedPresentation: boolean;

  /** `Math.min(1, (now-spawnedAtMs)/spawnDurationMs)` — only meaningful while `state==='spawning'`. */
  spawnProgress: number;

  stunned: boolean;

  /** True exactly once, the tick a windup starts (`engaging`'s cooldown elapsed). */
  startWindup: boolean;
  /** True exactly once, the tick an in-progress windup is aborted (LOS lost or stunned) — mirrors the legacy code's separate `else if` abort branch precisely. */
  abortWindup: boolean;
  /** True exactly once, the tick a shot actually fires. */
  fireExactlyOnce: boolean;
  /** Populated only when `fireExactlyOnce` — the three raw spread draws (already scaled by `aimSpreadDeg`), for the adapter to apply to its own aim vector. Never a `THREE.Vector3`. */
  aimSpread: Vec3Data | null;

  /** True exactly once, the tick the strafe-flip deadline rolls over (a new random flip deadline was drawn). Informational for the adapter/tests; the new `strafeDirection`/`strafeFlipAtMs` are already in `runtime`. */
  strafeFlipped: boolean;

  movementMode: LegacyDroneMovementMode;
  facePlayer: boolean;
}
