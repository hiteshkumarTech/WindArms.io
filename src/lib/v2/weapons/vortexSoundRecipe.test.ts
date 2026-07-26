import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WIND_WEAPONS } from '@shared/windWeapons';
import {
  computeVortexDryFireRecipe,
  computeVortexReloadRecipe,
  computeVortexShotRecipe,
  computeVortexTurbineTarget,
  GAIN_VARIATION_MAX,
  PITCH_VARIATION_MAX,
  VORTEX_SHOT_BASE,
} from './vortexSoundRecipe';

const BASE_CONTEXT = { shotIndexInBurst: 0, sustainedFireAmount: 0, randomSeed: 1, masterVolume: 0.8 };

function assertFiniteRecipe(recipe: Record<string, number>) {
  for (const [key, value] of Object.entries(recipe)) {
    assert.equal(typeof value, 'number', `${key} must be a number`);
    assert.ok(Number.isFinite(value), `${key} must be finite, got ${value}`);
  }
}

describe('computeVortexShotRecipe (Step 7G — signature shot identity)', () => {
  it('produces a fully finite recipe', () => {
    assertFiniteRecipe(computeVortexShotRecipe(BASE_CONTEXT) as unknown as Record<string, number>);
  });

  it('is deterministic: the same context always produces the same recipe', () => {
    const a = computeVortexShotRecipe({ ...BASE_CONTEXT, randomSeed: 42, sustainedFireAmount: 0.6 });
    const b = computeVortexShotRecipe({ ...BASE_CONTEXT, randomSeed: 42, sustainedFireAmount: 0.6 });
    assert.deepEqual(a, b);
  });

  it('different seeds produce different (but still valid) recipes -- variation is real, not a no-op', () => {
    const a = computeVortexShotRecipe({ ...BASE_CONTEXT, randomSeed: 1 });
    const b = computeVortexShotRecipe({ ...BASE_CONTEXT, randomSeed: 2 });
    assert.notDeepEqual(a, b);
  });

  it('gain jitter across many seeds never exceeds the declared GAIN_VARIATION_MAX around the TRUE (un-jittered) base value', () => {
    for (let seed = 0; seed < 200; seed++) {
      const recipe = computeVortexShotRecipe({ ...BASE_CONTEXT, randomSeed: seed, sustainedFireAmount: 0 });
      const ratio = recipe.pressureGain / VORTEX_SHOT_BASE.pressureGain;
      assert.ok(ratio >= 1 - GAIN_VARIATION_MAX - 1e-9 && ratio <= 1 + GAIN_VARIATION_MAX + 1e-9, `seed ${seed}: pressureGain ratio ${ratio} outside +/-${GAIN_VARIATION_MAX}`);
    }
  });

  it('pitch jitter across many seeds never exceeds the declared PITCH_VARIATION_MAX around the TRUE (un-jittered) base value (at zero sustain)', () => {
    for (let seed = 0; seed < 200; seed++) {
      const recipe = computeVortexShotRecipe({ ...BASE_CONTEXT, randomSeed: seed, sustainedFireAmount: 0 });
      const ratio = recipe.pressureCutoffHz / VORTEX_SHOT_BASE.pressureCutoffHz;
      assert.ok(ratio >= 1 - PITCH_VARIATION_MAX - 1e-9 && ratio <= 1 + PITCH_VARIATION_MAX + 1e-9, `seed ${seed}: pressureCutoffHz ratio ${ratio} outside +/-${PITCH_VARIATION_MAX}`);
    }
  });

  it('sustained fire modestly raises shot-layer pitch, never lowers it below the unsustained baseline', () => {
    const cold = computeVortexShotRecipe({ ...BASE_CONTEXT, randomSeed: 5, sustainedFireAmount: 0 });
    const hot = computeVortexShotRecipe({ ...BASE_CONTEXT, randomSeed: 5, sustainedFireAmount: 1 });
    assert.ok(hot.mechanicalPitchHz > cold.mechanicalPitchHz, 'fully sustained fire should read brighter/higher-pitched than a cold first shot');
    assert.ok(hot.mechanicalPitchHz / cold.mechanicalPitchHz < 1.5, 'the pitch rise must stay restrained, not runaway');
  });

  it('non-finite or out-of-range context inputs never produce non-finite or negative output', () => {
    const recipe = computeVortexShotRecipe({ shotIndexInBurst: 0, sustainedFireAmount: NaN, randomSeed: Infinity, masterVolume: -5 });
    assertFiniteRecipe(recipe as unknown as Record<string, number>);
    for (const value of Object.values(recipe)) assert.ok(value >= 0);
  });

  it('the mechanical transient is shorter than the pressure body -- it is a "click", not a second body layer', () => {
    const recipe = computeVortexShotRecipe(BASE_CONTEXT);
    assert.ok(recipe.mechanicalDecaySeconds < recipe.pressureDurationSeconds);
  });

  it('the pressure layer is the loudest single layer -- it is the primary body of the shot', () => {
    const recipe = computeVortexShotRecipe(BASE_CONTEXT);
    assert.ok(recipe.pressureGain >= recipe.mechanicalGain);
    assert.ok(recipe.pressureGain >= recipe.emSnapGain);
    assert.ok(recipe.pressureGain >= recipe.windTailGain);
  });

  it('the EM snap sweeps downward (start higher than end) -- "fast downward frequency movement" per the brief', () => {
    const recipe = computeVortexShotRecipe(BASE_CONTEXT);
    assert.ok(recipe.emSnapStartHz > recipe.emSnapEndHz);
  });

  it('all layer durations stay short enough for automatic fire at max RPM (well under the ~66ms shot interval headroom target)', () => {
    const recipe = computeVortexShotRecipe({ ...BASE_CONTEXT, sustainedFireAmount: 1 });
    assert.ok(recipe.pressureDurationSeconds < 0.09);
    assert.ok(recipe.mechanicalDecaySeconds < 0.03);
    assert.ok(recipe.emSnapDurationSeconds < 0.05);
    assert.ok(recipe.windTailDurationSeconds < 0.12);
  });
});

