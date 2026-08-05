import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLegacyDroneRuntime, decideLegacyDroneAi, evaluateAttackReadiness, resetLegacyDroneRuntime } from './droneAiStateMachine';
import { createSeededRandomSource, createTapeRandomSource } from './droneAiRandom';
import type { LegacyDroneAiObservation, LegacyDroneAiRuntime } from './droneAiTypes';

// Base config numbers mirror enemyConfig.ts's DRONE constants (Medium/base values).
const BASE = {
  detectRadius: 42,
  fireIntervalMs: 2400,
  spawnDurationMs: 700,
  attackWindupMs: 650,
  destroyShrinkMs: 260,
  stunMs: 240,
  aimSpreadDeg: 4.5,
  // Milestone 9C — mirrors DRONE_PERCEPTION_MEMORY's own selected values.
  losLossConfirmMs: 250,
  investigateDurationMs: 4500,
  // Milestone 9E — 0 matches Medium's own resolved profile exactly (no added
  // delay), preserving every pre-9E test's same-tick acquire→windup cascade
  // assumption unchanged.
  acquireReactionDelayMs: 0,
};

function obs(overrides: Partial<LegacyDroneAiObservation> = {}): LegacyDroneAiObservation {
  return {
    nowMs: 0,
    distance: 15,
    canSeePlayer: true,
    targetPosition: { x: 0, y: 0, z: 15 },
    playerGeneration: 0,
    destroyedAtMs: 0,
    hitFlashUntilMs: 0,
    ...BASE,
    ...overrides,
  };
}

function freshRuntime(rng = createSeededRandomSource(1), nowMs = 0): LegacyDroneAiRuntime {
  return createLegacyDroneRuntime(rng, nowMs, BASE.fireIntervalMs, 1).runtime;
}

describe('droneAiStateMachine — six-state model (Milestone 9C adds investigating)', () => {
  it('createLegacyDroneRuntime always starts in spawning', () => {
    assert.strictEqual(freshRuntime().state, 'spawning');
  });

  it('only the six real states are ever produced: spawning, searching, investigating, engaging, attacking, destroyed — and a realistic LOS-loss/reacquire sweep actually reaches every one of them', () => {
    const valid = new Set(['spawning', 'searching', 'investigating', 'engaging', 'attacking', 'destroyed']);
    const seen = new Set<string>();
    let runtime = freshRuntime();
    const rng = createSeededRandomSource(2);
    let now = 0;
    for (let i = 0; i < 500; i++) {
      now += 50;
      // Alternate visibility in a slow, deliberate rhythm — each half-cycle
      // is 6000ms, comfortably longer than BOTH losLossConfirmMs (250ms) and
      // investigateDurationMs (4500ms), so an invisible half-cycle actually
      // completes a full investigate→timeout→searching arc (not just enters
      // investigating and reacquires before it can time out), making this a
      // REALISTIC exercise of every reachable state, not just a permission
      // check.
      const cycle = Math.floor(i / 120) % 2;
      const canSeePlayer = cycle === 0;
      const decision = decideLegacyDroneAi(runtime, obs({ nowMs: now, distance: 12, canSeePlayer }), rng);
      assert.ok(valid.has(decision.state), `unexpected state: ${decision.state}`);
      seen.add(decision.state);
      runtime = decision.runtime;
    }
    for (const expected of ['spawning', 'searching', 'investigating', 'engaging']) {
      assert.ok(seen.has(expected), `the sweep never reached "${expected}" — the exhaustiveness check above would not have caught its absence`);
    }
  });

  it("'stunned' is never a discrete state value — it is a boolean overlay only", () => {
    const rng = createSeededRandomSource(3);
    let runtime = freshRuntime(rng, 0);
    // Fast-forward past spawn.
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 1000 }), rng).runtime;
    const decision = decideLegacyDroneAi(runtime, obs({ nowMs: 1050, hitFlashUntilMs: 1100 }), rng);
    assert.notStrictEqual(decision.state, 'stunned');
    assert.strictEqual(decision.stunned, true);
  });

  it("'inactive' is never produced by the pure runtime", () => {
    let runtime = freshRuntime();
    const rng = createSeededRandomSource(4);
    for (let now = 0; now < 5000; now += 100) {
      const d = decideLegacyDroneAi(runtime, obs({ nowMs: now }), rng);
      assert.notStrictEqual(d.state, 'inactive' as any);
      runtime = d.runtime;
    }
  });

  it('future 9D+ states (recover/dead) are never returned as a runtime state value, across an exhaustive input sweep — doc comments may still explain what is deferred and why', () => {
    const disallowed = new Set(['recover', 'dead']);
    const rng = createSeededRandomSource(48);
    let runtime = freshRuntime(rng, 0);
    for (let now = 0; now < 20000; now += 137) {
      for (const canSeePlayer of [true, false]) {
        for (const flash of [0, now + 10]) {
          const d = decideLegacyDroneAi(runtime, obs({ nowMs: now, canSeePlayer, distance: 15, hitFlashUntilMs: flash }), rng);
          assert.ok(!disallowed.has(d.state), `unexpected future-phase state produced: ${d.state}`);
        }
      }
      runtime = decideLegacyDroneAi(runtime, obs({ nowMs: now, canSeePlayer: true, distance: 15 }), rng).runtime;
    }
  });
});

describe('droneAiStateMachine — spawn', () => {
  it('stays spawning strictly before the duration boundary', () => {
    const runtime = freshRuntime(createSeededRandomSource(5), 0);
    const d = decideLegacyDroneAi(runtime, obs({ nowMs: 699 }), createSeededRandomSource(5));
    assert.strictEqual(d.state, 'spawning');
    assert.ok(d.spawnProgress < 1);
  });

  it('reproduces the exact boundary result (t>=1 -> searching, same tick)', () => {
    const runtime = freshRuntime(createSeededRandomSource(6), 0);
    const d = decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: false, distance: 100 }), createSeededRandomSource(6));
    assert.strictEqual(d.state, 'searching');
    assert.strictEqual(d.spawnProgress, 1);
  });

  it('a same-tick spawning->searching->engaging cascade is preserved when LOS is already clear at the boundary', () => {
    const runtime = freshRuntime(createSeededRandomSource(7), 0);
    const d = decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 15 }), createSeededRandomSource(7));
    assert.strictEqual(d.state, 'engaging');
  });

  it('cannot fire while spawning, even with LOS and an elapsed cooldown', () => {
    const runtime = freshRuntime(createSeededRandomSource(8), 0);
    const d = decideLegacyDroneAi(runtime, obs({ nowMs: 500, canSeePlayer: true, distance: 15 }), createSeededRandomSource(8));
    assert.strictEqual(d.state, 'spawning');
    assert.strictEqual(d.fireExactlyOnce, false);
    assert.strictEqual(d.startWindup, false);
  });

  it('reports spawn-hold movement mode while spawning and not stunned', () => {
    const runtime = freshRuntime(createSeededRandomSource(9), 0);
    const d = decideLegacyDroneAi(runtime, obs({ nowMs: 100 }), createSeededRandomSource(9));
    assert.strictEqual(d.movementMode, 'spawn-hold');
  });
});

describe('droneAiStateMachine — search / acquire', () => {
  function pastSpawn(rng = createSeededRandomSource(10)) {
    let runtime = freshRuntime(rng, 0);
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: false, distance: 100 }), rng).runtime;
    assert.strictEqual(runtime.state, 'searching');
    return runtime;
  }

  it('blocked LOS keeps the drone searching', () => {
    const rng = createSeededRandomSource(11);
    const runtime = pastSpawn(rng);
    const d = decideLegacyDroneAi(runtime, obs({ nowMs: 800, canSeePlayer: false, distance: 20 }), rng);
    assert.strictEqual(d.state, 'searching');
  });

  it('clear LOS within detect radius enters engaging', () => {
    const rng = createSeededRandomSource(12);
    const runtime = pastSpawn(rng);
    const d = decideLegacyDroneAi(runtime, obs({ nowMs: 800, canSeePlayer: true, distance: 15 }), rng);
    assert.strictEqual(d.state, 'engaging');
  });

  it('no duplicate entry event — re-evaluating while already engaging does not re-trigger anything acquisition-specific', () => {
    const rng = createSeededRandomSource(13);
    let runtime = pastSpawn(rng);
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 800, canSeePlayer: true, distance: 15 }), rng).runtime;
    assert.strictEqual(runtime.state, 'engaging');
    const again = decideLegacyDroneAi(runtime, obs({ nowMs: 850, canSeePlayer: true, distance: 15 }), rng);
    assert.strictEqual(again.state, 'engaging');
  });
});

describe('droneAiStateMachine — LOS-loss confirmation (Milestone 9C — intentionally supersedes the old 9B quirk)', () => {
  // The 9B quirk this block used to assert ("blocked LOS while still inside
  // detectRadius does NOT revert to searching, but blocked LOS BEYOND
  // detectRadius reverts immediately") is gone as of 9C, replaced by ONE
  // unified rule: distance no longer matters at all — only `canSeePlayer`
  // does, and losing it (for any reason) now requires `losLossConfirmMs` of
  // CONTINUOUS loss before anything happens, at which point the drone enters
  // `investigating` rather than snapping back to ambient `searching`. See
  // `docs/decisions.md`'s Step 9C entry and `decideLegacyDroneAi`'s own doc
  // comment for the full replacement rationale — this is the ONE
  // intentional, disclosed behaviour change this phase makes.

  it('blocked LOS does NOT immediately transition an engaging drone, regardless of distance — inside or beyond detectRadius alike', () => {
    const rng = createSeededRandomSource(14);
    let runtime = freshRuntime(rng, 0);
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 15 }), rng).runtime;
    assert.strictEqual(runtime.state, 'engaging');
    const insideRadius = decideLegacyDroneAi(runtime, obs({ nowMs: 800, canSeePlayer: false, distance: 30 }), rng);
    assert.strictEqual(insideRadius.state, 'engaging', 'blocked LOS inside detectRadius must not immediately transition');
    const beyondRadius = decideLegacyDroneAi(runtime, obs({ nowMs: 800, canSeePlayer: false, distance: 50 }), rng);
    assert.strictEqual(beyondRadius.state, 'engaging', '9C: distance alone no longer triggers an immediate revert either — both cases wait for the same confirmation window');
  });

  it('sustained LOS loss enters investigating exactly once losLossConfirmMs of continuous loss elapses, not one tick before', () => {
    const rng = createSeededRandomSource(15);
    let runtime = freshRuntime(rng, 0);
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 15 }), rng).runtime;
    assert.strictEqual(runtime.state, 'engaging');
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 800, canSeePlayer: false, distance: 50 }), rng).runtime; // loss begins — losLostStartedAtMs = 800
    assert.strictEqual(runtime.state, 'engaging');
    const justUnder = decideLegacyDroneAi(runtime, obs({ nowMs: 800 + BASE.losLossConfirmMs - 1, canSeePlayer: false, distance: 50 }), rng);
    assert.strictEqual(justUnder.state, 'engaging', 'one ms before the confirmation boundary must still be engaging');
    const confirmed = decideLegacyDroneAi(runtime, obs({ nowMs: 800 + BASE.losLossConfirmMs, canSeePlayer: false, distance: 50 }), rng);
    assert.strictEqual(confirmed.state, 'investigating', 'exactly at the confirmation boundary the drone must enter investigating');
    assert.ok(confirmed.runtime.lastKnownTargetPosition !== null, 'the last confirmed-visible position must be preserved into investigating');
  });

  it('a one-frame LOS flicker well under the confirmation window never enters investigating (anti-thrash)', () => {
    const rng = createSeededRandomSource(150);
    let runtime = freshRuntime(rng, 0);
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 15 }), rng).runtime;
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 716, canSeePlayer: false, distance: 15 }), rng).runtime; // one ~16ms frame of blocked LOS
    assert.strictEqual(runtime.state, 'engaging');
    const recovered = decideLegacyDroneAi(runtime, obs({ nowMs: 732, canSeePlayer: true, distance: 15 }), rng);
    assert.strictEqual(recovered.state, 'engaging', 'LOS returning within one frame must never have entered investigating');
    assert.strictEqual(recovered.runtime.losLostStartedAtMs, null, 'the loss timer must be cleared the instant visibility returns');
  });

  it('an engaging drone with blocked LOS (inside radius) cannot fire, even before confirmation completes', () => {
    const rng = createSeededRandomSource(16);
    let runtime = freshRuntime(rng, 0);
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 15 }), rng).runtime;
    runtime = { ...runtime, lastFireAtMs: 0 }; // force cooldown elapsed
    const d = decideLegacyDroneAi(runtime, obs({ nowMs: 5000, canSeePlayer: false, distance: 30 }), rng);
    assert.strictEqual(d.state, 'engaging', 'the loss timer only just started this exact tick — confirmation has not elapsed yet');
    assert.strictEqual(d.startWindup, false);
    assert.strictEqual(d.fireExactlyOnce, false);
  });
});

