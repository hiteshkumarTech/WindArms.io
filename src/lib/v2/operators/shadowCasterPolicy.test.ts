import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RANGE_SHADOW_CASTER_POLICY,
  EFFECTIVE_RANGE_SHADOW_CASTER_POLICY,
  isValidRangeShadowCasterPolicy,
  resolveRangeShadowCasterPolicy,
  resolveRangeShadowCasterDecision,
} from './shadowCasterPolicy';

describe('shadowCasterPolicy — canonical value and typing', () => {
  it('the canonical production policy is full-body (the Step 8E-E rollout candidate)', () => {
    assert.strictEqual(RANGE_SHADOW_CASTER_POLICY, 'full-body');
  });

  it('the effective (validated) policy equals the canonical constant', () => {
    assert.strictEqual(EFFECTIVE_RANGE_SHADOW_CASTER_POLICY, RANGE_SHADOW_CASTER_POLICY);
  });

  it('isValidRangeShadowCasterPolicy accepts exactly the two typed values', () => {
    assert.strictEqual(isValidRangeShadowCasterPolicy('fp-arms'), true);
    assert.strictEqual(isValidRangeShadowCasterPolicy('full-body'), true);
    assert.strictEqual(isValidRangeShadowCasterPolicy('FULL-BODY'), false);
    assert.strictEqual(isValidRangeShadowCasterPolicy('production'), false);
    assert.strictEqual(isValidRangeShadowCasterPolicy(''), false);
    assert.strictEqual(isValidRangeShadowCasterPolicy(null), false);
    assert.strictEqual(isValidRangeShadowCasterPolicy(undefined), false);
    assert.strictEqual(isValidRangeShadowCasterPolicy(1), false);
  });
});

describe('shadowCasterPolicy — resolveRangeShadowCasterPolicy (fail-safe fallback)', () => {
  it('passes through both valid values unchanged', () => {
    assert.strictEqual(resolveRangeShadowCasterPolicy('fp-arms'), 'fp-arms');
    assert.strictEqual(resolveRangeShadowCasterPolicy('full-body'), 'full-body');
  });

  it('falls back to fp-arms (never full-body) for any invalid value — the one-line-rollback safety net', () => {
    for (const bad of ['garbage', '', null, undefined, 42, {}, []]) {
      assert.strictEqual(resolveRangeShadowCasterPolicy(bad), 'fp-arms', `expected fp-arms fallback for ${JSON.stringify(bad)}`);
    }
  });
});

describe('shadowCasterPolicy — resolveRangeShadowCasterDecision (exclusive ownership)', () => {
  it('fp-arms policy, no debug flags: FP arms cast, full-body inactive, controller inactive', () => {
    const d = resolveRangeShadowCasterDecision({ shadowDebugEnabled: false, shadowReviewEnabled: false, policy: 'fp-arms' });
    assert.deepStrictEqual(d, { fpArmsCastShadow: true, fullBodyCasterActive: false, playerCenteredControllerActive: false });
  });

  it('full-body policy, no debug flags (the production case): FP arms do NOT cast, full-body active, controller active — no query flags required', () => {
    const d = resolveRangeShadowCasterDecision({ shadowDebugEnabled: false, shadowReviewEnabled: false, policy: 'full-body' });
    assert.deepStrictEqual(d, { fpArmsCastShadow: false, fullBodyCasterActive: true, playerCenteredControllerActive: true });
  });

  it('fp-arms policy but shadowDebugEnabled (dev testing the prototype without switching production policy): FP arms stop casting, full-body takes over — matches the pre-8E-E Step 8E-C rule exactly', () => {
    const d = resolveRangeShadowCasterDecision({ shadowDebugEnabled: true, shadowReviewEnabled: false, policy: 'fp-arms' });
    assert.strictEqual(d.fpArmsCastShadow, false);
    assert.strictEqual(d.fullBodyCasterActive, true);
    assert.strictEqual(d.playerCenteredControllerActive, false);
  });

  it('full-body policy with the review harness open (?shadow=1&shadowReview=1): still exactly one active caster, controller active', () => {
    const d = resolveRangeShadowCasterDecision({ shadowDebugEnabled: true, shadowReviewEnabled: true, policy: 'full-body' });
    assert.strictEqual(d.fpArmsCastShadow, false);
    assert.strictEqual(d.fullBodyCasterActive, true);
    assert.strictEqual(d.playerCenteredControllerActive, true);
  });

  it('exhaustive: fpArmsCastShadow and fullBodyCasterActive are NEVER both true, for every input combination', () => {
    for (const shadowDebugEnabled of [false, true]) {
      for (const shadowReviewEnabled of [false, true]) {
        for (const policy of ['fp-arms', 'full-body'] as const) {
          const d = resolveRangeShadowCasterDecision({ shadowDebugEnabled, shadowReviewEnabled, policy });
          assert.ok(
            !(d.fpArmsCastShadow && d.fullBodyCasterActive),
            `both true for shadowDebugEnabled=${shadowDebugEnabled} shadowReviewEnabled=${shadowReviewEnabled} policy=${policy}`,
          );
        }
      }
    }
  });

  it('exhaustive: exactly one of fpArmsCastShadow / fullBodyCasterActive is true for every input combination — never both false either', () => {
    for (const shadowDebugEnabled of [false, true]) {
      for (const shadowReviewEnabled of [false, true]) {
        for (const policy of ['fp-arms', 'full-body'] as const) {
          const d = resolveRangeShadowCasterDecision({ shadowDebugEnabled, shadowReviewEnabled, policy });
          const activeCount = Number(d.fpArmsCastShadow) + Number(d.fullBodyCasterActive);
          assert.strictEqual(activeCount, 1, `expected exactly 1 active caster for shadowDebugEnabled=${shadowDebugEnabled} shadowReviewEnabled=${shadowReviewEnabled} policy=${policy}, got ${activeCount}`);
        }
      }
    }
  });

  it('is a pure function — the same input always produces a fresh, deep-equal result object (no shared mutable state)', () => {
    const input = { shadowDebugEnabled: false, shadowReviewEnabled: true, policy: 'full-body' as const };
    const a = resolveRangeShadowCasterDecision(input);
    const b = resolveRangeShadowCasterDecision(input);
    assert.deepStrictEqual(a, b);
    assert.notStrictEqual(a, b, 'must return a fresh object each call, not a cached/shared reference');
  });
});

describe('shadowCasterPolicy — route-scoping regression (policy must never reach /v2/play or V1 /play)', () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

  it('V2PlayScene.tsx does not import shadowCasterPolicy', () => {
    const src = fs.readFileSync(path.join(repoRoot, 'src/components/three/play/V2PlayScene.tsx'), 'utf8');
    assert.ok(!src.includes('shadowCasterPolicy'), 'V2PlayScene.tsx must not reference the range-only caster policy');
  });

  it('the /v2/play PlayerController.tsx does not import shadowCasterPolicy', () => {
    const src = fs.readFileSync(path.join(repoRoot, 'src/components/three/play/PlayerController.tsx'), 'utf8');
    assert.ok(!src.includes('shadowCasterPolicy'), 'play PlayerController.tsx must not reference the range-only caster policy');
  });

  it('V1 game/player/PlayerController.tsx does not import shadowCasterPolicy', () => {
    const src = fs.readFileSync(path.join(repoRoot, 'src/components/game/player/PlayerController.tsx'), 'utf8');
    assert.ok(!src.includes('shadowCasterPolicy'), 'V1 PlayerController.tsx must not reference the V2 range-only caster policy');
  });
});
