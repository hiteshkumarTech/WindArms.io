import { clamp } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settingsStore';
import { SingleVoiceGuard, VoiceBudget } from '@/lib/v2/weapons/audioVoiceBudget';
import {
  computeVortexDryFireRecipe,
  computeVortexReloadRecipe,
  computeVortexShotRecipe,
  computeVortexTurbineTarget,
  type VortexReloadRecipe,
  type VortexShotRecipe,
} from '@/lib/v2/weapons/vortexSoundRecipe';

/**
 * Vortex Rifle audio (Milestone 7, Phase G, Step 7G — signature procedural
 * sound identity; Step 7F established the 100% procedural architecture this
 * builds on, see that step's doc comment history in git blame). Creative
 * sound PARAMETERS live in the pure, testable `vortexSoundRecipe.ts`; this
 * file only owns Web Audio NODE GRAPH construction and lifecycle —
 * everything here is either a thin per-shot node builder or persistent
 * state management (voice budgets, the one persistent turbine chain).
 *
 * Graph builder functions (`fireNoiseBurst`/`fireTone`/`fireShotLayers`/
 * `fireReloadSequence`) take an explicit `ctx: BaseAudioContext` + `output:
 * AudioNode` rather than closing over `this.ctx`/`this.master`, so the SAME
 * code renders identically through the live `AudioContext` (real playback)
 * or an `OfflineAudioContext` (deterministic peak/RMS measurement — see
 * `renderVortexShotOffline` etc., used by the `?audio=1` debug panel and by
 * Playwright browser validation; `OfflineAudioContext` doesn't exist in
 * Node, so this measurement path is browser-only, not `node:test`-covered).
 */

function makeNoiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const length = ctx.sampleRate;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function fireNoiseBurst(
  ctx: BaseAudioContext,
  output: AudioNode,
  buffer: AudioBuffer,
  duration: number,
  filterFreq: number,
  peak: number,
  filterType: BiquadFilterType = 'bandpass',
  startTime?: number,
): void {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = filterFreq;
  filter.Q.value = 0.9;
  const gain = ctx.createGain();
  const now = startTime ?? ctx.currentTime;
  gain.gain.setValueAtTime(peak, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  source.connect(filter).connect(gain).connect(output);
  source.start(now, Math.random());
  source.stop(now + duration + 0.02);
}

function fireTone(
  ctx: BaseAudioContext,
  output: AudioNode,
  freq: number,
  duration: number,
  peak: number,
  type: OscillatorType = 'sine',
  glideTo?: number,
  startTime?: number,
): void {
  const osc = ctx.createOscillator();
  osc.type = type;
  const gain = ctx.createGain();
  const now = startTime ?? ctx.currentTime;
  osc.frequency.setValueAtTime(freq, now);
  if (glideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(glideTo, 1), now + duration);
  gain.gain.setValueAtTime(peak, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc.connect(gain).connect(output);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

/**
 * The four-layer signature shot: a compressed pressure "chuff" (primary
 * body), a sharp mechanical transient (timing clarity, "valve/gate"), a
 * brief downward-sweeping electromagnetic snap (technology identity, kept
 * subtle), and a restrained filtered-air tail (pressure escaping through
 * engineered vents). See `vortexSoundRecipe.ts` for the tuned parameters.
 */
function fireShotLayers(ctx: BaseAudioContext, output: AudioNode, noiseBuffer: AudioBuffer, recipe: VortexShotRecipe): void {
  fireNoiseBurst(ctx, output, noiseBuffer, recipe.pressureDurationSeconds, recipe.pressureCutoffHz, recipe.pressureGain, 'bandpass');
  fireTone(ctx, output, recipe.mechanicalPitchHz, recipe.mechanicalDecaySeconds, recipe.mechanicalGain, 'triangle');
  fireTone(ctx, output, recipe.emSnapStartHz, recipe.emSnapDurationSeconds, recipe.emSnapGain, 'sawtooth', recipe.emSnapEndHz);
  fireNoiseBurst(ctx, output, noiseBuffer, recipe.windTailDurationSeconds, recipe.windTailCutoffHz, recipe.windTailGain, 'lowpass');
}

/** Schedules the full reload stage sequence via Web Audio's own precise time scheduling (`ctx.currentTime + stage.atSeconds`) rather than `setTimeout` — identical code path for live playback and offline rendering, no JS-event-loop jitter. */
function fireReloadSequence(ctx: BaseAudioContext, output: AudioNode, recipe: VortexReloadRecipe): void {
  const base = ctx.currentTime;
  for (const stage of recipe.stages) {
    fireTone(ctx, output, stage.pitchHz, stage.durationSeconds, stage.gain, 'square', undefined, base + stage.atSeconds);
  }
}

function fireDryFireLayers(ctx: BaseAudioContext, output: AudioNode): void {
  const recipe = computeVortexDryFireRecipe();
  const base = ctx.currentTime;
  fireTone(ctx, output, recipe.clickPitchHz, recipe.clickDurationSeconds, recipe.clickGain, 'square', undefined, base);
  fireTone(ctx, output, recipe.failPitchHz, recipe.failDurationSeconds, recipe.failGain, 'square', undefined, base + 0.02);
}

function measureBuffer(buffer: AudioBuffer): { peakAmplitude: number; rms: number } {
  const data = buffer.getChannelData(0);
  let peak = 0;
  let sumSquares = 0;
  for (let i = 0; i < data.length; i++) {
    const abs = Math.abs(data[i]);
    if (abs > peak) peak = abs;
    sumSquares += data[i] * data[i];
  }
  return { peakAmplitude: peak, rms: Math.sqrt(sumSquares / Math.max(1, data.length)) };
}

/** Attack/release time constants for the turbine's `setTargetAtTime` ramps — reaches ~95% of target after ~3x the constant, so these land the attack around ~0.24s and the release around ~0.39s, within the brief's suggested 0.15-0.35s / 0.25-0.55s ranges. */
const TURBINE_ATTACK_TIME_CONSTANT = 0.08;
const TURBINE_RELEASE_TIME_CONSTANT = 0.13;
/** If no new accepted shot drives the turbine within this window, it self-releases — a passive safety net covering reload/death/pause/route-unmount without needing new hooks into gameplay code. */
const TURBINE_SILENCE_TIMEOUT_MS = 220;

class VortexSynth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private warnedUnavailable = false;
  private shotCounter = 0;

  /** Bounds concurrent `shot()` bursts so sustained automatic fire (or any pathological caller) can never spawn unbounded Web Audio nodes. Generous relative to the Vortex's max ~900rpm (66ms/shot) — this exists as a hard safety cap, not a normal-play limiter. */
  private readonly shotVoices = new VoiceBudget(12);
  /** At most one reload sequence plays at a time; a reload triggered while one is still sounding is dropped rather than layered. */
  private readonly reloadVoice = new SingleVoiceGuard();
  private reloadReleaseTimer: number | null = null;

  // The one persistent turbine node chain (never one node per shot).
  private turbineNoiseGain: GainNode | null = null;
  private turbineFilter: BiquadFilterNode | null = null;
  private turbineOscGain: GainNode | null = null;
  private turbineOsc: OscillatorNode | null = null;
  private turbineReleaseTimer: number | null = null;
  private turbineSustain = 0;

  unlock(): void {
    this.ensure();
    this.hardResetTurbine();
  }

  private ensure(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
        this.noiseBuffer = makeNoiseBuffer(this.ctx);
        this.buildTurbineChain(this.ctx, this.master, this.noiseBuffer);
      } catch {
        if (!this.warnedUnavailable) {
          this.warnedUnavailable = true;
          console.warn('[vortexAudio] Web Audio unavailable in this browser -- Vortex fire/reload SFX will be silent. Gameplay is unaffected.');
        }
        return null;
      }
    }
    // `resume()` is asynchronous — it cannot have settled by the next line,
    // so gating the return on `state === 'running'` here always failed
    // while suspended, silently dropping that call's sound with no retry.
    // Scheduling nodes on a still-suspended context is valid (they simply
    // produce no output until it resumes, which the call above already
    // kicked off), so return the context unconditionally once it exists.
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    if (this.master) this.master.gain.value = useSettingsStore.getState().masterVolume;
    return this.ctx;
  }

  /** One persistent noise+filter layer (airflow body) and one persistent low oscillator (pitch-rise brightness) — built once, gain held at 0 until `driveTurbine` raises it. Never recreated per shot. */
  private buildTurbineChain(ctx: AudioContext, master: GainNode, noiseBuffer: AudioBuffer): void {
    this.turbineFilter = ctx.createBiquadFilter();
    this.turbineFilter.type = 'bandpass';
    this.turbineFilter.frequency.value = 500;
    this.turbineFilter.Q.value = 0.7;
    this.turbineNoiseGain = ctx.createGain();
    this.turbineNoiseGain.gain.value = 0;
    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;
    noiseSource.connect(this.turbineFilter).connect(this.turbineNoiseGain).connect(master);
    noiseSource.start();

    this.turbineOscGain = ctx.createGain();
    this.turbineOscGain.gain.value = 0;
    this.turbineOsc = ctx.createOscillator();
    this.turbineOsc.type = 'sawtooth';
    this.turbineOsc.frequency.value = 90;
    this.turbineOsc.connect(this.turbineOscGain).connect(master);
    this.turbineOsc.start();
  }

  /** Drives the persistent turbine chain toward the target implied by `sustainedFireAmount` (the same `spinUpT` signal `VortexFireSystem.tsx` already computes and passes to `shot()`), smoothly, and (re)arms the self-release fallback. */
  private driveTurbine(sustainedFireAmount: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.turbineNoiseGain || !this.turbineFilter || !this.turbineOsc || !this.turbineOscGain) return;
    this.turbineSustain = clamp(sustainedFireAmount, 0, 1);
    const target = computeVortexTurbineTarget(this.turbineSustain);
    const now = ctx.currentTime;
    this.turbineNoiseGain.gain.setTargetAtTime(target.gain, now, TURBINE_ATTACK_TIME_CONSTANT);
    this.turbineOscGain.gain.setTargetAtTime(target.gain * 0.35, now, TURBINE_ATTACK_TIME_CONSTANT);
    this.turbineFilter.frequency.setTargetAtTime(target.filterCutoffHz, now, TURBINE_ATTACK_TIME_CONSTANT);
    this.turbineOsc.frequency.setTargetAtTime(target.pitchHz, now, TURBINE_ATTACK_TIME_CONSTANT);

    if (this.turbineReleaseTimer !== null) window.clearTimeout(this.turbineReleaseTimer);
    this.turbineReleaseTimer = window.setTimeout(() => this.releaseTurbine(), TURBINE_SILENCE_TIMEOUT_MS);
  }

  /** Smoothly decays the turbine to silent. Called explicitly on trigger release (`spinDown`) and reload start for a snappy response, and automatically by the self-release timeout as a passive safety net (covers death/pause/route-unmount without new gameplay hooks). */
  private releaseTurbine(): void {
    const ctx = this.ctx;
    if (!ctx || !this.turbineNoiseGain || !this.turbineOscGain) return;
    const now = ctx.currentTime;
    this.turbineNoiseGain.gain.setTargetAtTime(0, now, TURBINE_RELEASE_TIME_CONSTANT);
    this.turbineOscGain.gain.setTargetAtTime(0, now, TURBINE_RELEASE_TIME_CONSTANT);
    this.turbineSustain = 0;
    if (this.turbineReleaseTimer !== null) {
      window.clearTimeout(this.turbineReleaseTimer);
      this.turbineReleaseTimer = null;
    }
  }

  /** Hard, instant silence with no ramp — for `unlock()`'s defensive reset on (re)entry, so a stale turbine state from before a route remount can never carry over audibly. */
  private hardResetTurbine(): void {
    const ctx = this.ctx;
    if (!ctx || !this.turbineNoiseGain || !this.turbineOscGain) return;
    this.turbineNoiseGain.gain.cancelScheduledValues(ctx.currentTime);
    this.turbineNoiseGain.gain.value = 0;
    this.turbineOscGain.gain.cancelScheduledValues(ctx.currentTime);
    this.turbineOscGain.gain.value = 0;
    this.turbineSustain = 0;
    if (this.turbineReleaseTimer !== null) {
      window.clearTimeout(this.turbineReleaseTimer);
      this.turbineReleaseTimer = null;
    }
  }

  /** `spinUp` (0..1) — the same turbine spin-up ramp `VortexFireSystem.tsx` already computes as `spinUpT`; drives both this shot's layer pitch/gain variation and the persistent turbine's sustained-fire response. */
  shot(spinUp: number): void {
    const ctx = this.ensure();
    if (!ctx || !this.master || !this.noiseBuffer) return;
    if (!this.shotVoices.tryAcquire()) return; // at the hard concurrency cap -- drop silently, never throw or spam
    this.shotCounter += 1;
    const recipe = computeVortexShotRecipe({
      shotIndexInBurst: this.shotCounter,
      sustainedFireAmount: clamp(spinUp, 0, 1),
      randomSeed: this.shotCounter,
      masterVolume: useSettingsStore.getState().masterVolume,
    });
    fireShotLayers(ctx, this.master, this.noiseBuffer, recipe);
    const durationMs = Math.max(recipe.pressureDurationSeconds, recipe.mechanicalDecaySeconds, recipe.emSnapDurationSeconds, recipe.windTailDurationSeconds) * 1000 + 40;
    window.setTimeout(() => this.shotVoices.release(), durationMs);
    this.driveTurbine(spinUp);
  }

  reload(): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const token = this.reloadVoice.start();
    if (token === null) return; // a reload sequence is already sounding -- don't layer another
    this.releaseTurbine(); // reload interrupts sustained fire -- extra insurance alongside gameplay's own spinDown call
    const recipe = computeVortexReloadRecipe();
    fireReloadSequence(ctx, this.master, recipe);
    if (this.reloadReleaseTimer !== null) window.clearTimeout(this.reloadReleaseTimer);
    this.reloadReleaseTimer = window.setTimeout(() => {
      this.reloadVoice.stop(token);
      this.reloadReleaseTimer = null;
    }, recipe.totalDurationSeconds * 1000 + 20);
  }

  dryFire(): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    fireDryFireLayers(ctx, this.master);
  }

  impact(): void {
    const ctx = this.ensure();
    if (!ctx || !this.master || !this.noiseBuffer) return;
    fireTone(ctx, this.master, 1700, 0.05, 0.15, 'triangle');
    fireNoiseBurst(ctx, this.master, this.noiseBuffer, 0.04, 3000, 0.1, 'highpass');
  }

  /** Turbine spin-down hum when the trigger releases before the ramp completes — otherwise the spin-up is inaudible on release. Also snaps the persistent turbine into its release ramp immediately rather than waiting on the self-release timeout. */
  spinDown(): void {
    const ctx = this.ensure();
    if (ctx && this.master) fireTone(ctx, this.master, 240, 0.18, 0.08, 'sine', 90);
    this.releaseTurbine();
  }

  debugState(): {
    contextState: AudioContextState | 'uninitialized';
    shotVoices: number;
    shotVoiceCapacity: number;
    reloadActive: boolean;
    turbineSustain: number;
  } {
    return {
      contextState: this.ctx?.state ?? 'uninitialized',
      shotVoices: this.shotVoices.count,
      shotVoiceCapacity: this.shotVoices.capacity,
      reloadActive: this.reloadVoice.isActive,
      turbineSustain: this.turbineSustain,
    };
  }

  /** Dev-only "reset audio state" control — forces the shot-voice budget and reload guard clear and hard-resets the turbine, without tearing down/recreating the AudioContext itself. Never called from a normal gameplay path. */
  resetState(): void {
    this.shotVoices.reset();
    this.reloadVoice.forceRelease();
    if (this.reloadReleaseTimer !== null) {
      window.clearTimeout(this.reloadReleaseTimer);
      this.reloadReleaseTimer = null;
    }
    this.hardResetTurbine();
  }
}

