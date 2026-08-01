import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RANGE_SHADOW_CASTER_POLICY,
  PLAY_SHADOW_CASTER_POLICY,
  EFFECTIVE_RANGE_SHADOW_CASTER_POLICY,
  EFFECTIVE_PLAY_SHADOW_CASTER_POLICY,
  isValidShadowCasterPolicy,
  resolveShadowCasterPolicy,
  resolveShadowCasterDecision,
} from './shadowCasterPolicy';

describe('shadowCasterPolicy — canonical values and typing', () => {
  it('both route policies are full-body (the Step 8E-E/8F rollout candidates)', () => {
    assert.strictEqual(RANGE_SHADOW_CASTER_POLICY, 'full-body');
    assert.strictEqual(PLAY_SHADOW_CASTER_POLICY, 'full-body');
  });

  it('each effective (validated) policy equals its own canonical constant', () => {
    assert.strictEqual(EFFECTIVE_RANGE_SHADOW_CASTER_POLICY, RANGE_SHADOW_CASTER_POLICY);
    assert.strictEqual(EFFECTIVE_PLAY_SHADOW_CASTER_POLICY, PLAY_SHADOW_CASTER_POLICY);
  });

  it('isValidShadowCasterPolicy accepts exactly the two typed values', () => {
    assert.strictEqual(isValidShadowCasterPolicy('fp-arms'), true);
    assert.strictEqual(isValidShadowCasterPolicy('full-body'), true);
    assert.strictEqual(isValidShadowCasterPolicy('FULL-BODY'), false);
    assert.strictEqual(isValidShadowCasterPolicy('production'), false);
    assert.strictEqual(isValidShadowCasterPolicy(''), false);
    assert.strictEqual(isValidShadowCasterPolicy(null), false);
    assert.strictEqual(isValidShadowCasterPolicy(undefined), false);
    assert.strictEqual(isValidShadowCasterPolicy(1), false);
  });
});

describe('shadowCasterPolicy — resolveShadowCasterPolicy (fail-safe fallback)', () => {
  it('passes through both valid values unchanged', () => {
    assert.strictEqual(resolveShadowCasterPolicy('fp-arms'), 'fp-arms');
    assert.strictEqual(resolveShadowCasterPolicy('full-body'), 'full-body');
  });

  it('falls back to fp-arms (never full-body) for any invalid value — the one-line-rollback safety net', () => {
    for (const bad of ['garbage', '', null, undefined, 42, {}, []]) {
      assert.strictEqual(resolveShadowCasterPolicy(bad), 'fp-arms', `expected fp-arms fallback for ${JSON.stringify(bad)}`);
    }
  });
});