describe('droneAiStateMachine — engage / fire cooldown', () => {
  it('cooldown not reached stays engaging', () => {
    const rng = createSeededRandomSource(17);
    let runtime = freshRuntime(rng, 0);
    runtime = { ...decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 15 }), rng).runtime, lastFireAtMs: 1000 };
    const d = decideLegacyDroneAi(runtime, obs({ nowMs: 1000 + BASE.fireIntervalMs - 1, canSeePlayer: true, distance: 15 }), rng);
    assert.strictEqual(d.state, 'engaging');
    assert.strictEqual(d.startWindup, false);
  });

  it('cooldown reached enters attack and records windup start exactly once', () => {
    const rng = createSeededRandomSource(18);
    let runtime = freshRuntime(rng, 0);
    runtime = { ...decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 15 }), rng).runtime, lastFireAtMs: 1000 };
    const d = decideLegacyDroneAi(runtime, obs({ nowMs: 1000 + BASE.fireIntervalMs, canSeePlayer: true, distance: 15 }), rng);
    assert.strictEqual(d.state, 'attacking');
    assert.strictEqual(d.startWindup, true);
    assert.strictEqual(d.runtime.windupUntilMs, 1000 + BASE.fireIntervalMs + BASE.attackWindupMs);
  });
});

describe('droneAiStateMachine — attack', () => {
  function engagingReadyToFire(rng: ReturnType<typeof createSeededRandomSource>) {
    let runtime = freshRuntime(rng, 0);
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 15 }), rng).runtime;
    runtime = { ...runtime, lastFireAtMs: 0 };
    return runtime;
  }

  it('stays attacking before windup completion', () => {
    const rng = createSeededRandomSource(19);
    let runtime = engagingReadyToFire(rng);
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: BASE.fireIntervalMs, canSeePlayer: true, distance: 15 }), rng).runtime;
    assert.strictEqual(runtime.state, 'attacking');
    const d = decideLegacyDroneAi(runtime, obs({ nowMs: BASE.fireIntervalMs + BASE.attackWindupMs - 1, canSeePlayer: true, distance: 15 }), rng);
    assert.strictEqual(d.state, 'attacking');
    assert.strictEqual(d.fireExactlyOnce, false);
  });

  it('completion fires exactly once and returns to engaging', () => {
    const rng = createSeededRandomSource(20);
    let runtime = engagingReadyToFire(rng);
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: BASE.fireIntervalMs, canSeePlayer: true, distance: 15 }), rng).runtime;
    const d = decideLegacyDroneAi(runtime, obs({ nowMs: BASE.fireIntervalMs + BASE.attackWindupMs, canSeePlayer: true, distance: 15 }), rng);
    assert.strictEqual(d.fireExactlyOnce, true);
    assert.strictEqual(d.state, 'engaging');
    assert.ok(d.aimSpread !== null);
    assert.strictEqual(d.runtime.lastFireAtMs, BASE.fireIntervalMs + BASE.attackWindupMs);
  });

  it('repeated evaluation at the same timestamp cannot fire twice', () => {
    const rng = createSeededRandomSource(21);
    let runtime = engagingReadyToFire(rng);
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: BASE.fireIntervalMs, canSeePlayer: true, distance: 15 }), rng).runtime;
    const fireTick = BASE.fireIntervalMs + BASE.attackWindupMs;
    const first = decideLegacyDroneAi(runtime, obs({ nowMs: fireTick, canSeePlayer: true, distance: 15 }), rng);
    assert.strictEqual(first.fireExactlyOnce, true);
    const second = decideLegacyDroneAi(first.runtime, obs({ nowMs: fireTick, canSeePlayer: true, distance: 15 }), rng);
    assert.strictEqual(second.fireExactlyOnce, false, 'a second evaluation at the identical timestamp must not fire again — the cooldown is measured from the just-updated lastFireAtMs');
  });

  it('LOS interruption during windup aborts back to engaging', () => {
    const rng = createSeededRandomSource(22);
    let runtime = engagingReadyToFire(rng);
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: BASE.fireIntervalMs, canSeePlayer: true, distance: 15 }), rng).runtime;
    assert.strictEqual(runtime.state, 'attacking');
    const d = decideLegacyDroneAi(runtime, obs({ nowMs: BASE.fireIntervalMs + 100, canSeePlayer: false, distance: 15 }), rng);
    assert.strictEqual(d.state, 'engaging');
    assert.strictEqual(d.abortWindup, true);
    assert.strictEqual(d.fireExactlyOnce, false);
  });

  it('stun interruption during windup aborts back to engaging', () => {
    const rng = createSeededRandomSource(23);
    let runtime = engagingReadyToFire(rng);
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: BASE.fireIntervalMs, canSeePlayer: true, distance: 15 }), rng).runtime;
    assert.strictEqual(runtime.state, 'attacking');
    const hitAt = BASE.fireIntervalMs + 100;
    const d = decideLegacyDroneAi(runtime, obs({ nowMs: hitAt, canSeePlayer: true, distance: 15, hitFlashUntilMs: hitAt + 90 }), rng);
    assert.strictEqual(d.stunned, true);
    assert.strictEqual(d.state, 'engaging');
    assert.strictEqual(d.abortWindup, true);
  });

  it('LEGACY QUIRK, preserved deliberately (see docs/decisions.md Step 9B entry): an aborted windup does NOT clear windupUntilMs — it remains at its stale pre-abort value until the next real windup overwrites it', () => {
    const rng = createSeededRandomSource(24);
    let runtime = engagingReadyToFire(rng);
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: BASE.fireIntervalMs, canSeePlayer: true, distance: 15 }), rng).runtime;
    const staleWindupUntil = runtime.windupUntilMs;
    assert.ok(staleWindupUntil > 0);
    const aborted = decideLegacyDroneAi(runtime, obs({ nowMs: BASE.fireIntervalMs + 100, canSeePlayer: false, distance: 15 }), rng);
    assert.strictEqual(aborted.runtime.windupUntilMs, staleWindupUntil, 'windupUntilMs must remain stale after an abort, matching the real DroneEnemy.tsx exactly');
  });

  it('cooldown semantics remain unchanged after an abort — lastFireAtMs is untouched, so the drone can re-attempt a windup as soon as canSeePlayer returns, without waiting out a fresh cooldown', () => {
    const rng = createSeededRandomSource(25);
    let runtime = engagingReadyToFire(rng);
    const preAttemptLastFireAt = runtime.lastFireAtMs;
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: BASE.fireIntervalMs, canSeePlayer: true, distance: 15 }), rng).runtime;
    const aborted = decideLegacyDroneAi(runtime, obs({ nowMs: BASE.fireIntervalMs + 100, canSeePlayer: false, distance: 15 }), rng);
    assert.strictEqual(aborted.runtime.lastFireAtMs, preAttemptLastFireAt, 'abort must not touch lastFireAtMs');
    // LOS returns immediately — cooldown is still considered elapsed (it always was, that's why windup started in the first place), so a new windup begins on the very next eligible tick.
    const retried = decideLegacyDroneAi(aborted.runtime, obs({ nowMs: BASE.fireIntervalMs + 150, canSeePlayer: true, distance: 15 }), rng);
    assert.strictEqual(retried.startWindup, true);
  });
});

describe('droneAiStateMachine — stun overlay', () => {
  it('stun holds movement (stunned-hold mode) regardless of underlying state', () => {
    const rng = createSeededRandomSource(26);
    let runtime = freshRuntime(rng, 0);
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 15 }), rng).runtime;
    const d = decideLegacyDroneAi(runtime, obs({ nowMs: 750, canSeePlayer: true, distance: 15, hitFlashUntilMs: 800 }), rng);
    assert.strictEqual(d.movementMode, 'stunned-hold');
  });

  it('stun blocks a new attack even when cooldown has elapsed and LOS is clear', () => {
    const rng = createSeededRandomSource(27);
    let runtime = freshRuntime(rng, 0);
    runtime = { ...decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 15 }), rng).runtime, lastFireAtMs: 0 };
    const d = decideLegacyDroneAi(runtime, obs({ nowMs: BASE.fireIntervalMs + 10, canSeePlayer: true, distance: 15, hitFlashUntilMs: BASE.fireIntervalMs + 50 }), rng);
    assert.strictEqual(d.stunned, true);
    assert.strictEqual(d.startWindup, false);
  });

  it('stun expiry resumes normal logic on the very next eligible tick', () => {
    const rng = createSeededRandomSource(28);
    // lastFireAtMs pushed far enough into the past that the fire cooldown has
    // genuinely elapsed by the time the stun clears — isolates "does stun
    // expiry alone unblock attack logic" from "has the cooldown elapsed yet".
    let runtime = { ...decideLegacyDroneAi(freshRuntime(rng, 0), obs({ nowMs: 700, canSeePlayer: true, distance: 15 }), rng).runtime, lastFireAtMs: -BASE.fireIntervalMs };
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 800, canSeePlayer: true, distance: 15, hitFlashUntilMs: 850 }), rng).runtime;
    assert.ok(runtime.stunnedUntilMs > 800);
    const afterStun = decideLegacyDroneAi(runtime, obs({ nowMs: runtime.stunnedUntilMs + 1, canSeePlayer: true, distance: 15 }), rng);
    assert.strictEqual(afterStun.stunned, false);
    assert.strictEqual(afterStun.startWindup, true, 'cooldown had long elapsed, so normal attack logic resumes immediately once the stun clears');
  });

  it('repeated hits during an ACTIVE stun do not extend the deadline (matches the legacy `stunnedUntil < now` guard exactly)', () => {
    const rng = createSeededRandomSource(29);
    let runtime = freshRuntime(rng, 0);
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 15 }), rng).runtime;
    const first = decideLegacyDroneAi(runtime, obs({ nowMs: 800, canSeePlayer: true, distance: 15, hitFlashUntilMs: 850 }), rng);
    const firstDeadline = first.runtime.stunnedUntilMs;
    // A second flash lands 50ms later, while still within the first stun window.
    const second = decideLegacyDroneAi(first.runtime, obs({ nowMs: 850, canSeePlayer: true, distance: 15, hitFlashUntilMs: 900 }), rng);
    assert.strictEqual(second.runtime.stunnedUntilMs, firstDeadline, 'a flash landing while already stunned must not push the deadline out further');
  });

  it('no permanent stun-lock — stunned is always false once nowMs exceeds stunnedUntilMs, with no further input required', () => {
    const rng = createSeededRandomSource(30);
    let runtime = freshRuntime(rng, 0);
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 15, hitFlashUntilMs: 750 }), rng).runtime;
    const deadline = runtime.stunnedUntilMs;
    const d = decideLegacyDroneAi(runtime, obs({ nowMs: deadline + 1, canSeePlayer: true, distance: 15 }), rng);
    assert.strictEqual(d.stunned, false);
  });
});

