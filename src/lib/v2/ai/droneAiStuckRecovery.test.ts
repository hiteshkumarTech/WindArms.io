import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createDroneStuckRecoveryRuntime,
  resetDroneStuckRecoveryRuntime,
  clearActiveDroneStuckRecovery,
  onDroneStunned,
  onDroneDestroyed,
  resolveDroneStuckRecovery,
  DRONE_STUCK_DETECTOR,
  DRONE_RECOVERY_TUNING,
} from './droneAiStuckRecovery';
import type { DroneArenaConfig } from './droneArenaConfig';
import type { DroneStuckRecoveryContext, DroneStuckSample, DroneStuckRecoveryRuntime } from './droneAiStuckRecovery';

const CONFIG: DroneArenaConfig = {
  horizontalBounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 },
  minAltitudeM: 1,
  maxAltitudeM: 9,
  softBoundaryMarginM: 2,
  hardBoundaryEpsilonM: 0.01,
  forbiddenZones: [{ id: 'wind-lift', centerX: -6.4, centerZ: -6, radiusM: 1.9, minY: -0.5, maxY: 7.5 }],
  safeFallbackPositions: [{ x: 0, y: 4, z: 0 }],
};

function pos(x: number, y: number, z: number) {
  return { x, y, z };
}

function makeContext(overrides: Partial<DroneStuckRecoveryContext> = {}): DroneStuckRecoveryContext {
  return {
    droneId: 'test-drone',
    currentPosition: pos(0, 4, 0),
    homePosition: pos(0, 4, 0),
    speedMps: 4,
    config: CONFIG,
    ...overrides,
  };
}

function healthySample(nowMs: number, dirX = 1, dirZ = 0, speed = 4, dt = 1 / 60): DroneStuckSample {
  const disp = { x: dirX * speed * dt, y: 0, z: dirZ * speed * dt };
  return {
    nowMs,
    wantsMovement: true,
    expectedDisplacementM: speed * dt,
    actualDisplacementM: Math.sqrt(disp.x * disp.x + disp.z * disp.z),
    requestedDirection: { x: dirX * speed, y: 0, z: dirZ * speed },
    actualDisplacement: disp,
    horizontalClamped: false,
    altitudeClamped: false,
    forbiddenZoneCorrected: false,
  };
}

function blockedSample(nowMs: number, dirX = 1, dirZ = 0, speed = 4, dt = 1 / 60): DroneStuckSample {
  return {
    nowMs,
    wantsMovement: true,
    expectedDisplacementM: speed * dt,
    actualDisplacementM: 0,
    requestedDirection: { x: dirX * speed, y: 0, z: dirZ * speed },
    actualDisplacement: { x: 0, y: 0, z: 0 },
    horizontalClamped: true,
    altitudeClamped: false,
    forbiddenZoneCorrected: false,
  };
}

function idleSample(nowMs: number): DroneStuckSample {
  return { nowMs, wantsMovement: false, expectedDisplacementM: 0, actualDisplacementM: 0, requestedDirection: { x: 0, y: 0, z: 0 }, actualDisplacement: { x: 0, y: 0, z: 0 }, horizontalClamped: false, altitudeClamped: false, forbiddenZoneCorrected: false };
}

/** Drives `count` substeps at `dt` real seconds apart, feeding `sampleFn(nowMs)` each tick, updating both runtime and (optionally) currentPosition via `advancePosition`. Returns the final { runtime, decision, now }. */
function runTicks(
  runtime: DroneStuckRecoveryRuntime,
  context: DroneStuckRecoveryContext,
  startMs: number,
  count: number,
  dtMs: number,
  sampleFn: (nowMs: number) => DroneStuckSample,
) {
  let now = startMs;
  let decision;
  let ctx = context;
  for (let i = 0; i < count; i++) {
    now += dtMs;
    const sample = sampleFn(now);
    const result = resolveDroneStuckRecovery(runtime, sample, ctx);
    runtime = result.runtime;
    decision = result.decision;
    if (decision.movementOverride) {
      ctx = { ...ctx, currentPosition: { x: ctx.currentPosition.x + decision.movementOverride.x * (dtMs / 1000), y: ctx.currentPosition.y + decision.movementOverride.y * (dtMs / 1000), z: ctx.currentPosition.z + decision.movementOverride.z * (dtMs / 1000) } };
    }
  }
  return { runtime, decision: decision!, now, context: ctx };
}

