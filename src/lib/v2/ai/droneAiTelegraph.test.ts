import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveDroneTelegraph, DRONE_COMBAT_TELEGRAPH, type DroneTelegraphInput } from './droneAiTelegraph';

function input(overrides: Partial<DroneTelegraphInput> = {}): DroneTelegraphInput {
  return {
    nowMs: 1000,
    state: 'engaging',
    hitFlashUntilMs: 0,
    acquirePulseUntilMs: 0,
    reactionReadyAtMs: null,
    windupUntilMs: 0,
    attackWindupMs: 650,
    fireFlashUntilMs: 0,
    ...overrides,
  };
}

describe('droneAiTelegraph — DRONE_COMBAT_TELEGRAPH config bounds', () => {
  it('timing values fall within the phase brief\'s own bounded ranges', () => {
    assert.ok(DRONE_COMBAT_TELEGRAPH.acquirePulseMs >= 140 && DRONE_COMBAT_TELEGRAPH.acquirePulseMs <= 250);
    assert.ok(DRONE_COMBAT_TELEGRAPH.fireFlashMs >= 60 && DRONE_COMBAT_TELEGRAPH.fireFlashMs <= 110);
    assert.ok(DRONE_COMBAT_TELEGRAPH.cooldownSettleMs >= 120 && DRONE_COMBAT_TELEGRAPH.cooldownSettleMs <= 250);
  });

  it('eye-intensity values match the brief exactly, extending the pre-9E observed 1.4/2.6/3.2 set', () => {
    assert.strictEqual(DRONE_COMBAT_TELEGRAPH.idleEyeIntensity, 1.4);
    assert.strictEqual(DRONE_COMBAT_TELEGRAPH.acquireEyeIntensity, 2.0);
    assert.strictEqual(DRONE_COMBAT_TELEGRAPH.windupStartEyeIntensity, 1.8);
    assert.strictEqual(DRONE_COMBAT_TELEGRAPH.windupEndEyeIntensity, 2.6);
    assert.strictEqual(DRONE_COMBAT_TELEGRAPH.fireEyeIntensity, 3.0);
    assert.strictEqual(DRONE_COMBAT_TELEGRAPH.hitEyeIntensity, 3.2);
  });
});

describe('droneAiTelegraph — phase priority (destroyed > hit > fire > windup > acquire/reaction > cooldown > idle)', () => {
  it('destroyed wins over every other simultaneously-active signal', () => {
    const out = resolveDroneTelegraph(
      input({ state: 'destroyed', hitFlashUntilMs: 2000, fireFlashUntilMs: 2000, acquirePulseUntilMs: 2000 }),
    );
    assert.strictEqual(out.phase, 'destroyed');
  });

  it('hit wins over fire/windup/acquire', () => {
    const out = resolveDroneTelegraph(
      input({ state: 'attacking', hitFlashUntilMs: 1200, fireFlashUntilMs: 1200, acquirePulseUntilMs: 1200, windupUntilMs: 1500 }),
    );
    assert.strictEqual(out.phase, 'hit');
  });

  it('fire wins over windup/acquire/reaction', () => {
    const out = resolveDroneTelegraph(
      input({ state: 'attacking', windupUntilMs: 1500, fireFlashUntilMs: 1050, acquirePulseUntilMs: 1100 }),
    );
    assert.strictEqual(out.phase, 'fire');
  });

  it('windup wins over acquire/reaction/cooldown', () => {
    const out = resolveDroneTelegraph(
      input({ state: 'attacking', windupUntilMs: 1500, acquirePulseUntilMs: 1100, reactionReadyAtMs: 1100 }),
    );
    assert.strictEqual(out.phase, 'windup');
  });

  it('acquire wins over reaction when both windows are simultaneously open', () => {
    const out = resolveDroneTelegraph(
      input({ state: 'engaging', acquirePulseUntilMs: 1180, reactionReadyAtMs: 1350 }),
    );
    assert.strictEqual(out.phase, 'acquire');
  });

  it('reaction shows once the acquire pulse has faded but the reaction wait is still pending', () => {
    const out = resolveDroneTelegraph(
      input({ nowMs: 1200, state: 'engaging', acquirePulseUntilMs: 1180, reactionReadyAtMs: 1350 }),
    );
    assert.strictEqual(out.phase, 'reaction');
  });

  it('reaction only applies while engaging — attacking with a stale reactionReadyAtMs never shows reaction', () => {
    const out = resolveDroneTelegraph(
      input({ nowMs: 1200, state: 'attacking', windupUntilMs: 0, reactionReadyAtMs: 1350 }),
    );
    assert.notStrictEqual(out.phase, 'reaction');
  });

  it('cooldown shows in the brief settle window immediately after a fire window ends', () => {
    const out = resolveDroneTelegraph(
      input({ nowMs: 1090, state: 'engaging', fireFlashUntilMs: 1080 }),
    );
    assert.strictEqual(out.phase, 'cooldown');
  });

  it('idle is the default once every window has lapsed', () => {
    const out = resolveDroneTelegraph(
      input({ nowMs: 5000, state: 'engaging', fireFlashUntilMs: 1080, acquirePulseUntilMs: 1180, reactionReadyAtMs: 1000 }),
    );
    assert.strictEqual(out.phase, 'idle');
  });

  it('searching/investigating/spawning/stunned states with no active window all resolve to idle', () => {
    for (const state of ['searching', 'investigating', 'spawning'] as const) {
      const out = resolveDroneTelegraph(input({ state }));
      assert.strictEqual(out.phase, 'idle', `${state} must resolve to idle with no active telegraph window`);
    }
  });
});

