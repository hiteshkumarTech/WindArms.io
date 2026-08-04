import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveDroneAiDifficultyProfile } from './droneAiDifficulty';
import { resolveDroneConfig, TRIAL_DIFFICULTIES, type TrialDifficulty } from '../play/difficulty';
import { DRONE } from '../play/enemyConfig';
import { DRONE_PERCEPTION_MEMORY } from './droneAiPerception';

const DIFFICULTIES: TrialDifficulty[] = ['low', 'medium', 'max'];

describe('droneAiDifficulty — extends, never duplicates, ResolvedDroneConfig', () => {
  for (const difficulty of DIFFICULTIES) {
    it(`${difficulty}: every ResolvedDroneConfig field matches resolveDroneConfig() exactly`, () => {
      const profile = resolveDroneAiDifficultyProfile(difficulty);
      const base = resolveDroneConfig(difficulty);
      for (const key of Object.keys(base) as Array<keyof typeof base>) {
        assert.strictEqual(profile[key], base[key], `${difficulty}.${key} must match resolveDroneConfig() byte-for-byte`);
      }
    });
  }

  it('is a pure function — identical difficulty always produces a deep-equal profile', () => {
    for (const difficulty of DIFFICULTIES) {
      assert.deepStrictEqual(resolveDroneAiDifficultyProfile(difficulty), resolveDroneAiDifficultyProfile(difficulty));
    }
  });

  it('exposes exactly the expected key set — no stray fields (e.g. no burstSize/shotsPerAttack)', () => {
    const expected = new Set([
      'maxHp',
      'boltDamage',
      'fireIntervalMs',
      'aimSpreadDeg',
      'boltSpeed',
      'approachSpeed',
      'retreatSpeed',
      'strafeSpeed',
      'acquireReactionDelayMs',
      'targetMemoryDurationMs',
      'attackWindupMs',
    ]);
    for (const difficulty of DIFFICULTIES) {
      const keys = new Set(Object.keys(resolveDroneAiDifficultyProfile(difficulty)));
      assert.deepStrictEqual(keys, expected, `${difficulty} profile must expose exactly the documented field set`);
    }
  });
});

describe('droneAiDifficulty — attackWindupMs is absolute (Rule 2): always exactly DRONE.WINDUP_MS, every difficulty', () => {
  for (const difficulty of DIFFICULTIES) {
    it(`${difficulty}.attackWindupMs === DRONE.WINDUP_MS (650)`, () => {
      assert.strictEqual(resolveDroneAiDifficultyProfile(difficulty).attackWindupMs, DRONE.WINDUP_MS);
      assert.strictEqual(resolveDroneAiDifficultyProfile(difficulty).attackWindupMs, 650);
    });
  }
});

describe('droneAiDifficulty — acquireReactionDelayMs', () => {
  it('medium is exactly 0ms — byte-identical cadence to pre-9E, no added delay', () => {
    assert.strictEqual(resolveDroneAiDifficultyProfile('medium').acquireReactionDelayMs, 0);
  });

  it('low is strictly slower (greater) than medium', () => {
    const low = resolveDroneAiDifficultyProfile('low').acquireReactionDelayMs;
    const medium = resolveDroneAiDifficultyProfile('medium').acquireReactionDelayMs;
    assert.ok(low > medium, `low (${low}) must react slower than medium (${medium})`);
  });

  it('max is no slower than medium', () => {
    const max = resolveDroneAiDifficultyProfile('max').acquireReactionDelayMs;
    const medium = resolveDroneAiDifficultyProfile('medium').acquireReactionDelayMs;
    assert.ok(max <= medium, `max (${max}) must not be slower than medium (${medium})`);
  });

  it('no reaction delay is ever negative', () => {
    for (const difficulty of DIFFICULTIES) {
      assert.ok(resolveDroneAiDifficultyProfile(difficulty).acquireReactionDelayMs >= 0);
    }
  });
});

describe('droneAiDifficulty — targetMemoryDurationMs', () => {
  it('medium is exactly 4500ms and reuses DRONE_PERCEPTION_MEMORY.investigateDurationMs verbatim (never a second literal)', () => {
    const medium = resolveDroneAiDifficultyProfile('medium').targetMemoryDurationMs;
    assert.strictEqual(medium, 4500);
    assert.strictEqual(medium, DRONE_PERCEPTION_MEMORY.investigateDurationMs);
  });

  it('low falls within [3000, 4000] and is strictly shorter than medium', () => {
    const low = resolveDroneAiDifficultyProfile('low').targetMemoryDurationMs;
    const medium = resolveDroneAiDifficultyProfile('medium').targetMemoryDurationMs;
    assert.ok(low >= 3000 && low <= 4000, `low (${low}) must fall within [3000, 4000]`);
    assert.ok(low < medium, `low (${low}) must forget sooner than medium (${medium})`);
  });

  it('max falls within [5000, 5500] and is strictly longer than medium', () => {
    const max = resolveDroneAiDifficultyProfile('max').targetMemoryDurationMs;
    const medium = resolveDroneAiDifficultyProfile('medium').targetMemoryDurationMs;
    assert.ok(max >= 5000 && max <= 5500, `max (${max}) must fall within [5000, 5500]`);
    assert.ok(max > medium, `max (${max}) must hold on longer than medium (${medium})`);
  });
});

describe('droneAiDifficulty — droneCount/matchTimeS remain owned entirely by TRIAL_DIFFICULTIES (not restated here)', () => {
  it('the profile never introduces a droneCount or matchTimeS field of its own', () => {
    for (const difficulty of DIFFICULTIES) {
      const profile = resolveDroneAiDifficultyProfile(difficulty) as unknown as Record<string, unknown>;
      assert.ok(!('droneCount' in profile), 'droneCount stays owned by TRIAL_DIFFICULTIES only');
      assert.ok(!('matchTimeS' in profile), 'matchTimeS stays owned by TRIAL_DIFFICULTIES only');
    }
  });

  it('TRIAL_DIFFICULTIES itself is unmodified in shape by this phase (sanity check on the reused source)', () => {
    for (const difficulty of DIFFICULTIES) {
      assert.strictEqual(TRIAL_DIFFICULTIES[difficulty].id, difficulty);
    }
  });
});
