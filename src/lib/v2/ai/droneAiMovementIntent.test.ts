import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveDroneMovementIntent,
  computeLocalSeparation,
  exactOverlapFallbackDirection,
  DRONE_LOCAL_SEPARATION,
  EMERGENCY_SPEED_BOOST_MAX,
  type DroneMovementInput,
  type DroneSpatialSnapshot,
} from './droneAiMovementIntent';
import type { LegacyDroneMovementMode, Vec3Data } from './droneAiTypes';

/**
 * Milestone 9D — pure movement-intent test suite. Two distinct kinds of
 * parity are proven here, matching the established `droneAiLegacyParity.test.ts`
 * convention (see that file's own doc comment):
 *
 * 1. NO-NEIGHBOUR FORMULA PARITY — a hand-transcribed reference re-
 *    implementation of the exact pre-9D `DroneEnemy.tsx` movement formulas
 *    (copied verbatim from the committed `d1ef01b` source, quoted inline
 *    per assertion), compared against `resolveDroneMovementIntent()`'s
 *    output with `neighbours: []`. Proves the new pure module's formulas
 *    are byte-identical to the old inline code for every mode.
 * 2. SEPARATION/DOMINANCE behaviour — the entirely NEW 9D surface, tested
 *    directly against the algorithm described in `droneAiMovementIntent.ts`'s
 *    own doc comment.
 */

// --- Legacy formula reference helpers (hand-transcribed from d1ef01b's DroneEnemy.tsx) ---