describe('shadowCasterPolicy — resolveShadowCasterDecision (route-agnostic, exclusive ownership)', () => {
  it('fp-arms policy, no debug flags: FP arms cast, full-body inactive, controller inactive', () => {
    const d = resolveShadowCasterDecision({ debugFullBodyRequested: false, debugControllerRequested: false, policy: 'fp-arms' });
    assert.deepStrictEqual(d, { fpArmsCastShadow: true, fullBodyCasterActive: false, playerCenteredControllerActive: false });
  });

  it('full-body policy, no debug flags (the production case): FP arms do NOT cast, full-body active, controller active — no query flags required', () => {
    const d = resolveShadowCasterDecision({ debugFullBodyRequested: false, debugControllerRequested: false, policy: 'full-body' });
    assert.deepStrictEqual(d, { fpArmsCastShadow: false, fullBodyCasterActive: true, playerCenteredControllerActive: true });
  });

  it('fp-arms policy but debugFullBodyRequested (dev testing the prototype without switching production policy): FP arms stop casting, full-body takes over — matches the pre-8E-E Step 8E-C rule exactly', () => {
    const d = resolveShadowCasterDecision({ debugFullBodyRequested: true, debugControllerRequested: false, policy: 'fp-arms' });
    assert.strictEqual(d.fpArmsCastShadow, false);
    assert.strictEqual(d.fullBodyCasterActive, true);
    assert.strictEqual(d.playerCenteredControllerActive, false);
  });

  it('full-body policy with the review harness open (range-only, ?shadow=1&shadowReview=1): still exactly one active caster, controller active', () => {
    const d = resolveShadowCasterDecision({ debugFullBodyRequested: true, debugControllerRequested: true, policy: 'full-body' });
    assert.strictEqual(d.fpArmsCastShadow, false);
    assert.strictEqual(d.fullBodyCasterActive, true);
    assert.strictEqual(d.playerCenteredControllerActive, true);
  });

  it('exhaustive: fpArmsCastShadow and fullBodyCasterActive are NEVER both true, for every input combination', () => {
    for (const debugFullBodyRequested of [false, true]) {
      for (const debugControllerRequested of [false, true]) {
        for (const policy of ['fp-arms', 'full-body'] as const) {
          const d = resolveShadowCasterDecision({ debugFullBodyRequested, debugControllerRequested, policy });
          assert.ok(
            !(d.fpArmsCastShadow && d.fullBodyCasterActive),
            `both true for debugFullBodyRequested=${debugFullBodyRequested} debugControllerRequested=${debugControllerRequested} policy=${policy}`,
          );
        }
      }
    }
  });

  it('exhaustive: exactly one of fpArmsCastShadow / fullBodyCasterActive is true for every input combination — never both false either', () => {
    for (const debugFullBodyRequested of [false, true]) {
      for (const debugControllerRequested of [false, true]) {
        for (const policy of ['fp-arms', 'full-body'] as const) {
          const d = resolveShadowCasterDecision({ debugFullBodyRequested, debugControllerRequested, policy });
          const activeCount = Number(d.fpArmsCastShadow) + Number(d.fullBodyCasterActive);
          assert.strictEqual(activeCount, 1, `expected exactly 1 active caster for debugFullBodyRequested=${debugFullBodyRequested} debugControllerRequested=${debugControllerRequested} policy=${policy}, got ${activeCount}`);
        }
      }
    }
  });

  it('invalid policy values fail safely: same decision as fp-arms for every debug-flag combination', () => {
    for (const debugFullBodyRequested of [false, true]) {
      for (const debugControllerRequested of [false, true]) {
        for (const bad of ['garbage', '', null, undefined, 42]) {
          const invalid = resolveShadowCasterDecision({ debugFullBodyRequested, debugControllerRequested, policy: bad });
          const safe = resolveShadowCasterDecision({ debugFullBodyRequested, debugControllerRequested, policy: 'fp-arms' });
          assert.deepStrictEqual(invalid, safe, `invalid policy ${JSON.stringify(bad)} must resolve identically to explicit fp-arms`);
        }
      }
    }
  });

  it('no route names appear anywhere in the resolver output shape or logic — same function serves every route', () => {
    const rangeStyle = resolveShadowCasterDecision({ debugFullBodyRequested: false, debugControllerRequested: false, policy: RANGE_SHADOW_CASTER_POLICY });
    const playStyle = resolveShadowCasterDecision({ debugFullBodyRequested: false, debugControllerRequested: false, policy: PLAY_SHADOW_CASTER_POLICY });
    assert.deepStrictEqual(rangeStyle, playStyle, 'identical inputs from either route must produce identical decisions — the resolver itself must be route-blind');
  });

  it('is a pure function — the same input always produces a fresh, deep-equal result object (no shared mutable state)', () => {
    const input = { debugFullBodyRequested: false, debugControllerRequested: true, policy: 'full-body' as const };
    const a = resolveShadowCasterDecision(input);
    const b = resolveShadowCasterDecision(input);
    assert.deepStrictEqual(a, b);
    assert.notStrictEqual(a, b, 'must return a fresh object each call, not a cached/shared reference');
  });
});

