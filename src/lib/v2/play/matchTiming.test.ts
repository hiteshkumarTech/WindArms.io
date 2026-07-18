import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createStepAccumulator, stepFixed, FIXED_STEP_S, MAX_SUBSTEPS_PER_FRAME } from './fixedStep';
import { useV2MatchStore, MAX_TICK_REAL_DELTA_S } from './matchStore';

/**
 * Deterministic frame-rate simulation harness (Skyfront Trial timing
 * cleanup). Simulates a fixed-FPS render loop by calling `onFrame` once per
 * simulated frame with that tier's constant real per-frame delta — no
 * timers, no real clock, no flakiness. Covers the brief's required 60/30/
 * 10/5fps tiers for 10 seconds of simulated wall-clock input.
 */
const FPS_TIERS = [60, 30, 10, 5] as const;
const SIM_REAL_SECONDS = 10;

function simulateFrames(fps: number, totalRealS: number, onFrame: (frameDeltaS: number) => void): number {
  const frameDeltaS = 1 / fps;
  const frameCount = Math.round(totalRealS / frameDeltaS);
  for (let i = 0; i < frameCount; i++) onFrame(frameDeltaS);
  return frameCount * frameDeltaS;
}

describe('matchStore.tick — timers advance by REAL elapsed time at every frame rate', () => {
  for (const fps of FPS_TIERS) {
    it(`countdown drains by ~${SIM_REAL_SECONDS}s of real time over ${SIM_REAL_SECONDS}s at ${fps}fps`, () => {
      useV2MatchStore.setState({ phase: 'countdown', countdownRemainingS: 999 });
      const simulatedS = simulateFrames(fps, SIM_REAL_SECONDS, (frameDeltaS) => {
        useV2MatchStore.getState().tick(frameDeltaS);
      });
      const elapsed = 999 - useV2MatchStore.getState().countdownRemainingS;
      assert.ok(
        Math.abs(elapsed - simulatedS) < 1e-6,
        `expected countdown to drain by ${simulatedS}s (full real time) at ${fps}fps, actually drained ${elapsed}s`,
      );
    });

    it(`match timer drains by ~${SIM_REAL_SECONDS}s of real time over ${SIM_REAL_SECONDS}s at ${fps}fps`, () => {
      useV2MatchStore.setState({ phase: 'active', matchRemainingS: 999, dronesDestroyed: 0, selectedDifficulty: 'medium' });
      const simulatedS = simulateFrames(fps, SIM_REAL_SECONDS, (frameDeltaS) => {
        useV2MatchStore.getState().tick(frameDeltaS);
      });
      const elapsed = 999 - useV2MatchStore.getState().matchRemainingS;
      assert.ok(
        Math.abs(elapsed - simulatedS) < 1e-6,
        `expected match timer to drain by ${simulatedS}s (full real time) at ${fps}fps, actually drained ${elapsed}s`,
      );
    });

    it(`respawn timer drains by ~${SIM_REAL_SECONDS}s of real time over ${SIM_REAL_SECONDS}s at ${fps}fps`, () => {
      useV2MatchStore.setState({ phase: 'playerDead', matchRemainingS: 999, respawnRemainingS: 999, selectedDifficulty: 'medium' });
      const simulatedS = simulateFrames(fps, SIM_REAL_SECONDS, (frameDeltaS) => {
        useV2MatchStore.getState().tick(frameDeltaS);
      });
      const elapsed = 999 - useV2MatchStore.getState().respawnRemainingS;
      assert.ok(
        Math.abs(elapsed - simulatedS) < 1e-6,
        `expected respawn timer to drain by ${simulatedS}s (full real time) at ${fps}fps, actually drained ${elapsed}s`,
      );
    });
  }

  it('this is the exact regression the old code failed: a 3s countdown must reach zero after ~3s of real 5fps frames, not ~18-21s', () => {
    useV2MatchStore.setState({ phase: 'countdown', countdownRemainingS: 3 });
    // 15 frames at 5fps = 3.0s of real time.
    for (let i = 0; i < 15; i++) useV2MatchStore.getState().tick(1 / 5);
    assert.equal(useV2MatchStore.getState().phase, 'active', 'countdown should have finished and transitioned to active after 3 real seconds, regardless of the 5fps frame rate');
  });
});

describe('matchStore.tick — pause freezes every timer', () => {
  it('does not advance countdown/match/respawn while paused, at any frame rate', () => {
    useV2MatchStore.setState({ phase: 'paused', countdownRemainingS: 3, matchRemainingS: 50, respawnRemainingS: 3 });
    for (const fps of FPS_TIERS) {
      simulateFrames(fps, 5, (frameDeltaS) => useV2MatchStore.getState().tick(frameDeltaS));
    }
    const s = useV2MatchStore.getState();
    assert.equal(s.countdownRemainingS, 3);
    assert.equal(s.matchRemainingS, 50);
    assert.equal(s.respawnRemainingS, 3);
  });
});