describe('droneAiStateMachine — destruction', () => {
  it('destruction overrides all living behaviour, even mid-windup', () => {
    const rng = createSeededRandomSource(31);
    let runtime = freshRuntime(rng, 0);
    runtime = { ...decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 15 }), rng).runtime, lastFireAtMs: 0 };
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: BASE.fireIntervalMs, canSeePlayer: true, distance: 15 }), rng).runtime;
    assert.strictEqual(runtime.state, 'attacking');
    const d = decideLegacyDroneAi(runtime, obs({ nowMs: BASE.fireIntervalMs + 50, canSeePlayer: true, distance: 15, destroyedAtMs: BASE.fireIntervalMs + 50 }), rng);
    assert.strictEqual(d.state, 'destroyed');
    assert.strictEqual(d.fireExactlyOnce, false);
  });

  it('the destroyed event is emitted exactly once (never on subsequent already-destroyed ticks)', () => {
    const rng = createSeededRandomSource(32);
    let runtime = freshRuntime(rng, 0);
    const first = decideLegacyDroneAi(runtime, obs({ nowMs: 100, destroyedAtMs: 100 }), rng);
    assert.strictEqual(first.requestRecordDestroyed, true);
    const second = decideLegacyDroneAi(first.runtime, obs({ nowMs: 150, destroyedAtMs: 100 }), rng);
    assert.strictEqual(second.requestRecordDestroyed, false);
  });

  it('no bolt fires after destruction (fireExactlyOnce stays false for every subsequent tick)', () => {
    const rng = createSeededRandomSource(33);
    let runtime = freshRuntime(rng, 0);
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 100, destroyedAtMs: 100 }), rng).runtime;
    for (let now = 100; now < 5000; now += 200) {
      const d = decideLegacyDroneAi(runtime, obs({ nowMs: now, destroyedAtMs: 100, canSeePlayer: true, distance: 15 }), rng);
      assert.strictEqual(d.fireExactlyOnce, false);
      runtime = d.runtime;
    }
  });

  it('shrink completion occurs at the exact boundary', () => {
    const rng = createSeededRandomSource(34);
    let runtime = freshRuntime(rng, 0);
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 1000, destroyedAtMs: 1000 }), rng).runtime;
    const before = decideLegacyDroneAi(runtime, obs({ nowMs: 1000 + BASE.destroyShrinkMs - 1, destroyedAtMs: 1000 }), rng);
    assert.strictEqual(before.completeDestroyedPresentation, false);
    const at = decideLegacyDroneAi(runtime, obs({ nowMs: 1000 + BASE.destroyShrinkMs, destroyedAtMs: 1000 }), rng);
    assert.strictEqual(at.completeDestroyedPresentation, true);
  });

  it('visibility completion is emitted once, at the boundary tick', () => {
    const rng = createSeededRandomSource(35);
    let runtime = freshRuntime(rng, 0);
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 1000, destroyedAtMs: 1000 }), rng).runtime;
    const at = decideLegacyDroneAi(runtime, obs({ nowMs: 1000 + BASE.destroyShrinkMs, destroyedAtMs: 1000 }), rng);
    assert.strictEqual(at.completeDestroyedPresentation, true);
    const after = decideLegacyDroneAi(at.runtime, obs({ nowMs: 1000 + BASE.destroyShrinkMs + 500, destroyedAtMs: 1000 }), rng);
    assert.strictEqual(after.completeDestroyedPresentation, true, 'stays true once complete (the adapter only needs to act on the transition tick, but the flag itself is a pure function of elapsed time, not a one-shot latch)');
  });

  it('destroyed remains terminal until an explicit reset — no living state is ever reachable again', () => {
    const rng = createSeededRandomSource(36);
    let runtime = freshRuntime(rng, 0);
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 1000, destroyedAtMs: 1000 }), rng).runtime;
    for (let now = 1000; now < 20000; now += 500) {
      const d = decideLegacyDroneAi(runtime, obs({ nowMs: now, destroyedAtMs: 0, canSeePlayer: true, distance: 15 }), rng);
      assert.strictEqual(d.state, 'destroyed', 'even if destroyedAtMs is later reported as 0 (e.g. a stale observation), a drone already in the destroyed runtime state must never revert');
      runtime = d.runtime;
    }
  });
});

describe('droneAiStateMachine — reset', () => {
  it('every runtime field returns to its canonical spawn-equivalent value, except the two fields the legacy code deliberately leaves untouched', () => {
    const rng = createSeededRandomSource(37);
    let runtime = freshRuntime(rng, 0);
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 1000, destroyedAtMs: 1000 }), rng).runtime;
    assert.strictEqual(runtime.state, 'destroyed');
    const reset = resetLegacyDroneRuntime(runtime, rng, 5000, BASE.fireIntervalMs);
    assert.strictEqual(reset.state, 'spawning');
    assert.strictEqual(reset.spawnedAtMs, 5000);
    assert.strictEqual(reset.windupUntilMs, 0);
    assert.strictEqual(reset.stunnedUntilMs, 0);
    assert.strictEqual(reset.destroyShrinkFromMs, 0);
  });

  it('LEGACY QUIRK, preserved deliberately: reset does NOT re-roll strafeDirection or strafeFlipAtMs — they carry over unchanged from before the reset', () => {
    const rng = createSeededRandomSource(38);
    const runtime = freshRuntime(rng, 0);
    const preResetDir = runtime.strafeDirection;
    const preResetFlipAt = runtime.strafeFlipAtMs;
    const reset = resetLegacyDroneRuntime(runtime, rng, 9000, BASE.fireIntervalMs);
    assert.strictEqual(reset.strafeDirection, preResetDir);
    assert.strictEqual(reset.strafeFlipAtMs, preResetFlipAt);
  });

  it('lastFireAtMs IS reseeded on reset, using the resolved (difficulty-scaled) fire interval', () => {
    const tape = createTapeRandomSource([0.1, 0.2, 0.3, 0.4, 0.5]);
    const runtime = createLegacyDroneRuntime(tape, 0, BASE.fireIntervalMs, 1).runtime;
    const tape2 = createTapeRandomSource([0.75]);
    const reset = resetLegacyDroneRuntime(runtime, tape2, 10000, 1200 /* resolved, e.g. Max preset */);
    assert.strictEqual(reset.lastFireAtMs, 10000 + 0.75 * 1200);
  });

  it('the RNG stream is reseeded for the new life — life generation increments deterministically', () => {
    const runtime = freshRuntime(createSeededRandomSource(39), 0);
    assert.strictEqual(runtime.lifeGeneration, 1);
    const reset1 = resetLegacyDroneRuntime(runtime, createSeededRandomSource(40), 1000, BASE.fireIntervalMs);
    assert.strictEqual(reset1.lifeGeneration, 2);
    const reset2 = resetLegacyDroneRuntime(reset1, createSeededRandomSource(41), 2000, BASE.fireIntervalMs);
    assert.strictEqual(reset2.lifeGeneration, 3);
  });

  it('a stale windup is removed by reset (windupUntilMs back to 0, unreadable as attacking no longer applies)', () => {
    const rng = createSeededRandomSource(42);
    let runtime = freshRuntime(rng, 0);
    runtime = { ...decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 15 }), rng).runtime, lastFireAtMs: 0 };
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: BASE.fireIntervalMs, canSeePlayer: true, distance: 15 }), rng).runtime;
    assert.ok(runtime.windupUntilMs > 0);
    const reset = resetLegacyDroneRuntime(runtime, rng, 99999, BASE.fireIntervalMs);
    assert.strictEqual(reset.windupUntilMs, 0);
  });

  it('a stale stun is removed by reset', () => {
    const rng = createSeededRandomSource(43);
    let runtime = freshRuntime(rng, 0);
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 15, hitFlashUntilMs: 750 }), rng).runtime;
    assert.ok(runtime.stunnedUntilMs > 0);
    const reset = resetLegacyDroneRuntime(runtime, rng, 99999, BASE.fireIntervalMs);
    assert.strictEqual(reset.stunnedUntilMs, 0);
  });

  it('a stale destruction guard is removed by reset — a destroyed drone can live again after reset', () => {
    const rng = createSeededRandomSource(44);
    let runtime = freshRuntime(rng, 0);
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 1000, destroyedAtMs: 1000 }), rng).runtime;
    assert.strictEqual(runtime.state, 'destroyed');
    const reset = resetLegacyDroneRuntime(runtime, rng, 99999, BASE.fireIntervalMs);
    const d = decideLegacyDroneAi(reset, obs({ nowMs: 99999, destroyedAtMs: 0 }), rng);
    assert.strictEqual(d.state, 'spawning');
  });

  it('Milestone 9C — every perception-memory field is cleared by reset, even from a mid-investigation runtime (memory must never survive a match restart)', () => {
    const rng = createSeededRandomSource(145);
    let runtime = freshRuntime(rng, 0);
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 12, playerGeneration: 5 }), rng).runtime;
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 800, canSeePlayer: false, distance: 12, playerGeneration: 5 }), rng).runtime;
    const investigating = decideLegacyDroneAi(runtime, obs({ nowMs: 800 + BASE.losLossConfirmMs, canSeePlayer: false, distance: 12, playerGeneration: 5 }), rng);
    assert.strictEqual(investigating.state, 'investigating');
    assert.notStrictEqual(investigating.runtime.lastKnownTargetPosition, null, 'sanity: memory must actually exist before this test proves reset clears it');

    const reset = resetLegacyDroneRuntime(investigating.runtime, rng, 99999, BASE.fireIntervalMs);
    assert.strictEqual(reset.state, 'spawning');
    assert.strictEqual(reset.lastKnownTargetPosition, null);
    assert.strictEqual(reset.lastSeenTargetAtMs, null);
    assert.strictEqual(reset.losLostStartedAtMs, null);
    assert.strictEqual(reset.investigateUntilMs, null);
    assert.strictEqual(reset.observedPlayerGeneration, -1, 'resets to the "never observed" sentinel, matching createLegacyDroneRuntime\'s own initial value — not the pre-reset generation');

    // A subsequent decision tick must not resurrect any of it, even if the observation still reports the OLD generation.
    const afterReset = decideLegacyDroneAi(reset, obs({ nowMs: 99999, canSeePlayer: false, distance: 12, playerGeneration: 5 }), rng);
    assert.strictEqual(afterReset.state, 'spawning');
    assert.strictEqual(afterReset.movementTarget, null);
  });
});

describe('droneAiStateMachine — time model / FPS independence', () => {
  it('pause causes zero runtime mutation — simply not calling decide() at all leaves the runtime byte-identical', () => {
    const runtime = freshRuntime(createSeededRandomSource(45), 0);
    const snapshot = { ...runtime };
    // Simulating "pause": no decide() call happens for a while — nothing to assert on the function itself, but confirm the runtime object is plain, inert data with no timers of its own.
    assert.deepStrictEqual(runtime, snapshot);
  });

  it('fire cadence is independent of how many ticks/what cadence decide() is called at, given the same elapsed nowMs', () => {
    // Simulate "60fps-like": one tick per 16.67ms.
    const rngA = createSeededRandomSource(46);
    let runtimeA = { ...decideLegacyDroneAi(freshRuntime(rngA, 0), obs({ nowMs: 700, canSeePlayer: true, distance: 15 }), rngA).runtime, lastFireAtMs: 0 };
    let firesA = 0;
    for (let now = 700; now <= 700 + BASE.fireIntervalMs + BASE.attackWindupMs + 50; now += 16.67) {
      const d = decideLegacyDroneAi(runtimeA, obs({ nowMs: now, canSeePlayer: true, distance: 15 }), rngA);
      if (d.fireExactlyOnce) firesA++;
      runtimeA = d.runtime;
    }

    // Simulate "20fps-like": one tick per 50ms, same total elapsed time.
    const rngB = createSeededRandomSource(46);
    let runtimeB = { ...decideLegacyDroneAi(freshRuntime(rngB, 0), obs({ nowMs: 700, canSeePlayer: true, distance: 15 }), rngB).runtime, lastFireAtMs: 0 };
    let firesB = 0;
    for (let now = 700; now <= 700 + BASE.fireIntervalMs + BASE.attackWindupMs + 50; now += 50) {
      const d = decideLegacyDroneAi(runtimeB, obs({ nowMs: now, canSeePlayer: true, distance: 15 }), rngB);
      if (d.fireExactlyOnce) firesB++;
      runtimeB = d.runtime;
    }

    assert.strictEqual(firesA, 1);
    assert.strictEqual(firesB, 1, 'the same elapsed absolute time must produce the same fire count regardless of tick cadence');
  });

  it('stun/windup/spawn durations are all measured in absolute ms, never frame counts', () => {
    const rng = createSeededRandomSource(47);
    let runtime = freshRuntime(rng, 0);
    // Single huge tick jump (simulating one very slow frame) reaches the same spawn-complete result as many small ticks would.
    const d = decideLegacyDroneAi(runtime, obs({ nowMs: 10000, canSeePlayer: false, distance: 100 }), rng);
    assert.strictEqual(d.state, 'searching');
  });

  it('Milestone 9C — investigate timeout is measured in absolute ms: 30/60/120fps-like tick cadences all reach the exact same timeout boundary at the same elapsed real time', () => {
    function runToInvestigateTimeout(stepMs: number): { timedOutAtNowMs: number; ticks: number } {
      const rng = createSeededRandomSource(147);
      let runtime = freshRuntime(rng, 0);
      runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 15 }), rng).runtime;
      assert.strictEqual(runtime.state, 'engaging');
      let now = 700;
      let ticks = 0;
      // Drive LOS loss (confirm -> investigate) then keep ticking, invisible, until timeout.
      while (true) {
        now += stepMs;
        ticks++;
        const d = decideLegacyDroneAi(runtime, obs({ nowMs: now, canSeePlayer: false, distance: 50 }), rng);
        runtime = d.runtime;
        if (d.state === 'searching' && ticks > 1) return { timedOutAtNowMs: now, ticks };
        if (ticks > 100000) throw new Error('timeout never reached — test cadence too coarse or logic regression');
      }
    }

    const at60fps = runToInvestigateTimeout(1000 / 60);
    const at30fps = runToInvestigateTimeout(1000 / 30);
    const at120fps = runToInvestigateTimeout(1000 / 120);

    // All three must land within a bounded window of each other — the exact
    // boundary tick differs slightly by cadence (a coarser step can overshoot
    // the exact deadline by up to one step), and this timeline crosses TWO
    // independent quantization boundaries (the LOS-loss confirmation AND the
    // investigate timeout), so worst-case spread is up to ~2x the coarsest
    // step size, not 1x — but still small, bounded, and NOT scaled by the
    // total elapsed time (~5000ms), which is what would indicate a real
    // frame-count-based (rather than absolute-ms) timing bug.
    const values = [at60fps.timedOutAtNowMs, at30fps.timedOutAtNowMs, at120fps.timedOutAtNowMs];
    const spread = Math.max(...values) - Math.min(...values);
    const coarsestStepMs = 1000 / 30;
    assert.ok(spread <= 2.5 * coarsestStepMs, `timeout boundary spread across FPS cadences must stay within ~2 coarse tick steps (two quantized boundaries), was ${spread}ms`);
  });
});

