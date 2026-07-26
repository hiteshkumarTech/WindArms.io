import { useSettingsStore } from '@/stores/settingsStore';
import { SingleVoiceGuard, VoiceBudget } from '@/lib/v2/weapons/audioVoiceBudget';

/**
 * Vortex Rifle audio (Milestone 7, Phase G, Step 7F). 100% procedural Web
 * Audio synthesis — noise()/tone() primitives ported from v1's proven
 * `src/lib/audio/audioEngine.ts` (not the `AudioEngine` class itself, whose
 * `SHOT_RECIPES` table is typed `Record<WeaponId, ...>` against v1's closed
 * 7-weapon union; widening that real, working v1 type to fit a v2-only
 * weapon would be exactly the kind of unrelated refactor the brief says to
 * avoid). A small synth scoped to this one weapon has no such cost.
 *
 * This is NOT a placeholder awaiting real recorded audio: it's this
 * project's documented, intended architecture for weapon SFX —
 * `docs/design/weapons/vortex-rifle.md` §15 explicitly recommends "v1's
 * proven technical approach (100% procedural Web Audio synthesis)... not
 * sourced/recorded audio," and `docs/design/audio.md` names the same
 * "default assumption" for all of v2. See `docs/decisions.md` (2026-07-26,
 * Step 7F) for the confirmation that doc asked for before this could be
 * treated as settled rather than inferred.
 *
 * Earlier versions of this module ALSO tried a real-audio-file-first path
 * (`playAudioEvent('vortex-rifle', event)` probing `/v2-art/*.{mp3,ogg,wav}`
 * before falling back to synthesis) — removed here. That path was the
 * direct cause of the "missing fire/reload audio" 404s: with no manifest
 * entries or files ever placed at those paths, and no docs actually calling
 * for them, every session's first fire and first reload triggered up to
 * three failed HEAD probes each (mp3, then ogg, then wav), all logged by
 * the browser as real network errors. Given synthesis is the intended
 * *permanent* implementation, not a stopgap, the fix is to stop probing for
 * files that were never meant to exist rather than to manufacture some.
 */
class VortexSynth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private warnedUnavailable = false;

  /** Bounds concurrent `shot()` bursts so sustained automatic fire (or any pathological caller) can never spawn unbounded Web Audio nodes. Generous relative to the Vortex's max ~900rpm (66ms/shot) — this exists as a hard safety cap, not a normal-play limiter. */
  private readonly shotVoices = new VoiceBudget(12);
  /** At most one reload jingle (three scheduled tones over ~370ms) plays at a time; a reload triggered while one is still sounding is dropped rather than layered. */
  private readonly reloadVoice = new SingleVoiceGuard();
  private reloadTimers: number[] = [];

  unlock(): void {
    this.ensure();
  }

  private ensure(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
        const length = this.ctx.sampleRate;
        this.noiseBuffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
        const data = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
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

  private noise(duration: number, filterFreq: number, peak: number, filterType: BiquadFilterType = 'bandpass'): void {
    const ctx = this.ensure();
    if (!ctx || !this.master || !this.noiseBuffer) return;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterFreq;
    filter.Q.value = 0.9;
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(peak, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    source.connect(filter).connect(gain).connect(this.master);
    source.start(now, Math.random());
    source.stop(now + duration + 0.02);
  }

  private tone(freq: number, duration: number, peak: number, type: OscillatorType = 'sine', glideTo?: number): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(freq, now);
    if (glideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(glideTo, 1), now + duration);
    gain.gain.setValueAtTime(peak, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  /** `spinUp` (0..1) — the turbine ramp progress at the moment of this shot; pitches the crack up slightly as it spins toward max rate. */
  shot(spinUp: number): void {
    if (!this.shotVoices.tryAcquire()) return; // at the hard concurrency cap -- drop silently, never throw or spam
    const pitch = 1 + spinUp * 0.35;
    const durationMs = 90; // covers both the 0.05s noise burst and the 0.07s tone, plus their 0.02s release tails
    this.noise(0.05, 2200 * pitch, 0.3);
    this.tone(160 * pitch, 0.07, 0.22, 'sawtooth', 90);
    window.setTimeout(() => this.shotVoices.release(), durationMs);
  }

  reload(): void {
    const token = this.reloadVoice.start();
    if (token === null) return; // a reload jingle is already sounding -- don't layer another
    this.clearReloadTimers();
    this.tone(480, 0.05, 0.16, 'square');
    this.reloadTimers.push(
      window.setTimeout(() => this.tone(360, 0.06, 0.16, 'square'), 140),
      window.setTimeout(() => this.tone(520, 0.05, 0.14, 'square'), 320),
      window.setTimeout(() => this.reloadVoice.stop(token), 370),
    );
  }

  private clearReloadTimers(): void {
    for (const id of this.reloadTimers) window.clearTimeout(id);
    this.reloadTimers = [];
  }

  dryFire(): void {
    this.tone(280, 0.04, 0.12, 'square');
  }

  impact(): void {
    this.tone(1700, 0.05, 0.15, 'triangle');
    this.noise(0.04, 3000, 0.1, 'highpass');
  }

  /** Turbine spin-down hum when the trigger releases before the ramp completes — otherwise the spin-up is inaudible on release. */
  spinDown(): void {
    this.tone(240, 0.18, 0.08, 'sine', 90);
  }

  debugState(): { contextState: AudioContextState | 'uninitialized'; shotVoices: number; shotVoiceCapacity: number; reloadActive: boolean } {
    return {
      contextState: this.ctx?.state ?? 'uninitialized',
      shotVoices: this.shotVoices.count,
      shotVoiceCapacity: this.shotVoices.capacity,
      reloadActive: this.reloadVoice.isActive,
    };
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
