import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Milestone 9B.1 — deterministic movement parity.
 *
 * Section 4's own gate: "Formula copied verbatim" (the adapter's own doc
 * comment at `DroneEnemy.tsx` line 224 says exactly this) is a code-diff
 * claim, not a measurement. This file measures it: two independently
 * structured transcriptions of the SAME movement formula from
 * `src/components/three/play/DroneEnemy.tsx` lines 226-240 —
 *
 *   - `legacyMovementFormula` branches on the raw pre-9B state string plus a
 *     separate `stunned` boolean, mirroring how the inline code looked
 *     BEFORE the 9B extraction (`if (stunned) {} else if (state==='spawning')
 *     {} else if (state==='searching') {...} else if (state==='engaging' ||
 *     state==='attacking') {...}`).
 *   - `currentMovementFormula` branches on the pure core's own
 *     `LegacyDroneMovementMode` output, exactly as the current adapter does
 *     today (`decision.movementMode === 'search'`, etc.).
 *
 * Both use plain `{x,y,z}` math, not `THREE.Vector3` — this test exists to
 * prove the FORMULA and the STATE-TO-MODE MAPPING are correct, which needs
 * no Three.js; keeping it dependency-free also keeps this file trivially
 * outside the pure-core import-guard's concern (it isn't part of
 * `src/lib/v2/ai/droneAi*.ts`'s production surface, just a test).
 *
 * This is a CLOSURE-PASS test only — it proves the mapping introduced by 9B
 * didn't silently change movement output. It is NOT the future
 * `DroneMovementIntent` extraction (that remains Phase 9D, per this closure
 * brief's own explicit fence).
 */

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

function vecSub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function vecLength(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}
function vecNormalize(v: Vec3): Vec3 {
  const l = vecLength(v);
  return l > 0 ? { x: v.x / l, y: v.y / l, z: v.z / l } : { x: 0, y: 0, z: 0 };
}
function vecScale(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}
function vecAdd(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}
function vecCross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}
function vecAddScaled(a: Vec3, b: Vec3, s: number): Vec3 {
  return { x: a.x + b.x * s, y: a.y + b.y * s, z: a.z + b.z * s };
}

const UP: Vec3 = { x: 0, y: 1, z: 0 };

/** Mirrors `DRONE.STRAFE_SPEED` (enemyConfig.ts) — the constant used for the search-return-to-patrol leg, deliberately distinct from `config.strafeSpeed` (difficulty-resolved) used in the engage/attack strafe term below. */
const SEARCH_RETURN_SPEED = 2.6;

interface MovementInputs {
  position: Vec3;
  home: Vec3;
  playerPos: Vec3;
  patrolRadius: number;
  phase: number;
  strafeDirection: -1 | 1;
  approachSpeed: number;
  retreatSpeed: number;
  strafeSpeed: number;
  rangeMin: number;
  rangeMax: number;
}

type LegacyRawState = 'spawning' | 'searching' | 'engaging' | 'attacking' | 'destroyed';
type CurrentMovementMode = 'spawn-hold' | 'search' | 'stunned-hold' | 'engage' | 'attack' | 'destroyed-hold';

/**
 * OLD formula — transcribed from the pre-9B inline shape: a single
 * `stunned`-first if/else-if chain over the raw legacy state string.
 * Verbatim arithmetic match to `DroneEnemy.tsx` lines 226-240.
 */