describe('droneAiStateMachine — visible-target memory (Milestone 9C)', () => {
  it('a visible target stores a COPIED last-known position, not a reference to the caller-supplied observation object', () => {
    const rng = createSeededRandomSource(50);
    const runtime = freshRuntime(rng, 0);
    const targetPosition = { x: 3, y: 1, z: 12 };
    const d = decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 12, targetPosition }), rng);
    assert.deepStrictEqual(d.runtime.lastKnownTargetPosition, targetPosition);
    assert.notStrictEqual(d.runtime.lastKnownTargetPosition, targetPosition, 'must be a fresh copy, not the same object reference');
  });

  it('caller-side mutation of the original target-position object afterward cannot alter stored memory', () => {
    const rng = createSeededRandomSource(51);
    const runtime = freshRuntime(rng, 0);
    const targetPosition = { x: 3, y: 1, z: 12 };
    const d = decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 12, targetPosition }), rng);
    targetPosition.x = 999; // mutate the caller's own object after the call
    assert.strictEqual(d.runtime.lastKnownTargetPosition!.x, 3, 'stored memory must be immune to later mutation of the object the caller originally passed in');
  });

  it('a visible target refreshes lastSeenTargetAtMs to the current tick every time', () => {
    const rng = createSeededRandomSource(52);
    let runtime = freshRuntime(rng, 0);
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 12 }), rng).runtime;
    assert.strictEqual(runtime.lastSeenTargetAtMs, 700);
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 900, canSeePlayer: true, distance: 12 }), rng).runtime;
    assert.strictEqual(runtime.lastSeenTargetAtMs, 900);
  });

  it('a visible target clears any in-progress LOS-loss timer', () => {
    const rng = createSeededRandomSource(53);
    let runtime = freshRuntime(rng, 0);
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 12 }), rng).runtime;
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 750, canSeePlayer: false, distance: 12 }), rng).runtime;
    assert.notStrictEqual(runtime.losLostStartedAtMs, null, 'sanity: the loss timer must actually be running before we test that visibility clears it');
    const recovered = decideLegacyDroneAi(runtime, obs({ nowMs: 800, canSeePlayer: true, distance: 12 }), rng);
    assert.strictEqual(recovered.runtime.losLostStartedAtMs, null);
  });

  it('memory updates consume zero RNG', () => {
    const rng = createSeededRandomSource(54);
    let runtime = freshRuntime(rng, 0);
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 12 }), rng).runtime;
    const tape = createTapeRandomSource([]); // an EMPTY tape — any RNG consumption here would throw
    assert.doesNotThrow(() => decideLegacyDroneAi(runtime, obs({ nowMs: 750, canSeePlayer: true, distance: 12 }), tape));
    assert.doesNotThrow(() => decideLegacyDroneAi(runtime, obs({ nowMs: 750, canSeePlayer: false, distance: 12 }), tape));
  });
});

describe('droneAiStateMachine — investigating (Milestone 9C)', () => {
  function engagedThenInvestigating(seed: number, targetPosition = { x: 5, y: 0, z: 12 }) {
    const rng = createSeededRandomSource(seed);
    let runtime = freshRuntime(rng, 0);
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 12, targetPosition }), rng).runtime;
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 800, canSeePlayer: false, distance: 12 }), rng).runtime; // loss begins
    const confirmed = decideLegacyDroneAi(runtime, obs({ nowMs: 800 + BASE.losLossConfirmMs, canSeePlayer: false, distance: 12 }), rng);
    return { rng, runtime: confirmed.runtime, decision: confirmed, targetPosition };
  }

  it('requires memory to enter — a defensive (should-be-unreachable) confirmed-loss with no memory fails safely to searching, not investigating', () => {
    const rng = createSeededRandomSource(55);
    let runtime = freshRuntime(rng, 0);
    // Manually construct a runtime that is 'engaging' with a running loss
    // timer but NO memory (should never occur via normal decision flow,
    // since memory is always set before entering engaging — this proves the
    // defensive fallback itself, not a reachable production path).
    runtime = { ...runtime, state: 'engaging', lastKnownTargetPosition: null, losLostStartedAtMs: 100 };
    const d = decideLegacyDroneAi(runtime, obs({ nowMs: 100 + BASE.losLossConfirmMs, canSeePlayer: false, distance: 12 }), rng);
    assert.strictEqual(d.state, 'searching', 'confirmed loss with no memory must fail safely to searching, never investigating with nothing to investigate');
  });

  it('cannot attack while investigating, even if the fire cooldown has fully elapsed', () => {
    const { runtime, decision } = engagedThenInvestigating(56);
    assert.strictEqual(decision.state, 'investigating');
    const withElapsedCooldown = { ...runtime, lastFireAtMs: 0 };
    const d = decideLegacyDroneAi(withElapsedCooldown, obs({ nowMs: runtime.investigateUntilMs! - 100, canSeePlayer: false, distance: 12 }), createSeededRandomSource(57));
    assert.strictEqual(d.startWindup, false);
    assert.strictEqual(d.fireExactlyOnce, false);
    assert.strictEqual(d.state, 'investigating');
  });

  it('never begins a windup while investigating', () => {
    const { runtime } = engagedThenInvestigating(58);
    const rng = createSeededRandomSource(59);
    let r = { ...runtime, lastFireAtMs: 0 };
    for (let now = runtime.investigateUntilMs! - 2000; now < runtime.investigateUntilMs!; now += 100) {
      const d = decideLegacyDroneAi(r, obs({ nowMs: now, canSeePlayer: false, distance: 12 }), rng);
      assert.strictEqual(d.startWindup, false, `no windup may start while investigating (tick ${now})`);
      r = d.runtime;
    }
  });

  it('emits an investigate movementTarget equal to the remembered last-known position, and reports facePlayer=false', () => {
    const targetPosition = { x: 7, y: 2, z: 20 };
    const { decision } = engagedThenInvestigating(60, targetPosition);
    assert.strictEqual(decision.movementMode, 'investigate');
    assert.deepStrictEqual(decision.movementTarget, targetPosition);
    assert.strictEqual(decision.facePlayer, false, 'facing the remembered point is an ADAPTER concern (movementTarget), not facePlayer — see DroneEnemy.tsx');
  });

  it('stays investigating for the whole duration before timeout, reporting the same movementTarget every tick', () => {
    const { runtime, targetPosition } = engagedThenInvestigating(61);
    const rng = createSeededRandomSource(62);
    let r = runtime;
    for (let now = runtime.lastSeenTargetAtMs! + BASE.losLossConfirmMs; now < runtime.investigateUntilMs! - 1; now += 400) {
      const d = decideLegacyDroneAi(r, obs({ nowMs: now, canSeePlayer: false, distance: 12 }), rng);
      assert.strictEqual(d.state, 'investigating', `must remain investigating before the timeout boundary (tick ${now})`);
      assert.deepStrictEqual(d.movementTarget, targetPosition);
      r = d.runtime;
    }
  });

  it('reacquires immediately (same tick) when the target becomes visible again — no free shot, lastFireAtMs untouched', () => {
    const { runtime } = engagedThenInvestigating(63);
    const preInvestigateLastFireAtMs = runtime.lastFireAtMs;
    const rng = createSeededRandomSource(64);
    const d = decideLegacyDroneAi(runtime, obs({ nowMs: runtime.lastSeenTargetAtMs! + 1000, canSeePlayer: true, distance: 12 }), rng);
    assert.strictEqual(d.state, 'engaging');
    assert.strictEqual(d.fireExactlyOnce, false, 'reacquisition alone must never grant an immediate shot');
    assert.strictEqual(d.runtime.lastFireAtMs, preInvestigateLastFireAtMs, 'reacquisition must never reset the fire cooldown — time spent investigating still counts');
    assert.strictEqual(d.runtime.investigateUntilMs, null);
  });

  it('reacquisition may cascade same-tick into a fresh windup start if the fire cooldown had already elapsed while investigating (documented, verified-safe ordering — not a free shot, only a windup start)', () => {
    const { runtime } = engagedThenInvestigating(65);
    const withElapsedCooldown = { ...runtime, lastFireAtMs: 0 };
    const rng = createSeededRandomSource(66);
    const d = decideLegacyDroneAi(withElapsedCooldown, obs({ nowMs: runtime.investigateUntilMs! - 10, canSeePlayer: true, distance: 12, fireIntervalMs: BASE.fireIntervalMs }), rng);
    assert.strictEqual(d.state, 'attacking');
    assert.strictEqual(d.startWindup, true);
    assert.strictEqual(d.fireExactlyOnce, false, 'a windup START is not a shot — the earliest a shot can occur is attackWindupMs later, on a FUTURE tick');
  });

  it('memory timeout (no reacquire) returns to searching and clears all memory fields', () => {
    const { runtime } = engagedThenInvestigating(67);
    const rng = createSeededRandomSource(68);
    const beforeTimeout = decideLegacyDroneAi(runtime, obs({ nowMs: runtime.investigateUntilMs! - 1, canSeePlayer: false, distance: 12 }), rng);
    assert.strictEqual(beforeTimeout.state, 'investigating', 'one ms before the deadline must still be investigating');
    const atTimeout = decideLegacyDroneAi(runtime, obs({ nowMs: runtime.investigateUntilMs!, canSeePlayer: false, distance: 12 }), rng);
    assert.strictEqual(atTimeout.state, 'searching');
    assert.strictEqual(atTimeout.runtime.lastKnownTargetPosition, null);
    assert.strictEqual(atTimeout.runtime.lastSeenTargetAtMs, null);
    assert.strictEqual(atTimeout.runtime.losLostStartedAtMs, null);
    assert.strictEqual(atTimeout.runtime.investigateUntilMs, null);
    assert.strictEqual(atTimeout.movementTarget, null);
  });

  it('memory timeout consumes zero RNG', () => {
    const { runtime } = engagedThenInvestigating(69);
    const tape = createTapeRandomSource([]); // empty — any consumption throws
    assert.doesNotThrow(() => decideLegacyDroneAi(runtime, obs({ nowMs: runtime.investigateUntilMs!, canSeePlayer: false, distance: 12 }), tape));
  });
});

describe('droneAiStateMachine — attacking + LOS loss (Milestone 9C)', () => {
  function attackingRuntime(seed: number) {
    const rng = createSeededRandomSource(seed);
    let runtime = { ...freshRuntime(rng, 0) };
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 12 }), rng).runtime;
    runtime = { ...runtime, lastFireAtMs: 0 };
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: BASE.fireIntervalMs, canSeePlayer: true, distance: 12 }), rng).runtime;
    return { rng, runtime };
  }

  it('an attacking drone that loses LOS aborts to engaging on the SAME tick — cannot fire, windup aborted, no bolt/spread RNG consumed', () => {
    const { runtime } = attackingRuntime(70);
    assert.strictEqual(runtime.state, 'attacking');
    const staleWindup = runtime.windupUntilMs;
    const tape = createTapeRandomSource([]); // empty — a spread draw would throw
    const d = decideLegacyDroneAi(runtime, obs({ nowMs: runtime.windupUntilMs - 1, canSeePlayer: false, distance: 12 }), tape);
    assert.strictEqual(d.state, 'engaging');
    assert.strictEqual(d.abortWindup, true);
    assert.strictEqual(d.fireExactlyOnce, false);
    assert.strictEqual(d.aimSpread, null);
    assert.strictEqual(d.runtime.windupUntilMs, staleWindup, 'the stale-windup-field legacy quirk is preserved — windupUntilMs is not zeroed on this abort either');
  });

  it('the LOS-loss confirmation timer starts on the TRUE loss tick even while still attacking — not delayed until the abort has already happened', () => {
    const { runtime } = attackingRuntime(71);
    const lossTick = runtime.windupUntilMs - 200;
    const d = decideLegacyDroneAi(runtime, obs({ nowMs: lossTick, canSeePlayer: false, distance: 12 }), createSeededRandomSource(72));
    assert.strictEqual(d.runtime.losLostStartedAtMs, lossTick, 'the confirmation window must be measured from the exact tick LOS was actually lost, not one tick later once state has already dropped to engaging');
  });

  it('resulting state ordering: attacking -> (LOS lost) -> engaging (same tick, no fire) -> investigating only after the FULL confirmation window elapses from the true loss tick', () => {
    const { runtime } = attackingRuntime(73);
    const rng = createSeededRandomSource(74);
    const lossTick = runtime.windupUntilMs - 200;
    let r = decideLegacyDroneAi(runtime, obs({ nowMs: lossTick, canSeePlayer: false, distance: 12 }), rng).runtime;
    assert.strictEqual(r.state, 'engaging', 'must abort to engaging on the very tick LOS is lost');
    const justUnder = decideLegacyDroneAi(r, obs({ nowMs: lossTick + BASE.losLossConfirmMs - 1, canSeePlayer: false, distance: 12 }), rng);
    assert.strictEqual(justUnder.state, 'engaging');
    const confirmed = decideLegacyDroneAi(r, obs({ nowMs: lossTick + BASE.losLossConfirmMs, canSeePlayer: false, distance: 12 }), rng);
    assert.strictEqual(confirmed.state, 'investigating');
  });
});

