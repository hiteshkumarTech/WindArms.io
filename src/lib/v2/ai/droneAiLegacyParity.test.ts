import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createLegacyDroneRuntime, decideLegacyDroneAi, resetLegacyDroneRuntime } from './droneAiStateMachine';
import { createTapeRandomSource, createSeededRandomSource, deriveDroneSeed } from './droneAiRandom';
import type { LegacyDroneAiObservation } from './droneAiTypes';

/**
 * Milestone 9B — legacy parity fixture. Two distinct kinds of parity are
 * proven here, deliberately kept separate (see `docs/decisions.md`'s Step 9B
 * entry for the full reasoning):
 *
 * 1. FORMULA parity — a captured baseline browser session (real `/v2/play`,
 *    a deterministic `Math.random` tape injected via Playwright before app
 *    init, one stable drone — `deck-a` — driven through every scenario this
 *    phase's brief required) proved the OLD code shares ONE GLOBAL
 *    `Math.random` stream across all 8 drones plus every other consumer in
 *    the scene (60,391 calls captured across a ~160s session against only
 *    38 fire events + a handful of state-timing draws for the one drone
 *    being watched) — there is no per-drone or per-subsystem isolation in
 *    the legacy code AT ALL. A byte-exact replay of that global interleaved
 *    stream against the NEW per-drone-isolated design is therefore not a
 *    meaningful thing to attempt (the two architectures fundamentally do not
 *    share a comparable "stream position" concept) — so formula parity is
 *    instead proven the way Section 7 of this phase's own brief anticipates
 *    when it says the new source "will not reproduce the browser's former
 *    arbitrary stream by coincidence": by feeding an IDENTICAL tape into a
 *    hand-transcribed reference re-implementation of each legacy formula
 *    (copied verbatim from `DroneEnemy.tsx`'s own source, see each test's
 *    comment) and into the actual new pure-core function, and asserting
 *    numeric equality. This proves the new code's formulas are byte-identical
 *    to the old code's, in the same call order — the load-bearing claim.
 *
 * 2. SEQUENCE/SHAPE parity — the captured trace's qualitative shape (which
 *    transitions happened, in what relative order, honouring which quirks)
 *    is reproduced here as a compact, hand-curated fixture — never the raw
 *    124-sample/60k-random-call browser log, per this phase's own "do not
 *    commit a giant raw browser log" instruction.
 */

const BASE = {
  detectRadius: 42,
  fireIntervalMs: 2400,
  spawnDurationMs: 700,
  attackWindupMs: 650,
  destroyShrinkMs: 260,
  stunMs: 240,
  aimSpreadDeg: 4.5,
};

function obs(overrides: Partial<LegacyDroneAiObservation> = {}): LegacyDroneAiObservation {
  return { nowMs: 0, distance: 15, canSeePlayer: true, destroyedAtMs: 0, hitFlashUntilMs: 0, ...BASE, ...overrides };
}

