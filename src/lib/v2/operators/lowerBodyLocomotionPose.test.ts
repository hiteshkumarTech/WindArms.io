import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PLAYER } from '@/lib/game/constants';
import {
  computeLowerBodyLocomotionPose,
  createLowerBodyLocomotionPose,
  createLowerBodyLocomotionRuntimeState,
  type LowerBodyLocomotionInput,
  type LowerBodyLocomotionRuntimeState,
} from './lowerBodyLocomotionPose';

function baseInput(overrides: Partial<LowerBodyLocomotionInput> = {}): LowerBodyLocomotionInput {
  return {
    deltaSeconds: 1 / 60,
    horizontalSpeed: 0,
    verticalVelocity: 0,
    grounded: true,
    movementState: 'idle',
    windLiftActive: false,
    respawnNonce: 0,
    ...overrides,
  };
}

function isFiniteVec3(v: readonly [number, number, number]): boolean {
  return v.every((n) => Number.isFinite(n));
}

function runFrames(state: LowerBodyLocomotionRuntimeState, input: LowerBodyLocomotionInput, frames: number) {
  const pose = createLowerBodyLocomotionPose();
  for (let i = 0; i < frames; i++) computeLowerBodyLocomotionPose(input, state, pose);
  return pose;
}

/** Signed angular difference `a - b`, wrapped into [-pi, pi] — `((a-b+pi) % (2*pi)) - pi` misbehaves for negative operands under JS's `%` (sign-preserving, not the mathematical modulo), so this uses the atan2(sin,cos) identity instead, which is correct for any real a/b. */
function wrappedAngleDiff(a: number, b: number): number {
  const d = a - b;
  return Math.atan2(Math.sin(d), Math.cos(d));
}

describe('lowerBodyLocomotionPose — finiteness and neutrality', () => {
  it('a fresh runtime state at idle produces an all-finite, near-neutral pose', () => {
    const state = createLowerBodyLocomotionRuntimeState();
    const pose = runFrames(state, baseInput(), 30);
    assert.ok(isFiniteVec3(pose.pelvisPositionOffset));
    assert.ok(isFiniteVec3(pose.pelvisRotationEuler));
    assert.ok(isFiniteVec3(pose.leftUpperLegRotation));
    assert.ok(isFiniteVec3(pose.rightUpperLegRotation));
    assert.strictEqual(pose.state, 'idle');
    // "Restrained" — idle breathing/sway must stay tiny, never read as marching.
    assert.ok(Math.abs(pose.pelvisPositionOffset[1]) < 0.02, `idle pelvis Y offset too large: ${pose.pelvisPositionOffset[1]}`);
    assert.ok(Math.abs(pose.leftUpperLegRotation[0]) < 0.05, `idle should not swing the legs: ${pose.leftUpperLegRotation[0]}`);
  });

  it('output stays finite across a representative range of inputs, including extreme/non-finite deltaSeconds', () => {
    const state = createLowerBodyLocomotionRuntimeState();
    const inputs: LowerBodyLocomotionInput[] = [
      baseInput({ deltaSeconds: 1e6 }),
      baseInput({ deltaSeconds: -5 }),
      baseInput({ deltaSeconds: NaN }),
      baseInput({ horizontalSpeed: 9999, movementState: 'sprint' }),
      baseInput({ verticalVelocity: -9999, grounded: false, movementState: 'air' }),
      baseInput({ windLiftActive: true, grounded: false, movementState: 'air' }),
    ];
    for (const input of inputs) {
      const pose = computeLowerBodyLocomotionPose(input, state);
      assert.ok(isFiniteVec3(pose.pelvisPositionOffset), JSON.stringify(input));
      assert.ok(isFiniteVec3(pose.pelvisRotationEuler), JSON.stringify(input));
      assert.ok(isFiniteVec3(pose.leftLowerLegRotation), JSON.stringify(input));
      assert.ok(isFiniteVec3(pose.rightFootRotation), JSON.stringify(input));
      assert.ok(Number.isFinite(pose.phase) && Number.isFinite(pose.blendWeight));
    }
  });

  it('deltaSeconds is clamped — one huge-delta call cannot snap the gait phase by more than one clamp\'s worth of advance', () => {
    const state = createLowerBodyLocomotionRuntimeState();
    // Warm up to full walking blend first so the phase-advance term is active.
    runFrames(state, baseInput({ horizontalSpeed: PLAYER.WALK_SPEED, movementState: 'walk' }), 120);
    const before = state.gaitPhase;
    computeLowerBodyLocomotionPose(baseInput({ horizontalSpeed: PLAYER.WALK_SPEED, movementState: 'walk', deltaSeconds: 1e7 }), state);
    const advance = Math.abs(wrappedAngleDiff(state.gaitPhase, before));
    assert.ok(Number.isFinite(state.gaitPhase));
    // Max possible single-call advance is boundedby the clamp (~0.1s) at the fastest tuned frequency (< 3Hz) — well under a full cycle.
    assert.ok(advance < Math.PI * 2, `gait phase jumped an unbounded amount from one huge-delta call: ${advance}`);
  });
});

