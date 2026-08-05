/**
 * Milestone 9B — types for the pure, renderer-independent legacy drone AI
 * core. This module has NO React/R3F/Three.js/Rapier/Zustand import and
 * never will — see `droneAiStateMachine.ts`'s own doc comment for the full
 * "why a pure core" reasoning.
 *
 * SCOPE (9B, historical): originally modelled exactly the five states
 * `DroneEnemy.tsx` assigned to `state.state` — `spawning`, `searching`,
 * `engaging`, `attacking`, `destroyed`.
 *
 * MILESTONE 9C — adds a sixth state, `investigating` (see
 * `DroneAiRuntimeState` below), plus last-known-player-position memory. This
 * is now the ONE authoritative runtime state union for the whole codebase —
 * `lib/v2/play/types.ts`'s `DroneAiState` aliases it directly rather than
 * declaring its own separate union (see that file's own comment). `stunned`
 * remains a timed boolean OVERLAY (`now < stunnedUntil`), never a discrete
 * state value — unaffected by this phase. `'inactive'` (never assigned at
 * runtime, in the old wider union) is dropped entirely by the alias.
 *
 * Still deliberately absent (per the 9C brief's own scope fence): no
 * `recover`/`dead`-as-terminal-target-memory fields, no `assignedSector`, no
 * `stuck` runtime, no `nextAllowedEvadeAt`, no combat node reference, no
 * squad-shared perception. Those belong to 9D onward.
 *
 * MILESTONE 9E — adds the acquisition-reaction gate: `reactionReadyAtMs` on
 * the runtime (below) and `acquireReactionDelayMs` on the observation, plus
 * one new one-shot decision fact, `targetAcquired`. `investigateDurationMs`
 * (observation) is unchanged in SHAPE but now sourced from the caller's
 * resolved `DroneAiDifficultyProfile.targetMemoryDurationMs`
 * (`droneAiDifficulty.ts`) rather than the flat, pre-9E
 * `DRONE_PERCEPTION_MEMORY.investigateDurationMs` constant — see that
 * module's own doc comment. No new AI state, no burst/shot-count field, no
 * presentation/telegraph concept anywhere in this file — those stay entirely
 * in the new, separate `droneAiTelegraph.ts` (adapter-facing, not part of
 * this pure runtime contract at all).
 */

/**
 * The one authoritative drone AI runtime state union (Milestone 9C).
 * `searching` = existing ambient home-orbit/patrol behaviour (unchanged from
 * 9B). `investigating` = NEW — a brief, no-fire investigation of the last
 * confirmed player position after sustained line-of-sight loss, before
 * giving up and returning to `searching` (see `droneAiStateMachine.ts`'s own
 * doc comment for the full transition design).
 */
export type DroneAiRuntimeState = 'spawning' | 'searching' | 'investigating' | 'engaging' | 'attacking' | 'destroyed';

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
  state: DroneAiRuntimeState;

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

  // --- Milestone 9C: perception memory. A copied snapshot, never a
  // reference into caller-owned/mutable data — see `droneAiPerception.ts`'s
  // own doc comment on why the pure core always copies rather than retains.

  /** The player's world position the last time it was genuinely visible (`targetVisible === true`), or `null` if never seen this life (or memory has since been cleared by timeout/reset/generation-change). Always a fresh copy — mutating the caller's original object afterward cannot affect this. */
  lastKnownTargetPosition: Vec3Data | null;
  /** `nowMs` the last time the target was genuinely visible, or `null` if never seen this life / memory cleared. */
  lastSeenTargetAtMs: number | null;
  /** `nowMs` continuous line-of-sight loss began while `engaging`/`attacking`, or `null` if not currently mid-loss (either still visible, or the confirmation/investigation already resolved one way or the other). Cleared the instant visibility returns — a one-frame flicker never accumulates across separate loss events. */
  losLostStartedAtMs: number | null;
  /** `nowMs` the current `investigating` spell will time out and give up (return to `searching`), or `null` when not investigating. */
  investigateUntilMs: number | null;

  /**
   * Milestone 9E — the `nowMs` deadline a drone must reach before it becomes
   * ELIGIBLE to start its first windup, or `null` when no reaction wait is
   * currently pending. Seeded to `now + observation.acquireReactionDelayMs`
   * on EXACTLY the tick of a genuine acquisition (`searching`→`engaging` or
   * `investigating`→`engaging` reacquisition — see `droneAiStateMachine.ts`'s
   * own doc comment) — never on `attacking`→`engaging` (post-fire or
   * post-stun-abort re-entry), never on a sub-`losLossConfirmMs` cover-edge
   * flicker (state never actually leaves `engaging` for those), and never on
   * an ordinary already-`engaging` tick. Once its deadline has passed it is
   * left as-is (a harmless past timestamp) rather than cleared back to
   * `null` — cheaper than re-deriving "already satisfied" on every
   * subsequent tick, and the attack gate below only ever checks `now >=
   * reactionReadyAtMs`, which stays true forever once crossed. Cleared to
   * `null` on player-generation invalidation and on a full life reset
   * (`resetLegacyDroneRuntime`), exactly like the other memory fields above.
   */
  reactionReadyAtMs: number | null;

  /**
   * The player-life generation (`DroneTargetSnapshot.generation`, e.g.
   * `matchStore.respawnNonce`) this runtime's memory fields above currently
   * belong to. When the caller-supplied observation's generation differs,
   * the pure core invalidates all memory above before making any other
   * decision this tick — a drone can never carry a previous life's
   * last-known position across a player death/respawn. Starts at `-1` (a
   * value no real generation can ever equal, since `matchStore.respawnNonce`
   * only ever counts up from 0) so the very first decision tick after
   * construction/reset always performs one harmless no-op "invalidation"
   * (there is nothing to invalidate yet) that simply syncs this field to
   * whatever the real current generation is — deliberately simpler than
   * threading the real starting generation through `createLegacyDroneRuntime`/
   * `resetLegacyDroneRuntime` as an extra parameter.
   */
  observedPlayerGeneration: number;
}