describe('matchStore.tick — tab-restoration policy: a single huge real delta is capped, not credited in full', () => {
  it(`credits at most MAX_TICK_REAL_DELTA_S (${MAX_TICK_REAL_DELTA_S}s) from one huge tick(), not the full gap`, () => {
    useV2MatchStore.setState({ phase: 'active', matchRemainingS: 100, dronesDestroyed: 0, selectedDifficulty: 'medium' });
    useV2MatchStore.getState().tick(45); // e.g. the tab was backgrounded for 45s and rAF delivers one large delta on resume
    const remaining = useV2MatchStore.getState().matchRemainingS;
    assert.ok(
      Math.abs(100 - remaining - MAX_TICK_REAL_DELTA_S) < 1e-9,
      `expected exactly ${MAX_TICK_REAL_DELTA_S}s credited, matchRemainingS dropped by ${100 - remaining}`,
    );
  });

  it('a huge single delta does not instantly end the match (no unintended instant-defeat on tab focus regain)', () => {
    useV2MatchStore.setState({ phase: 'active', matchRemainingS: 100, dronesDestroyed: 0, selectedDifficulty: 'medium' });
    useV2MatchStore.getState().tick(300); // 5 real minutes backgrounded
    assert.equal(useV2MatchStore.getState().phase, 'active', 'a single background gap must not fast-forward the match to defeat');
  });

  it('a huge single delta does not instantly resolve the countdown either', () => {
    useV2MatchStore.setState({ phase: 'countdown', countdownRemainingS: 3 });
    useV2MatchStore.getState().tick(300);
    assert.equal(useV2MatchStore.getState().countdownRemainingS, 2, 'one capped tick should only consume 1s of the 3s countdown');
    assert.equal(useV2MatchStore.getState().phase, 'countdown');
  });
});

describe('fixedStep accumulator — movement stays close to real time and is bounded under low FPS', () => {
  it(`60fps fully preserves ${SIM_REAL_SECONDS}s of real time (no dilation)`, () => {
    const acc = createStepAccumulator();
    let totalSubsteps = 0;
    simulateFrames(60, SIM_REAL_SECONDS, (frameDeltaS) => {
      totalSubsteps += stepFixed(acc, frameDeltaS, () => {});
    });
    const simulatedS = totalSubsteps * FIXED_STEP_S;
    assert.ok(Math.abs(simulatedS - SIM_REAL_SECONDS) < 1e-6, `expected ~${SIM_REAL_SECONDS}s simulated, got ${simulatedS}s`);
  });

  it(`30fps fully preserves ${SIM_REAL_SECONDS}s of real time (no dilation)`, () => {
    const acc = createStepAccumulator();
    let totalSubsteps = 0;
    simulateFrames(30, SIM_REAL_SECONDS, (frameDeltaS) => {
      totalSubsteps += stepFixed(acc, frameDeltaS, () => {});
    });
    const simulatedS = totalSubsteps * FIXED_STEP_S;
    assert.ok(Math.abs(simulatedS - SIM_REAL_SECONDS) < 1e-6, `expected ~${SIM_REAL_SECONDS}s simulated, got ${simulatedS}s`);
  });

  it(`10fps fully preserves ${SIM_REAL_SECONDS}s of real time (6 substeps/frame, within the ${MAX_SUBSTEPS_PER_FRAME}-substep cap)`, () => {
    const acc = createStepAccumulator();
    let totalSubsteps = 0;
    let maxSubstepsSeen = 0;
    simulateFrames(10, SIM_REAL_SECONDS, (frameDeltaS) => {
      const n = stepFixed(acc, frameDeltaS, () => {});
      totalSubsteps += n;
      maxSubstepsSeen = Math.max(maxSubstepsSeen, n);
    });
    const simulatedS = totalSubsteps * FIXED_STEP_S;
    assert.ok(maxSubstepsSeen <= MAX_SUBSTEPS_PER_FRAME);
    assert.ok(Math.abs(simulatedS - SIM_REAL_SECONDS) < 1e-6, `expected ~${SIM_REAL_SECONDS}s simulated, got ${simulatedS}s`);
  });

  it('5fps is bounded (no spiral of death) but does NOT fully keep up — a documented, deliberate shortfall at the most extreme tier', () => {
    const acc = createStepAccumulator();
    let totalSubsteps = 0;
    let maxSubstepsSeen = 0;
    simulateFrames(5, SIM_REAL_SECONDS, (frameDeltaS) => {
      const n = stepFixed(acc, frameDeltaS, () => {});
      totalSubsteps += n;
      maxSubstepsSeen = Math.max(maxSubstepsSeen, n);
    });
    const simulatedS = totalSubsteps * FIXED_STEP_S;
    assert.equal(maxSubstepsSeen, MAX_SUBSTEPS_PER_FRAME, 'every 5fps frame (0.2s) needs more than the cap (8 substeps ≈ 0.133s) — each one should hit the cap exactly');
    assert.ok(simulatedS < SIM_REAL_SECONDS, 'movement should fall behind real time at this extreme, capped tier');
    assert.ok(simulatedS > SIM_REAL_SECONDS * 0.6, `shortfall should be bounded, not catastrophic — got ${simulatedS}s of ${SIM_REAL_SECONDS}s`);
  });

  it('a single huge frame delta (tab-background wake-up) does not cause a one-frame teleport or a spiral of death', () => {
    const acc = createStepAccumulator();
    const substepsThisHugeFrame = stepFixed(acc, 30, () => {}); // 30s arrived in one rendered frame
    assert.ok(substepsThisHugeFrame <= MAX_SUBSTEPS_PER_FRAME, 'one frame must never run more than the substep cap, however large its real delta');
    assert.equal(acc.carryS, 0, 'excess banked time must be dropped, not queued, once the cap is hit');

    // The very next normal-sized frame must NOT still be paying off a backlog.
    const substepsNextFrame = stepFixed(acc, 1 / 60, () => {});
    assert.ok(substepsNextFrame <= 1, 'a backlog from the huge frame must not leak into subsequent frames');
  });

  it('never produces a negative or NaN carry', () => {
    const acc = createStepAccumulator();
    for (const frameDeltaS of [1 / 60, 1 / 5, 45, 0, 1 / 30]) {
      stepFixed(acc, frameDeltaS, () => {});
      assert.ok(Number.isFinite(acc.carryS) && acc.carryS >= 0, `carry went invalid: ${acc.carryS}`);
    }
  });
});