describe('lowerBodyLocomotionPose — walk cycle', () => {
  it('left and right legs are exactly a half-cycle (pi) out of phase', () => {
    const state = createLowerBodyLocomotionRuntimeState();
    const input = baseInput({ horizontalSpeed: PLAYER.WALK_SPEED, movementState: 'walk' });
    runFrames(state, input, 90); // let locomotionIntensity/sprintFactor settle
    const pose = computeLowerBodyLocomotionPose(input, state);
    // At full walk blend, left thigh at phase p mirrors right thigh at phase p+pi: sin(p) vs sin(p+pi) = -sin(p).
    assert.ok(Math.abs(pose.leftUpperLegRotation[0] + pose.rightUpperLegRotation[0]) < 1e-6, `expected left/right thigh pitch to sum to ~0 (opposite phase), got L=${pose.leftUpperLegRotation[0]} R=${pose.rightUpperLegRotation[0]}`);
  });

  it('walking swings the legs measurably more than idle', () => {
    const state = createLowerBodyLocomotionRuntimeState();
    const input = baseInput({ horizontalSpeed: PLAYER.WALK_SPEED, movementState: 'walk' });
    let maxSwing = 0;
    for (let i = 0; i < 180; i++) {
      const pose = computeLowerBodyLocomotionPose(input, state);
      maxSwing = Math.max(maxSwing, Math.abs(pose.leftUpperLegRotation[0]));
    }
    assert.ok(maxSwing > 0.1, `expected a real walk swing amplitude, got max ${maxSwing}`);
  });

  it('sprint amplitude is greater than walk amplitude at the same reference speed', () => {
    const walkState = createLowerBodyLocomotionRuntimeState();
    const sprintState = createLowerBodyLocomotionRuntimeState();
    const walkInput = baseInput({ horizontalSpeed: PLAYER.WALK_SPEED, movementState: 'walk' });
    const sprintInput = baseInput({ horizontalSpeed: PLAYER.SPRINT_SPEED, movementState: 'sprint' });

    let walkMax = 0;
    let sprintMax = 0;
    for (let i = 0; i < 240; i++) {
      const wp = computeLowerBodyLocomotionPose(walkInput, walkState);
      const sp = computeLowerBodyLocomotionPose(sprintInput, sprintState);
      walkMax = Math.max(walkMax, Math.abs(wp.leftUpperLegRotation[0]));
      sprintMax = Math.max(sprintMax, Math.abs(sp.leftUpperLegRotation[0]));
    }
    assert.ok(sprintMax > walkMax, `expected sprint (${sprintMax}) > walk (${walkMax})`);
  });

  it('a bent knee reads as the shin trailing behind the thigh (absolute shin pitch below absolute thigh pitch at peak knee bend)', () => {
    const state = createLowerBodyLocomotionRuntimeState();
    const input = baseInput({ horizontalSpeed: PLAYER.WALK_SPEED, movementState: 'walk' });
    runFrames(state, input, 60);
    let foundBentFrame = false;
    for (let i = 0; i < 120; i++) {
      const pose = computeLowerBodyLocomotionPose(input, state);
      if (pose.leftUpperLegRotation[0] > 0.05) {
        // Thigh swinging forward — the shin should be at or below the thigh's pitch (bent knee), never above it.
        assert.ok(pose.leftLowerLegRotation[0] <= pose.leftUpperLegRotation[0] + 1e-6, `shin (${pose.leftLowerLegRotation[0]}) should not exceed thigh (${pose.leftUpperLegRotation[0]})`);
        foundBentFrame = true;
      }
    }
    assert.ok(foundBentFrame, 'test did not sample any forward-swing frame — widen the loop');
  });

  it('phase advance is frame-rate independent for a constant input (many small steps ~= fewer large steps over the same elapsed time)', () => {
    const input = baseInput({ horizontalSpeed: PLAYER.WALK_SPEED, movementState: 'walk' });
    const fineState = createLowerBodyLocomotionRuntimeState();
    const coarseState = createLowerBodyLocomotionRuntimeState();
    const totalSeconds = 2;
    const fineDt = 1 / 240;
    const coarseDt = 1 / 30;
    for (let t = 0; t < totalSeconds; t += fineDt) computeLowerBodyLocomotionPose({ ...input, deltaSeconds: fineDt }, fineState);
    for (let t = 0; t < totalSeconds; t += coarseDt) computeLowerBodyLocomotionPose({ ...input, deltaSeconds: coarseDt }, coarseState);
    const diff = Math.abs(wrappedAngleDiff(fineState.gaitPhase, coarseState.gaitPhase));
    assert.ok(diff < 0.15, `expected close phase agreement across step sizes, got diff=${diff} (fine=${fineState.gaitPhase}, coarse=${coarseState.gaitPhase})`);
  });

  it('idle-to-walk and walk-to-sprint transitions ramp the underlying blend smoothly, not snapped to 1 on the first frame', () => {
    // Asserts on the internal blend weights directly rather than the rendered
    // leg-swing angle — that angle is `sin(gaitPhase) * amplitude(blend)`,
    // and gaitPhase itself keeps advancing every call during normal walking,
    // so its natural oscillation would make an angle-based smoothness check
    // flaky (a big frame-to-frame angle change can be pure sine-wave motion,
    // not evidence of a snapped blend).
    const state = createLowerBodyLocomotionRuntimeState();
    runFrames(state, baseInput(), 30); // settle at idle
    assert.strictEqual(state.locomotionIntensity, 0);
    computeLowerBodyLocomotionPose(baseInput({ horizontalSpeed: PLAYER.WALK_SPEED, movementState: 'walk' }), state);
    assert.ok(state.locomotionIntensity > 0 && state.locomotionIntensity < 0.3, `expected a small first-step idle->walk increase, got ${state.locomotionIntensity}`);

    runFrames(state, baseInput({ horizontalSpeed: PLAYER.WALK_SPEED, movementState: 'walk' }), 90); // settle at full walk
    assert.ok(state.sprintFactor < 0.01);
    computeLowerBodyLocomotionPose(baseInput({ horizontalSpeed: PLAYER.SPRINT_SPEED, movementState: 'sprint' }), state);
    assert.ok(state.sprintFactor > 0 && state.sprintFactor < 0.3, `expected a small first-step walk->sprint increase, got ${state.sprintFactor}`);
  });

  it('stopping returns smoothly toward neutral rather than freezing mid-stride', () => {
    const state = createLowerBodyLocomotionRuntimeState();
    runFrames(state, baseInput({ horizontalSpeed: PLAYER.WALK_SPEED, movementState: 'walk' }), 90);
    let prevAbs = Math.abs(computeLowerBodyLocomotionPose(baseInput({ horizontalSpeed: PLAYER.WALK_SPEED, movementState: 'walk' }), state).leftUpperLegRotation[0]);
    for (let i = 0; i < 60; i++) {
      const pose = computeLowerBodyLocomotionPose(baseInput(), state); // idle again
      prevAbs = Math.abs(pose.leftUpperLegRotation[0]);
    }
    assert.ok(prevAbs < 0.03, `expected the swing to decay back toward neutral after stopping, got ${prevAbs}`);
  });
});