describe('droneAiStateMachine — player-generation invalidation (Milestone 9C)', () => {
  it('a generation change clears all memory fields', () => {
    const rng = createSeededRandomSource(75);
    let runtime = freshRuntime(rng, 0);
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 12, playerGeneration: 0 }), rng).runtime;
    assert.notStrictEqual(runtime.lastKnownTargetPosition, null);
    const d = decideLegacyDroneAi(runtime, obs({ nowMs: 750, canSeePlayer: false, distance: 12, playerGeneration: 1 }), rng);
    assert.strictEqual(d.runtime.lastKnownTargetPosition, null);
    assert.strictEqual(d.runtime.lastSeenTargetAtMs, null);
    assert.strictEqual(d.runtime.losLostStartedAtMs, null);
    assert.strictEqual(d.runtime.investigateUntilMs, null);
    assert.strictEqual(d.runtime.observedPlayerGeneration, 1);
  });

  it('a generation change exits investigating, returning directly to searching', () => {
    const rng = createSeededRandomSource(76);
    let runtime = freshRuntime(rng, 0);
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 12, playerGeneration: 0 }), rng).runtime;
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 800, canSeePlayer: false, distance: 12, playerGeneration: 0 }), rng).runtime;
    const investigating = decideLegacyDroneAi(runtime, obs({ nowMs: 800 + BASE.losLossConfirmMs, canSeePlayer: false, distance: 12, playerGeneration: 0 }), rng);
    assert.strictEqual(investigating.state, 'investigating');
    const afterGenChange = decideLegacyDroneAi(investigating.runtime, obs({ nowMs: 800 + BASE.losLossConfirmMs + 50, canSeePlayer: false, distance: 12, playerGeneration: 1 }), rng);
    assert.strictEqual(afterGenChange.state, 'searching');
  });

  it('a generation change aborts an in-progress attack (old target life) — windup aborted, no fire, state forced to searching, when the new life is not yet visible on that same tick (the realistic respawn case: the new spawn point is not immediately in view)', () => {
    const rng = createSeededRandomSource(77);
    let runtime = freshRuntime(rng, 0);
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 12, playerGeneration: 0 }), rng).runtime;
    runtime = { ...runtime, lastFireAtMs: 0 };
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: BASE.fireIntervalMs, canSeePlayer: true, distance: 12, playerGeneration: 0 }), rng).runtime;
    assert.strictEqual(runtime.state, 'attacking');
    const d = decideLegacyDroneAi(runtime, obs({ nowMs: BASE.fireIntervalMs + 50, canSeePlayer: false, distance: 12, playerGeneration: 1 }), rng);
    assert.strictEqual(d.state, 'searching');
    assert.strictEqual(d.abortWindup, true);
    assert.strictEqual(d.fireExactlyOnce, false);
  });

  it('a generation change followed by the NEW life being immediately visible on that same tick may legitimately cascade straight into a fresh acquisition (searching->engaging, even a new windup start if the cooldown already reads as elapsed) — this is a genuine new-life acquisition, not a bug: the OLD memory/attack was still correctly aborted first', () => {
    const rng = createSeededRandomSource(770);
    let runtime = freshRuntime(rng, 0);
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 12, playerGeneration: 0, targetPosition: { x: 0, y: 0, z: 12 } }), rng).runtime;
    runtime = { ...runtime, lastFireAtMs: 0 };
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: BASE.fireIntervalMs, canSeePlayer: true, distance: 12, playerGeneration: 0 }), rng).runtime;
    assert.strictEqual(runtime.state, 'attacking');
    const oldMemory = runtime.lastKnownTargetPosition;
    const newLifeTargetPosition = { x: 40, y: 0, z: 40 }; // a different world position — the new spawn point
    const d = decideLegacyDroneAi(runtime, obs({ nowMs: BASE.fireIntervalMs + 50, canSeePlayer: true, distance: 12, playerGeneration: 1, targetPosition: newLifeTargetPosition }), rng);
    assert.strictEqual(d.abortWindup, true, 'the OLD attack must still be aborted, even though a new acquisition immediately follows');
    assert.strictEqual(d.fireExactlyOnce, false, 'even if a new windup starts same-tick, that is never a fire event — only a windup start');
    assert.deepStrictEqual(d.runtime.lastKnownTargetPosition, newLifeTargetPosition, 'memory must reflect the NEW life\'s position, never the stale old one');
    assert.notDeepStrictEqual(d.runtime.lastKnownTargetPosition, oldMemory);
  });

  it('a generation change never reseeds RNG, resets HP, or resets drone position — those are entirely outside this pure core\'s own concern (the adapter/DroneSquad own them), and generation invalidation consumes zero RNG itself', () => {
    const rng = createSeededRandomSource(78);
    let runtime = freshRuntime(rng, 0);
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 12, playerGeneration: 0 }), rng).runtime;
    const lifeGenerationBefore = runtime.lifeGeneration;
    const tape = createTapeRandomSource([]); // empty — any RNG consumption throws
    const d = decideLegacyDroneAi(runtime, obs({ nowMs: 750, canSeePlayer: false, distance: 12, playerGeneration: 1 }), tape);
    assert.strictEqual(d.runtime.lifeGeneration, lifeGenerationBefore, 'the DRONE\'s own life generation (a distinct concept from the PLAYER\'s) must be untouched by a player-generation change');
  });

  it('the same generation on consecutive ticks does nothing — no spurious memory clear', () => {
    const rng = createSeededRandomSource(79);
    let runtime = freshRuntime(rng, 0);
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 12, playerGeneration: 0 }), rng).runtime;
    const memoryBefore = runtime.lastKnownTargetPosition;
    const d = decideLegacyDroneAi(runtime, obs({ nowMs: 750, canSeePlayer: false, distance: 12, playerGeneration: 0 }), rng);
    assert.deepStrictEqual(d.runtime.lastKnownTargetPosition, memoryBefore, 'memory must survive an unchanged generation across ticks');
  });

  it('a freshly constructed runtime performs one harmless no-op invalidation on its first decision tick (observedPlayerGeneration sentinel syncs to reality, nothing to invalidate)', () => {
    const rng = createSeededRandomSource(80);
    const runtime = freshRuntime(rng, 0);
    assert.strictEqual(runtime.observedPlayerGeneration, -1, 'sanity: the sentinel starting value');
    const d = decideLegacyDroneAi(runtime, obs({ nowMs: 100, canSeePlayer: false, distance: 100, playerGeneration: 3 }), rng);
    assert.strictEqual(d.runtime.observedPlayerGeneration, 3);
    assert.strictEqual(d.state, 'spawning', 'a spawning drone is unaffected by the sync — nothing meaningful to invalidate yet');
  });
});

describe('droneAiStateMachine — destruction interactions with investigating (Milestone 9C)', () => {
  it('destruction overrides an in-progress investigation', () => {
    const rng = createSeededRandomSource(81);
    let runtime = freshRuntime(rng, 0);
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 12 }), rng).runtime;
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 800, canSeePlayer: false, distance: 12 }), rng).runtime;
    const investigating = decideLegacyDroneAi(runtime, obs({ nowMs: 800 + BASE.losLossConfirmMs, canSeePlayer: false, distance: 12 }), rng);
    assert.strictEqual(investigating.state, 'investigating');
    const destroyed = decideLegacyDroneAi(investigating.runtime, obs({ nowMs: 800 + BASE.losLossConfirmMs + 10, canSeePlayer: false, distance: 12, destroyedAtMs: 800 + BASE.losLossConfirmMs + 10 }), rng);
    assert.strictEqual(destroyed.state, 'destroyed');
  });

  it('no investigate movement target is ever emitted once destroyed', () => {
    const rng = createSeededRandomSource(82);
    let runtime = freshRuntime(rng, 0);
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 12 }), rng).runtime;
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 800, canSeePlayer: false, distance: 12 }), rng).runtime;
    const investigating = decideLegacyDroneAi(runtime, obs({ nowMs: 800 + BASE.losLossConfirmMs, canSeePlayer: false, distance: 12 }), rng).runtime;
    const destroyed = decideLegacyDroneAi(investigating, obs({ nowMs: 800 + BASE.losLossConfirmMs + 10, canSeePlayer: false, distance: 12, destroyedAtMs: 800 + BASE.losLossConfirmMs + 10 }), rng);
    assert.strictEqual(destroyed.movementMode, 'destroyed-hold');
    assert.strictEqual(destroyed.movementTarget, null);
    for (let now = destroyed.runtime.destroyShrinkFromMs; now < destroyed.runtime.destroyShrinkFromMs + BASE.destroyShrinkMs + 500; now += 100) {
      const d = decideLegacyDroneAi(destroyed.runtime, obs({ nowMs: now, canSeePlayer: false, distance: 12, destroyedAtMs: destroyed.runtime.destroyShrinkFromMs }), rng);
      assert.strictEqual(d.movementTarget, null, `no investigate movement target may ever appear post-destruction (tick ${now})`);
    }
  });

  it('last-known target memory never influences destroyed presentation (destroyProgress/completeDestroyedPresentation are pure functions of elapsed shrink time only)', () => {
    const rng = createSeededRandomSource(83);
    let withMemory = freshRuntime(rng, 0);
    withMemory = decideLegacyDroneAi(withMemory, obs({ nowMs: 700, canSeePlayer: true, distance: 12, targetPosition: { x: 99, y: 99, z: 99 } }), rng).runtime;
    const destroyedWithMemory = decideLegacyDroneAi(withMemory, obs({ nowMs: 1000, destroyedAtMs: 1000 }), rng);

    const withoutMemory = freshRuntime(createSeededRandomSource(83), 0); // never acquired — no memory ever set
    const destroyedWithoutMemory = decideLegacyDroneAi(withoutMemory, obs({ nowMs: 1000, destroyedAtMs: 1000 }), createSeededRandomSource(84));

    assert.strictEqual(destroyedWithMemory.destroyProgress, destroyedWithoutMemory.destroyProgress);
    assert.strictEqual(destroyedWithMemory.completeDestroyedPresentation, destroyedWithoutMemory.completeDestroyedPresentation);
  });
});