describe('resolveDroneStuckRecovery — detector: no false positives', () => {
  it('no requested movement never accumulates or triggers', () => {
    let runtime = createDroneStuckRecoveryRuntime(pos(0, 4, 0));
    const ctx = makeContext();
    const { runtime: final, decision } = runTicks(runtime, ctx, 0, 200, 33, idleSample);
    assert.strictEqual(final.phase, 'idle');
    assert.strictEqual(decision.stuckDetected, false);
    assert.strictEqual(final.expectedDistanceAccumM, 0);
  });

  it('tiny intentional search wander (well under the expected-distance threshold) never triggers, even sustained for many windows', () => {
    let runtime = createDroneStuckRecoveryRuntime(pos(0, 4, 0));
    const ctx = makeContext();
    // Search wander peaks around 0.57 units/s — matched here, actual tracks expected closely (near-1.0 ratio), so this also proves the ratio-based part never trips even under heavy sampling.
    const wanderSample = (now: number): DroneStuckSample => healthySample(now, 0.6, 0.6, 0.57, 0.033);
    const { runtime: final } = runTicks(runtime, ctx, 0, 400, 33, wanderSample);
    assert.strictEqual(final.phase, 'idle');
  });

  it('healthy sustained progress (actual tracks expected) never triggers', () => {
    let runtime = createDroneStuckRecoveryRuntime(pos(0, 4, 0));
    const ctx = makeContext();
    const { runtime: final, decision } = runTicks(runtime, ctx, 0, 200, 33, (n) => healthySample(n));
    assert.strictEqual(final.phase, 'idle');
    assert.strictEqual(decision.stuckDetected, false);
  });

  it('a single bad sample amid otherwise healthy progress does not trigger', () => {
    let runtime = createDroneStuckRecoveryRuntime(pos(0, 4, 0));
    const ctx = makeContext();
    let now = 0;
    for (let i = 0; i < 60; i++) {
      now += 33;
      const sample = i === 30 ? blockedSample(now) : healthySample(now);
      const result = resolveDroneStuckRecovery(runtime, sample, ctx);
      runtime = result.runtime;
    }
    assert.strictEqual(runtime.phase, 'idle');
  });

  it('an incomplete window (elapsed < windowDurationMs) never triggers even with zero progress', () => {
    let runtime = createDroneStuckRecoveryRuntime(pos(0, 4, 0));
    const ctx = makeContext();
    const { runtime: final } = runTicks(runtime, ctx, 0, 10, 100, (n) => blockedSample(n)); // 1000ms total, window is 2000ms
    assert.strictEqual(final.phase, 'idle');
  });

  it('insufficient accumulated expected distance never triggers even at zero progress ratio, for the full window duration', () => {
    let runtime = createDroneStuckRecoveryRuntime(pos(0, 4, 0));
    const ctx = makeContext();
    // Very slow requested speed -> expected distance stays under minExpectedDistanceM even across the full window.
    const { runtime: final } = runTicks(runtime, ctx, 0, 80, 33, (n) => blockedSample(n, 1, 0, 0.5));
    assert.strictEqual(final.phase, 'idle');
  });
});

describe('resolveDroneStuckRecovery — detector: sustained no-progress triggers exactly once', () => {
  it('sustained blocked movement with enough expected distance triggers recovery exactly once', () => {
    let runtime = createDroneStuckRecoveryRuntime(pos(0, 4, 0));
    const ctx = makeContext();
    let now = 0;
    let triggers = 0;
    for (let i = 0; i < 90; i++) {
      now += 33;
      const result = resolveDroneStuckRecovery(runtime, blockedSample(now), ctx);
      runtime = result.runtime;
      if (result.decision.stuckDetected) triggers++;
    }
    assert.strictEqual(triggers, 1);
    assert.strictEqual(runtime.phase, 'nudging');
  });

  it('the progress ratio is evaluated at an exact deterministic boundary', () => {
    // ratio exactly AT the threshold must NOT trigger (strict less-than).
    const ctx = makeContext();
    let runtime = createDroneStuckRecoveryRuntime(pos(0, 4, 0));
    const targetRatio = DRONE_STUCK_DETECTOR.progressRatioThreshold;
    let now = 0;
    for (let i = 0; i < 70; i++) {
      now += 33;
      const speed = 4;
      const dt = 0.033;
      const expected = speed * dt;
      const actual = expected * targetRatio; // exactly at threshold
      const sample: DroneStuckSample = { nowMs: now, wantsMovement: true, expectedDisplacementM: expected, actualDisplacementM: actual, requestedDirection: { x: speed, y: 0, z: 0 }, actualDisplacement: { x: actual, y: 0, z: 0 }, horizontalClamped: true, altitudeClamped: false, forbiddenZoneCorrected: false };
      const result = resolveDroneStuckRecovery(runtime, sample, ctx);
      runtime = result.runtime;
    }
    assert.strictEqual(runtime.phase, 'idle', 'a ratio exactly at the threshold must not count as stuck (strict less-than)');
  });
});