const synth = new VortexSynth();

export function unlockVortexAudio(): void {
  synth.unlock();
}

export function playVortexShot(spinUp: number): void {
  synth.shot(spinUp);
}

export function playVortexReload(): void {
  synth.reload();
}

export function playVortexDryFire(): void {
  synth.dryFire();
}

export function playVortexImpact(): void {
  synth.impact();
}

export function playVortexSpinDown(): void {
  synth.spinDown();
}

/** Dev-only diagnostic snapshot (`?audio=1` panel) — not used by any gameplay path. */
export function getVortexAudioDebugState(): ReturnType<VortexSynth['debugState']> {
  return synth.debugState();
}

/** Dev-only "reset audio state" control (`?audio=1` panel) — not used by any gameplay path. */
export function resetVortexAudioState(): void {
  synth.resetState();
}

// --- Offline peak/RMS measurement (browser-only: OfflineAudioContext does not exist in Node, so this is exercised by the `?audio=1` panel and Playwright validation, not `node:test`) ---------------------------------------------------

export interface VortexAudioMeasurement {
  peakAmplitude: number;
  rms: number;
}

async function renderOffline(durationSeconds: number, build: (ctx: OfflineAudioContext, output: AudioNode, noiseBuffer: AudioBuffer) => void): Promise<VortexAudioMeasurement> {
  if (typeof OfflineAudioContext === 'undefined') return { peakAmplitude: 0, rms: 0 };
  const sampleRate = 44100;
  const ctx = new OfflineAudioContext(1, Math.max(1, Math.ceil(sampleRate * durationSeconds)), sampleRate);
  const noiseBuffer = makeNoiseBuffer(ctx);
  build(ctx, ctx.destination, noiseBuffer);
  const rendered = await ctx.startRendering();
  return measureBuffer(rendered);
}