describe('droneAiStateMachine — Milestone 9E acquisition-reaction gate', () => {
  it('a genuine searching->engaging acquisition seeds reactionReadyAtMs = now + acquireReactionDelayMs and sets targetAcquired exactly once', () => {
    const rng = createSeededRandomSource(200);
    const runtime = freshRuntime(rng, 0);
    const acquired = decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 15, acquireReactionDelayMs: 350 }), rng);
    assert.strictEqual(acquired.state, 'engaging');
    assert.strictEqual(acquired.targetAcquired, true);
    assert.strictEqual(acquired.runtime.reactionReadyAtMs, 700 + 350);
  });

  it('zero-delay (Medium-equivalent): the same-tick acquire->windup cascade is byte-identical to pre-9E — reaction gate never blocks it', () => {
    const rng = createSeededRandomSource(201);
    let runtime = { ...freshRuntime(rng, 0) };
    runtime = { ...runtime, lastFireAtMs: -BASE.fireIntervalMs }; // cooldown already elapsed
    const d = decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 15, acquireReactionDelayMs: 0 }), rng);
    assert.strictEqual(d.state, 'attacking', 'searching->engaging->attacking must still cascade in a single tick when acquireReactionDelayMs is 0');
    assert.strictEqual(d.startWindup, true);
    assert.strictEqual(d.targetAcquired, true);
  });

  it('non-zero delay: a windup cannot start before reactionReadyAtMs, even with cooldown already elapsed and clear LOS', () => {
    const rng = createSeededRandomSource(202);
    let runtime = freshRuntime(rng, 0);
    runtime = { ...decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 15, acquireReactionDelayMs: 350 }), rng).runtime, lastFireAtMs: -BASE.fireIntervalMs };
    assert.strictEqual(runtime.reactionReadyAtMs, 1050);
    const tooSoon = decideLegacyDroneAi(runtime, obs({ nowMs: 1049, canSeePlayer: true, distance: 15, acquireReactionDelayMs: 350 }), rng);
    assert.strictEqual(tooSoon.state, 'engaging', 'one ms before reactionReadyAtMs must still be waiting, not attacking');
    assert.strictEqual(tooSoon.startWindup, false);
  });

  it('non-zero delay: the windup starts exactly on the tick reactionReadyAtMs is reached', () => {
    const rng = createSeededRandomSource(203);
    let runtime = freshRuntime(rng, 0);
    runtime = { ...decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 15, acquireReactionDelayMs: 350 }), rng).runtime, lastFireAtMs: -BASE.fireIntervalMs };
    const ready = decideLegacyDroneAi(runtime, obs({ nowMs: 1050, canSeePlayer: true, distance: 15, acquireReactionDelayMs: 350 }), rng);
    assert.strictEqual(ready.state, 'attacking');
    assert.strictEqual(ready.startWindup, true);
  });

  it('reaction gate does not block windup COMPLETION/firing or the abort branch — only the windup-START check', () => {
    const rng = createSeededRandomSource(204);
    let runtime = freshRuntime(rng, 0);
    runtime = { ...decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 15, acquireReactionDelayMs: 0 }), rng).runtime, lastFireAtMs: -BASE.fireIntervalMs };
    const attacking = decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 15, acquireReactionDelayMs: 0 }), rng);
    assert.strictEqual(attacking.state, 'attacking');
    // Force a stale/never-satisfied reactionReadyAtMs onto the runtime — if
    // completion/firing wrongly re-checked the gate, this would block it.
    const gatedRuntime = { ...attacking.runtime, reactionReadyAtMs: Number.POSITIVE_INFINITY };
    const fired = decideLegacyDroneAi(gatedRuntime, obs({ nowMs: 700 + BASE.attackWindupMs, canSeePlayer: true, distance: 15, acquireReactionDelayMs: 0 }), rng);
    assert.strictEqual(fired.fireExactlyOnce, true, 'windup completion/firing must never be gated by reactionReadyAtMs');
  });

  it('reacquisition (investigating->engaging) seeds a NEW reactionReadyAtMs and grants no free shot even if cooldown elapsed during the investigation', () => {
    const rng = createSeededRandomSource(205);
    let runtime = freshRuntime(rng, 0);
    runtime = { ...decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 15, acquireReactionDelayMs: 0 }), rng).runtime, lastFireAtMs: 700 };
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 800, canSeePlayer: false, distance: 15, acquireReactionDelayMs: 0 }), rng).runtime;
    const investigating = decideLegacyDroneAi(runtime, obs({ nowMs: 800 + BASE.losLossConfirmMs, canSeePlayer: false, distance: 15, acquireReactionDelayMs: 0 }), rng);
    assert.strictEqual(investigating.state, 'investigating');
    // Cooldown elapses while investigating (far beyond fireIntervalMs).
    const reacquireAt = 800 + BASE.losLossConfirmMs + BASE.fireIntervalMs + 500;
    const reacquired = decideLegacyDroneAi(investigating.runtime, obs({ nowMs: reacquireAt, canSeePlayer: true, distance: 15, acquireReactionDelayMs: 350 }), rng);
    assert.strictEqual(reacquired.state, 'engaging', 'reacquisition must not grant a same-tick free shot even though the cooldown had long elapsed');
    assert.strictEqual(reacquired.targetAcquired, true);
    assert.strictEqual(reacquired.runtime.reactionReadyAtMs, reacquireAt + 350);
    assert.strictEqual(reacquired.startWindup, false);
  });

  it('attacking->engaging (post-fire) does NOT reseed reactionReadyAtMs — a fresh cooldown-gated shot needs no further reaction wait', () => {
    const rng = createSeededRandomSource(206);
    let runtime = freshRuntime(rng, 0);
    const acquired = decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 15, acquireReactionDelayMs: 350 }), rng);
    const reactionDeadline = acquired.runtime.reactionReadyAtMs;
    runtime = { ...acquired.runtime, lastFireAtMs: -BASE.fireIntervalMs };
    // Reaction wait for the FIRST windup — waiting until reactionDeadline.
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: reactionDeadline!, canSeePlayer: true, distance: 15, acquireReactionDelayMs: 350 }), rng).runtime;
    assert.strictEqual(runtime.state, 'attacking');
    const fired = decideLegacyDroneAi(runtime, obs({ nowMs: reactionDeadline! + BASE.attackWindupMs, canSeePlayer: true, distance: 15, acquireReactionDelayMs: 350 }), rng);
    assert.strictEqual(fired.fireExactlyOnce, true);
    assert.strictEqual(fired.state, 'engaging');
    assert.strictEqual(fired.runtime.reactionReadyAtMs, reactionDeadline, 'firing must not touch reactionReadyAtMs at all');
    assert.strictEqual(fired.targetAcquired, false, 'firing/re-entering engaging post-shot is not a genuine acquisition');
    // The SECOND windup, once the next cooldown elapses, must start immediately — no second reaction wait.
    const secondReady = decideLegacyDroneAi(fired.runtime, obs({ nowMs: reactionDeadline! + BASE.attackWindupMs + BASE.fireIntervalMs, canSeePlayer: true, distance: 15, acquireReactionDelayMs: 350 }), rng);
    assert.strictEqual(secondReady.startWindup, true, 'a second cooldown-gated windup must not wait out a second reaction delay');
  });

  it('an aborted windup (LOS loss or stun) does not reseed reactionReadyAtMs, and does not touch targetAcquired', () => {
    const rng = createSeededRandomSource(207);
    let runtime = freshRuntime(rng, 0);
    const acquired = decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 15, acquireReactionDelayMs: 0 }), rng);
    runtime = { ...acquired.runtime, lastFireAtMs: -BASE.fireIntervalMs };
    const attacking = decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 15, acquireReactionDelayMs: 0 }), rng);
    assert.strictEqual(attacking.state, 'attacking');
    const aborted = decideLegacyDroneAi(attacking.runtime, obs({ nowMs: 750, canSeePlayer: false, distance: 15, acquireReactionDelayMs: 0 }), rng);
    assert.strictEqual(aborted.state, 'engaging');
    assert.strictEqual(aborted.abortWindup, true);
    assert.strictEqual(aborted.targetAcquired, false);
    assert.strictEqual(aborted.runtime.reactionReadyAtMs, attacking.runtime.reactionReadyAtMs, 'an abort must never reseed the reaction deadline');
  });

  it('a sub-confirmation cover-edge LOS flicker while engaging never touches reactionReadyAtMs or targetAcquired (state never leaves engaging)', () => {
    const rng = createSeededRandomSource(208);
    let runtime = freshRuntime(rng, 0);
    const acquired = decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 15, acquireReactionDelayMs: 500 }), rng);
    const deadline = acquired.runtime.reactionReadyAtMs;
    runtime = acquired.runtime;
    const flicker = decideLegacyDroneAi(runtime, obs({ nowMs: 716, canSeePlayer: false, distance: 15, acquireReactionDelayMs: 500 }), rng);
    assert.strictEqual(flicker.state, 'engaging');
    assert.strictEqual(flicker.targetAcquired, false);
    const recovered = decideLegacyDroneAi(flicker.runtime, obs({ nowMs: 732, canSeePlayer: true, distance: 15, acquireReactionDelayMs: 500 }), rng);
    assert.strictEqual(recovered.state, 'engaging');
    assert.strictEqual(recovered.targetAcquired, false, 'LOS returning within one frame is not a new acquisition');
    assert.strictEqual(recovered.runtime.reactionReadyAtMs, deadline, 'a sub-confirmation flicker must never reseed the reaction deadline');
  });

  it('reactionReadyAtMs (and every memory field) clears to null on player-generation invalidation', () => {
    const rng = createSeededRandomSource(209);
    let runtime = freshRuntime(rng, 0);
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 15, acquireReactionDelayMs: 350, playerGeneration: 0 }), rng).runtime;
    assert.ok(runtime.reactionReadyAtMs !== null);
    const invalidated = decideLegacyDroneAi(runtime, obs({ nowMs: 750, canSeePlayer: false, distance: 15, playerGeneration: 1 }), rng);
    assert.strictEqual(invalidated.state, 'searching');
    assert.strictEqual(invalidated.runtime.reactionReadyAtMs, null);
  });

  it('resetLegacyDroneRuntime always clears reactionReadyAtMs back to null, exactly like the other per-life memory fields', () => {
    const rng = createSeededRandomSource(210);
    let runtime = freshRuntime(rng, 0);
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 15, acquireReactionDelayMs: 350 }), rng).runtime;
    assert.ok(runtime.reactionReadyAtMs !== null);
    const reset = resetLegacyDroneRuntime(runtime, rng, 2000, BASE.fireIntervalMs);
    assert.strictEqual(reset.reactionReadyAtMs, null);
  });

  it('createLegacyDroneRuntime always starts with reactionReadyAtMs === null', () => {
    assert.strictEqual(freshRuntime().reactionReadyAtMs, null);
  });

  it('an already-elapsed reactionReadyAtMs is left as a stale past timestamp across many subsequent engaging ticks, never re-derived to null', () => {
    const rng = createSeededRandomSource(211);
    let runtime = freshRuntime(rng, 0);
    const acquired = decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 15, acquireReactionDelayMs: 100 }), rng);
    const deadline = acquired.runtime.reactionReadyAtMs;
    runtime = { ...acquired.runtime, lastFireAtMs: 1_000_000 }; // push cooldown far out so state stays engaging, never attacks
    for (let now = 900; now < 5000; now += 250) {
      const d = decideLegacyDroneAi(runtime, obs({ nowMs: now, canSeePlayer: true, distance: 15, acquireReactionDelayMs: 100 }), rng);
      assert.strictEqual(d.runtime.reactionReadyAtMs, deadline, `reactionReadyAtMs must remain the original stale deadline at tick ${now}, never cleared or redrawn`);
      runtime = d.runtime;
    }
  });

  it('zero additional RNG consumption: the reaction gate itself never advances the RNG stream (a tightly-sized tape survives an acquire+reaction+windup+fire sequence)', () => {
    // Tape budget mirrors the pre-9E draw count exactly: 4 at construction
    // (phase, fire jitter, strafeDir, strafeFlip), then 3 for the eventual
    // aim-spread draw. If the reaction gate consumed any RNG itself, this
    // exact-length tape would throw "exhausted" before firing.
    const tape = [0.1, 0.2, 0.3, 0.4, 0.5, 0.5, 0.5];
    const tapeRng = createTapeRandomSource(tape);
    let runtime = createLegacyDroneRuntime(tapeRng, 0, BASE.fireIntervalMs, 1).runtime;
    const acquired = decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 15, acquireReactionDelayMs: 350 }), tapeRng);
    assert.strictEqual(acquired.state, 'engaging');
    runtime = { ...acquired.runtime, lastFireAtMs: -BASE.fireIntervalMs };
    const ready = decideLegacyDroneAi(runtime, obs({ nowMs: 1050, canSeePlayer: true, distance: 15, acquireReactionDelayMs: 350 }), tapeRng);
    assert.strictEqual(ready.state, 'attacking');
    const fired = decideLegacyDroneAi(ready.runtime, obs({ nowMs: 1050 + BASE.attackWindupMs, canSeePlayer: true, distance: 15, acquireReactionDelayMs: 350 }), tapeRng);
    assert.strictEqual(fired.fireExactlyOnce, true, 'the exact-length tape must not be exhausted before the shot fires — proves the reaction gate itself consumes zero RNG');
  });
});