describe('droneAiTelegraph — eye emissive intensity', () => {
  it('idle is exactly idleEyeIntensity', () => {
    assert.strictEqual(resolveDroneTelegraph(input()).eyeEmissiveIntensity, DRONE_COMBAT_TELEGRAPH.idleEyeIntensity);
  });

  it('hit is exactly hitEyeIntensity, regardless of any other concurrent state', () => {
    const out = resolveDroneTelegraph(input({ hitFlashUntilMs: 2000, state: 'attacking', windupUntilMs: 1600 }));
    assert.strictEqual(out.eyeEmissiveIntensity, DRONE_COMBAT_TELEGRAPH.hitEyeIntensity);
  });

  it('fire is exactly fireEyeIntensity', () => {
    const out = resolveDroneTelegraph(input({ fireFlashUntilMs: 1080 }));
    assert.strictEqual(out.eyeEmissiveIntensity, DRONE_COMBAT_TELEGRAPH.fireEyeIntensity);
  });

  it('acquire is exactly acquireEyeIntensity', () => {
    const out = resolveDroneTelegraph(input({ acquirePulseUntilMs: 1180 }));
    assert.strictEqual(out.eyeEmissiveIntensity, DRONE_COMBAT_TELEGRAPH.acquireEyeIntensity);
  });

  it('reaction is exactly windupStartEyeIntensity (continuity into windup)', () => {
    const out = resolveDroneTelegraph(input({ nowMs: 1200, acquirePulseUntilMs: 1180, reactionReadyAtMs: 1350 }));
    assert.strictEqual(out.eyeEmissiveIntensity, DRONE_COMBAT_TELEGRAPH.windupStartEyeIntensity);
  });

  it('windup interpolates smoothly from windupStartEyeIntensity to windupEndEyeIntensity across the window', () => {
    const start = resolveDroneTelegraph(input({ state: 'attacking', nowMs: 1000, windupUntilMs: 1650, attackWindupMs: 650 }));
    assert.ok(Math.abs(start.eyeEmissiveIntensity - DRONE_COMBAT_TELEGRAPH.windupStartEyeIntensity) < 1e-9);
    const mid = resolveDroneTelegraph(input({ state: 'attacking', nowMs: 1325, windupUntilMs: 1650, attackWindupMs: 650 }));
    const expectedMid = (DRONE_COMBAT_TELEGRAPH.windupStartEyeIntensity + DRONE_COMBAT_TELEGRAPH.windupEndEyeIntensity) / 2;
    assert.ok(Math.abs(mid.eyeEmissiveIntensity - expectedMid) < 1e-9);
    const end = resolveDroneTelegraph(input({ state: 'attacking', nowMs: 1650, windupUntilMs: 1650, attackWindupMs: 650 }));
    assert.ok(Math.abs(end.eyeEmissiveIntensity - DRONE_COMBAT_TELEGRAPH.windupEndEyeIntensity) < 1e-9);
  });

  it('cooldown interpolates smoothly from fireEyeIntensity down to idleEyeIntensity', () => {
    const justAfterFire = resolveDroneTelegraph(input({ nowMs: 1080, fireFlashUntilMs: 1080 }));
    assert.ok(Math.abs(justAfterFire.eyeEmissiveIntensity - DRONE_COMBAT_TELEGRAPH.fireEyeIntensity) < 1e-9);
    const settled = resolveDroneTelegraph(input({ nowMs: 1080 + DRONE_COMBAT_TELEGRAPH.cooldownSettleMs - 1, fireFlashUntilMs: 1080 }));
    assert.ok(settled.eyeEmissiveIntensity > DRONE_COMBAT_TELEGRAPH.idleEyeIntensity && settled.eyeEmissiveIntensity < DRONE_COMBAT_TELEGRAPH.fireEyeIntensity);
  });
});