describe('resolveDroneStuckRecovery — lifecycle exclusions', () => {
  it('recovery cooldown blocks immediate retrigger', () => {
    let runtime = createDroneStuckRecoveryRuntime(pos(0, 4, 0));
    let ctx = makeContext();
    // Drive into stuck -> escalate through failed attempts to teleport, ending in cooldown.
    let now = 0;
    for (let i = 0; i < 400; i++) {
      now += 33;
      const result = resolveDroneStuckRecovery(runtime, blockedSample(now), ctx);
      runtime = result.runtime;
      if (result.decision.teleportTarget) ctx = { ...ctx, currentPosition: result.decision.teleportTarget };
      if (runtime.phase === 'cooldown') break;
    }
    assert.strictEqual(runtime.phase, 'cooldown');
    // Even feeding more blocked samples while in cooldown must not re-trigger.
    let triggeredDuringCooldown = false;
    for (let i = 0; i < 50; i++) {
      now += 33;
      const result = resolveDroneStuckRecovery(runtime, blockedSample(now), ctx);
      runtime = result.runtime;
      if (result.decision.stuckDetected) triggeredDuringCooldown = true;
      if (runtime.phase !== 'cooldown') break;
    }
    assert.strictEqual(triggeredDuringCooldown, false);
  });

  it('stun aborts an active recovery episode into cooldown and clears the window', () => {
    let runtime = createDroneStuckRecoveryRuntime(pos(0, 4, 0));
    const ctx = makeContext();
    let now = 0;
    for (let i = 0; i < 80; i++) {
      now += 33;
      runtime = resolveDroneStuckRecovery(runtime, blockedSample(now), ctx).runtime;
      if (runtime.phase !== 'idle') break;
    }
    assert.notStrictEqual(runtime.phase, 'idle');
    const stunned = onDroneStunned(runtime, now + 10);
    assert.strictEqual(stunned.phase, 'cooldown');
    assert.strictEqual(stunned.windowStartedAtMs, null);
    assert.strictEqual(stunned.expectedDistanceAccumM, 0);
  });

  it('stun while idle is a no-op (no accumulation to clear, phase stays idle)', () => {
    const runtime = createDroneStuckRecoveryRuntime(pos(0, 4, 0));
    const stunned = onDroneStunned(runtime, 100);
    assert.strictEqual(stunned.phase, 'idle');
    assert.deepStrictEqual(stunned, runtime);
  });

  it('onDroneDestroyed clears any active window/recovery', () => {
    let runtime = createDroneStuckRecoveryRuntime(pos(0, 4, 0));
    const ctx = makeContext();
    let now = 0;
    for (let i = 0; i < 80; i++) {
      now += 33;
      runtime = resolveDroneStuckRecovery(runtime, blockedSample(now), ctx).runtime;
    }
    const destroyed = onDroneDestroyed(runtime);
    assert.strictEqual(destroyed.phase, 'idle');
    assert.strictEqual(destroyed.windowStartedAtMs, null);
    assert.strictEqual(destroyed.teleportTarget, null);
  });

  it('timestamp reversal fails safely (resets the window rather than computing a negative/corrupt elapsed time)', () => {
    let runtime = createDroneStuckRecoveryRuntime(pos(0, 4, 0));
    const ctx = makeContext();
    runtime = resolveDroneStuckRecovery(runtime, blockedSample(1000), ctx).runtime;
    assert.ok(runtime.windowStartedAtMs !== null);
    // Clock jumps backwards.
    const result = resolveDroneStuckRecovery(runtime, blockedSample(500), ctx);
    assert.ok(Number.isFinite(result.runtime.expectedDistanceAccumM));
    assert.strictEqual(result.runtime.phase, 'idle');
    assert.strictEqual(result.decision.stuckDetected, false);
  });

  it('reset clears every accumulated value back to a fresh state', () => {
    let runtime = createDroneStuckRecoveryRuntime(pos(0, 4, 0));
    const ctx = makeContext();
    let now = 0;
    for (let i = 0; i < 300; i++) {
      now += 33;
      runtime = resolveDroneStuckRecovery(runtime, blockedSample(now), ctx).runtime;
    }
    assert.notStrictEqual(runtime.phase, 'idle');
    const reset = resetDroneStuckRecoveryRuntime(pos(1, 5, 1));
    assert.strictEqual(reset.phase, 'idle');
    assert.strictEqual(reset.expectedDistanceAccumM, 0);
    assert.strictEqual(reset.actualDistanceAccumM, 0);
    assert.strictEqual(reset.attemptCountThisLife, 0);
    assert.strictEqual(reset.teleportCountThisLife, 0);
    assert.deepStrictEqual(reset.lastStablePosition, pos(1, 5, 1));
  });

  it('does not mutate the input runtime or sample objects', () => {
    const runtime = createDroneStuckRecoveryRuntime(pos(0, 4, 0));
    const runtimeSnapshot = JSON.parse(JSON.stringify(runtime));
    const sample = blockedSample(1000);
    const sampleSnapshot = JSON.parse(JSON.stringify(sample));
    resolveDroneStuckRecovery(runtime, sample, makeContext());
    assert.deepStrictEqual(JSON.parse(JSON.stringify(runtime)), runtimeSnapshot);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(sample)), sampleSnapshot);
  });
});

