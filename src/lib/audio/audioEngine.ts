import type { SurfaceKind } from '@shared/maps';
import type { Vec3, WeaponId } from '@shared/protocol';
import { localPose } from '@/lib/game/localPose';
import { useSettingsStore } from '@/stores/settingsStore';
import { clamp } from '@/lib/utils';

/**
 * Procedural SFX engine on raw Web Audio — every sound is synthesized
 * (noise bursts, filtered tones, envelopes), so the game ships zero audio
 * assets and nothing is copyrighted. The context is created lazily and
 * resumed on the first user gesture (autoplay policy); if the browser
 * refuses, playback fails silently and the game stays functional.
 */

interface ShotRecipe {
  /** Noise burst length (s). */
  duration: number;
  /** Bandpass center frequency for the crack. */
  filterFreq: number;
  /** Low "thump" oscillator frequency. */
  thumpFreq: number;
  gain: number;
}

const SHOT_RECIPES: Record<WeaponId, ShotRecipe> = {
  pistol: { duration: 0.11, filterFreq: 1600, thumpFreq: 130, gain: 0.5 },
  smg: { duration: 0.07, filterFreq: 2100, thumpFreq: 150, gain: 0.38 },
  ar: { duration: 0.12, filterFreq: 1400, thumpFreq: 120, gain: 0.5 },
  shotgun: { duration: 0.24, filterFreq: 700, thumpFreq: 80, gain: 0.7 },
  sniper: { duration: 0.3, filterFreq: 900, thumpFreq: 70, gain: 0.75 },
  lmg: { duration: 0.1, filterFreq: 1100, thumpFreq: 100, gain: 0.46 },
  energy: { duration: 0.16, filterFreq: 2400, thumpFreq: 220, gain: 0.5 },
};