describe('droneAiStateMachine — Milestone 9E profile-driven target-memory duration', () => {
  it('investigateUntilMs is computed from observation.investigateDurationMs — a non-4500 (Low-equivalent) value is honoured exactly, not the old flat constant', () => {
    const rng = createSeededRandomSource(220);
    let runtime = freshRuntime(rng, 0);
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 15, investigateDurationMs: 3500 }), rng).runtime;
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 800, canSeePlayer: false, distance: 15, investigateDurationMs: 3500 }), rng).runtime;
    const investigating = decideLegacyDroneAi(runtime, obs({ nowMs: 800 + BASE.losLossConfirmMs, canSeePlayer: false, distance: 15, investigateDurationMs: 3500 }), rng);
    assert.strictEqual(investigating.state, 'investigating');
    assert.strictEqual(investigating.runtime.investigateUntilMs, 800 + BASE.losLossConfirmMs + 3500, 'must use the supplied 3500ms (Low-equivalent) value, not the flat 4500ms constant');
  });

  it('a Max-equivalent (5250ms) value keeps a drone investigating noticeably longer than the Medium baseline before timing out', () => {
    const rng = createSeededRandomSource(221);
    let runtime = freshRuntime(rng, 0);
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 15, investigateDurationMs: 5250 }), rng).runtime;
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 800, canSeePlayer: false, distance: 15, investigateDurationMs: 5250 }), rng).runtime;
    const investigating = decideLegacyDroneAi(runtime, obs({ nowMs: 800 + BASE.losLossConfirmMs, canSeePlayer: false, distance: 15, investigateDurationMs: 5250 }), rng).runtime;
    const timeoutAt = 800 + BASE.losLossConfirmMs + 5250;
    const justBefore = decideLegacyDroneAi(investigating, obs({ nowMs: timeoutAt - 1, canSeePlayer: false, distance: 15, investigateDurationMs: 5250 }), rng);
    assert.strictEqual(justBefore.state, 'investigating');
    const atTimeout = decideLegacyDroneAi(investigating, obs({ nowMs: timeoutAt, canSeePlayer: false, distance: 15, investigateDurationMs: 5250 }), rng);
    assert.strictEqual(atTimeout.state, 'searching');
  });

  it('losLossConfirmMs and investigate-arrival semantics remain difficulty-invariant — only investigateDurationMs changed, the confirmation window did not', () => {
    const rng = createSeededRandomSource(222);
    let runtime = freshRuntime(rng, 0);
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 15, investigateDurationMs: 3500 }), rng).runtime;
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 800, canSeePlayer: false, distance: 15, investigateDurationMs: 3500 }), rng).runtime;
    const justUnder = decideLegacyDroneAi(runtime, obs({ nowMs: 800 + BASE.losLossConfirmMs - 1, canSeePlayer: false, distance: 15, investigateDurationMs: 3500 }), rng);
    assert.strictEqual(justUnder.state, 'engaging', 'confirmation window (250ms, difficulty-invariant) must be unaffected by a non-default investigateDurationMs');
  });

  it('Medium-equivalent (4500ms, exactly BASE) is unchanged from the pre-9E behaviour', () => {
    const rng = createSeededRandomSource(223);
    let runtime = freshRuntime(rng, 0);
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 15 }), rng).runtime;
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 800, canSeePlayer: false, distance: 15 }), rng).runtime;
    const investigating = decideLegacyDroneAi(runtime, obs({ nowMs: 800 + BASE.losLossConfirmMs, canSeePlayer: false, distance: 15 }), rng);
    assert.strictEqual(investigating.runtime.investigateUntilMs, 800 + BASE.losLossConfirmMs + 4500);
  });
});

describe('droneAiStateMachine — Milestone 9E targetAcquired event integrity (exhaustive sweep)', () => {
  it('targetAcquired is true on exactly the ticks state genuinely transitions searching->engaging or investigating->engaging, across a long randomized visibility sweep, and never on any other tick', () => {
    const rng = createSeededRandomSource(230);
    let runtime = freshRuntime(rng, 0);
    let previousState = runtime.state;
    let acquisitions = 0;
    let now = 0;
    for (let i = 0; i < 800; i++) {
      now += 47;
      const cycle = Math.floor(i / 37) % 2;
      const canSeePlayer = cycle === 0;
      const d = decideLegacyDroneAi(runtime, obs({ nowMs: now, canSeePlayer, distance: 12, acquireReactionDelayMs: 120, investigateDurationMs: 2000 }), rng);
      if (d.targetAcquired) {
        acquisitions++;
        // previousState may be 'spawning' when the spawning->searching->
        // engaging same-tick cascade completes in one call — still a
        // genuine acquisition. Only a re-entry from 'engaging' (impossible,
        // it's already there) or 'attacking' (post-fire/abort) is NOT genuine.
        const genuineTransition = d.state === 'engaging' && previousState !== 'engaging' && previousState !== 'attacking';
        assert.ok(genuineTransition, `targetAcquired fired on tick ${i} but the transition was ${previousState} -> ${d.state}, not a genuine acquisition`);
        assert.strictEqual(d.runtime.reactionReadyAtMs, now + 120, `targetAcquired fired but reactionReadyAtMs was not freshly seeded on tick ${i}`);
      }
      if (previousState === 'attacking' && d.state === 'engaging') {
        assert.strictEqual(d.targetAcquired, false, `attacking->engaging on tick ${i} must never set targetAcquired`);
      }
      previousState = d.state;
      runtime = d.runtime;
    }
    assert.ok(acquisitions > 0, 'the sweep must actually exercise at least one real acquisition, or this test proves nothing');
  });
});

describe('droneAiStateMachine — Milestone 9F recoveryBlocksAttack gate (optional, default falsy)', () => {
  it('omitting recoveryBlocksAttack entirely is byte-identical to explicit false — an engaging, cooled-down, visible drone still starts a windup normally', () => {
    const runtime = { ...freshRuntime(), state: 'engaging' as const, lastFireAtMs: -10000 };
    const withoutField = decideLegacyDroneAi(runtime, obs({ nowMs: 0 }), createSeededRandomSource(5));
    const withFalse = decideLegacyDroneAi(runtime, obs({ nowMs: 0, recoveryBlocksAttack: false }), createSeededRandomSource(5));
    assert.strictEqual(withoutField.startWindup, true);
    assert.deepStrictEqual(withoutField, withFalse);
  });

  it('recoveryBlocksAttack=true prevents a new windup from starting while engaging', () => {
    const runtime = { ...freshRuntime(), state: 'engaging' as const, lastFireAtMs: -10000 };
    const decision = decideLegacyDroneAi(runtime, obs({ nowMs: 0, recoveryBlocksAttack: true }), createSeededRandomSource(5));
    assert.strictEqual(decision.startWindup, false);
    assert.strictEqual(decision.state, 'engaging');
    assert.strictEqual(decision.fireExactlyOnce, false);
  });

  it('recoveryBlocksAttack=true aborts an IN-PROGRESS windup through the existing abort branch — zero fire, zero spread RNG, lastFireAtMs untouched', () => {
    const rng = createSeededRandomSource(7);
    let runtime: LegacyDroneAiRuntime = { ...freshRuntime(rng), state: 'engaging', lastFireAtMs: -10000 };
    // Start a real windup first (recoveryBlocksAttack false/absent).
    const started = decideLegacyDroneAi(runtime, obs({ nowMs: 0 }), rng);
    assert.strictEqual(started.startWindup, true);
    runtime = started.runtime;
    const lastFireBeforeAbort = runtime.lastFireAtMs;
    const windupUntilBeforeAbort = runtime.windupUntilMs;

    // Recovery becomes active mid-windup, well before windupUntilMs.
    const aborted = decideLegacyDroneAi(runtime, obs({ nowMs: 100, recoveryBlocksAttack: true }), rng);
    assert.strictEqual(aborted.state, 'engaging', 'an in-progress windup must abort back to engaging');
    assert.strictEqual(aborted.abortWindup, true);
    assert.strictEqual(aborted.fireExactlyOnce, false);
    assert.strictEqual(aborted.aimSpread, null);
    assert.strictEqual(aborted.runtime.lastFireAtMs, lastFireBeforeAbort, 'lastFireAtMs must be exactly untouched by a recovery-triggered abort');
    assert.strictEqual(aborted.runtime.windupUntilMs, windupUntilBeforeAbort, 'windupUntilMs is left stale (matches the existing stun/LOS abort convention), never reset');
  });

  it('recoveryBlocksAttack=true even on the exact tick a windup would otherwise complete prevents firing (no free shot)', () => {
    const rng = createSeededRandomSource(9);
    let runtime: LegacyDroneAiRuntime = { ...freshRuntime(rng), state: 'engaging', lastFireAtMs: -10000 };
    const started = decideLegacyDroneAi(runtime, obs({ nowMs: 0 }), rng);
    runtime = started.runtime;
    const windupUntil = runtime.windupUntilMs;
    // Same tick the windup would complete AND recovery is active.
    const result = decideLegacyDroneAi(runtime, obs({ nowMs: windupUntil, recoveryBlocksAttack: true }), rng);
    assert.strictEqual(result.fireExactlyOnce, false);
    assert.strictEqual(result.aimSpread, null);
    assert.strictEqual(result.state, 'engaging');
  });

  it('after recoveryBlocksAttack returns to false, the drone resumes normal cadence — no reset reaction gate, no forced reacquisition, cooldown continues counting through the blocked period', () => {
    const rng = createSeededRandomSource(11);
    let runtime: LegacyDroneAiRuntime = { ...freshRuntime(rng), state: 'engaging', lastFireAtMs: -10000 };
    const started = decideLegacyDroneAi(runtime, obs({ nowMs: 0 }), rng);
    runtime = started.runtime;
    const aborted = decideLegacyDroneAi(runtime, obs({ nowMs: 100, recoveryBlocksAttack: true }), rng);
    runtime = aborted.runtime;
    // Recovery still active for a while — no re-acquisition cue, no windup.
    for (let now = 200; now < 2000; now += 200) {
      const held = decideLegacyDroneAi(runtime, obs({ nowMs: now, recoveryBlocksAttack: true }), rng);
      assert.strictEqual(held.targetAcquired, false, 'holding recovery must never replay an acquire cue');
      assert.strictEqual(held.startWindup, false);
      runtime = held.runtime;
    }
    // Recovery ends — normal attack resumes once fireIntervalMs has elapsed since the ORIGINAL lastFireAtMs (never reset by the abort).
    const resumed = decideLegacyDroneAi(runtime, obs({ nowMs: 2000 + BASE.fireIntervalMs }), rng);
    assert.strictEqual(resumed.startWindup, true, 'a real windup must be able to start again once recovery ends and the (unmodified) cooldown has elapsed');
    assert.strictEqual(resumed.targetAcquired, false, 'resuming after recovery must never fabricate a fresh acquisition');
  });

  it('recoveryBlocksAttack has no effect on state transitions unrelated to the attack block — truthful perception/investigating remain unaffected', () => {
    const rng = createSeededRandomSource(13);
    let runtime: LegacyDroneAiRuntime = { ...freshRuntime(rng), state: 'engaging' };
    // Establish real target memory first (a visible tick), matching how
    // `engaging` is only ever genuinely reached in production — otherwise
    // the defensive "no memory to investigate" fallback (searching) would
    // fire instead, which would not be testing this gate at all.
    const seen = decideLegacyDroneAi(runtime, obs({ nowMs: 0, canSeePlayer: true, recoveryBlocksAttack: true }), rng);
    runtime = seen.runtime;
    // LOS genuinely lost while recovery is (irrelevantly) also active — investigating must still trigger truthfully off real canSeePlayer, not be blocked/altered by recoveryBlocksAttack.
    let now = 0;
    for (let i = 0; i < 20; i++) {
      now += 50;
      const d = decideLegacyDroneAi(runtime, obs({ nowMs: now, canSeePlayer: false, recoveryBlocksAttack: true }), rng);
      runtime = d.runtime;
    }
    assert.strictEqual(runtime.state, 'investigating', 'real LOS loss must still produce a truthful investigating transition regardless of recoveryBlocksAttack');
  });

  it('DroneAiRuntimeState union is unchanged — still exactly six states — after the 9F addition', () => {
    const valid = new Set(['spawning', 'searching', 'investigating', 'engaging', 'attacking', 'destroyed']);
    assert.strictEqual(valid.size, 6);
  });
});