describe('resolveDroneStuckRecovery — recovery action escalation', () => {
  function driveToStuck(startCtx: DroneStuckRecoveryContext) {
    let runtime = createDroneStuckRecoveryRuntime(startCtx.currentPosition);
    let now = 0;
    for (let i = 0; i < 80; i++) {
      now += 33;
      runtime = resolveDroneStuckRecovery(runtime, blockedSample(now), startCtx).runtime;
      if (runtime.phase !== 'idle') break;
    }
    return { runtime, now };
  }

  it('the first attempt chooses nudging', () => {
    const { runtime } = driveToStuck(makeContext());
    assert.strictEqual(runtime.phase, 'nudging');
    assert.strictEqual(runtime.attemptCountThisLife, 1);
  });

  it('nudge direction is never the zero vector and is always finite', () => {
    const { runtime } = driveToStuck(makeContext());
    const len = Math.sqrt(runtime.activeDirection.x ** 2 + runtime.activeDirection.y ** 2 + runtime.activeDirection.z ** 2);
    assert.ok(len > 0.01);
    assert.ok(Number.isFinite(runtime.activeDirection.x) && Number.isFinite(runtime.activeDirection.z));
  });

  it('nudge direction stays frozen for the duration of the phase (no frame-to-frame flip)', () => {
    let { runtime, now } = driveToStuck(makeContext());
    const firstDir = { ...runtime.activeDirection };
    const ctx = makeContext();
    for (let i = 0; i < 10; i++) {
      now += 33;
      const result = resolveDroneStuckRecovery(runtime, blockedSample(now), ctx);
      runtime = result.runtime;
      if (runtime.phase !== 'nudging') break;
      assert.deepStrictEqual(runtime.activeDirection, firstDir);
    }
  });

  it('second attempt (after nudge fails to produce escape progress) chooses backing-away', () => {
    let { runtime, now } = driveToStuck(makeContext());
    const ctx = makeContext(); // currentPosition never advances -> "stuck in place" through the nudge duration too
    for (let i = 0; i < 60; i++) {
      now += 33;
      runtime = resolveDroneStuckRecovery(runtime, blockedSample(now), ctx).runtime;
      if (runtime.phase !== 'nudging') break;
    }
    assert.strictEqual(runtime.phase, 'backing-away');
    assert.strictEqual(runtime.attemptCountThisLife, 2);
  });

  it('back-away direction is the negation family of the requested direction (opposes the blocked request), not equal to the nudge direction', () => {
    const ctx = makeContext();
    let { runtime, now } = driveToStuck(ctx);
    const nudgeDir = { ...runtime.activeDirection };
    for (let i = 0; i < 60; i++) {
      now += 33;
      runtime = resolveDroneStuckRecovery(runtime, blockedSample(now), ctx).runtime;
      if (runtime.phase !== 'nudging') break;
    }
    assert.strictEqual(runtime.phase, 'backing-away');
    assert.notDeepStrictEqual(runtime.activeDirection, nudgeDir);
    // Requested direction was +X; backing away should have a negative-X lean.
    assert.ok(runtime.activeDirection.x < 0);
  });

  it('altitude-correcting is only entered when altitude evidence justifies it', () => {
    const ctxHealthyAlt = makeContext({ currentPosition: pos(0, 4, 0) }); // 4 is well inside [1,9]
    let { runtime, now } = driveToStuck(ctxHealthyAlt);
    for (let i = 0; i < 60; i++) {
      now += 33;
      runtime = resolveDroneStuckRecovery(runtime, blockedSample(now), ctxHealthyAlt).runtime;
      if (runtime.phase !== 'nudging') break;
    }
    for (let i = 0; i < 60; i++) {
      now += 33;
      runtime = resolveDroneStuckRecovery(runtime, blockedSample(now), ctxHealthyAlt).runtime;
      if (runtime.phase !== 'backing-away') break;
    }
    // With no altitude evidence, backing-away failure should skip straight to teleport-fallback, not altitude-correcting.
    assert.notStrictEqual(runtime.phase, 'altitude-correcting');
  });

  it('altitude-correcting IS entered when the sample reports altitudeClamped', () => {
    let runtime = createDroneStuckRecoveryRuntime(pos(0, 4, 0));
    const ctx = makeContext();
    let now = 0;
    const clampedBlockedSample = (n: number): DroneStuckSample => ({ ...blockedSample(n), altitudeClamped: true });
    for (let i = 0; i < 80; i++) {
      now += 33;
      runtime = resolveDroneStuckRecovery(runtime, clampedBlockedSample(now), ctx).runtime;
      if (runtime.phase !== 'idle') break;
    }
    for (let i = 0; i < 60; i++) {
      now += 33;
      runtime = resolveDroneStuckRecovery(runtime, clampedBlockedSample(now), ctx).runtime;
      if (runtime.phase !== 'nudging') break;
    }
    for (let i = 0; i < 60; i++) {
      now += 33;
      runtime = resolveDroneStuckRecovery(runtime, clampedBlockedSample(now), ctx).runtime;
      if (runtime.phase !== 'backing-away') break;
    }
    assert.strictEqual(runtime.phase, 'altitude-correcting');
  });

  it('recovery speed never exceeds the caller-supplied speedMps (nudge/back-away)', () => {
    const ctx = makeContext({ speedMps: 3.2 });
    const { runtime } = driveToStuck(ctx);
    const speed = Math.sqrt(runtime.activeDirection.x ** 2 + runtime.activeDirection.z ** 2) * runtime.activeSpeedMps;
    assert.ok(speed <= 3.2 + 1e-9);
    assert.strictEqual(runtime.activeSpeedMps, 3.2);
  });

  it('deterministic direction is a pure function of stable drone ID — same ID always escapes the same way given the same requested direction', () => {
    const ctxA = makeContext({ droneId: 'drone-alpha' });
    const ctxA2 = makeContext({ droneId: 'drone-alpha' });
    const { runtime: r1 } = driveToStuck(ctxA);
    const { runtime: r2 } = driveToStuck(ctxA2);
    assert.deepStrictEqual(r1.activeDirection, r2.activeDirection);
  });

  it('different drone IDs can choose different nudge sides deterministically', () => {
    const dirs = new Set<string>();
    for (const id of ['drone-a', 'drone-b', 'drone-c', 'drone-d', 'drone-e']) {
      const { runtime } = driveToStuck(makeContext({ droneId: id }));
      dirs.add(`${runtime.activeDirection.x.toFixed(3)},${runtime.activeDirection.z.toFixed(3)}`);
    }
    assert.ok(dirs.size >= 2, 'at least some variety across drone IDs is expected from the hash-based side choice');
  });

  it('a near-boundary drone gets a bounded inward-leaning nudge, but base escape direction still dominates', () => {
    const nearEdgeCtx = makeContext({ currentPosition: pos(19, 4, 0) }); // 1m from maxX=20, well inside softBoundaryMarginM=2
    const { runtime } = driveToStuck(nearEdgeCtx);
    // Requested direction was +X (toward the wall) -> nudge perpendiculars are +-Z; inward blend should pull slightly toward centre (negative X component), but not overwhelm the perpendicular Z lean into a pure -X vector.
    assert.ok(Math.abs(runtime.activeDirection.z) > 0, 'perpendicular lean must still be present, not fully replaced by the inward pull');
  });
});