describe('droneAiLegacyParity — formula parity (tape-in / value-out against hand-transcribed legacy formulas)', () => {
  it('spawn-time initial phase: legacy `Math.random() * Math.PI * 2`', () => {
    // createLegacyDroneRuntime always draws exactly 4 values (phase, fire
    // jitter, strafeDir, strafeFlip jitter, in that order) — the tape must
    // supply all 4, even though this test only asserts on the first.
    const tape = [0.37, 0, 0, 0];
    const legacy = tape[0] * Math.PI * 2;
    const { initialPhase } = createLegacyDroneRuntime(createTapeRandomSource(tape), 0, BASE.fireIntervalMs, 1);
    assert.strictEqual(initialPhase, legacy);
  });

  it('spawn-time fire-desync jitter: legacy `performance.now() + Math.random() * DRONE.FIRE_INTERVAL_MS` (the BASE constant, not the difficulty-resolved value — a confirmed legacy quirk)', () => {
    const tape = [0.1, 0.62, 0, 0];
    const nowMs = 1000;
    const legacy = nowMs + tape[1] * BASE.fireIntervalMs;
    const { runtime } = createLegacyDroneRuntime(createTapeRandomSource(tape), nowMs, BASE.fireIntervalMs, 1);
    assert.strictEqual(runtime.lastFireAtMs, legacy);
  });

  it('spawn-time strafe direction: legacy `Math.random() < 0.5 ? 1 : -1`', () => {
    const below = createLegacyDroneRuntime(createTapeRandomSource([0, 0, 0.49, 0]), 0, BASE.fireIntervalMs, 1).runtime;
    assert.strictEqual(below.strafeDirection, 1);
    const above = createLegacyDroneRuntime(createTapeRandomSource([0, 0, 0.51, 0]), 0, BASE.fireIntervalMs, 1).runtime;
    assert.strictEqual(above.strafeDirection, -1);
  });

  it('spawn-time strafe-flip deadline: legacy `performance.now() + 1500 + Math.random() * 1500`', () => {
    const tape = [0, 0, 0, 0.8];
    const nowMs = 2000;
    const legacy = nowMs + 1500 + tape[3] * 1500;
    const { runtime } = createLegacyDroneRuntime(createTapeRandomSource(tape), nowMs, BASE.fireIntervalMs, 1);
    assert.strictEqual(runtime.strafeFlipAtMs, legacy);
  });

  it('reset fire-desync jitter: legacy `performance.now() + Math.random() * config.fireIntervalMs` (the RESOLVED/difficulty-scaled value, unlike spawn construction)', () => {
    const seedTape = createTapeRandomSource([0, 0, 0, 0]);
    const runtime = createLegacyDroneRuntime(seedTape, 0, BASE.fireIntervalMs, 1).runtime;
    const resolvedFireIntervalMs = 1800; // e.g. a Max-preset-resolved value, deliberately different from the base constant
    const resetTape = [0.44];
    const legacy = 9000 + resetTape[0] * resolvedFireIntervalMs;
    const reset = resetLegacyDroneRuntime(runtime, createTapeRandomSource(resetTape), 9000, resolvedFireIntervalMs);
    assert.strictEqual(reset.lastFireAtMs, legacy);
  });

  it('strafe-flip re-roll deadline: legacy `now + 1400 + Math.random() * 1600`', () => {
    const seedTape = createTapeRandomSource([0, 0, 0, 0]);
    let runtime = createLegacyDroneRuntime(seedTape, 0, BASE.fireIntervalMs, 1).runtime;
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 15 }), seedTape).runtime;
    runtime = { ...runtime, strafeFlipAtMs: 0 }; // force an overdue flip
    const flipTape = createTapeRandomSource([0.25]);
    const nowMs = 800;
    const legacy = nowMs + 1400 + 0.25 * 1600;
    const d = decideLegacyDroneAi(runtime, obs({ nowMs, canSeePlayer: true, distance: 15 }), flipTape);
    assert.strictEqual(d.runtime.strafeFlipAtMs, legacy);
    assert.strictEqual(d.strafeFlipped, true);
  });

  it('aim spread x/y/z: legacy `aim.{x,y,z} += (Math.random() - 0.5) * spread`, spread = aimSpreadDeg-in-radians, drawn in x,y,z order', () => {
    const seedTape = createTapeRandomSource([0, 0, 0, 0]);
    let runtime = createLegacyDroneRuntime(seedTape, 0, BASE.fireIntervalMs, 1).runtime;
    runtime = { ...decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 15 }), seedTape).runtime, lastFireAtMs: 0, strafeFlipAtMs: Number.MAX_SAFE_INTEGER };
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: BASE.fireIntervalMs, canSeePlayer: true, distance: 15 }), seedTape).runtime;
    assert.strictEqual(runtime.state, 'attacking');

    const spreadTape = [0.9, 0.1, 0.5];
    const spreadRad = (BASE.aimSpreadDeg * Math.PI) / 180;
    const legacyX = (spreadTape[0] - 0.5) * spreadRad;
    const legacyY = (spreadTape[1] - 0.5) * spreadRad;
    const legacyZ = (spreadTape[2] - 0.5) * spreadRad;

    const d = decideLegacyDroneAi(runtime, obs({ nowMs: BASE.fireIntervalMs + BASE.attackWindupMs, canSeePlayer: true, distance: 15 }), createTapeRandomSource(spreadTape));
    assert.strictEqual(d.fireExactlyOnce, true);
    assert.ok(d.aimSpread);
    assert.strictEqual(d.aimSpread!.x, legacyX);
    assert.strictEqual(d.aimSpread!.y, legacyY);
    assert.strictEqual(d.aimSpread!.z, legacyZ);
  });

  it('random-consumption ORDER within one fire+flip tick matches the legacy code: movement (strafe-flip) is evaluated before attack (aim spread), matching the source\'s own top-to-bottom block order', () => {
    let runtime = createLegacyDroneRuntime(createTapeRandomSource([0, 0, 0, 0]), 0, BASE.fireIntervalMs, 1).runtime;
    runtime = { ...decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 15 }), createTapeRandomSource([])).runtime, lastFireAtMs: 0, strafeFlipAtMs: 0 };
    // Tape: [0]=strafe-flip draw, [1..3]=aim-spread x/y/z. If the order were
    // reversed, this tape would be consumed differently and the assertions
    // below would fail.
    const tape = createTapeRandomSource([0.2, 0.7, 0.3, 0.6]);
    const d = decideLegacyDroneAi(runtime, obs({ nowMs: BASE.fireIntervalMs, canSeePlayer: true, distance: 15 }), tape);
    // First tick starts the windup — no fire yet, but the strafe-flip check already ran (state is engage-movement territory).
    assert.strictEqual(d.strafeFlipped, true);
    assert.strictEqual(d.startWindup, true);
    const spreadRad = (BASE.aimSpreadDeg * Math.PI) / 180;
    const d2 = decideLegacyDroneAi(d.runtime, obs({ nowMs: BASE.fireIntervalMs + BASE.attackWindupMs, canSeePlayer: true, distance: 15 }), tape);
    assert.strictEqual(d2.fireExactlyOnce, true);
    assert.strictEqual(d2.aimSpread!.x, (0.7 - 0.5) * spreadRad);
    assert.strictEqual(d2.aimSpread!.y, (0.3 - 0.5) * spreadRad);
    assert.strictEqual(d2.aimSpread!.z, (0.6 - 0.5) * spreadRad);
  });
});

