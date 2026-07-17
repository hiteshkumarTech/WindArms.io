import { resolveAudio } from './modelResolver';

/**
 * Real-audio-file playback for pipeline slots. Deliberately NOT built on
 * top of the existing `AudioEngine` singleton (`@/lib/audio/audioEngine.ts`)
 * — that engine's public API (`shot(weapon: WeaponId)`, `SHOT_RECIPES`) is
 * closed over v1's fixed 7-weapon union and is 100% procedural synthesis by
 * design; opening it up to arbitrary v2 slot strings would mean modifying a
 * real, working v1 system, which is out of scope for "build the reusable
 * foundation first."
 *
 * This module only answers "does real audio exist for this slot+event, and
 * if so, play it" — procedural *fallback* synthesis for a specific new
 * weapon (matching AudioEngine's noise/tone recipe pattern) is that
 * weapon's own implementation work, not this pipeline's.
 */

export interface PlayOptions {
  volume?: number;
  pan?: number;
}

const elementCache = new Map<string, HTMLAudioElement>();

/** Plays a resolved audio URL via a plain <audio> element — decoupled from AudioEngine's AudioContext/master gain graph on purpose (see file header). */
export function playResolvedAudio(url: string, options: PlayOptions = {}): void {
  if (typeof window === 'undefined') return;
  let element = elementCache.get(url);
  if (!element) {
    element = new Audio(url);
    elementCache.set(url, element);
  }
  element.volume = Math.min(1, Math.max(0, options.volume ?? 1));
  // Stereo pan on a plain element needs a MediaElementAudioSourceNode/StereoPannerNode,
  // which would pull this into AudioEngine's context — out of scope here (see header).
  // Reset + replay so rapid repeat triggers (e.g. an automatic weapon) don't queue.
  element.currentTime = 0;
  void element.play().catch(() => {
    // Autoplay-policy or decode failure — fail silently, matching this
    // project's existing audio-failure convention (AudioEngine.ensure()).
  });
}

/** Resolves and plays real audio for one event on a slot; returns whether real audio was found (false ⇒ caller should run its own procedural fallback for this event). */
export async function playAudioEvent(slot: string, event: string, options?: PlayOptions): Promise<boolean> {
  const url = await resolveAudio(slot, event);
  if (!url) return false;
  playResolvedAudio(url, options);
  return true;
}