export interface LegacyDroneAiObservation {
  nowMs: number;

  /** World-space distance from this drone to the player, computed by the adapter (Three.js math), passed in as a plain number. As of 9C, no longer read directly by the pure core's own transition logic (the unified confirmed-loss rule keys off `canSeePlayer` alone, regardless of why it's false) — kept in the contract since the adapter still needs it for its own movement range-band formulas. */
  distance: number;
  /** `targetVisible` from `evaluateDronePerception()` — `distance <= detectRadius && !segmentOccluded(...)`, computed by the adapter via the pure `droneAiPerception.ts` module now (previously computed inline); the canonical rule itself is unchanged since 9B. */
  canSeePlayer: boolean;

  /** The player's current world position, supplied every tick regardless of visibility — the pure core only ever copies this into `lastKnownTargetPosition` when `canSeePlayer` is true this tick (see `droneAiStateMachine.ts`). Never retained by reference. */
  targetPosition: Vec3Data;
  /** The player-life generation this observation's `targetPosition` belongs to (e.g. `matchStore.respawnNonce`) — see `LegacyDroneAiRuntime.observedPlayerGeneration`'s own doc comment for the full invalidation contract. */
  playerGeneration: number;

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

  /** Milestone 9C — how long continuous LOS loss must persist while `engaging`/`attacking` before entering `investigating`, ms. Sourced from `DRONE_PERCEPTION_MEMORY.losLossConfirmMs` (see `droneAiPerception.ts`); supplied per-tick rather than imported directly so the pure core stays a function of its explicit inputs only. Difficulty-INVARIANT — unchanged by 9E. */
  losLossConfirmMs: number;
  /**
   * How long an `investigating` drone waits at/near the last-known position
   * before giving up and returning to `searching`, ms. Through 9C/9D this
   * was always the flat `DRONE_PERCEPTION_MEMORY.investigateDurationMs`
   * constant; as of Milestone 9E it is sourced from the caller's resolved
   * `DroneAiDifficultyProfile.targetMemoryDurationMs`
   * (`droneAiDifficulty.ts`) instead — difficulty-scaled (Medium still
   * reuses the same 4500ms constant verbatim, so Medium's own behaviour is
   * byte-identical to every prior phase). The field's shape/name/meaning
   * here is unchanged; only its SOURCE moved.
   */
  investigateDurationMs: number;
  /**
   * Milestone 9E — how long, after a genuine acquisition, a drone must wait
   * before it becomes eligible to start its first windup, ms. Sourced from
   * `DroneAiDifficultyProfile.acquireReactionDelayMs`. 0 = immediate (no
   * added delay) — Medium is always exactly 0, preserving the pre-9E
   * same-tick acquire→windup cascade byte-for-byte. See
   * `LegacyDroneAiRuntime.reactionReadyAtMs`'s own doc comment for the full
   * seeding/gating contract.
   */
  acquireReactionDelayMs: number;