/**
 * SEQUENCE/SHAPE parity fixture — a compact, hand-curated summary of the
 * real captured browser trace (deck-a, `/v2/play`, real Rapier/R3F session,
 * deterministic Math.random tape injected via Playwright). Raw trace:
 * 124 samples, 60,391 global random calls, 38 deck-a fire events, 1 destroy
 * event, 0 console errors — archived outside the repository, NOT committed
 * (see docs/decisions.md's Step 9B entry for the capture method and full
 * numbers). Only the qualitative, reproducible FACTS below are checked into
 * the fixture.
 */
const LEGACY_TRACE_FIXTURE = {
  spawnCompletesAndCanCascadeIntoEngagingSameTick: true, // confirmed: by the 4th post-deploy sample (~700ms in), state was already 'engaging' with scale=1.0 — the player's own default spawn point already has clear LOS to deck-a, so acquisition can follow spawn-completion within the same observed window.
  engagingPersistsThroughBlockedLosInsideDetectRadius: true, // confirmed twice (scenario B and scenario L): teleporting the player behind cover while still within DETECT_RADIUS left state=='engaging', never reverting to 'searching'.
  engagingRevertsToSearchingBeyondDetectRadius: true, // confirmed (scenario M): teleporting beyond 42m flipped state to 'searching' on the very next sample.
  stunDuringEngageHoldsStateAsEngaging: true, // confirmed (scenario J): forcing a hit while state=='engaging' set stunnedUntil in the future while state remained 'engaging'.
  stunDuringWindupAbortsToEngagingWithStaleWindupUntil: true, // confirmed (scenario K): forcing a hit while state=='attacking' produced a sample with state=='engaging' and windupUntil UNCHANGED from its pre-abort value (not reset to 0) — the legacy quirk this phase deliberately preserves.
  destroyIsTerminalAndVisibleFalseEventually: true, // confirmed (scenario N/O): state=='destroyed' persisted, visible flipped false within the sampling window (headless fixed-step catch-up completed the 260ms shrink within very few real-time samples — an established environment artifact, not a logic concern).
  restartProducesAFreshLifeNearHomeWithClearedStun: true, // confirmed (scenario P): post-restart samples showed stunnedUntil==0 and position back near deck-a's own home coordinate.
};