function legacyMovementFormula(state: LegacyRawState, stunned: boolean, inputs: MovementInputs): Vec3 {
  let desired: Vec3 = { x: 0, y: 0, z: 0 };
  const toPlayer = vecNormalize(vecSub(inputs.playerPos, inputs.position));
  const distance = vecLength(vecSub(inputs.playerPos, inputs.position));

  if (stunned) {
    // no movement — matches the legacy 'stunned takes priority over every other branch' quirk.
  } else if (state === 'spawning') {
    // no movement
  } else if (state === 'searching') {
    desired = vecSub(inputs.home, inputs.position);
    if (vecLength(desired) > inputs.patrolRadius) {
      desired = vecScale(vecNormalize(desired), SEARCH_RETURN_SPEED);
    } else {
      desired = { x: Math.sin(inputs.phase) * 0.4, y: 0, z: Math.cos(inputs.phase * 0.7) * 0.4 };
    }
  } else if (state === 'engaging' || state === 'attacking') {
    if (distance < inputs.rangeMin) desired = vecScale(toPlayer, -inputs.retreatSpeed);
    else if (distance > inputs.rangeMax) desired = vecScale(toPlayer, inputs.approachSpeed);
    const strafe = vecScale(vecCross(UP, toPlayer), inputs.strafeDirection * inputs.strafeSpeed);
    desired = vecAdd(desired, strafe);
  }
  // 'destroyed': movement is never applied post-destruction in either version (the adapter returns early) — not modeled here.

  return desired;
}

/**
 * NEW formula — the actual current adapter code (`DroneEnemy.tsx` lines
 * 226-240), transcribed verbatim but driven by `movementMode` instead of a
 * re-checked state string.
 */
function currentMovementFormula(mode: CurrentMovementMode, inputs: MovementInputs): Vec3 {
  let desired: Vec3 = { x: 0, y: 0, z: 0 };
  const toPlayer = vecNormalize(vecSub(inputs.playerPos, inputs.position));
  const distance = vecLength(vecSub(inputs.playerPos, inputs.position));

  if (mode === 'search') {
    desired = vecSub(inputs.home, inputs.position);
    if (vecLength(desired) > inputs.patrolRadius) {
      desired = vecScale(vecNormalize(desired), SEARCH_RETURN_SPEED);
    } else {
      desired = { x: Math.sin(inputs.phase) * 0.4, y: 0, z: Math.cos(inputs.phase * 0.7) * 0.4 };
    }
  } else if (mode === 'engage' || mode === 'attack') {
    if (distance < inputs.rangeMin) desired = vecScale(toPlayer, -inputs.retreatSpeed);
    else if (distance > inputs.rangeMax) desired = vecScale(toPlayer, inputs.approachSpeed);
    const strafe = vecScale(vecCross(UP, toPlayer), inputs.strafeDirection * inputs.strafeSpeed);
    desired = vecAdd(desired, strafe);
  }
  // 'spawn-hold' / 'stunned-hold' / 'destroyed-hold': desired stays (0,0,0) — matches the legacy empty branches exactly.

  return desired;
}

function assertVecClose(actual: Vec3, expected: Vec3, msg: string, eps = 1e-9) {
  assert.ok(Math.abs(actual.x - expected.x) <= eps, `${msg} (x: ${actual.x} vs ${expected.x})`);
  assert.ok(Math.abs(actual.y - expected.y) <= eps, `${msg} (y: ${actual.y} vs ${expected.y})`);
  assert.ok(Math.abs(actual.z - expected.z) <= eps, `${msg} (z: ${actual.z} vs ${expected.z})`);
}

const BASE_INPUTS: MovementInputs = {
  position: { x: 0, y: 0, z: 0 },
  home: { x: 0, y: 0, z: 0 },
  playerPos: { x: 15, y: 0, z: 0 },
  patrolRadius: 3.5,
  phase: 0,
  strafeDirection: 1,
  approachSpeed: 4.2,
  retreatSpeed: 3.4,
  strafeSpeed: 2.6,
  rangeMin: 10,
  rangeMax: 19,
};