  /**
   * Milestone 9F — OPTIONAL, adapter-owned attack-suppression gate.
   * `undefined`/`false` (every pre-9F call site, and every 9B-9E test) is
   * byte-identical to omitting this field entirely — the two extra
   * conditions this adds in `decideLegacyDroneAi`'s attack block are both
   * `&&`/`||` against a falsy default, so no existing behaviour changes
   * unless a caller deliberately sets this true. Set true by the adapter
   * (`DroneEnemy.tsx`) on exactly the ticks its own separate
   * `DroneStuckRecoveryRuntime` (`droneAiStuckRecovery.ts`, a fully
   * decoupled pure module this file never imports) reports an ACTIVE
   * recovery episode (nudging/backing-away/altitude-correcting/teleport-
   * fallback — never idle/cooldown). When true: a new windup may not START,
   * and an IN-PROGRESS windup is aborted through the exact same existing
   * `abortWindup` branch stunned/LOS-loss already use (only `state`
   * changes; `windupUntilMs`/`lastFireAtMs` are left exactly as untouched as
   * every other abort reason — no free retry, no reset cooldown, no fire
   * cue, no spread RNG). This is a deliberate, disclosed, minimal extension
   * of the attack-gating contract — NOT a new AI state, NOT a change to
   * `DroneAiRuntimeState`'s six-value union, NOT a reverse dependency
   * (`droneAiStuckRecovery.ts` never imports this file or
   * `droneAiStateMachine.ts`). See `docs/decisions.md`'s Step 9F entry for
   * the full reasoning behind touching this previously-untouched-since-9E
   * file at all.
   */
  recoveryBlocksAttack?: boolean;
}

export type LegacyDroneMovementMode = 'spawn-hold' | 'search' | 'stunned-hold' | 'engage' | 'attack' | 'investigate' | 'destroyed-hold';

export interface LegacyDroneAiDecision {
  /** The full new runtime — the adapter replaces its stored runtime with this, never mutates the old one in place. */
  runtime: LegacyDroneAiRuntime;

  state: DroneAiRuntimeState;

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
  /** True exactly once, the tick an in-progress windup is aborted (LOS lost, stunned, or the target's player-life generation changed) — mirrors the legacy code's separate `else if` abort branch precisely. */
  abortWindup: boolean;
  /** True exactly once, the tick a shot actually fires. */
  fireExactlyOnce: boolean;
  /** Populated only when `fireExactlyOnce` — the three raw spread draws (already scaled by `aimSpreadDeg`), for the adapter to apply to its own aim vector. Never a `THREE.Vector3`. */
  aimSpread: Vec3Data | null;

  /** True exactly once, the tick the strafe-flip deadline rolls over (a new random flip deadline was drawn). Informational for the adapter/tests; the new `strafeDirection`/`strafeFlipAtMs` are already in `runtime`. Never true while `investigating` (no strafe-flip logic runs in that mode). */
  strafeFlipped: boolean;

  /**
   * Milestone 9E — true exactly once, the tick a GENUINE acquisition
   * happens: `searching`→`engaging`, or `investigating`→`engaging`
   * (reacquisition). Never true on `attacking`→`engaging` (post-fire or
   * post-stun-abort), never true on a sub-confirmation cover-edge flicker
   * (state never leaves `engaging` for those), never true on an ordinary
   * already-`engaging` tick. Drives the telegraph resolver's one-shot
   * "acquire" pulse (`droneAiTelegraph.ts`) without that module needing to
   * diff state across ticks itself — mirrors `startWindup`/`fireExactlyOnce`/
   * `strafeFlipped`'s own "true exactly once" event-flag convention.
   */
  targetAcquired: boolean;

  movementMode: LegacyDroneMovementMode;
  /** Non-null exactly when `movementMode === 'investigate'` — a fresh copy of `runtime.lastKnownTargetPosition` for the adapter to steer/face toward. Never a `THREE.Vector3`; the adapter owns converting this to real movement. */
  movementTarget: Vec3Data | null;
  /** Unchanged since 9B — true only for `engaging`/`attacking` (faces the LIVE player position). While `investigating`, the adapter instead faces `movementTarget` — see `DroneEnemy.tsx`. */
  facePlayer: boolean;
}

/**
 * Milestone 9C — the player-target snapshot `DroneSquad` builds ONCE per
 * simulation tick and passes, unchanged, to every drone's `update()` call
 * (never a per-drone camera read, never reallocated per frame — see
 * `DroneSquad.tsx`). Plain data only, so it can flow all the way into the
 * pure core's observation without any adapter-side translation layer.
 */
export interface DroneTargetSnapshot {
  /** The player's current world position (camera position) — the single source every drone reads, never re-derived per drone. */
  position: Vec3Data;
  /** `match.phase === 'active'` — informational; `DroneSquad` already only calls `update()` while active, so every consumer already implicitly sees `alive === true`, but the field is populated so the snapshot is self-documenting and the invariant is explicit rather than assumed. */
  alive: boolean;
  /** The player's current life generation (`matchStore.respawnNonce`) — see `LegacyDroneAiRuntime.observedPlayerGeneration`'s own doc comment. */
  generation: number;
}