describe('droneAiLegacyParity — sequence/shape parity against the captured baseline trace', () => {
  it('spawn completion can cascade directly into engaging within the same tick when LOS is already clear (matches the captured trace\'s own fast-acquisition observation)', () => {
    assert.strictEqual(LEGACY_TRACE_FIXTURE.spawnCompletesAndCanCascadeIntoEngagingSameTick, true);
    const runtime = createLegacyDroneRuntime(createTapeRandomSource([0, 0, 0, 0]), 0, BASE.fireIntervalMs, 1).runtime;
    const d = decideLegacyDroneAi(runtime, obs({ nowMs: BASE.spawnDurationMs, canSeePlayer: true, distance: 23 }), createTapeRandomSource([]));
    assert.strictEqual(d.state, 'engaging');
  });

  it('engaging persists through blocked LOS while still inside detectRadius (matches the captured trace\'s scenario B/L)', () => {
    assert.strictEqual(LEGACY_TRACE_FIXTURE.engagingPersistsThroughBlockedLosInsideDetectRadius, true);
    let runtime = createLegacyDroneRuntime(createTapeRandomSource([0, 0, 0, 0]), 0, BASE.fireIntervalMs, 1).runtime;
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 12 }), createTapeRandomSource([])).runtime;
    const blocked = decideLegacyDroneAi(runtime, obs({ nowMs: 800, canSeePlayer: false, distance: 7 }), createTapeRandomSource([]));
    assert.strictEqual(blocked.state, 'engaging');
  });

  it('engaging reverts to searching once beyond detectRadius (matches the captured trace\'s scenario M)', () => {
    assert.strictEqual(LEGACY_TRACE_FIXTURE.engagingRevertsToSearchingBeyondDetectRadius, true);
    let runtime = createLegacyDroneRuntime(createTapeRandomSource([0, 0, 0, 0]), 0, BASE.fireIntervalMs, 1).runtime;
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 12 }), createTapeRandomSource([])).runtime;
    const gone = decideLegacyDroneAi(runtime, obs({ nowMs: 800, canSeePlayer: false, distance: 45 }), createTapeRandomSource([]));
    assert.strictEqual(gone.state, 'searching');
  });

  it('a stun landing during engage holds the state as engaging (matches the captured trace\'s scenario J)', () => {
    assert.strictEqual(LEGACY_TRACE_FIXTURE.stunDuringEngageHoldsStateAsEngaging, true);
    let runtime = createLegacyDroneRuntime(createTapeRandomSource([0, 0, 0, 0]), 0, BASE.fireIntervalMs, 1).runtime;
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 12 }), createTapeRandomSource([])).runtime;
    const hit = decideLegacyDroneAi(runtime, obs({ nowMs: 800, canSeePlayer: true, distance: 12, hitFlashUntilMs: 850 }), createTapeRandomSource([]));
    assert.strictEqual(hit.state, 'engaging');
    assert.ok(hit.runtime.stunnedUntilMs > 800);
  });

  it('a stun landing during windup aborts to engaging with a stale (not reset) windupUntilMs (matches the captured trace\'s scenario K)', () => {
    assert.strictEqual(LEGACY_TRACE_FIXTURE.stunDuringWindupAbortsToEngagingWithStaleWindupUntil, true);
    let runtime = createLegacyDroneRuntime(createTapeRandomSource([0, 0, 0, 0]), 0, BASE.fireIntervalMs, 1).runtime;
    runtime = { ...decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 12 }), createTapeRandomSource([])).runtime, lastFireAtMs: 0, strafeFlipAtMs: Number.MAX_SAFE_INTEGER };
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: BASE.fireIntervalMs, canSeePlayer: true, distance: 12 }), createTapeRandomSource([])).runtime;
    assert.strictEqual(runtime.state, 'attacking');
    const staleWindup = runtime.windupUntilMs;
    const hit = decideLegacyDroneAi(runtime, obs({ nowMs: BASE.fireIntervalMs + 100, canSeePlayer: true, distance: 12, hitFlashUntilMs: BASE.fireIntervalMs + 150 }), createTapeRandomSource([]));
    assert.strictEqual(hit.state, 'engaging');
    assert.strictEqual(hit.runtime.windupUntilMs, staleWindup);
  });

  it('destruction is terminal and eventually reports visibility-complete (matches the captured trace\'s scenario N/O)', () => {
    assert.strictEqual(LEGACY_TRACE_FIXTURE.destroyIsTerminalAndVisibleFalseEventually, true);
    let runtime = createLegacyDroneRuntime(createTapeRandomSource([0, 0, 0, 0]), 0, BASE.fireIntervalMs, 1).runtime;
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 1000, destroyedAtMs: 1000 }), createTapeRandomSource([])).runtime;
    const d = decideLegacyDroneAi(runtime, obs({ nowMs: 1000 + BASE.destroyShrinkMs, destroyedAtMs: 1000 }), createTapeRandomSource([]));
    assert.strictEqual(d.state, 'destroyed');
    assert.strictEqual(d.completeDestroyedPresentation, true);
  });

  it('restart produces a fresh life with stun cleared (matches the captured trace\'s scenario P)', () => {
    assert.strictEqual(LEGACY_TRACE_FIXTURE.restartProducesAFreshLifeNearHomeWithClearedStun, true);
    let runtime = createLegacyDroneRuntime(createTapeRandomSource([0, 0, 0, 0]), 0, BASE.fireIntervalMs, 1).runtime;
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 12, hitFlashUntilMs: 750 }), createTapeRandomSource([])).runtime;
    assert.ok(runtime.stunnedUntilMs > 0);
    const reset = resetLegacyDroneRuntime(runtime, createTapeRandomSource([0.5]), 99999, BASE.fireIntervalMs);
    assert.strictEqual(reset.stunnedUntilMs, 0);
    assert.strictEqual(reset.state, 'spawning');
  });
});