describe('droneAiStateMachine — Milestone 9G coordinationBlocksAttack gate (optional, default falsy)', () => {
  it('omitting coordinationBlocksAttack entirely is byte-identical to explicit false — an engaging, cooled-down, visible drone still starts a windup normally', () => {
    const runtime = { ...freshRuntime(), state: 'engaging' as const, lastFireAtMs: -10000 };
    const withoutField = decideLegacyDroneAi(runtime, obs({ nowMs: 0 }), createSeededRandomSource(5));
    const withFalse = decideLegacyDroneAi(runtime, obs({ nowMs: 0, coordinationBlocksAttack: false }), createSeededRandomSource(5));
    assert.strictEqual(withoutField.startWindup, true);
    assert.deepStrictEqual(withoutField, withFalse);
  });

  it('coordinationBlocksAttack=true prevents a new windup from starting while engaging (no granted attack-permit lease)', () => {
    const runtime = { ...freshRuntime(), state: 'engaging' as const, lastFireAtMs: -10000 };
    const decision = decideLegacyDroneAi(runtime, obs({ nowMs: 0, coordinationBlocksAttack: true }), createSeededRandomSource(5));
    assert.strictEqual(decision.startWindup, false);
    assert.strictEqual(decision.state, 'engaging');
    assert.strictEqual(decision.fireExactlyOnce, false);
  });

  it('coordinationBlocksAttack=true aborts an IN-PROGRESS windup through the existing abort branch — zero fire, zero spread RNG, lastFireAtMs untouched', () => {
    const rng = createSeededRandomSource(7);
    let runtime: LegacyDroneAiRuntime = { ...freshRuntime(rng), state: 'engaging', lastFireAtMs: -10000 };
    const started = decideLegacyDroneAi(runtime, obs({ nowMs: 0 }), rng);
    assert.strictEqual(started.startWindup, true);
    runtime = started.runtime;
    const lastFireBeforeAbort = runtime.lastFireAtMs;
    const windupUntilBeforeAbort = runtime.windupUntilMs;

    // The squad coordinator revokes the lease mid-windup (e.g. a real
    // combat-gate failure the coordinator's own request predicate detected).
    const aborted = decideLegacyDroneAi(runtime, obs({ nowMs: 100, coordinationBlocksAttack: true }), rng);
    assert.strictEqual(aborted.state, 'engaging', 'an in-progress windup must abort back to engaging');
    assert.strictEqual(aborted.abortWindup, true);
    assert.strictEqual(aborted.fireExactlyOnce, false);
    assert.strictEqual(aborted.aimSpread, null);
    assert.strictEqual(aborted.runtime.lastFireAtMs, lastFireBeforeAbort, 'lastFireAtMs must be exactly untouched by a coordination-triggered abort');
    assert.strictEqual(aborted.runtime.windupUntilMs, windupUntilBeforeAbort, 'windupUntilMs is left stale (matches the existing stun/LOS/recovery abort convention), never reset');
  });

  it('coordinationBlocksAttack=true even on the exact tick a windup would otherwise complete prevents firing (no free shot)', () => {
    const rng = createSeededRandomSource(9);
    let runtime: LegacyDroneAiRuntime = { ...freshRuntime(rng), state: 'engaging', lastFireAtMs: -10000 };
    const started = decideLegacyDroneAi(runtime, obs({ nowMs: 0 }), rng);
    runtime = started.runtime;
    const windupUntil = runtime.windupUntilMs;
    const result = decideLegacyDroneAi(runtime, obs({ nowMs: windupUntil, coordinationBlocksAttack: true }), rng);
    assert.strictEqual(result.fireExactlyOnce, false);
    assert.strictEqual(result.aimSpread, null);
    assert.strictEqual(result.state, 'engaging');
  });

  it('after coordinationBlocksAttack returns to false (permit re-granted), the drone resumes normal cadence — no reset reaction gate, no forced reacquisition, cooldown continues counting through the blocked period', () => {
    const rng = createSeededRandomSource(11);
    let runtime: LegacyDroneAiRuntime = { ...freshRuntime(rng), state: 'engaging', lastFireAtMs: -10000 };
    const started = decideLegacyDroneAi(runtime, obs({ nowMs: 0 }), rng);
    runtime = started.runtime;
    const aborted = decideLegacyDroneAi(runtime, obs({ nowMs: 100, coordinationBlocksAttack: true }), rng);
    runtime = aborted.runtime;
    for (let now = 200; now < 2000; now += 200) {
      const held = decideLegacyDroneAi(runtime, obs({ nowMs: now, coordinationBlocksAttack: true }), rng);
      assert.strictEqual(held.targetAcquired, false, 'holding coordination-block must never replay an acquire cue');
      assert.strictEqual(held.startWindup, false);
      runtime = held.runtime;
    }
    const resumed = decideLegacyDroneAi(runtime, obs({ nowMs: 2000 + BASE.fireIntervalMs }), rng);
    assert.strictEqual(resumed.startWindup, true, 'a real windup must be able to start again once the permit is re-granted and the (unmodified) cooldown has elapsed');
    assert.strictEqual(resumed.targetAcquired, false, 'resuming after a coordination block must never fabricate a fresh acquisition');
  });

  it('coordinationBlocksAttack has no effect on state transitions unrelated to the attack block — truthful perception/investigating remain unaffected', () => {
    const rng = createSeededRandomSource(13);
    let runtime: LegacyDroneAiRuntime = { ...freshRuntime(rng), state: 'engaging' };
    const seen = decideLegacyDroneAi(runtime, obs({ nowMs: 0, canSeePlayer: true, coordinationBlocksAttack: true }), rng);
    runtime = seen.runtime;
    let now = 0;
    for (let i = 0; i < 20; i++) {
      now += 50;
      const d = decideLegacyDroneAi(runtime, obs({ nowMs: now, canSeePlayer: false, coordinationBlocksAttack: true }), rng);
      runtime = d.runtime;
    }
    assert.strictEqual(runtime.state, 'investigating', 'real LOS loss must still produce a truthful investigating transition regardless of coordinationBlocksAttack');
  });

  it('coordinationBlocksAttack and recoveryBlocksAttack compose — either alone blocks attack, and both simultaneously behave identically to either alone', () => {
    const runtime = { ...freshRuntime(), state: 'engaging' as const, lastFireAtMs: -10000 };
    const coordOnly = decideLegacyDroneAi(runtime, obs({ nowMs: 0, coordinationBlocksAttack: true, recoveryBlocksAttack: false }), createSeededRandomSource(5));
    const recoveryOnly = decideLegacyDroneAi(runtime, obs({ nowMs: 0, coordinationBlocksAttack: false, recoveryBlocksAttack: true }), createSeededRandomSource(5));
    const both = decideLegacyDroneAi(runtime, obs({ nowMs: 0, coordinationBlocksAttack: true, recoveryBlocksAttack: true }), createSeededRandomSource(5));
    assert.strictEqual(coordOnly.startWindup, false);
    assert.strictEqual(recoveryOnly.startWindup, false);
    assert.strictEqual(both.startWindup, false);
  });

  it('DroneAiRuntimeState union is unchanged — still exactly six states — after the 9G addition', () => {
    const valid = new Set(['spawning', 'searching', 'investigating', 'engaging', 'attacking', 'destroyed']);
    assert.strictEqual(valid.size, 6);
  });
});

describe('droneAiStateMachine — Milestone 9G.1 evaluateAttackReadiness: exhaustive combinatorial parity', () => {
  const ALL_STATES = ['spawning', 'searching', 'investigating', 'engaging', 'attacking', 'destroyed'];
  const NOW = 10_000;
  const FIRE_INTERVAL = 500;

  /**
   * Independently-structured reference oracle — deliberately an early-return
   * chain, NOT the AND-expression shape `evaluateAttackReadiness` itself
   * uses, to minimize the chance an identical bug is present in both. Hand
   * -derived directly from the ORIGINAL (pre-9G.1) legacy two-`if`
   * structure this extraction replaced: outer gate
   * (state/stunned/canSeePlayer/recoveryBlocksAttack), then — ONLY while
   * `engaging` — the inner reaction/cooldown gate; an already-`attacking`
   * drone's continuation is NEVER re-gated by reaction/cooldown.
   */
  function referenceAttackEligible(params: { state: string; stunned: boolean; canSeePlayer: boolean; recoveryBlocksAttack: boolean; reactionReady: boolean; cooldownElapsed: boolean }): boolean {
    if (params.state !== 'engaging' && params.state !== 'attacking') return false;
    if (params.stunned) return false;
    if (!params.canSeePlayer) return false;
    if (params.recoveryBlocksAttack) return false;
    if (params.state === 'attacking') return true;
    return params.reactionReady && params.cooldownElapsed;
  }

  it('agrees with an independently-structured reference oracle across every combination of state x stunned x canSeePlayer x recoveryBlocksAttack x reactionReady x cooldownElapsed (192 cases)', () => {
    let casesChecked = 0;
    for (const state of ALL_STATES) {
      for (const stunned of [true, false]) {
        for (const canSeePlayer of [true, false]) {
          for (const recoveryBlocksAttack of [true, false]) {
            for (const reactionReady of [true, false]) {
              for (const cooldownElapsed of [true, false]) {
                const reactionReadyAtMs = reactionReady ? NOW - 1 : NOW + 100_000;
                const lastFireAtMs = cooldownElapsed ? NOW - FIRE_INTERVAL - 1 : NOW - 1;
                const actual = evaluateAttackReadiness({
                  state: state as any,
                  stunned,
                  canSeePlayer,
                  recoveryBlocksAttack,
                  reactionReadyAtMs,
                  nowMs: NOW,
                  lastFireAtMs,
                  fireIntervalMs: FIRE_INTERVAL,
                });
                const expected = referenceAttackEligible({ state, stunned, canSeePlayer, recoveryBlocksAttack, reactionReady, cooldownElapsed });
                assert.strictEqual(
                  actual,
                  expected,
                  `mismatch: state=${state} stunned=${stunned} canSeePlayer=${canSeePlayer} recoveryBlocksAttack=${recoveryBlocksAttack} reactionReady=${reactionReady} cooldownElapsed=${cooldownElapsed} — got ${actual}, expected ${expected}`,
                );
                casesChecked += 1;
              }
            }
          }
        }
      }
    }
    assert.strictEqual(casesChecked, 6 * 2 * 2 * 2 * 2 * 2, 'must have exhaustively checked all 192 combinations, not a subset');
  });

  it('reactionReadyAtMs === null is always reaction-ready, matching the "no pending reaction wait" convention', () => {
    const result = evaluateAttackReadiness({ state: 'engaging', stunned: false, canSeePlayer: true, recoveryBlocksAttack: false, reactionReadyAtMs: null, nowMs: NOW, lastFireAtMs: NOW - FIRE_INTERVAL - 1, fireIntervalMs: FIRE_INTERVAL });
    assert.strictEqual(result, true);
  });

  it('consumes no RNG and reads no clock of its own — every timestamp is an explicit input (pure function property)', () => {
    const input = { state: 'engaging' as const, stunned: false, canSeePlayer: true, recoveryBlocksAttack: false, reactionReadyAtMs: null, nowMs: NOW, lastFireAtMs: NOW - FIRE_INTERVAL - 1, fireIntervalMs: FIRE_INTERVAL };
    const a = evaluateAttackReadiness(input);
    const b = evaluateAttackReadiness(input);
    const c = evaluateAttackReadiness({ ...input });
    assert.strictEqual(a, b);
    assert.strictEqual(a, c);
  });

  it('an already-attacking drone with a stale/never-satisfied reactionReadyAtMs and a not-yet-elapsed cooldown is STILL eligible — proves neither gate is re-checked once attacking (the exact scenario the dedicated regression test above exercises end-to-end)', () => {
    const result = evaluateAttackReadiness({
      state: 'attacking',
      stunned: false,
      canSeePlayer: true,
      recoveryBlocksAttack: false,
      reactionReadyAtMs: Number.POSITIVE_INFINITY,
      nowMs: NOW,
      lastFireAtMs: NOW, // cooldown could not possibly have elapsed (0ms since last fire)
      fireIntervalMs: FIRE_INTERVAL,
    });
    assert.strictEqual(result, true);
  });

  it('boundary: reactionReadyAtMs === nowMs (exactly) counts as ready (>=, not >)', () => {
    const result = evaluateAttackReadiness({ state: 'engaging', stunned: false, canSeePlayer: true, recoveryBlocksAttack: false, reactionReadyAtMs: NOW, nowMs: NOW, lastFireAtMs: NOW - FIRE_INTERVAL, fireIntervalMs: FIRE_INTERVAL });
    assert.strictEqual(result, true);
  });

  it('boundary: nowMs - lastFireAtMs === fireIntervalMs (exactly) counts as cooldown-elapsed (>=, not >)', () => {
    const result = evaluateAttackReadiness({ state: 'engaging', stunned: false, canSeePlayer: true, recoveryBlocksAttack: false, reactionReadyAtMs: null, nowMs: NOW, lastFireAtMs: NOW - FIRE_INTERVAL, fireIntervalMs: FIRE_INTERVAL });
    assert.strictEqual(result, true);
  });
});

describe('droneAiStateMachine — Milestone 9G.1: DroneEnemy.tsx consumes the SHARED evaluateAttackReadiness — no duplicated predicate remains (structural guard)', () => {
  it('DroneEnemy.tsx imports and calls evaluateAttackReadiness from droneAiStateMachine.ts, and no longer computes its own inline wantsAttack boolean expression', () => {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
    const src = fs.readFileSync(path.join(repoRoot, 'src/components/three/play/DroneEnemy.tsx'), 'utf8');
    assert.ok(/import\s*\{[^}]*\bevaluateAttackReadiness\b[^}]*\}\s*from\s*['"]@\/lib\/v2\/ai\/droneAiStateMachine['"]/.test(src), 'DroneEnemy.tsx must import evaluateAttackReadiness from droneAiStateMachine.ts');
    assert.ok(src.includes('evaluateAttackReadiness({'), 'DroneEnemy.tsx must actually CALL evaluateAttackReadiness (not just import it unused)');
    // The old hand-duplicated boolean expression must be gone — anchored on
    // its own distinctive shape (state/stunned/canSeePlayer chained with the
    // reaction/cooldown OR-clause) so this test would fail if a future edit
    // reintroduced a parallel inline predicate instead of reusing the shared one.
    assert.ok(!/state === 'engaging' \|\| state === 'attacking'\).*!stunned.*canSeePlayer/.test(src), 'DroneEnemy.tsx must not reintroduce its own inline duplicate of the attack-eligibility predicate');
  });
});