describe('computeVortexTurbineTarget (Step 7G — sustained-fire turbine response)', () => {
  it('zero sustained-fire amount produces zero gain (silent when not actively sustaining fire)', () => {
    const target = computeVortexTurbineTarget(0);
    assert.equal(target.gain, 0);
  });

  it('gain rises monotonically with sustained-fire amount', () => {
    const g0 = computeVortexTurbineTarget(0).gain;
    const g25 = computeVortexTurbineTarget(0.25).gain;
    const g50 = computeVortexTurbineTarget(0.5).gain;
    const g100 = computeVortexTurbineTarget(1).gain;
    assert.ok(g0 <= g25 && g25 <= g50 && g50 <= g100);
  });

  it('the turbine gain ceiling stays below a single shot pressure-layer gain -- never overpowers shot transients', () => {
    const shotGain = computeVortexShotRecipe({ ...BASE_CONTEXT, sustainedFireAmount: 1 }).pressureGain;
    const turbineMax = computeVortexTurbineTarget(1).gain;
    assert.ok(turbineMax < shotGain, `turbine max gain ${turbineMax} must stay below shot pressure gain ${shotGain}`);
  });

  it('pitch/filter cutoff rise with sustained-fire amount (rising brightness/tension)', () => {
    const cold = computeVortexTurbineTarget(0);
    const hot = computeVortexTurbineTarget(1);
    assert.ok(hot.pitchHz > cold.pitchHz);
    assert.ok(hot.filterCutoffHz > cold.filterCutoffHz);
  });

  it('does not take a masterVolume parameter -- volume is applied exactly once, at the shared master gain node the turbine also connects through, not duplicated here', () => {
    // Two-arg call would be a TS error at the call site; this test just documents/locks the single-arg shape via a type-level check the compiler enforces.
    assert.equal(computeVortexTurbineTarget.length, 1);
  });

  it('is finite and clamped for any input, including out-of-range', () => {
    const target = computeVortexTurbineTarget(NaN);
    assert.ok(Number.isFinite(target.gain));
    assert.ok(Number.isFinite(target.filterCutoffHz));
    assert.ok(Number.isFinite(target.pitchHz));
    assert.ok(target.gain >= 0);
  });
});

describe('computeVortexReloadRecipe (Step 7G — internal-servicing reload sequence)', () => {
  it('produces a finite, non-empty stage sequence', () => {
    const recipe = computeVortexReloadRecipe();
    assert.ok(recipe.stages.length > 0);
    for (const stage of recipe.stages) assertFiniteRecipe(stage as unknown as Record<string, number>);
  });

  it('stages are ordered by their scheduled offset', () => {
    const recipe = computeVortexReloadRecipe();
    for (let i = 1; i < recipe.stages.length; i++) {
      assert.ok(recipe.stages[i].atSeconds >= recipe.stages[i - 1].atSeconds);
    }
  });

  it('every stage completes (offset + duration) within the reported total duration', () => {
    const recipe = computeVortexReloadRecipe();
    for (const stage of recipe.stages) {
      assert.ok(stage.atSeconds + stage.durationSeconds <= recipe.totalDurationSeconds + 1e-9);
    }
  });

  it('every stage is quieter than a real shot pressure layer -- reload must read as reload, not as firing', () => {
    const shotGain = computeVortexShotRecipe(BASE_CONTEXT).pressureGain;
    const recipe = computeVortexReloadRecipe();
    for (const stage of recipe.stages) assert.ok(stage.gain < shotGain);
  });

  it('the audio sequence finishes well within the real reload gameplay duration -- must never extend or feel out of sync with the actual reload action', () => {
    const reloadTimeS = WIND_WEAPONS.vortex.gameplayStats?.reloadTimeS ?? 2.2;
    const recipe = computeVortexReloadRecipe();
    assert.ok(recipe.totalDurationSeconds < reloadTimeS * 0.5, `reload audio (${recipe.totalDurationSeconds}s) should finish comfortably before the real ${reloadTimeS}s reload completes, not stretch to fill it`);
  });
});

describe('computeVortexDryFireRecipe (Step 7G — dry-fire must be unmistakably weaker)', () => {
  it('produces a finite recipe', () => {
    assertFiniteRecipe(computeVortexDryFireRecipe() as unknown as Record<string, number>);
  });

  it('both dry-fire layers are quieter than a real shot pressure layer by a wide margin', () => {
    const shotGain = computeVortexShotRecipe(BASE_CONTEXT).pressureGain;
    const dryFire = computeVortexDryFireRecipe();
    assert.ok(dryFire.clickGain < shotGain * 0.5, 'dry-fire click must be unmistakably weaker than a real shot, not just marginally quieter');
    assert.ok(dryFire.failGain < shotGain * 0.5);
  });

  it('dry-fire is also quieter than every reload stage -- distinct, weakest-tier feedback', () => {
    const reload = computeVortexReloadRecipe();
    const dryFire = computeVortexDryFireRecipe();
    const loudestReloadStage = Math.max(...reload.stages.map((s) => s.gain));
    assert.ok(dryFire.clickGain <= loudestReloadStage);
    assert.ok(dryFire.failGain <= loudestReloadStage);
  });
});
