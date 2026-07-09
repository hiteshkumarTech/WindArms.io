import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  RUN_ENTER_SPEED,
  RUN_EXIT_SPEED,
  createHeroPose,
  poseFor,
  resolveLocomotion,
  strideCadence,
  type Locomotion,
} from './heroAnimator';

describe('resolveLocomotion', () => {
  it('reports dead whenever the player is not alive, ignoring state', () => {
    const states = ['idle', 'run', 'sprint', 'slide', 'dash', 'air'] as const;
    for (const state of states) {
      assert.equal(resolveLocomotion('run', { state, speed: 9, alive: false }), 'dead');
    }
  });

  it('passes discrete air/slide/dash states straight through', () => {
    assert.equal(resolveLocomotion('idle', { state: 'air', speed: 0, alive: true }), 'air');
    assert.equal(resolveLocomotion('idle', { state: 'slide', speed: 0, alive: true }), 'slide');
    assert.equal(resolveLocomotion('run', { state: 'dash', speed: 0, alive: true }), 'dash');
  });

  it('applies hysteresis on the grounded idle⇄run boundary', () => {
    // From idle you must exceed the (higher) enter threshold.
    assert.equal(resolveLocomotion('idle', { state: 'run', speed: RUN_ENTER_SPEED - 0.1, alive: true }), 'idle');
    assert.equal(resolveLocomotion('idle', { state: 'run', speed: RUN_ENTER_SPEED + 0.1, alive: true }), 'run');
    // From run you keep running until you drop below the (lower) exit threshold.
    assert.equal(resolveLocomotion('run', { state: 'idle', speed: RUN_EXIT_SPEED + 0.1, alive: true }), 'run');
    assert.equal(resolveLocomotion('run', { state: 'idle', speed: RUN_EXIT_SPEED - 0.1, alive: true }), 'idle');
  });

  it('treats sprint as run once moving', () => {
    assert.equal(resolveLocomotion('idle', { state: 'sprint', speed: 6, alive: true }), 'run');
  });
});

describe('strideCadence', () => {
  it('quickens the run cadence with speed', () => {
    assert.ok(strideCadence('run', 8) > strideCadence('run', 2));
    assert.ok(strideCadence('run', 0) > 0);
  });

  it('keeps a slow constant idle breathing cadence', () => {
    assert.equal(strideCadence('idle', 0), strideCadence('idle', 10));
    assert.ok(strideCadence('idle', 0) > 0);
  });

  it('is static for non-cyclic locomotions', () => {
    for (const loco of ['air', 'slide', 'dash', 'dead'] as Locomotion[]) {
      assert.equal(strideCadence(loco, 9), 0);
    }
  });
});

describe('poseFor', () => {
  const HALF_PI = Math.PI / 2; // sin = 1 → maximum stride extension

  it('swings the legs in strict opposition while running', () => {
    const pose = poseFor('run', HALF_PI, 6, 0);
    assert.ok(pose.legLPitch > 0.7, `legL ${pose.legLPitch}`);
    assert.ok(pose.legRPitch < -0.7, `legR ${pose.legRPitch}`);
    assert.ok(Math.abs(pose.legLPitch + pose.legRPitch) < 1e-9, 'legs must be equal and opposite');
    assert.ok(pose.torsoPitch > 0, 'runner leans forward');
  });

  it('scales stride amplitude with speed (no motion at zero speed)', () => {
    const fast = poseFor('run', HALF_PI, 6, 0);
    const crawl = poseFor('run', HALF_PI, 0, 0);
    assert.ok(Math.abs(fast.legLPitch) > Math.abs(crawl.legLPitch));
    assert.ok(Math.abs(crawl.legLPitch) < 1e-9);
  });

  it('stands still when idle', () => {
    const pose = poseFor('idle', HALF_PI, 0, 0);
    assert.ok(Math.abs(pose.legLPitch) < 1e-9);
    assert.ok(Math.abs(pose.legRPitch) < 1e-9);
    assert.ok(Math.abs(pose.rootY) < 0.05, 'only a small breathing bob');
  });

  it('tucks low and forward in a slide', () => {
    const pose = poseFor('slide', 0, 5, 0);
    assert.ok(pose.rootY < -0.3, 'body drops');
    assert.ok(pose.torsoPitch > 0.4, 'torso tucks forward');
  });

  it('parts the legs asymmetrically in the air', () => {
    const pose = poseFor('air', 0, 0, 0);
    assert.notEqual(pose.legLPitch, pose.legRPitch);
    assert.ok(Math.abs(pose.torsoPitch) < 0.1);
  });

  it('collapses when dead', () => {
    const pose = poseFor('dead', 0, 0, 0);
    assert.ok(pose.torsoPitch > 1, 'crumpled forward');
    assert.ok(pose.rootY < 0, 'sunk to the ground');
  });

  it('aims the weapon, head and barrel with look pitch', () => {
    const pose = poseFor('idle', 0, 0, 0.6);
    assert.equal(pose.weaponPitch, 0.6);
    assert.equal(pose.headPitch, 0.3); // 0.6 * 0.5
  });

  it('clamps extreme look pitch', () => {
    const pose = poseFor('idle', 0, 0, 2.0);
    assert.equal(pose.weaponPitch, 1.2);
  });

  it('is deterministic for identical inputs', () => {
    assert.deepEqual(poseFor('run', 1.0, 5, 0.2), poseFor('run', 1.0, 5, 0.2));
  });

  it('reuses the provided out object without allocating', () => {
    const out = createHeroPose();
    const result = poseFor('run', 1.0, 5, 0.2, out);
    assert.equal(result, out, 'returns the same object it was given');
  });
});