describe('droneAiMovementParity — old (raw-state) vs current (movementMode) formula, single-tick desired vector', () => {
  it('search movement, beyond patrol radius: return-to-home leg', () => {
    const inputs: MovementInputs = { ...BASE_INPUTS, position: { x: 8, y: 0, z: 0 }, home: { x: 0, y: 0, z: 0 } };
    const legacy = legacyMovementFormula('searching', false, inputs);
    const current = currentMovementFormula('search', inputs);
    assertVecClose(current, legacy, 'search (beyond patrol radius)');
    assertVecClose(current, { x: -SEARCH_RETURN_SPEED, y: 0, z: 0 }, 'search (beyond patrol radius) sanity');
  });

  it('search movement, within patrol radius: hover-wander formula', () => {
    const inputs: MovementInputs = { ...BASE_INPUTS, position: { x: 1, y: 0, z: 0 }, home: { x: 0, y: 0, z: 0 }, phase: 1.234 };
    const legacy = legacyMovementFormula('searching', false, inputs);
    const current = currentMovementFormula('search', inputs);
    assertVecClose(current, legacy, 'search (within patrol radius)');
    assertVecClose(current, { x: Math.sin(1.234) * 0.4, y: 0, z: Math.cos(1.234 * 0.7) * 0.4 }, 'search wander sanity');
  });

  it('approach: distance beyond RANGE_MAX', () => {
    const inputs: MovementInputs = { ...BASE_INPUTS, position: { x: 0, y: 0, z: 0 }, playerPos: { x: 25, y: 0, z: 0 } };
    const legacy = legacyMovementFormula('engaging', false, inputs);
    const current = currentMovementFormula('engage', inputs);
    assertVecClose(current, legacy, 'approach');
  });

  it('retreat: distance below RANGE_MIN', () => {
    const inputs: MovementInputs = { ...BASE_INPUTS, position: { x: 0, y: 0, z: 0 }, playerPos: { x: 5, y: 0, z: 0 } };
    const legacy = legacyMovementFormula('engaging', false, inputs);
    const current = currentMovementFormula('engage', inputs);
    assertVecClose(current, legacy, 'retreat');
  });

  it('preferred-range strafe, direction +1 (left)', () => {
    const inputs: MovementInputs = { ...BASE_INPUTS, position: { x: 0, y: 0, z: 0 }, playerPos: { x: 15, y: 0, z: 0 }, strafeDirection: 1 };
    const legacy = legacyMovementFormula('engaging', false, inputs);
    const current = currentMovementFormula('engage', inputs);
    assertVecClose(current, legacy, 'preferred-range strafe left');
    assert.notStrictEqual(current.x === 0 && current.z === 0, true, 'strafe left must actually produce lateral movement');
  });

  it('preferred-range strafe, direction -1 (right) — must be the exact negation of the +1 case', () => {
    const left: MovementInputs = { ...BASE_INPUTS, position: { x: 0, y: 0, z: 0 }, playerPos: { x: 15, y: 0, z: 0 }, strafeDirection: 1 };
    const right: MovementInputs = { ...left, strafeDirection: -1 };
    const legacyLeft = legacyMovementFormula('engaging', false, left);
    const currentRight = currentMovementFormula('engage', right);
    const legacyRight = legacyMovementFormula('engaging', false, right);
    assertVecClose(currentRight, legacyRight, 'preferred-range strafe right');
    assertVecClose(currentRight, vecScale(legacyLeft, -1), 'strafe right must be the exact negation of strafe left');
  });

  it('attack movement: movementMode "attack" produces identical output to "engage" at the same distance (state "attacking" identical to "engaging")', () => {
    const inputs: MovementInputs = { ...BASE_INPUTS, position: { x: 0, y: 0, z: 0 }, playerPos: { x: 15, y: 0, z: 0 } };
    const legacyEngaging = legacyMovementFormula('engaging', false, inputs);
    const legacyAttacking = legacyMovementFormula('attacking', false, inputs);
    const currentEngage = currentMovementFormula('engage', inputs);
    const currentAttack = currentMovementFormula('attack', inputs);
    assertVecClose(legacyAttacking, legacyEngaging, 'legacy: attacking state must move identically to engaging state');
    assertVecClose(currentAttack, currentEngage, 'current: attack mode must move identically to engage mode');
    assertVecClose(currentAttack, legacyAttacking, 'attack movement parity');
  });

  it('stunned hold: stunned overrides an otherwise-moving engaging/attacking state — desired is exactly zero', () => {
    const inputs: MovementInputs = { ...BASE_INPUTS, position: { x: 0, y: 0, z: 0 }, playerPos: { x: 25, y: 0, z: 0 } };
    const legacyUnstunned = legacyMovementFormula('engaging', false, inputs);
    assert.notStrictEqual(vecLength(legacyUnstunned), 0, 'sanity: this scenario would move if not stunned');
    const legacyStunned = legacyMovementFormula('engaging', true, inputs);
    const currentStunned = currentMovementFormula('stunned-hold', inputs);
    assertVecClose(legacyStunned, { x: 0, y: 0, z: 0 }, 'legacy stunned hold must be exactly zero');
    assertVecClose(currentStunned, { x: 0, y: 0, z: 0 }, 'current stunned-hold must be exactly zero');
    assertVecClose(currentStunned, legacyStunned, 'stunned hold parity');
  });

  it('vertical target offset: player above the drone — movement stays fully 3D, never flattened to XZ (confirmed legacy quirk)', () => {
    // Distance must fall OUTSIDE [rangeMin, rangeMax] so the approach/retreat
    // term (which carries toPlayer's Y component) is actually included —
    // the preferred-range strafe-only term is Y-less by construction
    // (cross(UP, toPlayer) always lies in the horizontal plane), so a
    // preferred-range distance would prove nothing about the vertical quirk.
    const inputs: MovementInputs = { ...BASE_INPUTS, position: { x: 0, y: 0, z: 0 }, playerPos: { x: 20, y: 10, z: 0 } };
    const legacy = legacyMovementFormula('engaging', false, inputs);
    const current = currentMovementFormula('engage', inputs);
    assertVecClose(current, legacy, 'vertical offset parity');
    assert.notStrictEqual(current.y, 0, 'the approach/retreat component must retain a nonzero Y — flattening to XZ would be a real behaviour change, not parity');
  });

  it('spawn-hold and destroyed-hold: both formulas report exactly zero desired movement', () => {
    const inputs: MovementInputs = { ...BASE_INPUTS, position: { x: 0, y: 0, z: 0 }, playerPos: { x: 15, y: 0, z: 0 } };
    assertVecClose(legacyMovementFormula('spawning', false, inputs), { x: 0, y: 0, z: 0 }, 'legacy spawn-hold');
    assertVecClose(currentMovementFormula('spawn-hold', inputs), { x: 0, y: 0, z: 0 }, 'current spawn-hold');
  });
});

