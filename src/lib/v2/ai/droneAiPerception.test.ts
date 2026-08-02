import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateDronePerception, DRONE_PERCEPTION_MEMORY } from './droneAiPerception';
import type { ArenaBox } from '../play/types';

const NO_OCCLUDERS: ArenaBox[] = [];

/** A single wall-like occluder centered between a drone at the origin and a target further along +z. */
const WALL: ArenaBox = { center: [0, 1, 5], size: [4, 4, 1] };

describe('droneAiPerception — evaluateDronePerception', () => {
  it('a clear segment within the detection radius is visible', () => {
    const result = evaluateDronePerception({
      dronePosition: { x: 0, y: 0, z: 0 },
      targetPosition: { x: 0, y: 0, z: 10 },
      detectionRadius: 42,
      occluders: NO_OCCLUDERS,
    });
    assert.strictEqual(result.withinDetectionRadius, true);
    assert.strictEqual(result.lineOfSightClear, true);
    assert.strictEqual(result.targetVisible, true);
    assert.strictEqual(result.distanceToTarget, 10);
  });

  it('a blocked segment (occluder between drone and target) is invisible, even well within detection radius', () => {
    const result = evaluateDronePerception({
      dronePosition: { x: 0, y: 1, z: 0 },
      targetPosition: { x: 0, y: 1, z: 10 },
      detectionRadius: 42,
      occluders: [WALL],
    });
    assert.strictEqual(result.withinDetectionRadius, true);
    assert.strictEqual(result.lineOfSightClear, false);
    assert.strictEqual(result.targetVisible, false);
  });

  it('a clear segment outside the detection radius is invisible, even with zero occluders', () => {
    const result = evaluateDronePerception({
      dronePosition: { x: 0, y: 0, z: 0 },
      targetPosition: { x: 0, y: 0, z: 50 },
      detectionRadius: 42,
      occluders: NO_OCCLUDERS,
    });
    assert.strictEqual(result.withinDetectionRadius, false);
    assert.strictEqual(result.lineOfSightClear, true, 'LOS clarity and detection-radius membership are independent facts');
    assert.strictEqual(result.targetVisible, false, 'visible requires BOTH within-radius AND clear LOS');
  });

  it('exact radius boundary matches the existing <= semantics (distance === detectionRadius counts as within)', () => {
    const atBoundary = evaluateDronePerception({
      dronePosition: { x: 0, y: 0, z: 0 },
      targetPosition: { x: 0, y: 0, z: 42 },
      detectionRadius: 42,
      occluders: NO_OCCLUDERS,
    });
    assert.strictEqual(atBoundary.withinDetectionRadius, true, 'distance === detectionRadius must count as within range (<=, not <)');
    assert.strictEqual(atBoundary.targetVisible, true);

    const justBeyond = evaluateDronePerception({
      dronePosition: { x: 0, y: 0, z: 0 },
      targetPosition: { x: 0, y: 0, z: 42.001 },
      detectionRadius: 42,
      occluders: NO_OCCLUDERS,
    });
    assert.strictEqual(justBeyond.withinDetectionRadius, false, 'a hair beyond the boundary must count as out of range');
    assert.strictEqual(justBeyond.targetVisible, false);
  });

  it('multiple arena occluders: visibility is blocked if ANY occluder intersects the segment, not just the first', () => {
    const farWall: ArenaBox = { center: [0, 1, 9], size: [4, 4, 1] };
    const result = evaluateDronePerception({
      dronePosition: { x: 0, y: 1, z: 0 },
      targetPosition: { x: 0, y: 1, z: 10 },
      detectionRadius: 42,
      occluders: [farWall, WALL], // deliberately out of "natural" order — the nearer WALL is second
    });
    assert.strictEqual(result.lineOfSightClear, false);
    assert.strictEqual(result.targetVisible, false);
  });

  it('multiple arena occluders that all miss the segment leave visibility clear', () => {
    const offToTheSide: ArenaBox = { center: [20, 1, 5], size: [4, 4, 1] };
    const anotherOffToTheSide: ArenaBox = { center: [-20, 1, 5], size: [4, 4, 1] };
    const result = evaluateDronePerception({
      dronePosition: { x: 0, y: 1, z: 0 },
      targetPosition: { x: 0, y: 1, z: 10 },
      detectionRadius: 42,
      occluders: [offToTheSide, anotherOffToTheSide],
    });
    assert.strictEqual(result.lineOfSightClear, true);
    assert.strictEqual(result.targetVisible, true);
  });

  it('vertical target offset: distance and visibility are computed fully in 3D, never flattened to XZ', () => {
    const droneAtOrigin = { x: 0, y: 0, z: 0 };
    const targetAbove = { x: 0, y: 30, z: 0 }; // straight up — zero XZ separation
    const result = evaluateDronePerception({
      dronePosition: droneAtOrigin,
      targetPosition: targetAbove,
      detectionRadius: 42,
      occluders: NO_OCCLUDERS,
    });
    assert.strictEqual(result.distanceToTarget, 30, 'a purely vertical offset must still contribute to distance — proves Y is not dropped');
    assert.strictEqual(result.withinDetectionRadius, true);

    const targetTooFarAbove = { x: 0, y: 50, z: 0 };
    const beyond = evaluateDronePerception({
      dronePosition: droneAtOrigin,
      targetPosition: targetTooFarAbove,
      detectionRadius: 42,
      occluders: NO_OCCLUDERS,
    });
    assert.strictEqual(beyond.withinDetectionRadius, false, 'a purely vertical excess distance must still exceed detectionRadius — not silently ignored');
  });

  it('is deterministic — identical inputs always produce an identical result, called repeatedly', () => {
    const input = {
      dronePosition: { x: 1.5, y: 2.25, z: -3.75 },
      targetPosition: { x: 8.125, y: 0.5, z: 6.0 },
      detectionRadius: 42,
      occluders: [WALL],
    };
    const first = evaluateDronePerception(input);
    for (let i = 0; i < 20; i++) {
      const repeat = evaluateDronePerception(input);
      assert.deepStrictEqual(repeat, first, `call #${i} must produce a byte-identical result to the first call`);
    }
  });

  it('never mutates its own input objects', () => {
    const dronePosition = { x: 0, y: 0, z: 0 };
    const targetPosition = { x: 0, y: 0, z: 10 };
    const droneCopy = { ...dronePosition };
    const targetCopy = { ...targetPosition };
    evaluateDronePerception({ dronePosition, targetPosition, detectionRadius: 42, occluders: [WALL] });
    assert.deepStrictEqual(dronePosition, droneCopy);
    assert.deepStrictEqual(targetPosition, targetCopy);
  });
});

