import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Vec3 } from '../../../shared/protocol';
import { INTERPOLATION_DELAY_MS } from '../../../shared/protocol';
import { PoseHistory } from '../game/history';
import { RTT_UNSET, rewindTime, updateRttEma } from '../game/lagcomp';

describe('PoseHistory', () => {
  function seed(): PoseHistory {
    const history = new PoseHistory(8);
    history.record(1000, [['a', [0, 0, 0] as Vec3]]);
    history.record(1050, [['a', [10, 0, 0] as Vec3]]);
    history.record(1100, [['a', [20, 0, 0] as Vec3]]);
    return history;
  }

  it('interpolates linearly between bracketing frames', () => {
    const pose = seed().sampleAt('a', 1025);
    assert.ok(pose && Math.abs(pose[0] - 5) < 1e-9, `x=${pose?.[0]}`);
  });

  it('returns an exact frame at its timestamp', () => {
    assert.deepEqual(seed().sampleAt('a', 1050), [10, 0, 0]);
  });

  it('clamps to the buffer span', () => {
    assert.deepEqual(seed().sampleAt('a', 500), [0, 0, 0]);
    assert.deepEqual(seed().sampleAt('a', 9000), [20, 0, 0]);
  });

  it('returns null for an unknown player', () => {
    assert.equal(seed().sampleAt('ghost', 1025), null);
  });

  it('evicts frames beyond capacity', () => {
    const history = new PoseHistory(2);
    history.record(1, [['a', [1, 0, 0] as Vec3]]);
    history.record(2, [['a', [2, 0, 0] as Vec3]]);
    history.record(3, [['a', [3, 0, 0] as Vec3]]);
    // Oldest (t=1) evicted; clamping below the new oldest (t=2) yields x=2.
    assert.deepEqual(history.sampleAt('a', 0), [2, 0, 0]);
  });
});

describe('updateRttEma', () => {
  it('seeds on the first valid sample', () => {
    assert.equal(updateRttEma(RTT_UNSET, 80), 80);
  });

  it('smooths subsequent samples toward the new value', () => {
    const next = updateRttEma(80, 180);
    assert.ok(next > 80 && next < 180);
  });

  it('rejects implausible samples', () => {
    assert.equal(updateRttEma(80, -5), 80);
    assert.equal(updateRttEma(80, 5000), 80);
    assert.equal(updateRttEma(80, Number.NaN), 80);
  });
});

describe('rewindTime', () => {
  it('rewinds by half RTT plus the interpolation delay', () => {
    assert.equal(rewindTime(1000, 100, 250), 1000 - (50 + INTERPOLATION_DELAY_MS));
  });

  it('treats an unset RTT as zero', () => {
    assert.equal(rewindTime(1000, RTT_UNSET, 250), 1000 - INTERPOLATION_DELAY_MS);
  });

  it('clamps to the max rewind', () => {
    assert.equal(rewindTime(1000, 1000, 250), 750);
  });
});
