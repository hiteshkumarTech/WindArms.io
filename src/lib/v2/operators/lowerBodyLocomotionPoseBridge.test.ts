import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PLAYER } from '@/lib/game/constants';
import {
  beginLowerBodyLocomotionPoseGeneration,
  getSharedLowerBodyLocomotionPose,
  invalidateLowerBodyLocomotionPose,
  publishLowerBodyLocomotionPose,
} from './lowerBodyLocomotionPoseBridge';
import {
  computeLowerBodyLocomotionPose,
  createLowerBodyLocomotionPose,
  createLowerBodyLocomotionRuntimeState,
  type LowerBodyLocomotionInput,
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

describe('lowerBodyLocomotionPoseBridge — lifecycle (Step 8E-B)', () => {
  it('a fresh generation starts not-ready with a null pose', () => {
    beginLowerBodyLocomotionPoseGeneration();
    const snap = getSharedLowerBodyLocomotionPose();
    assert.strictEqual(snap.ready, false);
    assert.strictEqual(snap.pose, null);
  });

  it('beginLowerBodyLocomotionPoseGeneration increments the generation counter each call', () => {
    const g1 = beginLowerBodyLocomotionPoseGeneration();
    const g2 = beginLowerBodyLocomotionPoseGeneration();
    assert.ok(g2 > g1);
  });

  it('a valid publish under the current generation succeeds, flips ready true, and stores the exact object reference (zero-copy)', () => {
    const gen = beginLowerBodyLocomotionPoseGeneration();
    const pose = createLowerBodyLocomotionPose();
    const ok = publishLowerBodyLocomotionPose(gen, pose);
    assert.strictEqual(ok, true);
    const snap = getSharedLowerBodyLocomotionPose();
    assert.strictEqual(snap.ready, true);
    assert.strictEqual(snap.pose, pose, 'must be the SAME object reference, not a copy');
  });

  it('a stale generation cannot publish (route remount / straggler-frame protection)', () => {
    const staleGen = beginLowerBodyLocomotionPoseGeneration();
    beginLowerBodyLocomotionPoseGeneration(); // supersedes staleGen
    const ok = publishLowerBodyLocomotionPose(staleGen, createLowerBodyLocomotionPose());
    assert.strictEqual(ok, false);
    assert.strictEqual(getSharedLowerBodyLocomotionPose().ready, false);
  });

  it('a stale generation cannot invalidate a newer, already-valid pose', () => {
    const staleGen = beginLowerBodyLocomotionPoseGeneration();
    const newGen = beginLowerBodyLocomotionPoseGeneration();
    publishLowerBodyLocomotionPose(newGen, createLowerBodyLocomotionPose());
    assert.strictEqual(getSharedLowerBodyLocomotionPose().ready, true);
    invalidateLowerBodyLocomotionPose(staleGen);
    assert.strictEqual(getSharedLowerBodyLocomotionPose().ready, true, 'a stale unmount must not clear the newer generation');
  });

  it('the current generation CAN invalidate its own pose (real unmount)', () => {
    const gen = beginLowerBodyLocomotionPoseGeneration();
    publishLowerBodyLocomotionPose(gen, createLowerBodyLocomotionPose());
    assert.strictEqual(getSharedLowerBodyLocomotionPose().ready, true);
    invalidateLowerBodyLocomotionPose(gen);
    assert.strictEqual(getSharedLowerBodyLocomotionPose().ready, false);
  });

  it('getSharedLowerBodyLocomotionPose returns a stable reference across calls (no copy-per-read allocation)', () => {
    beginLowerBodyLocomotionPoseGeneration();
    const a = getSharedLowerBodyLocomotionPose();
    const b = getSharedLowerBodyLocomotionPose();
    assert.strictEqual(a, b);
  });
});

describe('lowerBodyLocomotionPoseBridge — one shared result across a full walk -> sprint -> jump -> landing sequence (Step 8E-B)', () => {
  it('the bridge relays byte-identical pose values every frame — a second consumer reading it sees EXACTLY what the sole writer just computed, never a lagging/diverged copy', () => {
    const gen = beginLowerBodyLocomotionPoseGeneration();
    const state = createLowerBodyLocomotionRuntimeState();
    const pose = createLowerBodyLocomotionPose();

    const phases: { input: LowerBodyLocomotionInput; frames: number }[] = [
      { input: baseInput({ horizontalSpeed: PLAYER.WALK_SPEED, movementState: 'walk' }), frames: 60 },
      { input: baseInput({ horizontalSpeed: PLAYER.SPRINT_SPEED, movementState: 'sprint' }), frames: 60 },
      { input: baseInput({ grounded: false, verticalVelocity: PLAYER.JUMP_VELOCITY, movementState: 'air' }), frames: 10 },
      { input: baseInput({ grounded: false, verticalVelocity: -8, movementState: 'air' }), frames: 20 },
      { input: baseInput({ grounded: true, verticalVelocity: -0.6, movementState: 'idle' }), frames: 30 },
    ];

    let sampledPhases = 0;
    let sampledStates = 0;
    for (const { input, frames } of phases) {
      for (let i = 0; i < frames; i++) {
        computeLowerBodyLocomotionPose(input, state, pose);
        const ok = publishLowerBodyLocomotionPose(gen, pose);
        assert.strictEqual(ok, true);

        // The "second consumer" read — must see the exact same values the writer just computed this same frame, every single frame, not just at the start/end.
        const shared = getSharedLowerBodyLocomotionPose();
        assert.strictEqual(shared.ready, true);
        assert.ok(shared.pose, 'shared pose must be non-null once published');
        assert.strictEqual(shared.pose, pose, 'must be the exact same object the writer computed into — no divergent copy possible');
        assert.strictEqual(shared.pose!.phase, pose.phase);
        assert.strictEqual(shared.pose!.blendWeight, pose.blendWeight);
        assert.strictEqual(shared.pose!.state, pose.state);
        assert.deepStrictEqual([...shared.pose!.leftUpperLegRotation], [...pose.leftUpperLegRotation]);
        assert.deepStrictEqual([...shared.pose!.rightUpperLegRotation], [...pose.rightUpperLegRotation]);
        assert.deepStrictEqual([...shared.pose!.pelvisPositionOffset], [...pose.pelvisPositionOffset]);
        sampledPhases += 1;
        if (shared.pose!.state !== 'idle') sampledStates += 1;
      }
    }

    assert.strictEqual(sampledPhases, 180);
    assert.ok(sampledStates > 0, 'the sequence must have actually visited non-idle states — a vacuous all-idle run would not exercise the walk/sprint/jump/landing states this test claims to cover');
  });

  it('a respawnNonce change resets the single shared runtime — the shadow consumer sees the same reset instant as the visible body, never a stale mid-stride pose surviving a teleport', () => {
    const gen = beginLowerBodyLocomotionPoseGeneration();
    const state = createLowerBodyLocomotionRuntimeState();
    const pose = createLowerBodyLocomotionPose();

    for (let i = 0; i < 90; i++) {
      computeLowerBodyLocomotionPose(baseInput({ horizontalSpeed: PLAYER.SPRINT_SPEED, movementState: 'sprint', respawnNonce: 0 }), state, pose);
      publishLowerBodyLocomotionPose(gen, pose);
    }
    assert.notStrictEqual(getSharedLowerBodyLocomotionPose().pose!.state, 'idle');

    computeLowerBodyLocomotionPose(baseInput({ horizontalSpeed: 0, movementState: 'idle', respawnNonce: 1 }), state, pose);
    publishLowerBodyLocomotionPose(gen, pose);
    const afterTeleport = getSharedLowerBodyLocomotionPose().pose!;
    assert.strictEqual(afterTeleport.phase, 0);
    assert.strictEqual(afterTeleport.state, 'idle');
  });
});