function legacySub(a: Vec3Data, b: Vec3Data): Vec3Data {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function legacyLen(v: Vec3Data): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}
function legacyNormalize(v: Vec3Data): Vec3Data {
  const len = legacyLen(v);
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}
function legacyScale(v: Vec3Data, s: number): Vec3Data {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}
function legacyAdd(a: Vec3Data, b: Vec3Data): Vec3Data {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function assertVecClose(actual: Vec3Data, expected: Vec3Data, epsilon = 1e-9, message = '') {
  assert.ok(Math.abs(actual.x - expected.x) < epsilon, `${message} x: ${actual.x} vs ${expected.x}`);
  assert.ok(Math.abs(actual.y - expected.y) < epsilon, `${message} y: ${actual.y} vs ${expected.y}`);
  assert.ok(Math.abs(actual.z - expected.z) < epsilon, `${message} z: ${actual.z} vs ${expected.z}`);
}

const RANGE_MIN = 10;
const RANGE_MAX = 19;
const APPROACH = 4.2;
const RETREAT = 3.4;
const STRAFE = 2.6;
const BASE_STRAFE = 2.6; // DRONE.STRAFE_SPEED, unscaled by difficulty

function baseInput(overrides: Partial<DroneMovementInput> = {}): DroneMovementInput {
  return {
    legacyMovementMode: 'search',
    state: 'searching',
    selfId: 'deck-a',
    selfPosition: { x: 0, y: 3, z: 0 },
    homePosition: { x: 0, y: 3, z: 0 },
    patrolRadiusM: 3.5,
    targetPosition: { x: 0, y: 3, z: 15 },
    investigationPosition: null,
    strafeDirection: 1,
    rangeMinM: RANGE_MIN,
    rangeMaxM: RANGE_MAX,
    approachSpeedMps: APPROACH,
    retreatSpeedMps: RETREAT,
    strafeSpeedMps: STRAFE,
    searchReturnSpeedMps: BASE_STRAFE,
    searchPhase: 0,
    facePlayer: false,
    neighbours: [],
    ...overrides,
  };
}

describe('droneAiMovementIntent — movement-mode selection', () => {
  const cases: Array<[LegacyDroneMovementMode, string]> = [
    ['spawn-hold', 'hold'],
    ['destroyed-hold', 'hold'],
    ['stunned-hold', 'hold'],
    ['search', 'search'],
    ['investigate', 'investigate'],
  ];
  for (const [legacyMode, expectedMode] of cases) {
    it(`${legacyMode} -> ${expectedMode}`, () => {
      const input = baseInput({ legacyMovementMode: legacyMode, investigationPosition: legacyMode === 'investigate' ? { x: 1, y: 3, z: 1 } : null });
      const intent = resolveDroneMovementIntent(input);
      assert.strictEqual(intent.mode, expectedMode);
    });
  }

  it('engaging too close -> retreat', () => {
    const input = baseInput({ legacyMovementMode: 'engage', selfPosition: { x: 0, y: 3, z: 0 }, targetPosition: { x: 0, y: 3, z: 5 } });
    assert.strictEqual(resolveDroneMovementIntent(input).mode, 'retreat');
  });

  it('engaging exact RANGE_MIN boundary is NOT retreat (legacy uses strict <)', () => {
    const input = baseInput({ legacyMovementMode: 'engage', selfPosition: { x: 0, y: 3, z: 0 }, targetPosition: { x: 0, y: 3, z: RANGE_MIN } });
    assert.notStrictEqual(resolveDroneMovementIntent(input).mode, 'retreat');
  });

  it('engaging inside range -> strafe-left/right per strafeDirection', () => {
    const inputRight = baseInput({ legacyMovementMode: 'engage', selfPosition: { x: 0, y: 3, z: 0 }, targetPosition: { x: 0, y: 3, z: 14 }, strafeDirection: 1 });
    assert.strictEqual(resolveDroneMovementIntent(inputRight).mode, 'strafe-right');
    const inputLeft = baseInput({ legacyMovementMode: 'engage', selfPosition: { x: 0, y: 3, z: 0 }, targetPosition: { x: 0, y: 3, z: 14 }, strafeDirection: -1 });
    assert.strictEqual(resolveDroneMovementIntent(inputLeft).mode, 'strafe-left');
  });

  it('engaging exact RANGE_MAX boundary is NOT advance (legacy uses strict >)', () => {
    const input = baseInput({ legacyMovementMode: 'engage', selfPosition: { x: 0, y: 3, z: 0 }, targetPosition: { x: 0, y: 3, z: RANGE_MAX } });
    assert.notStrictEqual(resolveDroneMovementIntent(input).mode, 'advance');
  });

  it('engaging too far -> advance', () => {
    const input = baseInput({ legacyMovementMode: 'engage', selfPosition: { x: 0, y: 3, z: 0 }, targetPosition: { x: 0, y: 3, z: 30 } });
    assert.strictEqual(resolveDroneMovementIntent(input).mode, 'advance');
  });

  it('attacking mirrors current engage movement semantics exactly (same branch)', () => {
    const engage = resolveDroneMovementIntent(baseInput({ legacyMovementMode: 'engage', selfPosition: { x: 0, y: 3, z: 0 }, targetPosition: { x: 0, y: 3, z: 5 } }));
    const attack = resolveDroneMovementIntent(baseInput({ legacyMovementMode: 'attack', selfPosition: { x: 0, y: 3, z: 0 }, targetPosition: { x: 0, y: 3, z: 5 } }));
    assertVecClose(attack.desiredDirection, engage.desiredDirection);
    assert.strictEqual(attack.mode, engage.mode);
  });

  it('missing required investigate target fails safely to hold', () => {
    const input = baseInput({ legacyMovementMode: 'investigate', investigationPosition: null });
    const intent = resolveDroneMovementIntent(input);
    assert.strictEqual(intent.mode, 'hold');
    assertVecClose(intent.desiredDirection, { x: 0, y: 0, z: 0 });
  });

  it('invalid/non-finite self position fails safely to hold', () => {
    const input = baseInput({ legacyMovementMode: 'engage', selfPosition: { x: NaN, y: 3, z: 0 }, targetPosition: { x: 0, y: 3, z: 5 } });
    const intent = resolveDroneMovementIntent(input);
    assert.strictEqual(intent.mode, 'hold');
    assert.ok(Number.isFinite(intent.desiredDirection.x) && Number.isFinite(intent.desiredDirection.y) && Number.isFinite(intent.desiredDirection.z));
  });

  it('invalid/non-finite target position fails safely to hold', () => {
    const input = baseInput({ legacyMovementMode: 'engage', targetPosition: { x: Infinity, y: 3, z: 0 } });
    const intent = resolveDroneMovementIntent(input);
    assert.strictEqual(intent.mode, 'hold');
  });
});

describe('droneAiMovementIntent — no-neighbour legacy parity (byte-identical formulas, neighbours: [])', () => {
  it('search direction: legacy `home.sub(position); if(len>patrolRadius) normalize()*STRAFE_SPEED`', () => {
    const home = { x: 5, y: 3, z: -2 };
    const position = { x: -4, y: 3, z: 8 };
    const legacy = legacySub(home, position);
    const legacyDesired = legacyLen(legacy) > 3.5 ? legacyScale(legacyNormalize(legacy), BASE_STRAFE) : { x: 0, y: 0, z: 0 };
    const intent = resolveDroneMovementIntent(baseInput({ legacyMovementMode: 'search', homePosition: home, selfPosition: position, patrolRadiusM: 3.5 }));
    assertVecClose(intent.desiredDirection, legacyDesired, 1e-9, 'search-return');
  });

  it('search wander (within patrol radius): legacy `set(sin(phase)*0.4, 0, cos(phase*0.7)*0.4)` — non-unit, used as-is', () => {
    const phase = 1.23456;
    const legacyDesired = { x: Math.sin(phase) * 0.4, y: 0, z: Math.cos(phase * 0.7) * 0.4 };
    const intent = resolveDroneMovementIntent(baseInput({ legacyMovementMode: 'search', homePosition: { x: 0, y: 3, z: 0 }, selfPosition: { x: 0.1, y: 3, z: 0.1 }, patrolRadiusM: 3.5, searchPhase: phase }));
    assertVecClose(intent.desiredDirection, legacyDesired, 1e-9, 'search-wander');
  });

  it('investigate direction: legacy `target.sub(position); if(len>arrivalRadius) normalize()*approachSpeed`', () => {
    const memory = { x: 10, y: 4, z: 2 };
    const position = { x: -5, y: 3, z: -5 };
    const legacy = legacySub(memory, position);
    const legacyDesired = legacyScale(legacyNormalize(legacy), APPROACH); // well beyond the 1.5m arrival radius
    const intent = resolveDroneMovementIntent(baseInput({ legacyMovementMode: 'investigate', investigationPosition: memory, selfPosition: position }));
    assertVecClose(intent.desiredDirection, legacyDesired, 1e-9, 'investigate');
  });

  it('investigate arrival (within arrival radius): legacy sets desired to zero', () => {
    const memory = { x: 0, y: 3, z: 0.5 };
    const position = { x: 0, y: 3, z: 0 };
    const intent = resolveDroneMovementIntent(baseInput({ legacyMovementMode: 'investigate', investigationPosition: memory, selfPosition: position }));
    assertVecClose(intent.desiredDirection, { x: 0, y: 0, z: 0 }, 1e-9, 'investigate-arrived');
  });

  it('approach (too far) direction: legacy `toPlayer*approachSpeed + strafe` (strafe always added)', () => {
    const position = { x: 0, y: 3, z: 0 };
    const target = { x: 3, y: 5, z: 30 };
    const toPlayer = legacyNormalize(legacySub(target, position));
    const strafe = legacyScale({ x: toPlayer.z, y: 0, z: -toPlayer.x }, 1 * STRAFE);
    const legacyDesired = legacyAdd(legacyScale(toPlayer, APPROACH), strafe);
    const intent = resolveDroneMovementIntent(baseInput({ legacyMovementMode: 'engage', selfPosition: position, targetPosition: target, strafeDirection: 1 }));
    assertVecClose(intent.desiredDirection, legacyDesired, 1e-9, 'advance');
  });

  it('retreat (too close) direction: legacy `-toPlayer*retreatSpeed + strafe` (strafe always added)', () => {
    const position = { x: 0, y: 3, z: 0 };
    const target = { x: 1, y: 4, z: 4 };
    const toPlayer = legacyNormalize(legacySub(target, position));
    const strafe = legacyScale({ x: toPlayer.z, y: 0, z: -toPlayer.x }, -1 * STRAFE);
    const legacyDesired = legacyAdd(legacyScale(toPlayer, -RETREAT), strafe);
    const intent = resolveDroneMovementIntent(baseInput({ legacyMovementMode: 'engage', selfPosition: position, targetPosition: target, strafeDirection: -1 }));
    assertVecClose(intent.desiredDirection, legacyDesired, 1e-9, 'retreat');
  });

  it('strafe-left direction (in-band): legacy `strafe only, no radial component`', () => {
    const position = { x: 0, y: 3, z: 0 };
    const target = { x: 0, y: 3, z: 14 };
    const toPlayer = legacyNormalize(legacySub(target, position));
    const legacyDesired = legacyScale({ x: toPlayer.z, y: 0, z: -toPlayer.x }, -1 * STRAFE);
    const intent = resolveDroneMovementIntent(baseInput({ legacyMovementMode: 'engage', selfPosition: position, targetPosition: target, strafeDirection: -1 }));
    assertVecClose(intent.desiredDirection, legacyDesired, 1e-9, 'strafe-left');
  });

  it('strafe-right direction (in-band)', () => {
    const position = { x: 0, y: 3, z: 0 };
    const target = { x: 0, y: 3, z: 14 };
    const toPlayer = legacyNormalize(legacySub(target, position));
    const legacyDesired = legacyScale({ x: toPlayer.z, y: 0, z: -toPlayer.x }, 1 * STRAFE);
    const intent = resolveDroneMovementIntent(baseInput({ legacyMovementMode: 'engage', selfPosition: position, targetPosition: target, strafeDirection: 1 }));
    assertVecClose(intent.desiredDirection, legacyDesired, 1e-9, 'strafe-right');
  });

  it('attacking movement is formula-identical to engaging at the same distance/strafe', () => {
    const position = { x: 2, y: 3, z: -1 };
    const target = { x: -1, y: 6, z: 3 };
    const engage = resolveDroneMovementIntent(baseInput({ legacyMovementMode: 'engage', selfPosition: position, targetPosition: target, strafeDirection: 1 }));
    const attack = resolveDroneMovementIntent(baseInput({ legacyMovementMode: 'attack', selfPosition: position, targetPosition: target, strafeDirection: 1 }));
    assertVecClose(attack.desiredDirection, engage.desiredDirection);
  });

  it('stunned hold: legacy `desired stays (0,0,0)` regardless of distance/mode', () => {
    const intent = resolveDroneMovementIntent(baseInput({ legacyMovementMode: 'stunned-hold', selfPosition: { x: 0, y: 3, z: 0 }, targetPosition: { x: 0, y: 3, z: 5 } }));
    assertVecClose(intent.desiredDirection, { x: 0, y: 0, z: 0 });
    assert.strictEqual(intent.mode, 'hold');
  });

  it('player above drone: retreat/advance direction includes the vertical component (never flattened)', () => {
    const position = { x: 0, y: 3, z: 0 };
    const target = { x: 0, y: 9, z: 30 }; // player well above, and beyond RANGE_MAX
    const toPlayer = legacyNormalize(legacySub(target, position));
    const strafe = legacyScale({ x: toPlayer.z, y: 0, z: -toPlayer.x }, 1 * STRAFE);
    const legacyDesired = legacyAdd(legacyScale(toPlayer, APPROACH), strafe);
    const intent = resolveDroneMovementIntent(baseInput({ legacyMovementMode: 'engage', selfPosition: position, targetPosition: target, strafeDirection: 1 }));
    assertVecClose(intent.desiredDirection, legacyDesired, 1e-9, 'player-above');
    assert.ok(intent.desiredDirection.y > 0, 'must move upward toward a higher player');
  });

  it('player below drone: retreat/advance direction includes the vertical component (never flattened)', () => {
    const position = { x: 0, y: 9, z: 0 };
    const target = { x: 0, y: 0, z: 30 };
    const toPlayer = legacyNormalize(legacySub(target, position));
    const strafe = legacyScale({ x: toPlayer.z, y: 0, z: -toPlayer.x }, 1 * STRAFE);
    const legacyDesired = legacyAdd(legacyScale(toPlayer, APPROACH), strafe);
    const intent = resolveDroneMovementIntent(baseInput({ legacyMovementMode: 'engage', selfPosition: position, targetPosition: target, strafeDirection: 1 }));
    assertVecClose(intent.desiredDirection, legacyDesired, 1e-9, 'player-below');
    assert.ok(intent.desiredDirection.y < 0, 'must move downward toward a lower player');
  });

  it('30/60/120fps fixed-step integration: desiredDirection is delta-independent (the adapter, not this module, multiplies by simulationDeltaS) — same intent regardless of the caller\'s frame rate', () => {
    const input = baseInput({ legacyMovementMode: 'engage', selfPosition: { x: 0, y: 3, z: 0 }, targetPosition: { x: 0, y: 3, z: 30 } });
    const a = resolveDroneMovementIntent(input);
    const b = resolveDroneMovementIntent(input);
    assertVecClose(a.desiredDirection, b.desiredDirection);
    // Simulate integrating the SAME intent at three different fixed-step rates and confirm displacement scales linearly with dt, matching the legacy `addScaledVector(desired, dt)` contract.
    for (const dt of [1 / 30, 1 / 60, 1 / 120]) {
      const displacement = { x: a.desiredDirection.x * dt, y: a.desiredDirection.y * dt, z: a.desiredDirection.z * dt };
      const speedCheck = Math.sqrt(displacement.x ** 2 + displacement.y ** 2 + displacement.z ** 2) / dt;
      assert.ok(Math.abs(speedCheck - legacyLen(a.desiredDirection)) < 1e-9);
    }
  });

  it('speed parity: no-neighbour magnitude matches the legacy combined formula exactly (retreat+strafe), not a single flat speed', () => {
    const position = { x: 0, y: 3, z: 0 };
    const target = { x: 0, y: 3, z: 5 };
    const toPlayer = legacyNormalize(legacySub(target, position));
    const strafe = legacyScale({ x: toPlayer.z, y: 0, z: -toPlayer.x }, 1 * STRAFE);
    const legacyMagnitude = legacyLen(legacyAdd(legacyScale(toPlayer, -RETREAT), strafe));
    const intent = resolveDroneMovementIntent(baseInput({ legacyMovementMode: 'engage', selfPosition: position, targetPosition: target, strafeDirection: 1 }));
    assert.ok(Math.abs(legacyLen(intent.desiredDirection) - legacyMagnitude) < 1e-9);
  });

  it('no separation applied with zero neighbours (separationStrength is exactly 0)', () => {
    const intent = resolveDroneMovementIntent(baseInput({ legacyMovementMode: 'engage', selfPosition: { x: 0, y: 3, z: 0 }, targetPosition: { x: 0, y: 3, z: 5 }, neighbours: [] }));
    assert.strictEqual(intent.separationStrength, 0);
    assertVecClose(intent.separationDirection, { x: 0, y: 0, z: 0 });
  });
});

// --- Separation ---

function snap(id: string, position: Vec3Data, participates = true, state: DroneSpatialSnapshot['state'] = 'engaging'): DroneSpatialSnapshot {
  return { id, position, state, participatesInSeparation: participates };
}

describe('droneAiMovementIntent — separation (computeLocalSeparation)', () => {
  it('no neighbours -> zero correction', () => {
    const result = computeLocalSeparation('a', { x: 0, y: 0, z: 0 }, []);
    assert.strictEqual(result.strength, 0);
    assertVecClose(result.direction, { x: 0, y: 0, z: 0 });
  });

  it('one neighbour inside radius -> away correction, unit length', () => {
    const result = computeLocalSeparation('a', { x: 0, y: 0, z: 0 }, [snap('b', { x: 1, y: 0, z: 0 })]);
    assert.ok(result.strength > 0);
    assert.ok(Math.abs(legacyLen(result.direction) - 1) < 1e-9);
    assert.ok(result.direction.x < 0, 'must point away from the neighbour (self is at x=0, neighbour at x=1 -> away is -x)');
  });

  it('neighbour outside neighbourRadiusM -> zero', () => {
    const result = computeLocalSeparation('a', { x: 0, y: 0, z: 0 }, [snap('b', { x: DRONE_LOCAL_SEPARATION.neighbourRadiusM + 0.5, y: 0, z: 0 })]);
    assert.strictEqual(result.strength, 0);
  });

  it('neighbour outside verticalNeighbourLimitM -> zero even if XZ-close', () => {
    const result = computeLocalSeparation('a', { x: 0, y: 0, z: 0 }, [snap('b', { x: 0.5, y: DRONE_LOCAL_SEPARATION.verticalNeighbourLimitM + 1, z: 0 })]);
    assert.strictEqual(result.strength, 0);
  });

  it('destroyed neighbour ignored (participatesInSeparation: false)', () => {
    const result = computeLocalSeparation('a', { x: 0, y: 0, z: 0 }, [snap('b', { x: 0.5, y: 0, z: 0 }, false, 'destroyed')]);
    assert.strictEqual(result.strength, 0);
  });

  it('hidden/non-participating neighbour ignored', () => {
    const result = computeLocalSeparation('a', { x: 0, y: 0, z: 0 }, [snap('b', { x: 0.3, y: 0, z: 0 }, false)]);
    assert.strictEqual(result.strength, 0);
  });

  it('self excluded even if present in the neighbour array', () => {
    const result = computeLocalSeparation('a', { x: 0, y: 0, z: 0 }, [snap('a', { x: 0, y: 0, z: 0 })]);
    assert.strictEqual(result.strength, 0);
  });

  it('two symmetric neighbours cancel', () => {
    const result = computeLocalSeparation('a', { x: 0, y: 0, z: 0 }, [snap('b', { x: 1, y: 0, z: 0 }), snap('c', { x: -1, y: 0, z: 0 })]);
    assert.ok(legacyLen(result.direction) < 1e-9);
    assert.ok(result.strength < 1e-9);
  });

  it('closer neighbour has stronger effect than a farther one', () => {
    const close = computeLocalSeparation('a', { x: 0, y: 0, z: 0 }, [snap('b', { x: 0.5, y: 0, z: 0 })]);
    const far = computeLocalSeparation('a', { x: 0, y: 0, z: 0 }, [snap('b', { x: 2.0, y: 0, z: 0 })]);
    assert.ok(close.strength > far.strength);
  });

  it('strength is capped at maxBlendStrength regardless of neighbour count', () => {
    const neighbours = Array.from({ length: 8 }, (_, i) => snap(`n${i}`, { x: 0.1 * Math.cos(i), y: 0, z: 0.1 * Math.sin(i) }));
    const result = computeLocalSeparation('a', { x: 0, y: 0, z: 0 }, neighbours);
    assert.ok(result.strength <= DRONE_LOCAL_SEPARATION.maxBlendStrength + 1e-9);
  });

  it('no Y correction (direction.y is always exactly 0)', () => {
    const result = computeLocalSeparation('a', { x: 0, y: 5, z: 0 }, [snap('b', { x: 0.5, y: 4, z: 0.5 })]);
    assert.strictEqual(result.direction.y, 0);
  });

  it('no NaN/Infinity ever, including many coincident neighbours', () => {
    const neighbours = Array.from({ length: 5 }, (_, i) => snap(`n${i}`, { x: 0, y: 0, z: 0 }));
    const result = computeLocalSeparation('a', { x: 0, y: 0, z: 0 }, neighbours);
    assert.ok(Number.isFinite(result.direction.x) && Number.isFinite(result.direction.y) && Number.isFinite(result.direction.z));
    assert.ok(Number.isFinite(result.strength));
  });

  it('caller inputs are not mutated', () => {
    const neighbours = [snap('b', { x: 1, y: 0, z: 0 })];
    const selfPos = { x: 0, y: 0, z: 0 };
    const neighboursCopy = JSON.parse(JSON.stringify(neighbours));
    const selfPosCopy = { ...selfPos };
    computeLocalSeparation('a', selfPos, neighbours);
    assert.deepStrictEqual(neighbours, neighboursCopy);
    assert.deepStrictEqual(selfPos, selfPosCopy);
  });
});

describe('droneAiMovementIntent — exact overlap (exactOverlapFallbackDirection)', () => {
  it('deterministic: same IDs produce the same direction every call', () => {
    const a = exactOverlapFallbackDirection('deck-a', 'deck-b');
    const b = exactOverlapFallbackDirection('deck-a', 'deck-b');
    assertVecClose(a, b);
  });

  it('antisymmetric: reverse pair produces exact opposite', () => {
    const forward = exactOverlapFallbackDirection('deck-a', 'deck-b');
    const reverse = exactOverlapFallbackDirection('deck-b', 'deck-a');
    assertVecClose(reverse, { x: -forward.x, y: -forward.y, z: -forward.z });
  });

  it('unit length', () => {
    const v = exactOverlapFallbackDirection('left-lo', 'right-hi');
    assert.ok(Math.abs(legacyLen(v) - 1) < 1e-9);
  });

  it('no zero vector for any distinct ID pair', () => {
    const ids = ['deck-a', 'deck-b', 'deck-c', 'left-lo', 'left-hi', 'right-lo', 'right-hi', 'sentinel'];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const v = exactOverlapFallbackDirection(ids[i], ids[j]);
        assert.ok(legacyLen(v) > 0.99);
      }
    }
  });

  it('stable across reset/remount (pure function of IDs only, no generation/time input)', () => {
    // Simulated "reset": calling with the same two IDs at two arbitrary later times must agree.
    const first = exactOverlapFallbackDirection('deck-a', 'deck-c');
    const second = exactOverlapFallbackDirection('deck-a', 'deck-c');
    assertVecClose(first, second);
  });

  it('y is always exactly 0', () => {
    const v = exactOverlapFallbackDirection('deck-a', 'sentinel');
    assert.strictEqual(v.y, 0);
  });

  it('exact overlap in computeLocalSeparation uses the deterministic fallback, not a division by ~zero', () => {
    const result = computeLocalSeparation('deck-a', { x: 5, y: 3, z: 5 }, [snap('deck-b', { x: 5, y: 3, z: 5 })]);
    assert.ok(Number.isFinite(result.direction.x) && Number.isFinite(result.direction.z));
    assert.ok(legacyLen(result.direction) > 0.99);
    const expected = exactOverlapFallbackDirection('deck-a', 'deck-b');
    assertVecClose(result.direction, expected);
  });

  it('three drones at exact same position resolve to finite, well-defined tendencies', () => {
    const pos = { x: 0, y: 3, z: 0 };
    const rA = computeLocalSeparation('deck-a', pos, [snap('deck-b', pos), snap('deck-c', pos)]);
    const rB = computeLocalSeparation('deck-b', pos, [snap('deck-a', pos), snap('deck-c', pos)]);
    const rC = computeLocalSeparation('deck-c', pos, [snap('deck-a', pos), snap('deck-b', pos)]);
    for (const r of [rA, rB, rC]) {
      assert.ok(Number.isFinite(r.direction.x) && Number.isFinite(r.direction.z) && Number.isFinite(r.strength));
    }
  });
});