describe('lowerBodyLocomotionPose — jump / airborne / landing', () => {
  it('a real jump (strong upward velocity at the leaving-ground edge) triggers the takeoff envelope', () => {
    const state = createLowerBodyLocomotionRuntimeState();
    runFrames(state, baseInput({ grounded: true, verticalVelocity: 0, movementState: 'idle' }), 5);
    computeLowerBodyLocomotionPose(baseInput({ grounded: false, verticalVelocity: PLAYER.JUMP_VELOCITY, movementState: 'air' }), state);
    assert.strictEqual(state.takeoffActive, true);
  });

  it('walking off a ledge (leaving ground with near-zero/negative vertical velocity) does NOT trigger a takeoff envelope', () => {
    const state = createLowerBodyLocomotionRuntimeState();
    runFrames(state, baseInput({ grounded: true, verticalVelocity: 0, movementState: 'walk', horizontalSpeed: PLAYER.WALK_SPEED }), 5);
    computeLowerBodyLocomotionPose(baseInput({ grounded: false, verticalVelocity: -0.5, movementState: 'air' }), state);
    assert.strictEqual(state.takeoffActive, false);
  });

  it('rising and falling produce distinct airborne poses', () => {
    const riseState = createLowerBodyLocomotionRuntimeState();
    const fallState = createLowerBodyLocomotionRuntimeState();
    const risePose = runFrames(riseState, baseInput({ grounded: false, verticalVelocity: 6, movementState: 'air' }), 60);
    const fallPose = runFrames(fallState, baseInput({ grounded: false, verticalVelocity: -6, movementState: 'air' }), 60);
    assert.notStrictEqual(risePose.state, fallPose.state);
    assert.ok(Math.abs(risePose.leftUpperLegRotation[0] - fallPose.leftUpperLegRotation[0]) > 0.02, 'expected rise/fall hip pitch to visibly differ');
  });

  it('landing triggers a bounded, decaying envelope and ends within its own documented duration', () => {
    const state = createLowerBodyLocomotionRuntimeState();
    runFrames(state, baseInput({ grounded: false, verticalVelocity: -8, movementState: 'air' }), 30);
    computeLowerBodyLocomotionPose(baseInput({ grounded: true, verticalVelocity: -0.6, movementState: 'idle' }), state);
    assert.strictEqual(state.landingActive, true);
    assert.ok(state.landingStrength > 0);
    let stillActiveAfter1s = true;
    for (let i = 0; i < 90; i++) {
      computeLowerBodyLocomotionPose(baseInput({ grounded: true, verticalVelocity: -0.6, movementState: 'idle' }), state);
      if (!state.landingActive) stillActiveAfter1s = false;
    }
    assert.strictEqual(stillActiveAfter1s, false, 'landing envelope should have ended well within 1s of simulated time');
  });

  it('landing does not fire twice for one landing (no double-trigger)', () => {
    const state = createLowerBodyLocomotionRuntimeState();
    runFrames(state, baseInput({ grounded: false, verticalVelocity: -8, movementState: 'air' }), 30);
    computeLowerBodyLocomotionPose(baseInput({ grounded: true, verticalVelocity: -0.6, movementState: 'idle' }), state);
    assert.strictEqual(state.landingActive, true);
    const strengthAtLanding = state.landingStrength;
    computeLowerBodyLocomotionPose(baseInput({ grounded: true, verticalVelocity: -0.6, movementState: 'idle' }), state);
    assert.strictEqual(state.landingStrength, strengthAtLanding, 'landing strength must not be recaptured on a subsequent still-grounded frame');
  });

  it('the landing pelvis dip is bounded even for an extreme impact velocity (clamped maximum response)', () => {
    const state = createLowerBodyLocomotionRuntimeState();
    runFrames(state, baseInput({ grounded: false, verticalVelocity: PLAYER.MAX_FALL, movementState: 'air' }), 60);
    let maxDip = 0;
    for (let i = 0; i < 20; i++) {
      const pose = computeLowerBodyLocomotionPose(baseInput({ grounded: true, verticalVelocity: -0.6, movementState: 'idle' }), state);
      maxDip = Math.max(maxDip, -pose.pelvisPositionOffset[1]);
    }
    assert.ok(maxDip < 0.2, `expected a clamped, small visual dip even for a max-speed fall, got ${maxDip}m`);
  });

  it('a respawn/recovery-volume teleport (respawnNonce change) does not produce a landing response', () => {
    const state = createLowerBodyLocomotionRuntimeState();
    runFrames(state, baseInput({ grounded: false, verticalVelocity: -8, movementState: 'air', respawnNonce: 0 }), 30);
    // Teleport: nonce changes AND grounded flips true in the same publish (spawn is on solid ground) — must not read as a landing.
    computeLowerBodyLocomotionPose(baseInput({ grounded: true, verticalVelocity: 0, movementState: 'idle', respawnNonce: 1 }), state);
    assert.strictEqual(state.landingActive, false, 'a teleport must never be mistaken for a landing');
  });
});