const MAX_AUDIBLE_DISTANCE = 60;

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  /** Call from a user gesture (pointer-lock click) to satisfy autoplay policy. */
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

  private noise(
    duration: number,
    filterFreq: number,
    peak: number,
    pan = 0,
    filterType: BiquadFilterType = 'bandpass',
  ): void {
    const ctx = this.ensure();
    if (!ctx || !this.master || !this.noiseBuffer) return;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterFreq;
    filter.Q.value = 0.9;
    const gain = ctx.createGain();
    const panner = ctx.createStereoPanner();
    panner.pan.value = clamp(pan, -1, 1);
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(peak, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    source.connect(filter).connect(gain).connect(panner).connect(this.master);
    source.start(now, Math.random());
    source.stop(now + duration + 0.02);
  }

  private tone(
    freq: number,
    duration: number,
    peak: number,
    type: OscillatorType = 'sine',
    glideTo?: number,
    pan = 0,
  ): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    const gain = ctx.createGain();
    const panner = ctx.createStereoPanner();
    panner.pan.value = clamp(pan, -1, 1);
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(freq, now);
    if (glideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(glideTo, 1), now + duration);
    gain.gain.setValueAtTime(peak, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain).connect(panner).connect(this.master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  /** Stereo pan + distance attenuation relative to the local player's pose. */
  private spatialize(position: Vec3): { pan: number; attenuation: number } | null {
    const dx = position[0] - localPose.position[0];
    const dz = position[2] - localPose.position[2];
    const dist = Math.hypot(dx, dz);
    if (dist > MAX_AUDIBLE_DISTANCE) return null;
    // Angle of the source relative to the listener's facing direction.
    const sourceAngle = Math.atan2(dx, -dz);
    const relative = sourceAngle + localPose.yaw;
    return { pan: clamp(Math.sin(relative), -1, 1) * 0.8, attenuation: 1 - dist / MAX_AUDIBLE_DISTANCE };
  }

  shot(weapon: WeaponId): void {
    const recipe = SHOT_RECIPES[weapon];
    this.noise(recipe.duration, recipe.filterFreq, recipe.gain);
    this.tone(recipe.thumpFreq, recipe.duration * 1.4, recipe.gain * 0.7, 'sine', recipe.thumpFreq * 0.5);
    if (weapon === 'energy') this.tone(880, 0.14, 0.2, 'square', 240);
  }

  remoteShot(weapon: WeaponId, origin: Vec3): void {
    const spatial = this.spatialize(origin);
    if (!spatial) return;
    const recipe = SHOT_RECIPES[weapon];
    this.noise(recipe.duration, recipe.filterFreq * 0.8, recipe.gain * 0.55 * spatial.attenuation, spatial.pan);
    this.tone(
      recipe.thumpFreq,
      recipe.duration * 1.3,
      recipe.gain * 0.4 * spatial.attenuation,
      'sine',
      recipe.thumpFreq * 0.5,
      spatial.pan,
    );
  }

  /**
   * Bullet-impact SFX for the local shooter's own shots against world
   * geometry (never against players — that's `hitConfirm`'s job). Fires
   * instantly on the client raycast, ahead of the server's hit resolution,
   * since it's cosmetic and never implies damage.
   */
  impact(kind: SurfaceKind | 'energy'): void {
    switch (kind) {
      case 'metal':
        this.tone(1900, 0.05, 0.16, 'triangle');
        this.noise(0.04, 3200, 0.12, 0, 'highpass');
        break;
      case 'stone':
        this.noise(0.09, 480, 0.22, 0, 'lowpass');
        break;
      case 'snow':
        this.noise(0.11, 360, 0.15, 0, 'lowpass');
        break;
      case 'wood':
        this.noise(0.07, 900, 0.16, 0, 'bandpass');
        this.tone(220, 0.06, 0.12, 'triangle');
        break;
      case 'crystal':
        this.tone(2600, 0.08, 0.14, 'sine');
        this.noise(0.04, 4200, 0.1, 0, 'highpass');
        break;
      case 'energy':
        this.tone(1200, 0.09, 0.18, 'sawtooth', 300);
        break;
    }
  }

  hitConfirm(headshot = false): void {
    if (headshot) {
      this.tone(1760, 0.05, 0.26, 'triangle');
      this.tone(2350, 0.09, 0.18, 'sine');
    } else {
      this.tone(1320, 0.06, 0.22, 'triangle');
    }
  }

  /** Ascending arpeggio, longer/higher per streak tier (3/5/8). */
  streakStinger(tier: number): void {
    const notes = tier >= 8 ? [440, 554, 659, 880] : tier >= 5 ? [392, 494, 587] : [330, 415];
    notes.forEach((freq, index) => {
      window.setTimeout(() => this.tone(freq, 0.16, 0.24, 'square'), index * 90);
    });
  }

  multikillStinger(count: number): void {
    const base = 523 + count * 60;
    this.tone(base, 0.08, 0.22, 'triangle');
    window.setTimeout(() => this.tone(base * 1.5, 0.12, 0.22, 'triangle'), 90);
  }

  roundEnd(): void {
    [523, 659, 784].forEach((freq, index) => {
      window.setTimeout(() => this.tone(freq, 0.24, 0.2, 'sine'), index * 140);
    });
  }

  damaged(): void {
    this.noise(0.16, 300, 0.4, 0, 'lowpass');
    this.tone(160, 0.18, 0.3, 'sawtooth', 90);
  }

  death(position: Vec3 | null): void {
    let pan = 0;
    let attenuation = 1;
    if (position) {
      const spatial = this.spatialize(position);
      if (!spatial) return;
      pan = spatial.pan;
      attenuation = spatial.attenuation;
    }
    this.noise(0.5, 220, 0.6 * attenuation, pan, 'lowpass');
    this.tone(150, 0.5, 0.45 * attenuation, 'sine', 40, pan);
  }

  respawn(): void {
    this.tone(220, 0.28, 0.25, 'triangle', 660);
  }

  reload(): void {
    this.tone(520, 0.04, 0.16, 'square');
    window.setTimeout(() => this.tone(390, 0.05, 0.16, 'square'), 110);
  }

  dryFire(): void {
    this.tone(300, 0.04, 0.12, 'square');
  }

  jump(): void {
    this.noise(0.08, 500, 0.14, 0, 'highpass');
  }

  land(intensity: number): void {
    this.noise(0.12, 200, clamp(0.12 + intensity * 0.03, 0.12, 0.45), 0, 'lowpass');
  }

  footstep(): void {
    this.noise(0.05, 700, 0.09, 0, 'bandpass');
  }
}

/** Module singleton — imported by input systems and the network layer. */
export const audio = new AudioEngine();