describe('droneAiMovementIntent — base-intent dominance', () => {
  it('retreat cannot become net-advance under strong separation toward the player', () => {
    const position = { x: 0, y: 3, z: 0 };
    const target = { x: 0, y: 3, z: 3 }; // well inside RANGE_MIN -> retreat
    // Place a neighbour on the AWAY side so raw separation pushes further away (reinforcing) -- then also test the adversarial case below.
    const toPlayer = legacyNormalize(legacySub(target, position));
    const awaySide = legacyAdd(position, legacyScale(toPlayer, -0.3)); // a neighbour "behind" self relative to player, so separation pushes SELF toward the player
    const intent = resolveDroneMovementIntent(baseInput({ legacyMovementMode: 'engage', selfPosition: position, targetPosition: target, neighbours: [snap('b', awaySide)] }));
    const radial = intent.desiredDirection.x * toPlayer.x + intent.desiredDirection.y * toPlayer.y + intent.desiredDirection.z * toPlayer.z;
    assert.ok(radial <= 1e-9, `retreat must never net-advance toward the player: radial=${radial}`);
  });

  it('advance cannot become net-retreat under strong separation away from the player', () => {
    const position = { x: 0, y: 3, z: 0 };
    const target = { x: 0, y: 3, z: 30 }; // well beyond RANGE_MAX -> advance
    const toPlayer = legacyNormalize(legacySub(target, position));
    const towardSide = legacyAdd(position, legacyScale(toPlayer, 0.3)); // neighbour "ahead" (toward player) -- separation pushes SELF away from the player
    const intent = resolveDroneMovementIntent(baseInput({ legacyMovementMode: 'engage', selfPosition: position, targetPosition: target, neighbours: [snap('b', towardSide)] }));
    const radial = intent.desiredDirection.x * toPlayer.x + intent.desiredDirection.y * toPlayer.y + intent.desiredDirection.z * toPlayer.z;
    assert.ok(radial >= -1e-9, `advance must never net-retreat from the player: radial=${radial}`);
  });

  it('separation may still alter the lateral component during retreat/advance', () => {
    const position = { x: 0, y: 3, z: 0 };
    const target = { x: 0, y: 3, z: 3 };
    const withoutNeighbour = resolveDroneMovementIntent(baseInput({ legacyMovementMode: 'engage', selfPosition: position, targetPosition: target, neighbours: [] }));
    const withNeighbour = resolveDroneMovementIntent(baseInput({ legacyMovementMode: 'engage', selfPosition: position, targetPosition: target, neighbours: [snap('b', { x: 0.4, y: 3, z: 0.1 })] }));
    assert.ok(legacyLen(legacySub(withNeighbour.desiredDirection, withoutNeighbour.desiredDirection)) > 1e-6, 'separation should visibly perturb the vector');
  });

  it('investigate continues approaching memory with a MODERATELY nearby neighbour (outside hardSeparationRadiusM -> partial urgency)', () => {
    const memory = { x: 10, y: 3, z: 0 };
    const position = { x: 0, y: 3, z: 0 };
    const withoutNeighbour = resolveDroneMovementIntent(baseInput({ legacyMovementMode: 'investigate', investigationPosition: memory, selfPosition: position, neighbours: [] }));
    // 1.8m away, offset PERPENDICULAR to the toMemory axis (not blocking the
    // path): inside neighbourRadiusM(2.4) but outside hardSeparationRadiusM(1.2)
    // -> partial (not full) direction urgency, so the lerp keeps a real
    // component of the original toMemory direction.
    const withNeighbour = resolveDroneMovementIntent(baseInput({ legacyMovementMode: 'investigate', investigationPosition: memory, selfPosition: position, neighbours: [snap('b', { x: 0, y: 3, z: 1.8 })] }));
    const toMemory = legacyNormalize(legacySub(memory, position));
    const dotWithout = withoutNeighbour.desiredDirection.x * toMemory.x + withoutNeighbour.desiredDirection.z * toMemory.z;
    const dotWith = withNeighbour.desiredDirection.x * toMemory.x + withNeighbour.desiredDirection.z * toMemory.z;
    assert.ok(dotWith > 0, 'must still net-progress toward memory at partial urgency');
    assert.ok(Math.abs(dotWith - dotWithout) < APPROACH, 'progress toward memory should not be wildly distorted at partial urgency');
  });

  it('investigate: a neighbour WITHIN hardSeparationRadiusM may fully override toward-memory progress for that tick (full urgency, by design)', () => {
    const memory = { x: 10, y: 3, z: 0 };
    const position = { x: 0, y: 3, z: 0 };
    // 0.5m away: inside hardSeparationRadiusM(1.2) -> full direction urgency (t=1), direction should equal pure separation direction.
    const withNeighbour = resolveDroneMovementIntent(baseInput({ legacyMovementMode: 'investigate', investigationPosition: memory, selfPosition: position, neighbours: [snap('b', { x: 0.5, y: 3, z: 0 })] }));
    const normalizedFinal = legacyNormalize(withNeighbour.desiredDirection);
    assertVecClose(normalizedFinal, withNeighbour.separationDirection, 1e-6, 'at full urgency the final DIRECTION should match the pure separation direction (magnitude is separately capped to base)');
  });

  it('search remains home-relative with a MODERATELY nearby neighbour (outside hardSeparationRadiusM -> partial urgency)', () => {
    const home = { x: 5, y: 3, z: 0 };
    const position = { x: -5, y: 3, z: 0 }; // outside patrol radius -> returning home
    // 1.8m away, offset PERPENDICULAR to the toHome axis: inside
    // neighbourRadiusM(2.4) but outside hardSeparationRadiusM(1.2) -> partial urgency.
    const withNeighbour = resolveDroneMovementIntent(baseInput({ legacyMovementMode: 'search', homePosition: home, selfPosition: position, patrolRadiusM: 3.5, neighbours: [snap('b', { x: -5, y: 3, z: 1.8 })] }));
    const toHome = legacyNormalize(legacySub(home, position));
    const dot = withNeighbour.desiredDirection.x * toHome.x + withNeighbour.desiredDirection.z * toHome.z;
    assert.ok(dot > 0, 'search-return must still net-progress toward home at partial urgency');
  });

  it('stunned never moves even with neighbours present', () => {
    const intent = resolveDroneMovementIntent(baseInput({ legacyMovementMode: 'stunned-hold', neighbours: [snap('b', { x: 0.05, y: 3, z: 0.05 })] }));
    assertVecClose(intent.desiredDirection, { x: 0, y: 0, z: 0 });
    assert.strictEqual(intent.separationStrength, 0);
  });

  it('no separation applied after destruction (destroyed-hold)', () => {
    const intent = resolveDroneMovementIntent(baseInput({ legacyMovementMode: 'destroyed-hold', neighbours: [snap('b', { x: 0.05, y: 3, z: 0.05 })] }));
    assertVecClose(intent.desiredDirection, { x: 0, y: 0, z: 0 });
    assert.strictEqual(intent.separationStrength, 0);
  });
});