describe('lowerBodyLocomotionPose — Wind Lift', () => {
  it('Wind Lift produces a posture distinct from a normal rising jump', () => {
    const normalRiseState = createLowerBodyLocomotionRuntimeState();
    const windLiftState = createLowerBodyLocomotionRuntimeState();
    const normalPose = runFrames(normalRiseState, baseInput({ grounded: false, verticalVelocity: 6, movementState: 'air', windLiftActive: false }), 90);
    const windLiftPose = runFrames(windLiftState, baseInput({ grounded: false, verticalVelocity: 6, movementState: 'air', windLiftActive: true }), 90);
    assert.strictEqual(windLiftPose.state, 'windLift');
    assert.notStrictEqual(normalPose.state, windLiftPose.state);
    assert.ok(Math.abs(normalPose.leftUpperLegRotation[0] - windLiftPose.leftUpperLegRotation[0]) > 0.02);
  });

  it('Wind Lift does not run the walk/sprint gait cycle (no left/right alternation)', () => {
    const state = createLowerBodyLocomotionRuntimeState();
    const input = baseInput({ grounded: false, verticalVelocity: 4, movementState: 'air', windLiftActive: true });
    let maxAsymmetry = 0;
    for (let i = 0; i < 120; i++) {
      const pose = computeLowerBodyLocomotionPose(input, state);
      maxAsymmetry = Math.max(maxAsymmetry, Math.abs(pose.leftUpperLegRotation[0] - pose.rightUpperLegRotation[0]));
    }
    assert.ok(maxAsymmetry < 1e-6, `Wind Lift posture must stay symmetric between legs, got max asymmetry ${maxAsymmetry}`);
  });
});

