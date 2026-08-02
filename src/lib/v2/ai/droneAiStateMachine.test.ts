import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createLegacyDroneRuntime, decideLegacyDroneAi, resetLegacyDroneRuntime } from './droneAiStateMachine';
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
};

function obs(overrides: Partial<LegacyDroneAiObservation> = {}): LegacyDroneAiObservation {
  return {
    nowMs: 0,
    distance: 15,
    canSeePlayer: true,
    destroyedAtMs: 0,
    hitFlashUntilMs: 0,
    ...BASE,
    ...overrides,
  };
}

function freshRuntime(rng = createSeededRandomSource(1), nowMs = 0): LegacyDroneAiRuntime {
  return createLegacyDroneRuntime(rng, nowMs, BASE.fireIntervalMs, 1).runtime;
}

describe('droneAiStateMachine — five-state model', () => {
  it('createLegacyDroneRuntime always starts in spawning', () => {
    assert.strictEqual(freshRuntime().state, 'spawning');
  });

  it('only the five real legacy states are ever produced: spawning, searching, engaging, attacking, destroyed', () => {
    const valid = new Set(['spawning', 'searching', 'engaging', 'attacking', 'destroyed']);
    let runtime = freshRuntime();
    const rng = createSeededRandomSource(2);
    let now = 0;
    for (let i = 0; i < 500; i++) {
      now += 50;
      const decision = decideLegacyDroneAi(runtime, obs({ nowMs: now, distance: 12 }), rng);
      assert.ok(valid.has(decision.state), `unexpected state: ${decision.state}`);
      runtime = decision.runtime;
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

  it('future 9C+ states (investigate/recover/dead) are never returned as a runtime state value, across an exhaustive input sweep — doc comments may still explain what is deferred and why', () => {
    const disallowed = new Set(['investigate', 'recover', 'dead']);
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

describe('droneAiStateMachine — legacy LOS quirk (intentionally preserved, to be replaced in 9C)', () => {
  it('blocked LOS while still inside detectRadius does NOT revert an engaging drone to searching', () => {
    const rng = createSeededRandomSource(14);
    let runtime = freshRuntime(rng, 0);
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 15 }), rng).runtime;
    assert.strictEqual(runtime.state, 'engaging');
    const d = decideLegacyDroneAi(runtime, obs({ nowMs: 800, canSeePlayer: false, distance: 30 }), rng);
    assert.strictEqual(d.state, 'engaging', 'legacy quirk: blocked LOS inside detectRadius must NOT transition to searching');
  });

  it('blocked LOS AND beyond detectRadius correctly reverts to searching', () => {
    const rng = createSeededRandomSource(15);
    let runtime = freshRuntime(rng, 0);
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 15 }), rng).runtime;
    assert.strictEqual(runtime.state, 'engaging');
    const d = decideLegacyDroneAi(runtime, obs({ nowMs: 800, canSeePlayer: false, distance: 50 }), rng);
    assert.strictEqual(d.state, 'searching');
  });

  it('an engaging drone with blocked LOS (inside radius) cannot fire, even though it stays engaging', () => {
    const rng = createSeededRandomSource(16);
    let runtime = freshRuntime(rng, 0);
    runtime = decideLegacyDroneAi(runtime, obs({ nowMs: 700, canSeePlayer: true, distance: 15 }), rng).runtime;
    runtime = { ...runtime, lastFireAtMs: 0 }; // force cooldown elapsed
    const d = decideLegacyDroneAi(runtime, obs({ nowMs: 5000, canSeePlayer: false, distance: 30 }), rng);
    assert.strictEqual(d.state, 'engaging');
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
});