describe('droneAiTelegraph — muzzle flash', () => {
  it('is invisible with zero progress outside the fire phase', () => {
    const out = resolveDroneTelegraph(input());
    assert.strictEqual(out.muzzleFlashVisible, false);
    assert.strictEqual(out.muzzleFlashProgress, 0);
  });

  it('is visible with progress rising from 0 toward 1 across the fire window', () => {
    const anchor = 1080;
    const justStarted = resolveDroneTelegraph(input({ nowMs: anchor - DRONE_COMBAT_TELEGRAPH.fireFlashMs, fireFlashUntilMs: anchor }));
    assert.strictEqual(justStarted.muzzleFlashVisible, true);
    assert.ok(Math.abs(justStarted.muzzleFlashProgress - 0) < 1e-9);
    const almostDone = resolveDroneTelegraph(input({ nowMs: anchor - 1, fireFlashUntilMs: anchor }));
    assert.ok(almostDone.muzzleFlashProgress > 0.9);
  });

  it('never visible once fireFlashUntilMs is 0 (never fired this life)', () => {
    const out = resolveDroneTelegraph(input({ nowMs: 50, fireFlashUntilMs: 0 }));
    assert.strictEqual(out.muzzleFlashVisible, false);
  });
});

describe('droneAiTelegraph — is a pure, deterministic function', () => {
  it('identical input always produces a deep-equal output', () => {
    const i = input({ state: 'attacking', windupUntilMs: 1500, nowMs: 1200 });
    assert.deepStrictEqual(resolveDroneTelegraph(i), resolveDroneTelegraph(i));
  });

  it('never returns NaN/Infinity for any field across a representative sweep', () => {
    const states = ['spawning', 'searching', 'investigating', 'engaging', 'attacking', 'destroyed'] as const;
    for (const state of states) {
      for (let now = 0; now < 3000; now += 137) {
        const out = resolveDroneTelegraph(
          input({ state, nowMs: now, hitFlashUntilMs: 500, acquirePulseUntilMs: 300, reactionReadyAtMs: 400, windupUntilMs: 900, fireFlashUntilMs: 1200 }),
        );
        assert.ok(Number.isFinite(out.eyeEmissiveIntensity), `eyeEmissiveIntensity must be finite (state=${state}, now=${now})`);
        assert.ok(Number.isFinite(out.muzzleFlashProgress), `muzzleFlashProgress must be finite (state=${state}, now=${now})`);
      }
    }
  });
});