describe('lowerBodyLocomotionPose — pause / lifecycle', () => {
  it('deltaSeconds=0 (pause) freezes the pose exactly — repeated zero-delta calls produce identical output', () => {
    const state = createLowerBodyLocomotionRuntimeState();
    runFrames(state, baseInput({ horizontalSpeed: PLAYER.WALK_SPEED, movementState: 'walk' }), 45);
    const frozen = computeLowerBodyLocomotionPose(baseInput({ horizontalSpeed: PLAYER.WALK_SPEED, movementState: 'walk', deltaSeconds: 0 }), state);
    const frozenSnapshot = { ...frozen, pelvisPositionOffset: [...frozen.pelvisPositionOffset], leftUpperLegRotation: [...frozen.leftUpperLegRotation] };
    for (let i = 0; i < 10; i++) {
      const pose = computeLowerBodyLocomotionPose(baseInput({ horizontalSpeed: PLAYER.WALK_SPEED, movementState: 'walk', deltaSeconds: 0 }), state);
      assert.deepStrictEqual([...pose.pelvisPositionOffset], frozenSnapshot.pelvisPositionOffset);
      assert.deepStrictEqual([...pose.leftUpperLegRotation], frozenSnapshot.leftUpperLegRotation);
    }
  });

  it('a respawnNonce change resets the runtime state (stride phase, envelopes, blends) even mid-stride', () => {
    const state = createLowerBodyLocomotionRuntimeState();
    runFrames(state, baseInput({ horizontalSpeed: PLAYER.SPRINT_SPEED, movementState: 'sprint', respawnNonce: 0 }), 90);
    assert.ok(state.locomotionIntensity > 0.5, 'precondition: should be mid-sprint before the reset');
    computeLowerBodyLocomotionPose(baseInput({ horizontalSpeed: 0, movementState: 'idle', respawnNonce: 1 }), state);
    assert.strictEqual(state.gaitPhase, 0);
    assert.strictEqual(state.locomotionIntensity, 0);
    assert.strictEqual(state.sprintFactor, 0);
    assert.strictEqual(state.landingActive, false);
    assert.strictEqual(state.takeoffActive, false);
  });

  it('a fresh runtime state (route remount / new mount) starts fully neutral, independent of any other instance', () => {
    const staleState = createLowerBodyLocomotionRuntimeState();
    runFrames(staleState, baseInput({ horizontalSpeed: PLAYER.SPRINT_SPEED, movementState: 'sprint' }), 90);
    const freshState = createLowerBodyLocomotionRuntimeState();
    const freshPose = computeLowerBodyLocomotionPose(baseInput(), freshState);
    assert.strictEqual(freshPose.state, 'idle');
    assert.ok(Math.abs(freshPose.leftUpperLegRotation[0]) < 1e-6);
  });
});

describe('lowerBodyLocomotionPose — no camera-pitch input', () => {
  it('LowerBodyLocomotionInput has no pitch field — passing extra unknown keys has no effect on output', () => {
    const stateA = createLowerBodyLocomotionRuntimeState();
    const stateB = createLowerBodyLocomotionRuntimeState();
    const input = baseInput({ horizontalSpeed: PLAYER.WALK_SPEED, movementState: 'walk' });
    const inputWithHypotheticalPitch = { ...input, pitch: 1.4 } as unknown as LowerBodyLocomotionInput;
    const poseA = runFrames(stateA, input, 45);
    const poseB = runFrames(stateB, inputWithHypotheticalPitch, 45);
    assert.deepStrictEqual([...poseA.leftUpperLegRotation], [...poseB.leftUpperLegRotation]);
    assert.deepStrictEqual([...poseA.pelvisPositionOffset], [...poseB.pelvisPositionOffset]);
  });
});