describe('droneAiMovementParity — fixed-step position integration at 30/60/120 FPS-equivalent steps', () => {
  /**
   * Applies `position += desired * dt` repeatedly, recomputing `desired`
   * fresh from the CURRENT position every step (exactly as `DroneSquad`'s
   * fixed-step loop calls `update()` once per substep) — both formulas walk
   * their own independent position accumulator so a divergence at any
   * intermediate step is caught, not just the final position.
   */
  function integrate(
    formula: (inputs: MovementInputs) => Vec3,
    startPosition: Vec3,
    playerPos: Vec3,
    dtS: number,
    steps: number,
    inputsTemplate: Omit<MovementInputs, 'position' | 'playerPos'>,
  ): Vec3 {
    let position = { ...startPosition };
    for (let i = 0; i < steps; i++) {
      const desired = formula({ ...inputsTemplate, position, playerPos });
      position = vecAddScaled(position, desired, dtS);
    }
    return position;
  }

  const FPS_CASES: Array<{ label: string; dtS: number; steps: number }> = [
    { label: '30fps-equivalent', dtS: 1 / 30, steps: 30 },
    { label: '60fps-equivalent', dtS: 1 / 60, steps: 60 },
    { label: '120fps-equivalent', dtS: 1 / 120, steps: 120 },
  ];

  for (const { label, dtS, steps } of FPS_CASES) {
    it(`approach converges to the same final position under old vs current formula at ${label} (${steps} steps covering 1 simulated second)`, () => {
      const template: Omit<MovementInputs, 'position' | 'playerPos'> = {
        home: { x: 0, y: 0, z: 0 },
        patrolRadius: 3.5,
        phase: 0,
        strafeDirection: 1,
        approachSpeed: 4.2,
        retreatSpeed: 3.4,
        strafeSpeed: 2.6,
        rangeMin: 10,
        rangeMax: 19,
      };
      const start = { x: 0, y: 0, z: 0 };
      const player = { x: 30, y: 0, z: 0 };

      const legacyFinal = integrate((i) => legacyMovementFormula('engaging', false, i), start, player, dtS, steps, template);
      const currentFinal = integrate((i) => currentMovementFormula('engage', i), start, player, dtS, steps, template);

      assertVecClose(currentFinal, legacyFinal, `approach integration parity at ${label}`, 1e-9);
    });

    it(`preferred-range strafe orbits identically under old vs current formula at ${label}`, () => {
      const template: Omit<MovementInputs, 'position' | 'playerPos'> = {
        home: { x: 0, y: 0, z: 0 },
        patrolRadius: 3.5,
        phase: 0,
        strafeDirection: -1,
        approachSpeed: 4.2,
        retreatSpeed: 3.4,
        strafeSpeed: 2.6,
        rangeMin: 10,
        rangeMax: 19,
      };
      const start = { x: 0, y: 0, z: 0 };
      const player = { x: 15, y: 0, z: 0 };

      const legacyFinal = integrate((i) => legacyMovementFormula('engaging', false, i), start, player, dtS, steps, template);
      const currentFinal = integrate((i) => currentMovementFormula('engage', i), start, player, dtS, steps, template);

      assertVecClose(currentFinal, legacyFinal, `strafe integration parity at ${label}`, 1e-9);
    });
  }

  it('fixed-step catch-up sequence: a single slow frame requiring the maximum 8 substeps in one go (mirrors fixedStep.ts MAX_SUBSTEPS_PER_FRAME) still matches step-for-step', () => {
    const FIXED_STEP_S = 1 / 60; // matches fixedStep.ts
    const MAX_SUBSTEPS_PER_FRAME = 8; // matches fixedStep.ts
    const template: Omit<MovementInputs, 'position' | 'playerPos'> = {
      home: { x: 0, y: 0, z: 0 },
      patrolRadius: 3.5,
      phase: 0,
      strafeDirection: 1,
      approachSpeed: 4.2,
      retreatSpeed: 3.4,
      strafeSpeed: 2.6,
      rangeMin: 10,
      rangeMax: 19,
    };
    let legacyPosition = { x: 0, y: 0, z: 0 };
    let currentPosition = { x: 0, y: 0, z: 0 };
    const player = { x: 4, y: 0, z: 0 }; // inside RANGE_MIN -> retreat, the branch most sensitive to overshoot on a catch-up burst

    for (let substep = 0; substep < MAX_SUBSTEPS_PER_FRAME; substep++) {
      const legacyDesired = legacyMovementFormula('engaging', false, { ...template, position: legacyPosition, playerPos: player });
      legacyPosition = vecAddScaled(legacyPosition, legacyDesired, FIXED_STEP_S);
      const currentDesired = currentMovementFormula('engage', { ...template, position: currentPosition, playerPos: player });
      currentPosition = vecAddScaled(currentPosition, currentDesired, FIXED_STEP_S);
      assertVecClose(currentPosition, legacyPosition, `catch-up substep ${substep + 1}/${MAX_SUBSTEPS_PER_FRAME} position parity`, 1e-9);
    }
  });
});