describe('droneAiMovementIntent — facing (unchanged behaviour, passthrough)', () => {
  it('engaging faces the live player position when facePlayer is true', () => {
    const target = { x: 3, y: 4, z: 5 };
    const intent = resolveDroneMovementIntent(baseInput({ legacyMovementMode: 'engage', targetPosition: target, facePlayer: true }));
    assert.strictEqual(intent.faceTarget, true);
    assertVecClose(intent.facingTarget as Vec3Data, target);
  });

  it('investigating faces the remembered position, not the live player', () => {
    const memory = { x: 1, y: 2, z: 3 };
    const target = { x: 9, y: 9, z: 9 };
    const intent = resolveDroneMovementIntent(baseInput({ legacyMovementMode: 'investigate', investigationPosition: memory, targetPosition: target, facePlayer: false }));
    assert.strictEqual(intent.faceTarget, true);
    assertVecClose(intent.facingTarget as Vec3Data, memory);
  });

  it('searching has no facing target', () => {
    const intent = resolveDroneMovementIntent(baseInput({ legacyMovementMode: 'search', facePlayer: false }));
    assert.strictEqual(intent.faceTarget, false);
    assert.strictEqual(intent.facingTarget, null);
  });
});

describe('droneAiMovementIntent — 9D.1 speed cap (separation changes direction; magnitude bounded to a proximity-scaled emergency ceiling, never unbounded inflation)', () => {
  function magnitude(v: Vec3Data): number {
    return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  }
  // Every non-hold movement's final magnitude must stay within this
  // EMERGENCY_SPEED_BOOST_MAX-bounded ceiling of its own no-neighbour base
  // magnitude — 1.0x at ordinary range (no neighbour close enough to raise
  // `urgency` above 0), up to (1+EMERGENCY_SPEED_BOOST_MAX)x only once a
  // neighbour is within `hardSeparationRadiusM` (already visually
  // touching). See `EMERGENCY_SPEED_BOOST_MAX`'s own doc comment in
  // droneAiMovementIntent.ts for why this bounded, MEASURED exception
  // exists (three independent strictly-zero-inflation designs each failed
  // a real 8-drone moving-player capture worse than the pre-9D.1 baseline).
  function ceiling(baseMag: number): number {
    return baseMag * (1 + EMERGENCY_SPEED_BOOST_MAX);
  }

  it('no-neighbour magnitude === legacy magnitude (within the existing 1e-9 tolerance)', () => {
    const position = { x: 0, y: 3, z: 0 };
    const target = { x: 0, y: 3, z: 5 };
    const toPlayer = legacyNormalize(legacySub(target, position));
    const strafe = legacyScale({ x: toPlayer.z, y: 0, z: -toPlayer.x }, 1 * STRAFE);
    const legacyMagnitude = legacyLen(legacyAdd(legacyScale(toPlayer, -RETREAT), strafe));
    const intent = resolveDroneMovementIntent(baseInput({ legacyMovementMode: 'engage', selfPosition: position, targetPosition: target, strafeDirection: 1, neighbours: [] }));
    assert.ok(Math.abs(magnitude(intent.desiredDirection) - legacyMagnitude) < 1e-9);
  });

  it('advance with one CLOSE (emergency-range) neighbour: final magnitude <= base * (1+EMERGENCY_SPEED_BOOST_MAX)', () => {
    const position = { x: 0, y: 3, z: 0 };
    const target = { x: 0, y: 3, z: 30 }; // beyond RANGE_MAX -> advance
    const baseIntent = resolveDroneMovementIntent(baseInput({ legacyMovementMode: 'engage', selfPosition: position, targetPosition: target, neighbours: [] }));
    const withNeighbour = resolveDroneMovementIntent(baseInput({ legacyMovementMode: 'engage', selfPosition: position, targetPosition: target, neighbours: [snap('b', { x: 0.4, y: 3, z: 0.2 })] }));
    assert.ok(magnitude(withNeighbour.desiredDirection) <= ceiling(magnitude(baseIntent.desiredDirection)) + 1e-9);
  });

  it('retreat with one CLOSE (emergency-range) neighbour: final magnitude <= base * (1+EMERGENCY_SPEED_BOOST_MAX)', () => {
    const position = { x: 0, y: 3, z: 0 };
    const target = { x: 0, y: 3, z: 3 }; // inside RANGE_MIN -> retreat
    const baseIntent = resolveDroneMovementIntent(baseInput({ legacyMovementMode: 'engage', selfPosition: position, targetPosition: target, neighbours: [] }));
    const withNeighbour = resolveDroneMovementIntent(baseInput({ legacyMovementMode: 'engage', selfPosition: position, targetPosition: target, neighbours: [snap('b', { x: -0.4, y: 3, z: -0.1 })] }));
    assert.ok(magnitude(withNeighbour.desiredDirection) <= ceiling(magnitude(baseIntent.desiredDirection)) + 1e-9);
  });

  it('strafe with one CLOSE (emergency-range) neighbour: final magnitude <= base * (1+EMERGENCY_SPEED_BOOST_MAX)', () => {
    const position = { x: 0, y: 3, z: 0 };
    const target = { x: 0, y: 3, z: 14 }; // in-band -> strafe
    const baseIntent = resolveDroneMovementIntent(baseInput({ legacyMovementMode: 'engage', selfPosition: position, targetPosition: target, strafeDirection: 1, neighbours: [] }));
    const withNeighbour = resolveDroneMovementIntent(baseInput({ legacyMovementMode: 'engage', selfPosition: position, targetPosition: target, strafeDirection: 1, neighbours: [snap('b', { x: 0.3, y: 3, z: 0.3 })] }));
    assert.ok(magnitude(withNeighbour.desiredDirection) <= ceiling(magnitude(baseIntent.desiredDirection)) + 1e-9);
  });

  it('advance with a MODERATE-range neighbour (outside hardSeparationRadiusM): final magnitude <= base (no emergency boost yet)', () => {
    const position = { x: 0, y: 3, z: 0 };
    const target = { x: 0, y: 3, z: 30 };
    const baseIntent = resolveDroneMovementIntent(baseInput({ legacyMovementMode: 'engage', selfPosition: position, targetPosition: target, neighbours: [] }));
    // 1.8m away: inside neighbourRadiusM(2.4) but outside hardSeparationRadiusM(1.2) -> urgency < 1, no full emergency boost.
    const withNeighbour = resolveDroneMovementIntent(baseInput({ legacyMovementMode: 'engage', selfPosition: position, targetPosition: target, neighbours: [snap('b', { x: 1.8, y: 3, z: 0.3 })] }));
    assert.ok(magnitude(withNeighbour.desiredDirection) < ceiling(magnitude(baseIntent.desiredDirection)) - 1e-6, 'a moderate-distance neighbour should not reach the full emergency ceiling');
  });

  it('search (returning home) with one CLOSE neighbour: final magnitude <= base * (1+EMERGENCY_SPEED_BOOST_MAX)', () => {
    const home = { x: 5, y: 3, z: 0 };
    const position = { x: -5, y: 3, z: 0 }; // outside patrol radius -> returning home
    const baseIntent = resolveDroneMovementIntent(baseInput({ legacyMovementMode: 'search', homePosition: home, selfPosition: position, patrolRadiusM: 3.5, neighbours: [] }));
    const withNeighbour = resolveDroneMovementIntent(baseInput({ legacyMovementMode: 'search', homePosition: home, selfPosition: position, patrolRadiusM: 3.5, neighbours: [snap('b', { x: -4.7, y: 3, z: 0.2 })] }));
    assert.ok(magnitude(withNeighbour.desiredDirection) <= ceiling(magnitude(baseIntent.desiredDirection)) + 1e-9);
  });

  it('search (ambient wander) with one CLOSE neighbour: final magnitude <= the tiny legacy wander magnitude * (1+EMERGENCY_SPEED_BOOST_MAX)', () => {
    const phase = 0.77;
    const home = { x: 0, y: 3, z: 0 };
    const position = { x: 0.1, y: 3, z: 0.1 }; // inside patrol radius -> wander formula
    const baseIntent = resolveDroneMovementIntent(baseInput({ legacyMovementMode: 'search', homePosition: home, selfPosition: position, patrolRadiusM: 3.5, searchPhase: phase, neighbours: [] }));
    const withNeighbour = resolveDroneMovementIntent(baseInput({ legacyMovementMode: 'search', homePosition: home, selfPosition: position, patrolRadiusM: 3.5, searchPhase: phase, neighbours: [snap('b', { x: 0.3, y: 3, z: 0.3 })] }));
    assert.ok(magnitude(withNeighbour.desiredDirection) <= ceiling(magnitude(baseIntent.desiredDirection)) + 1e-9);
  });

  it('investigate (approaching memory) with one CLOSE neighbour: final magnitude <= base * (1+EMERGENCY_SPEED_BOOST_MAX)', () => {
    const memory = { x: 10, y: 3, z: 0 };
    const position = { x: 0, y: 3, z: 0 };
    const baseIntent = resolveDroneMovementIntent(baseInput({ legacyMovementMode: 'investigate', investigationPosition: memory, selfPosition: position, neighbours: [] }));
    const withNeighbour = resolveDroneMovementIntent(baseInput({ legacyMovementMode: 'investigate', investigationPosition: memory, selfPosition: position, neighbours: [snap('b', { x: 0.3, y: 3, z: 0.3 })] }));
    assert.ok(magnitude(withNeighbour.desiredDirection) <= ceiling(magnitude(baseIntent.desiredDirection)) + 1e-9);
  });

  it('investigate (arrived, base is exactly zero): the ceiling does not apply (zero base -> zero ceiling), and separation still finitely acts at its own natural magnitude', () => {
    const memory = { x: 0, y: 3, z: 0.5 };
    const position = { x: 0, y: 3, z: 0 }; // within arrival radius -> base is exactly zero
    const baseIntent = resolveDroneMovementIntent(baseInput({ legacyMovementMode: 'investigate', investigationPosition: memory, selfPosition: position, neighbours: [] }));
    assertVecClose(baseIntent.desiredDirection, { x: 0, y: 0, z: 0 }); // sanity: base really is zero
    const withNeighbour = resolveDroneMovementIntent(baseInput({ legacyMovementMode: 'investigate', investigationPosition: memory, selfPosition: position, neighbours: [snap('b', { x: 0.3, y: 3, z: 0.3 })] }));
    assert.ok(Number.isFinite(magnitude(withNeighbour.desiredDirection)));
    assert.ok(magnitude(withNeighbour.desiredDirection) > 0, 'separation must still finitely act when the drone has arrived and stopped');
  });

  it('exact overlap: final magnitude <= base * (1+EMERGENCY_SPEED_BOOST_MAX), and finite', () => {
    const position = { x: 5, y: 3, z: 5 };
    const target = { x: 5, y: 3, z: 40 };
    const baseIntent = resolveDroneMovementIntent(baseInput({ legacyMovementMode: 'engage', selfPosition: position, targetPosition: target, neighbours: [] }));
    const withOverlap = resolveDroneMovementIntent(baseInput({ legacyMovementMode: 'engage', selfPosition: position, targetPosition: target, neighbours: [snap('b', { x: 5, y: 3, z: 5 })] }));
    assert.ok(Number.isFinite(magnitude(withOverlap.desiredDirection)));
    assert.ok(magnitude(withOverlap.desiredDirection) <= ceiling(magnitude(baseIntent.desiredDirection)) + 1e-9);
  });

  it('several close neighbours (reinforcing the same side): final magnitude <= base * (1+EMERGENCY_SPEED_BOOST_MAX) (urgency still caps at 1, regardless of neighbour count)', () => {
    const position = { x: 0, y: 3, z: 0 };
    const target = { x: 0, y: 3, z: 30 };
    const baseIntent = resolveDroneMovementIntent(baseInput({ legacyMovementMode: 'engage', selfPosition: position, targetPosition: target, neighbours: [] }));
    const neighbours = [snap('b', { x: 0.3, y: 3, z: 0.1 }), snap('c', { x: 0.4, y: 3, z: 0.2 }), snap('d', { x: 0.2, y: 3, z: 0.3 })];
    const withNeighbours = resolveDroneMovementIntent(baseInput({ legacyMovementMode: 'engage', selfPosition: position, targetPosition: target, neighbours }));
    assert.ok(magnitude(withNeighbours.desiredDirection) <= ceiling(magnitude(baseIntent.desiredDirection)) + 1e-9);
  });

  it('symmetric cancellation: two opposite neighbours produce zero separation strength, magnitude unchanged from base (no emergency boost without a net separation direction)', () => {
    const position = { x: 0, y: 3, z: 0 };
    const target = { x: 0, y: 3, z: 14 };
    const baseIntent = resolveDroneMovementIntent(baseInput({ legacyMovementMode: 'engage', selfPosition: position, targetPosition: target, strafeDirection: 1, neighbours: [] }));
    const neighbours = [snap('b', { x: 1, y: 3, z: 0 }), snap('c', { x: -1, y: 3, z: 0 })];
    const withNeighbours = resolveDroneMovementIntent(baseInput({ legacyMovementMode: 'engage', selfPosition: position, targetPosition: target, strafeDirection: 1, neighbours }));
    assert.ok(Math.abs(magnitude(withNeighbours.desiredDirection) - magnitude(baseIntent.desiredDirection)) < 1e-6);
  });

  it('player above the drone: final magnitude <= base * (1+EMERGENCY_SPEED_BOOST_MAX), vertical component survives', () => {
    const position = { x: 0, y: 3, z: 0 };
    const target = { x: 0, y: 9, z: 30 };
    const baseIntent = resolveDroneMovementIntent(baseInput({ legacyMovementMode: 'engage', selfPosition: position, targetPosition: target, strafeDirection: 1, neighbours: [] }));
    const withNeighbour = resolveDroneMovementIntent(baseInput({ legacyMovementMode: 'engage', selfPosition: position, targetPosition: target, strafeDirection: 1, neighbours: [snap('b', { x: 0.3, y: 3, z: 0.2 })] }));
    assert.ok(magnitude(withNeighbour.desiredDirection) <= ceiling(magnitude(baseIntent.desiredDirection)) + 1e-9);
    assert.ok(withNeighbour.desiredDirection.y > 0, 'vertical approach component toward a higher player must survive the ceiling');
  });

  it('player below the drone: final magnitude <= base * (1+EMERGENCY_SPEED_BOOST_MAX), vertical component survives', () => {
    const position = { x: 0, y: 9, z: 0 };
    const target = { x: 0, y: 0, z: 30 };
    const baseIntent = resolveDroneMovementIntent(baseInput({ legacyMovementMode: 'engage', selfPosition: position, targetPosition: target, strafeDirection: 1, neighbours: [] }));
    const withNeighbour = resolveDroneMovementIntent(baseInput({ legacyMovementMode: 'engage', selfPosition: position, targetPosition: target, strafeDirection: 1, neighbours: [snap('b', { x: 0.3, y: 9, z: 0.2 })] }));
    assert.ok(magnitude(withNeighbour.desiredDirection) <= ceiling(magnitude(baseIntent.desiredDirection)) + 1e-9);
    assert.ok(withNeighbour.desiredDirection.y < 0, 'vertical approach component toward a lower player must survive the ceiling');
  });

  it('deliberate hold remains exactly zero regardless of neighbours (ceiling never applies to hold modes)', () => {
    const intent = resolveDroneMovementIntent(baseInput({ legacyMovementMode: 'stunned-hold', neighbours: [snap('b', { x: 0.05, y: 3, z: 0.05 })] }));
    assertVecClose(intent.desiredDirection, { x: 0, y: 0, z: 0 });
  });

  it('no NaN under cancelling vectors, and no normalization-of-zero (base exactly zero AND separation exactly zero)', () => {
    // Arrived investigate (base zero) with a neighbour just outside separation range (separation zero too).
    const memory = { x: 0, y: 3, z: 0.5 };
    const position = { x: 0, y: 3, z: 0 };
    const farNeighbour = snap('b', { x: 100, y: 3, z: 100 });
    const intent = resolveDroneMovementIntent(baseInput({ legacyMovementMode: 'investigate', investigationPosition: memory, selfPosition: position, neighbours: [farNeighbour] }));
    assert.ok(Number.isFinite(intent.desiredDirection.x) && Number.isFinite(intent.desiredDirection.y) && Number.isFinite(intent.desiredDirection.z));
    assertVecClose(intent.desiredDirection, { x: 0, y: 0, z: 0 });
  });

  it('maximum measured magnitude increase across a randomized sweep never exceeds the EMERGENCY_SPEED_BOOST_MAX-bounded ceiling', () => {
    let maxRatio = 1;
    let samples = 0;
    for (let i = 0; i < 200; i++) {
      const angle = (i / 200) * Math.PI * 2;
      const position = { x: Math.cos(angle) * 3, y: 3, z: Math.sin(angle) * 3 };
      const target = { x: 0, y: 3 + (i % 5) - 2, z: 20 };
      const modes: Array<{ mode: LegacyDroneMovementMode; extra: Partial<DroneMovementInput> }> = [
        { mode: 'engage', extra: { strafeDirection: i % 2 === 0 ? 1 : -1 } },
        { mode: 'search', extra: { homePosition: { x: 0, y: 3, z: 0 }, patrolRadiusM: 3.5, searchPhase: i * 0.13 } },
        { mode: 'investigate', extra: { investigationPosition: { x: 8, y: 3, z: -3 } } },
      ];
      for (const { mode, extra } of modes) {
        const neighbours = [snap('b', { x: position.x + 0.3, y: position.y, z: position.z + (i % 3) * 0.1 })];
        const base = resolveDroneMovementIntent(baseInput({ legacyMovementMode: mode, selfPosition: position, targetPosition: target, neighbours: [], ...extra }));
        const withN = resolveDroneMovementIntent(baseInput({ legacyMovementMode: mode, selfPosition: position, targetPosition: target, neighbours, ...extra }));
        const baseMag = magnitude(base.desiredDirection);
        const withMag = magnitude(withN.desiredDirection);
        samples++;
        if (baseMag > 1e-9) maxRatio = Math.max(maxRatio, withMag / baseMag);
      }
    }
    assert.ok(samples > 0);
    assert.ok(maxRatio <= 1 + EMERGENCY_SPEED_BOOST_MAX + 1e-6, `maximum measured magnitude ratio across ${samples} samples was ${maxRatio}, expected <= ${1 + EMERGENCY_SPEED_BOOST_MAX}`);
  });

  it('no-neighbour case is completely unaffected by the emergency ceiling (ratio exactly 1, byte-identical to legacy)', () => {
    const position = { x: 2, y: 3, z: -1 };
    const target = { x: -1, y: 6, z: 3 };
    const intent = resolveDroneMovementIntent(baseInput({ legacyMovementMode: 'engage', selfPosition: position, targetPosition: target, strafeDirection: 1, neighbours: [] }));
    assert.strictEqual(intent.separationStrength, 0);
  });
});