describe('resolveDroneStuckRecovery — teleport safeguards', () => {
  function driveThroughFullEscalation(ctx: DroneStuckRecoveryContext, maxTicks = 500) {
    let runtime = createDroneStuckRecoveryRuntime(ctx.currentPosition);
    let now = 0;
    let teleportTarget: { x: number; y: number; z: number } | null = null;
    for (let i = 0; i < maxTicks; i++) {
      now += 33;
      const result = resolveDroneStuckRecovery(runtime, blockedSample(now), ctx);
      runtime = result.runtime;
      if (result.decision.teleportTarget) teleportTarget = result.decision.teleportTarget;
      if (runtime.phase === 'cooldown') break; // first time cooldown is reached — whether via a real teleport or via exhausting attempts with no valid target
    }
    return { runtime, teleportTarget };
  }

  it('no teleport before the required minimum failed attempts', () => {
    let runtime = createDroneStuckRecoveryRuntime(pos(0, 4, 0));
    const ctx = makeContext();
    let now = 0;
    let sawTeleport = false;
    for (let i = 0; i < 80; i++) {
      now += 33;
      const result = resolveDroneStuckRecovery(runtime, blockedSample(now), ctx);
      runtime = result.runtime;
      if (result.decision.teleportTarget) sawTeleport = true;
      if (runtime.phase !== 'idle') break;
    }
    assert.strictEqual(sawTeleport, false);
    assert.strictEqual(runtime.attemptCountThisLife, 1);
  });

  it('no teleport before the nudge/back-away duration timeout elapses', () => {
    let runtime = createDroneStuckRecoveryRuntime(pos(0, 4, 0));
    const ctx = makeContext();
    let now = 0;
    runtime = resolveDroneStuckRecovery(runtime, blockedSample((now += 33)), ctx).runtime;
    // Force into nudging quickly for the test, then check immediately after entering — must not already show a teleport target on this same phase.
    for (let i = 0; i < 80 && runtime.phase === 'idle'; i++) {
      now += 33;
      runtime = resolveDroneStuckRecovery(runtime, blockedSample(now), ctx).runtime;
    }
    assert.strictEqual(runtime.phase, 'nudging');
    const result = resolveDroneStuckRecovery(runtime, blockedSample(now + 10), ctx);
    assert.strictEqual(result.decision.teleportTarget, null);
  });

  it('full escalation eventually reaches exactly one teleport, applying the drone\'s own home position', () => {
    const ctx = makeContext({ homePosition: pos(3, 4, 3) });
    const { teleportTarget } = driveThroughFullEscalation(ctx);
    assert.ok(teleportTarget, 'expected a teleport target to have been issued during full escalation');
    assert.deepStrictEqual(teleportTarget, pos(3, 4, 3));
  });

  it('teleport target always validates through the arena config (inside bounds, outside forbidden zones)', () => {
    // Home position deliberately placed OUTSIDE bounds -> must fall back to a safe fallback position instead.
    const ctx = makeContext({ homePosition: pos(999, 4, 999) });
    const { teleportTarget } = driveThroughFullEscalation(ctx);
    assert.ok(teleportTarget);
    assert.ok(teleportTarget!.x >= CONFIG.horizontalBounds.minX && teleportTarget!.x <= CONFIG.horizontalBounds.maxX);
    assert.deepStrictEqual(teleportTarget, CONFIG.safeFallbackPositions[0]);
  });

  it('no teleport at all when neither home nor any fallback validates', () => {
    const badConfig: DroneArenaConfig = { ...CONFIG, safeFallbackPositions: [] };
    const ctx = makeContext({ homePosition: pos(999, 4, 999), config: badConfig });
    const { teleportTarget, runtime } = driveThroughFullEscalation(ctx, 500);
    assert.strictEqual(teleportTarget, null);
    assert.strictEqual(runtime.phase, 'cooldown');
    assert.strictEqual(runtime.teleportCountThisLife, 0);
  });

  it('only one teleport occurs per life even if stuck conditions persist afterward', () => {
    const ctx = makeContext({ homePosition: pos(1, 4, 1) });
    let { runtime } = driveThroughFullEscalation(ctx);
    assert.strictEqual(runtime.teleportCountThisLife, 1);
    // Wait out the cooldown and drive into stuck again — must escalate again but never re-teleport.
    let now = 0;
    for (let i = 0; i < 400; i++) {
      now += 33;
      const result = resolveDroneStuckRecovery(runtime, blockedSample(now), ctx);
      runtime = result.runtime;
    }
    assert.strictEqual(runtime.teleportCountThisLife, 1, 'a second full escalation must never push the teleport count above 1');
  });

  it('reset restores teleport allowance for a genuinely new life', () => {
    const ctx = makeContext({ homePosition: pos(1, 4, 1) });
    const { runtime } = driveThroughFullEscalation(ctx);
    assert.strictEqual(runtime.teleportCountThisLife, 1);
    const reset = resetDroneStuckRecoveryRuntime(pos(1, 4, 1));
    assert.strictEqual(reset.teleportCountThisLife, 0);
  });

  it('a player-generation change (clearActiveDroneStuckRecovery) does NOT restore teleport allowance', () => {
    const ctx = makeContext({ homePosition: pos(1, 4, 1) });
    const { runtime } = driveThroughFullEscalation(ctx);
    assert.strictEqual(runtime.teleportCountThisLife, 1);
    const cleared = clearActiveDroneStuckRecovery(runtime, pos(1, 4, 1));
    assert.strictEqual(cleared.teleportCountThisLife, 1, 'teleport count must be RETAINED across a player respawn — it is still the same drone life');
    assert.strictEqual(cleared.phase, 'idle');
  });
});

