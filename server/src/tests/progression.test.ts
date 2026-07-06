import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  XP_PER_KILL,
  cumulativeXpForLevel,
  levelFromXp,
  levelProgress,
} from '../../../shared/progression';

describe('progression curve', () => {
  it('starts at level 1 with zero XP', () => {
    assert.equal(levelFromXp(0), 1);
    assert.equal(cumulativeXpForLevel(1), 0);
  });

  it('crosses level thresholds exactly', () => {
    assert.equal(levelFromXp(499), 1);
    assert.equal(levelFromXp(500), 2);
    assert.equal(levelFromXp(1499), 2);
    assert.equal(levelFromXp(1500), 3);
  });

  it('is monotonically non-decreasing', () => {
    let previous = 1;
    for (let xp = 0; xp <= 50000; xp += 137) {
      const level = levelFromXp(xp);
      assert.ok(level >= previous, `level regressed at ${xp} XP`);
      previous = level;
    }
  });

  it('reports bounded progress fractions', () => {
    for (const xp of [0, 1, 250, 499, 500, 12345]) {
      const progress = levelProgress(xp);
      assert.ok(progress.fraction >= 0 && progress.fraction <= 1);
      assert.ok(progress.intoLevel >= 0);
      assert.ok(progress.required > 0);
    }
  });

  it('one kill never grants more than one level early on', () => {
    const before = levelFromXp(0);
    const after = levelFromXp(XP_PER_KILL);
    assert.ok(after - before <= 1);
  });
});