/** Renders one signature shot at the given sustain level and measures peak/RMS. */
export function renderVortexShotOffline(sustainedFireAmount = 0, seed = 1): Promise<VortexAudioMeasurement> {
  return renderOffline(0.3, (ctx, output, noiseBuffer) => {
    const recipe = computeVortexShotRecipe({ shotIndexInBurst: 0, sustainedFireAmount, randomSeed: seed, masterVolume: 1 });
    fireShotLayers(ctx, output, noiseBuffer, recipe);
  });
}

/** Renders `shotCount` shots spaced at `intervalSeconds` (e.g. the Vortex's max-RPM interval) in one offline render, to measure worst-case overlapping-shot accumulation -- not per-shot isolation. */
export function renderVortexBurstOffline(shotCount: number, intervalSeconds: number): Promise<VortexAudioMeasurement> {
  const duration = shotCount * intervalSeconds + 0.3;
  return renderOffline(duration, (ctx, output, noiseBuffer) => {
    for (let i = 0; i < shotCount; i++) {
      const sustain = clamp(i / Math.max(1, shotCount - 1), 0, 1);
      const recipe = computeVortexShotRecipe({ shotIndexInBurst: i, sustainedFireAmount: sustain, randomSeed: i + 1, masterVolume: 1 });
      const base = ctx.currentTime;
      const startTime = base + i * intervalSeconds;
      // fireShotLayers always schedules at ctx.currentTime; shift by rebuilding with explicit start times via the lower-level helpers.
      fireNoiseBurst(ctx, output, noiseBuffer, recipe.pressureDurationSeconds, recipe.pressureCutoffHz, recipe.pressureGain, 'bandpass', startTime);
      fireTone(ctx, output, recipe.mechanicalPitchHz, recipe.mechanicalDecaySeconds, recipe.mechanicalGain, 'triangle', undefined, startTime);
      fireTone(ctx, output, recipe.emSnapStartHz, recipe.emSnapDurationSeconds, recipe.emSnapGain, 'sawtooth', recipe.emSnapEndHz, startTime);
      fireNoiseBurst(ctx, output, noiseBuffer, recipe.windTailDurationSeconds, recipe.windTailCutoffHz, recipe.windTailGain, 'lowpass', startTime);
    }
  });
}

export function renderVortexReloadOffline(): Promise<VortexAudioMeasurement> {
  return renderOffline(0.6, (ctx, output) => {
    fireReloadSequence(ctx, output, computeVortexReloadRecipe());
  });
}

export function renderVortexDryFireOffline(): Promise<VortexAudioMeasurement> {
  return renderOffline(0.2, (ctx, output) => {
    fireDryFireLayers(ctx, output);
  });
}