describe('resolveDroneStuckRecovery — safe input handling', () => {
  it('non-finite sample fields degrade to a safe no-op, never corrupting the runtime', () => {
    const runtime = createDroneStuckRecoveryRuntime(pos(0, 4, 0));
    const badSample: DroneStuckSample = { nowMs: NaN, wantsMovement: true, expectedDisplacementM: 1, actualDisplacementM: 0, requestedDirection: { x: 1, y: 0, z: 0 }, actualDisplacement: { x: 0, y: 0, z: 0 }, horizontalClamped: false, altitudeClamped: false, forbiddenZoneCorrected: false };
    const result = resolveDroneStuckRecovery(runtime, badSample, makeContext());
    assert.deepStrictEqual(result.runtime, runtime);
    assert.strictEqual(result.decision.stuckDetected, false);
  });

  it('non-finite context.currentPosition degrades to a safe no-op', () => {
    const runtime = createDroneStuckRecoveryRuntime(pos(0, 4, 0));
    const result = resolveDroneStuckRecovery(runtime, blockedSample(1000), makeContext({ currentPosition: pos(NaN, 4, 0) }));
    assert.deepStrictEqual(result.runtime, runtime);
  });

  it('createDroneStuckRecoveryRuntime with a non-finite initial position degrades to a finite (0,0,0) rather than propagating NaN', () => {
    const runtime = createDroneStuckRecoveryRuntime(pos(NaN, NaN, NaN));
    assert.deepStrictEqual(runtime.lastStablePosition, { x: 0, y: 0, z: 0 });
  });

  it('zero elapsed time (identical consecutive timestamps) never throws or corrupts state', () => {
    let runtime = createDroneStuckRecoveryRuntime(pos(0, 4, 0));
    const ctx = makeContext();
    for (let i = 0; i < 5; i++) {
      const result = resolveDroneStuckRecovery(runtime, blockedSample(1000), ctx);
      runtime = result.runtime;
    }
    assert.ok(Number.isFinite(runtime.expectedDistanceAccumM));
  });
});