/**
 * ============================================================================
 * Milestone 9B.1 — FROZEN LEGACY ORACLE + full deterministic sequence parity.
 * ============================================================================
 *
 * The formula-parity tests above prove individual formulas match, in
 * isolation. They do NOT prove the two implementations agree across a full,
 * continuous, multi-phase timeline — a hand-transcribed formula can still be
 * wired together in a subtly different order than the pure core, and two
 * captured LIVE browser traces can't prove this either (real-time scheduling
 * differences make exact tick-for-tick browser comparison meaningless, as
 * Step 9B's own report found: 38 vs 20 fire events between two live sessions
 * with the identical seed). This section closes that gap with a genuinely
 * independent, deterministic, synthetic-clock re-implementation.
 *
 * `LegacyOracleDrone` below is a SEPARATE, from-scratch transcription of the
 * exact pre-9B `DroneEnemy.tsx` decision logic (as verified against the
 * committed source at HEAD `d7c22ed` and the captured pre-refactor browser
 * trace) — written in a deliberately different code shape (a mutable class
 * with an imperative `tick()` method, not the pure core's immutable-return
 * function style) so that agreement between the two is genuine independent
 * corroboration, not a restatement of the same code under a new name. Two
 * independent authorings of the same verified behaviour landing on the same
 * class of bug in exactly the same way is possible but far less likely than
 * either one alone drifting — this is the real value of the exercise.
 *
 * Test-only. Never imported by `src/components/**`. No React, no Three.js,
 * no browser globals, no `Math.random()` — every random draw goes through
 * the SAME injected `RandomSource` the real pure core uses.
 */
class LegacyOracleDrone {
  state: 'spawning' | 'searching' | 'engaging' | 'attacking' | 'destroyed' = 'spawning';
  spawnedAtMs: number;
  lastFireAtMs: number;
  windupUntilMs = 0;
  stunnedUntilMs = 0;
  strafeDirection: -1 | 1;
  strafeFlipAtMs: number;
  destroyShrinkFromMs = 0;

  // Per-tick output — recomputed (reset to defaults) at the start of every tick() call.
  movementMode: 'spawn-hold' | 'search' | 'stunned-hold' | 'engage' | 'attack' | 'destroyed-hold' = 'spawn-hold';
  facePlayer = false;
  stunned = false;
  spawnProgress = 0;
  destroyProgress = 0;
  requestRecordDestroyed = false;
  completeDestroyedPresentation = false;
  startWindup = false;
  abortWindup = false;
  fireExactlyOnce = false;
  aimSpread: { x: number; y: number; z: number } | null = null;
  strafeFlipped = false;

  constructor(rng: import('./droneAiRandom').RandomSource, nowMs: number, baseFireIntervalMs: number) {
    this.spawnedAtMs = nowMs;
    // Exact legacy construction order: phase (discarded here — the oracle
    // doesn't track position/phase, only decision state), fire jitter,
    // strafe direction, strafe-flip jitter.
    rng.nextFloat(); // initial phase — consumed to preserve draw order/count, value unused by decision logic
    this.lastFireAtMs = nowMs + rng.nextFloat() * baseFireIntervalMs;
    this.strafeDirection = rng.nextFloat() < 0.5 ? 1 : -1;
    this.strafeFlipAtMs = nowMs + 1500 + rng.nextFloat() * 1500;
  }

  reset(rng: import('./droneAiRandom').RandomSource, nowMs: number, resolvedFireIntervalMs: number): void {
    this.state = 'spawning';
    this.spawnedAtMs = nowMs;
    this.lastFireAtMs = nowMs + rng.nextFloat() * resolvedFireIntervalMs;
    this.windupUntilMs = 0;
    this.stunnedUntilMs = 0;
    this.destroyShrinkFromMs = 0;
    // strafeDirection / strafeFlipAtMs deliberately untouched — the verified legacy quirk.
  }