describe('droneAiPerception — DRONE_PERCEPTION_MEMORY (Milestone 9C selected config)', () => {
  it('every value falls within the brief\'s own allowed adjustment ranges', () => {
    assert.ok(DRONE_PERCEPTION_MEMORY.losLossConfirmMs >= 150 && DRONE_PERCEPTION_MEMORY.losLossConfirmMs <= 350, 'losLossConfirmMs must be within [150, 350]');
    assert.ok(DRONE_PERCEPTION_MEMORY.investigateDurationMs >= 4000 && DRONE_PERCEPTION_MEMORY.investigateDurationMs <= 5500, 'investigateDurationMs must be within [4000, 5500]');
    assert.ok(DRONE_PERCEPTION_MEMORY.investigateArrivalRadiusM >= 1.0 && DRONE_PERCEPTION_MEMORY.investigateArrivalRadiusM <= 2.0, 'investigateArrivalRadiusM must be within [1.0, 2.0]');
  });

  it('is a flat, source-controlled constant object — not a function, and not keyed by difficulty', () => {
    assert.strictEqual(typeof DRONE_PERCEPTION_MEMORY, 'object', 'must be a plain constant object, never a function taking a difficulty parameter');
    assert.deepStrictEqual(Object.keys(DRONE_PERCEPTION_MEMORY).sort(), ['investigateArrivalRadiusM', 'investigateDurationMs', 'losLossConfirmMs']);
    assert.ok(!('low' in DRONE_PERCEPTION_MEMORY) && !('medium' in DRONE_PERCEPTION_MEMORY) && !('max' in DRONE_PERCEPTION_MEMORY), 'must not be difficulty-keyed — perception memory is flat this phase, difficulty-scaling is explicitly deferred to 9E');
  });
});