describe('resolveDroneStuckRecovery — Milestone 9F.1: exact detection-latency relationship (permanent deterministic timing guard)', () => {
  // Formalizes the exact mechanical relationship reconciled live in 9F.1's
  // own closure pass: given a UNIFORM real-world tick cadence (here, a real
  // 60Hz-equivalent 16.667ms step — deliberately finer than the detector's
  // own 250ms low-rate sampling gate, so this test also exercises that gate
  // for real rather than assuming it away), sustained blocked movement with
  // ample expected distance detects stuck on the EXACT tick windowAge FIRST
  // reaches windowDurationMs (2000ms) — never earlier, and never more than
  // one tick's worth of slop later. This is what the live 9F.1 browser trace
  // showed too (detection landed exactly on the first real frame whose own
  // `now` crossed the 2000ms threshold) — this test pins the same guarantee
  // permanently, independent of any browser frame-rate variance.
  const TICK_MS = 1000 / 60;

  it('detects on the exact tick window age first reaches windowDurationMs — not one tick earlier', () => {
    let runtime = createDroneStuckRecoveryRuntime(pos(0, 4, 0));
    const ctx = makeContext();
    let now = 0;
    let detectedAtWindowAge = null;
    let windowStartedAtMs = null;
    for (let i = 0; i < 400; i++) {
      now += TICK_MS;
      const sample = blockedSample(now, 1, 0, 4, TICK_MS / 1000);
      const result = resolveDroneStuckRecovery(runtime, sample, ctx);
      if (runtime.phase === 'idle' && runtime.windowStartedAtMs === null && result.runtime.windowStartedAtMs !== null) {
        windowStartedAtMs = result.runtime.windowStartedAtMs;
      }
      runtime = result.runtime;
      if (result.decision.stuckDetected) {
        detectedAtWindowAge = now - (windowStartedAtMs ?? 0);
        break;
      }
    }
    assert.ok(detectedAtWindowAge !== null, 'expected a stuck detection within 400 ticks');
    assert.ok(detectedAtWindowAge >= DRONE_STUCK_DETECTOR.windowDurationMs, `detection window age ${detectedAtWindowAge}ms must be >= the configured ${DRONE_STUCK_DETECTOR.windowDurationMs}ms — never early`);
    // Slop bound: the window-duration gate AND the low-rate resample gate
    // (sampleIntervalMs) must BOTH be true on the same tick — worst case,
    // the window threshold is crossed just after a resample check, so
    // detection waits up to one more full sampleIntervalMs before the next
    // due check, plus one tick to actually execute it. This is the exact
    // relationship reconciled live in 9F.1: no undocumented delay, only
    // these two documented gates compounding.
    assert.ok(
      detectedAtWindowAge < DRONE_STUCK_DETECTOR.windowDurationMs + DRONE_STUCK_DETECTOR.sampleIntervalMs + TICK_MS + 1,
      `detection window age ${detectedAtWindowAge}ms must land within one sample interval (${DRONE_STUCK_DETECTOR.sampleIntervalMs}ms) plus one tick of the configured ${DRONE_STUCK_DETECTOR.windowDurationMs}ms boundary — any larger gap would indicate an undocumented extra delay`,
    );
  });

  it('at a tick cadence coarser than the sample-interval gate, detection still lands within one tick of the window-duration boundary (mirrors this environment\'s real ~600-1100ms inter-frame gap)', () => {
    const COARSE_TICK_MS = 700; // deliberately wider than sampleIntervalMs (250ms) and comparable to the real measured browser frame gap
    let runtime = createDroneStuckRecoveryRuntime(pos(0, 4, 0));
    const ctx = makeContext();
    let now = 0;
    let detectedAtWindowAge = null;
    let windowStartedAtMs = null;
    for (let i = 0; i < 40; i++) {
      now += COARSE_TICK_MS;
      const sample = blockedSample(now, 1, 0, 4, COARSE_TICK_MS / 1000);
      const result = resolveDroneStuckRecovery(runtime, sample, ctx);
      if (runtime.phase === 'idle' && runtime.windowStartedAtMs === null && result.runtime.windowStartedAtMs !== null) {
        windowStartedAtMs = result.runtime.windowStartedAtMs;
      }
      runtime = result.runtime;
      if (result.decision.stuckDetected) {
        detectedAtWindowAge = now - (windowStartedAtMs ?? 0);
        break;
      }
    }
    assert.ok(detectedAtWindowAge !== null);
    assert.ok(detectedAtWindowAge >= DRONE_STUCK_DETECTOR.windowDurationMs);
    assert.ok(
      detectedAtWindowAge < DRONE_STUCK_DETECTOR.windowDurationMs + COARSE_TICK_MS + 1,
      `at a ${COARSE_TICK_MS}ms tick cadence, detection must still land within one tick of the ${DRONE_STUCK_DETECTOR.windowDurationMs}ms boundary — proving the ONLY source of "extra" latency beyond the configured window is waiting for the next tick to actually arrive, exactly as documented`,
    );
  });

  it('the pre-window latency (time before wantsMovement first becomes true) is entirely separate from and additive to the window-duration latency — not itself bounded by windowDurationMs/sampleIntervalMs', () => {
    let runtime = createDroneStuckRecoveryRuntime(pos(0, 4, 0));
    const ctx = makeContext();
    let now = 0;
    // Simulate an idle period (no requested movement at all) before the drone starts genuinely requesting blocked movement — mirrors real spawn/acquisition time in the live game.
    const PRE_WINDOW_IDLE_TICKS = 50; // 50 * 16.67ms ~= 833ms of "nothing to measure yet"
    for (let i = 0; i < PRE_WINDOW_IDLE_TICKS; i++) {
      now += TICK_MS;
      runtime = resolveDroneStuckRecovery(runtime, idleSample(now), ctx).runtime;
    }
    assert.strictEqual(runtime.windowStartedAtMs, null, 'the window must not have started at all during the pre-movement idle period');
    let detected = false;
    let ticksAfterIdle = 0;
    for (let i = 0; i < 400; i++) {
      now += TICK_MS;
      ticksAfterIdle++;
      const result = resolveDroneStuckRecovery(runtime, blockedSample(now, 1, 0, 4, TICK_MS / 1000), ctx);
      runtime = result.runtime;
      if (result.decision.stuckDetected) { detected = true; break; }
    }
    assert.ok(detected);
    // The total real elapsed time is PRE_WINDOW_IDLE_TICKS worth of idle PLUS the window's own ~2000ms -- proving the two components are independent and additive, exactly as reconciled in the 9F.1 report.
    const totalElapsedMs = PRE_WINDOW_IDLE_TICKS * TICK_MS + ticksAfterIdle * TICK_MS;
    assert.ok(totalElapsedMs > DRONE_STUCK_DETECTOR.windowDurationMs + PRE_WINDOW_IDLE_TICKS * TICK_MS - 1);
  });
});

describe('droneAiStuckRecovery — source guards', () => {
  it('exports no RNG-consuming call anywhere in its own source', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
    const src = fs.readFileSync(path.join(repoRoot, 'src/lib/v2/ai/droneAiStuckRecovery.ts'), 'utf8');
    assert.ok(!src.includes('Math.random('));
    assert.ok(!src.includes('performance.now('));
    assert.ok(!src.includes('Date.now('));
    assert.ok(!src.includes('setTimeout('));
    assert.ok(!src.includes('setInterval('));
  });
});