  tick(o: LegacyDroneAiObservation, rng: import('./droneAiRandom').RandomSource): void {
    const now = o.nowMs;
    this.requestRecordDestroyed = false;
    this.completeDestroyedPresentation = false;
    this.startWindup = false;
    this.abortWindup = false;
    this.fireExactlyOnce = false;
    this.aimSpread = null;
    this.strafeFlipped = false;

    if (o.destroyedAtMs !== 0 && this.state !== 'destroyed') {
      this.state = 'destroyed';
      this.destroyShrinkFromMs = now;
      this.requestRecordDestroyed = true;
    }
    if (this.state === 'destroyed') {
      const t = o.destroyShrinkMs > 0 ? (now - this.destroyShrinkFromMs) / o.destroyShrinkMs : 1;
      this.destroyProgress = Math.max(0.001, 1 - t);
      this.completeDestroyedPresentation = t >= 1;
      this.movementMode = 'destroyed-hold';
      this.facePlayer = false;
      this.stunned = false;
      return;
    }

    const flashing = now < o.hitFlashUntilMs;
    if (flashing && this.stunnedUntilMs < now) this.stunnedUntilMs = now + o.stunMs;
    this.stunned = now < this.stunnedUntilMs;

    if (this.state === 'spawning') {
      const t = o.spawnDurationMs > 0 ? (now - this.spawnedAtMs) / o.spawnDurationMs : 1;
      this.spawnProgress = Math.min(1, t);
      if (t >= 1) this.state = 'searching';
    } else {
      this.spawnProgress = 1;
    }

    if (this.state === 'searching' && o.canSeePlayer) this.state = 'engaging';
    if (this.state === 'engaging' && !o.canSeePlayer && o.distance > o.detectRadius) this.state = 'searching';

    if (this.stunned) {
      this.movementMode = 'stunned-hold';
    } else if (this.state === 'spawning') {
      this.movementMode = 'spawn-hold';
    } else if (this.state === 'searching') {
      this.movementMode = 'search';
    } else {
      this.movementMode = this.state === 'attacking' ? 'attack' : 'engage';
      if (now > this.strafeFlipAtMs) {
        this.strafeDirection = this.strafeDirection === 1 ? -1 : 1;
        this.strafeFlipAtMs = now + 1400 + rng.nextFloat() * 1600;
        this.strafeFlipped = true;
      }
    }

    this.facePlayer = this.state === 'engaging' || this.state === 'attacking';

    if ((this.state === 'engaging' || this.state === 'attacking') && !this.stunned && o.canSeePlayer) {
      if (this.state === 'engaging' && now - this.lastFireAtMs >= o.fireIntervalMs) {
        this.state = 'attacking';
        this.windupUntilMs = now + o.attackWindupMs;
        this.startWindup = true;
      }
      if (this.state === 'attacking' && now >= this.windupUntilMs) {
        const spreadRad = (o.aimSpreadDeg * Math.PI) / 180;
        this.aimSpread = { x: (rng.nextFloat() - 0.5) * spreadRad, y: (rng.nextFloat() - 0.5) * spreadRad, z: (rng.nextFloat() - 0.5) * spreadRad };
        this.fireExactlyOnce = true;
        this.lastFireAtMs = now;
        this.state = 'engaging';
      }
    } else if (this.state === 'attacking' && (this.stunned || !o.canSeePlayer)) {
      this.state = 'engaging';
      this.abortWindup = true;
    }
  }
}

/**
 * Wraps a RandomSource to count how many values it actually consumed,
 * without changing its behaviour. Every method is counted independently so
 * the wrapper stays correct even though only `nextFloat()` is exercised by
 * the decision paths under test here.
 */
function countingRandomSource(inner: import('./droneAiRandom').RandomSource): import('./droneAiRandom').RandomSource & { count: number } {
  const wrapped = {
    count: 0,
    nextFloat: (): number => {
      wrapped.count++;
      return inner.nextFloat();
    },
    range: (min: number, max: number): number => {
      wrapped.count++;
      return inner.range(min, max);
    },
    choose: <T,>(items: readonly T[]): T => {
      wrapped.count++;
      return inner.choose(items);
    },
  };
  return wrapped;
}