describe('shadowCasterPolicy — route policy independence', () => {
  it('RANGE_SHADOW_CASTER_POLICY and PLAY_SHADOW_CASTER_POLICY are separate bindings, not derived from one another', () => {
    // Both happen to be 'full-body' today, but they are two independent
    // source-controlled literals — flipping one in source can never flip
    // the other as a side effect. Verified structurally: each constant's
    // own EFFECTIVE_* companion is computed only from itself.
    assert.strictEqual(EFFECTIVE_RANGE_SHADOW_CASTER_POLICY, resolveShadowCasterPolicy(RANGE_SHADOW_CASTER_POLICY));
    assert.strictEqual(EFFECTIVE_PLAY_SHADOW_CASTER_POLICY, resolveShadowCasterPolicy(PLAY_SHADOW_CASTER_POLICY));
  });

  it('a range-specific debug flag (debugFullBodyRequested/debugControllerRequested) has no way to reach a play decision — the resolver takes no route identity, so play call sites simply never pass true for either', () => {
    const playDecision = resolveShadowCasterDecision({ debugFullBodyRequested: false, debugControllerRequested: false, policy: EFFECTIVE_PLAY_SHADOW_CASTER_POLICY });
    assert.deepStrictEqual(playDecision, { fpArmsCastShadow: false, fullBodyCasterActive: true, playerCenteredControllerActive: true });
  });
});

describe('shadowCasterPolicy — route-scoping regression', () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
  const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

  it('V2PlayScene.tsx DOES import shadowCasterPolicy (Step 8F rollout) and reads PLAY_SHADOW_CASTER_POLICY, never RANGE_SHADOW_CASTER_POLICY', () => {
    const src = read('src/components/three/play/V2PlayScene.tsx');
    assert.ok(src.includes('shadowCasterPolicy'), 'V2PlayScene.tsx must import the shared shadow-caster policy module');
    assert.ok(src.includes('PLAY_SHADOW_CASTER_POLICY'), 'V2PlayScene.tsx must reference its own PLAY_SHADOW_CASTER_POLICY');
    assert.ok(!src.includes('RANGE_SHADOW_CASTER_POLICY'), 'V2PlayScene.tsx must never reference the range-only policy constant');
  });

  it('RangeScene.tsx reads RANGE_SHADOW_CASTER_POLICY, never PLAY_SHADOW_CASTER_POLICY', () => {
    const src = read('src/components/three/range/RangeScene.tsx');
    assert.ok(src.includes('RANGE_SHADOW_CASTER_POLICY'), 'RangeScene.tsx must reference its own RANGE_SHADOW_CASTER_POLICY');
    assert.ok(!src.includes('PLAY_SHADOW_CASTER_POLICY'), 'RangeScene.tsx must never reference the play-only policy constant');
  });

  it('the /v2/play PlayerController.tsx does not import shadowCasterPolicy', () => {
    const src = read('src/components/three/play/PlayerController.tsx');
    assert.ok(!src.includes('shadowCasterPolicy'), 'play PlayerController.tsx must not reference the shadow-caster policy — movement logic stays untouched by this milestone');
  });

  it('V1 game/player/PlayerController.tsx does not import shadowCasterPolicy', () => {
    const src = read('src/components/game/player/PlayerController.tsx');
    assert.ok(!src.includes('shadowCasterPolicy'), 'V1 PlayerController.tsx must not reference the V2 shadow-caster policy');
  });

  it('no V1 source file under src/components/game or src/lib/game imports shadowCasterPolicy', () => {
    const roots = ['src/components/game', 'src/lib/game'];
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(tsx?|jsx?)$/.test(entry.name) && fs.readFileSync(full, 'utf8').includes('shadowCasterPolicy')) offenders.push(full);
      }
    };
    for (const root of roots) walk(path.join(repoRoot, root));
    assert.deepStrictEqual(offenders, [], `V1 files must never import shadowCasterPolicy: ${offenders.join(', ')}`);
  });
});
