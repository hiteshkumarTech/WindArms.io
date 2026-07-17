import { playAudioEvent } from '@/lib/v2/pipeline';

/**
 * Vortex Rifle audio. Real-file path first: tries the existing V2 pipeline
 * audio resolver (src/lib/v2/pipeline/audio.ts) so a future manifest entry
 * with real recorded/designed audio "just works" with zero changes here.
 * `playAudioEvent` resolves `false` when nothing's mapped — its own doc
 * comment says the caller should run its own procedural fallback, which is
 * exactly what this module is.
 *
 * The fallback is a genuine synthesis, not a stub: it copies the raw
 * Web-Audio noise()/tone()/envelope PRIMITIVES from v1's
 * src/lib/audio/audioEngine.ts (proven, zero-asset, already shipping) —
 * not the AudioEngine class itself, which is deliberately not reused here.
 * That class's SHOT_RECIPES table is typed `Record<WeaponId, ...>` against
 * v1's closed 7-weapon union (shared/protocol.ts); adding a `vortex` key
 * would mean widening a real, working v1 type, which is exactly the kind of
 * "architectural refactor not directly needed to unblock this task" the
 * brief says to avoid. A small synth scoped to this one weapon has no such
 * cost.
 */
class VortexSynth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  unlock(): void {
    this.ensure();
  }

  private ensure(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.5;
        this.master.connect(this.ctx.destination);
        const length = this.ctx.sampleRate;
        this.noiseBuffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
        const data = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
      } catch {
        return null;
      }
    }
    // See v1 AudioEngine's identical comment (stability-fixes round): resume()
    // is async and can't have settled by the next line — scheduling on a
    // still-suspended context is valid, so return it unconditionally.
    if (this.ctx.state === 'suspended') void this.ctx.resume();
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
    const pitch = 1 + spinUp * 0.35;
    this.noise(0.05, 2200 * pitch, 0.3);
    this.tone(160 * pitch, 0.07, 0.22, 'sawtooth', 90);
  }

  reload(): void {
    this.tone(480, 0.05, 0.16, 'square');
    window.setTimeout(() => this.tone(360, 0.06, 0.16, 'square'), 140);
    window.setTimeout(() => this.tone(520, 0.05, 0.14, 'square'), 320);
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
}

const synth = new VortexSynth();

export function unlockVortexAudio(): void {
  synth.unlock();
}

/**
 * `playAudioEvent` re-probes the network (mp3/ogg/wav) on every call when
 * nothing resolves — fine for a rare event, but at ~900rpm that's 3 failed
 * requests per shot. Cache the "nothing real exists for this event" result
 * locally (scoped to this module, not the shared pipeline resolver — a
 * negative cache belongs to a caller that knows its own call frequency, not
 * to a generic resolver every slot/event shares) so only the first shot of
 * a session ever probes; once a real audio manifest entry exists for
 * `vortex-rifle`, `playAudioEvent` starts returning `true` and this cache
 * simply never gets set for that event again.
 */
const knownMissing = new Set<string>();

function playWithFallback(event: string, synthFn: () => void): void {
  if (knownMissing.has(event)) {
    synthFn();
    return;
  }
  playAudioEvent('vortex-rifle', event)
    .then((playedReal) => {
      if (!playedReal) {
        knownMissing.add(event);
        synthFn();
      }
    })
    .catch(() => {
      knownMissing.add(event);
      synthFn();
    });
}

export function playVortexShot(spinUp: number): void {
  playWithFallback('fire', () => synth.shot(spinUp));
}

export function playVortexReload(): void {
  playWithFallback('reload', () => synth.reload());
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