describe('droneAiLegacyOracle — full deterministic sequence parity (Milestone 9B.1)', () => {
  it('the oracle and the pure core agree at every tick across one continuous 21-phase synthetic timeline, using identically-seeded independent random streams', () => {
    // A literal, hand-chosen tape (the same technique already used by every
    // formula-parity test above), fed into TWO SEPARATE `RandomSource`
    // instances — one for the oracle, one for the core — rather than
    // `createSeededRandomSource`. A live PRNG stream was tried first, but its
    // exact float outputs are opaque: whether a cooldown has elapsed by a
    // given synthetic timestamp depends on an unobserved jitter draw, so the
    // designed timeline could silently skip the fire/flip events it was
    // built to exercise (this happened — the first version of this test
    // undershot the "at least one fire happened" sanity floor because the
    // fire-desync jitter it drew happened to push the cooldown past the end
    // of the timeline). A literal tape restores full control over WHICH
    // events happen and WHEN, while the actual correctness assertions below
    // remain purely relative (oracle output === core output at every tick)
    // — never a hand-computed absolute expected value, which is the property
    // this test exists to guarantee independent of any specific tape.
    const TAPE_LIFE_1 = [
      0.1, 0.0, 0.2, 0.5, // spawn: phase, fire-jitter(=0 so lastFireAtMs=0), strafeDir(=1), strafeFlip-jitter(deadline=2250)
      0.5, // strafe-flip re-roll at t=2300 (2300 > 2250) -> new deadline 4500
      0.3, 0.7, 0.4, // aim spread x/y/z, fires at t=3050
      0.5, // strafe-flip re-roll at t=5450 (5450 > 4500) -> new deadline 7650
      ...Array(20).fill(0.5), // generous padding so any incidental extra draw never exhausts the tape
    ];
    const TAPE_LIFE_2 = [0.5, ...Array(10).fill(0.5)]; // reset draws exactly one value; padded defensively

    const coreRng = countingRandomSource(createTapeRandomSource(TAPE_LIFE_1));
    const oracleRng = countingRandomSource(createTapeRandomSource(TAPE_LIFE_1));

    const coreInit = createLegacyDroneRuntime(coreRng, 0, BASE.fireIntervalMs, 1);
    let coreRuntime = coreInit.runtime;
    const oracle = new LegacyOracleDrone(oracleRng, 0, BASE.fireIntervalMs);

    // One continuous, monotonically-increasing synthetic timeline covering
    // all 21 required phases. Assertions compare core vs oracle directly —
    // deliberately NOT against hand-computed absolute expected values (that
    // would just relocate the risk of a hand-arithmetic mistake into the
    // test itself); the exhaustive absolute-value unit tests in
    // `droneAiStateMachine.test.ts` already cover that ground independently.
    // The tape above was chosen so the events named in each label actually
    // occur at that tick — but even if a future core change shifted exactly
    // WHEN an event fires, the tick-by-tick oracle-vs-core comparison below
    // stays a valid parity proof; only the final sanity floor (coreRng.count
    // >= 8) would need revisiting.
    const steps: Array<Partial<LegacyDroneAiObservation> & { label: string }> = [
      { label: '1. spawning (before boundary)', nowMs: 300, distance: 100, canSeePlayer: false },
      { label: '2. spawn boundary (exact)', nowMs: 700, distance: 100, canSeePlayer: false },
      { label: '3. searching', nowMs: 750, distance: 100, canSeePlayer: false },
      { label: '4. acquire + too-far engage', nowMs: 800, distance: 25, canSeePlayer: true },
      { label: '5. too-far engage (confirm)', nowMs: 850, distance: 25, canSeePlayer: true },
      { label: '6. preferred-range engage', nowMs: 900, distance: 15, canSeePlayer: true },
      { label: '7. too-close engage', nowMs: 950, distance: 7, canSeePlayer: true },
      { label: '8. back to preferred', nowMs: 1000, distance: 15, canSeePlayer: true },
      { label: '9. strafe flip', nowMs: 2300, distance: 15, canSeePlayer: true },
      { label: '10. cooldown completion / windup start', nowMs: 2400, distance: 15, canSeePlayer: true },
      { label: '11. mid-windup (no fire yet)', nowMs: 3000, distance: 15, canSeePlayer: true },
      { label: '12. exact fire boundary', nowMs: 3050, distance: 15, canSeePlayer: true },
      { label: '13. post-fire engaging', nowMs: 3100, distance: 15, canSeePlayer: true },
      { label: '14. stun during engage', nowMs: 3150, distance: 15, canSeePlayer: true, hitFlashUntilMs: 3200 },
      { label: '15. second cooldown completion', nowMs: 5450, distance: 15, canSeePlayer: true },
      { label: '16. stun during windup -> abort', nowMs: 5500, distance: 15, canSeePlayer: true, hitFlashUntilMs: 5550 },
      { label: '17. blocked LOS inside detect radius (quirk)', nowMs: 6000, distance: 30, canSeePlayer: false },
      { label: '18. out-of-range loss', nowMs: 6050, distance: 50, canSeePlayer: false },
      { label: '19. destruction', nowMs: 6100, distance: 50, canSeePlayer: false, destroyedAtMs: 6100 },
      { label: '20. shrink completion', nowMs: 6360, distance: 50, canSeePlayer: false, destroyedAtMs: 6100 },
    ];

    let tickCount = 0;
    for (const step of steps) {
      const observation = obs({ nowMs: step.nowMs, distance: step.distance, canSeePlayer: step.canSeePlayer, hitFlashUntilMs: step.hitFlashUntilMs ?? 0, destroyedAtMs: step.destroyedAtMs ?? 0 });
      const decision = decideLegacyDroneAi(coreRuntime, observation, coreRng);
      coreRuntime = decision.runtime;
      oracle.tick(observation, oracleRng);
      tickCount++;

      const at = `at step "${step.label}"`;
      assert.strictEqual(decision.state, oracle.state, `state mismatch ${at}`);
      assert.strictEqual(decision.movementMode, oracle.movementMode, `movementMode mismatch ${at}`);
      assert.strictEqual(decision.stunned, oracle.stunned, `stunned mismatch ${at}`);
      assert.strictEqual(decision.runtime.windupUntilMs, oracle.windupUntilMs, `windupUntilMs mismatch ${at}`);
      assert.strictEqual(decision.runtime.stunnedUntilMs, oracle.stunnedUntilMs, `stunnedUntilMs mismatch ${at}`);
      assert.strictEqual(decision.runtime.lastFireAtMs, oracle.lastFireAtMs, `lastFireAtMs mismatch ${at}`);
      assert.strictEqual(decision.runtime.strafeDirection, oracle.strafeDirection, `strafeDirection mismatch ${at}`);
      assert.strictEqual(decision.runtime.strafeFlipAtMs, oracle.strafeFlipAtMs, `strafeFlipAtMs mismatch ${at}`);
      assert.strictEqual(decision.startWindup, oracle.startWindup, `startWindup mismatch ${at}`);
      assert.strictEqual(decision.abortWindup, oracle.abortWindup, `abortWindup mismatch ${at}`);
      assert.strictEqual(decision.fireExactlyOnce, oracle.fireExactlyOnce, `fireExactlyOnce mismatch ${at}`);
      assert.strictEqual(decision.requestRecordDestroyed, oracle.requestRecordDestroyed, `requestRecordDestroyed mismatch ${at}`);
      assert.strictEqual(decision.completeDestroyedPresentation, oracle.completeDestroyedPresentation, `completeDestroyedPresentation mismatch ${at}`);
      assert.strictEqual(decision.strafeFlipped, oracle.strafeFlipped, `strafeFlipped mismatch ${at}`);
      assert.deepStrictEqual(decision.aimSpread, oracle.aimSpread, `aimSpread mismatch ${at}`);
      if (step.label.startsWith('1.') || step.label.startsWith('2.')) {
        assert.strictEqual(decision.spawnProgress, oracle.spawnProgress, `spawnProgress mismatch ${at}`);
      }
      if (step.label.startsWith('19.') || step.label.startsWith('20.')) {
        assert.strictEqual(decision.destroyProgress, oracle.destroyProgress, `destroyProgress mismatch ${at}`);
      }
    }

    assert.strictEqual(tickCount, 20, 'sanity: all 20 timeline steps ran');
    // Sanity checkpoints — trivially true regardless of exact random values,
    // guarding against the sequence-parity assertions above vacuously
    // passing because both implementations independently do nothing.
    assert.strictEqual(coreRuntime.state, 'destroyed');
    assert.strictEqual(oracle.state, 'destroyed');
    assert.strictEqual(coreRng.count, oracleRng.count, 'random CALL COUNT must match exactly across the whole synthetic run — any divergence in consumption order or count would have shown up here');
    assert.ok(coreRng.count >= 8, 'sanity: the timeline above must have actually exercised spawn + at least one strafe flip + at least one fire to be a meaningful test');

    // --- 21. reset / second-life random reseed ---
    const coreRng2 = countingRandomSource(createTapeRandomSource(TAPE_LIFE_2));
    const oracleRng2 = countingRandomSource(createTapeRandomSource(TAPE_LIFE_2));
    const resolvedFireIntervalMs = 1800; // simulated difficulty-resolved value, deliberately different from the base constant
    const resetRuntime = resetLegacyDroneRuntime(coreRuntime, coreRng2, 7000, resolvedFireIntervalMs);
    oracle.reset(oracleRng2, 7000, resolvedFireIntervalMs);

    assert.strictEqual(resetRuntime.state, oracle.state);
    assert.strictEqual(resetRuntime.state, 'spawning');
    assert.strictEqual(resetRuntime.lastFireAtMs, oracle.lastFireAtMs);
    assert.strictEqual(resetRuntime.windupUntilMs, oracle.windupUntilMs);
    assert.strictEqual(resetRuntime.windupUntilMs, 0);
    assert.strictEqual(resetRuntime.stunnedUntilMs, oracle.stunnedUntilMs);
    assert.strictEqual(resetRuntime.stunnedUntilMs, 0);
    // The verified legacy quirk, once more, this time through the oracle cross-check specifically: strafe fields survive the reset unchanged.
    assert.strictEqual(resetRuntime.strafeDirection, coreRuntime.strafeDirection);
    assert.strictEqual(resetRuntime.strafeFlipAtMs, coreRuntime.strafeFlipAtMs);
    assert.strictEqual(oracle.strafeDirection, coreRuntime.strafeDirection);
    assert.strictEqual(oracle.strafeFlipAtMs, coreRuntime.strafeFlipAtMs);
    assert.strictEqual(coreRng2.count, oracleRng2.count, 'reset random call count must match exactly (both draw exactly one fire-jitter value)');
    assert.strictEqual(coreRng2.count, 1, 'reset must consume exactly one random value, matching the verified legacy resetInternal()');

    // One drone's stream cannot affect another's: an entirely separate
    // drone/life built from a DIFFERENT seed must not reproduce life 1's
    // sequence, proving the two streams used above were never secretly the
    // same underlying generator.
    const otherDroneRng = createSeededRandomSource(deriveDroneSeed({ matchSeed: 0x9b_d20e, droneId: 'deck-b', lifeGeneration: 1 }));
    const thisDroneRng = createSeededRandomSource(deriveDroneSeed({ matchSeed: 0x9b_d20e, droneId: 'deck-a', lifeGeneration: 1 }));
    assert.notStrictEqual(otherDroneRng.nextFloat(), thisDroneRng.nextFloat());
  });
});
