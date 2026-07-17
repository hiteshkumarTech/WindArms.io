import type * as THREE from 'three';
import type { AnimationClipMap, ClipName } from './types';

/**
 * Wraps a loaded GLB's `animations[]` array (from `useGLTF`) into a
 * name-keyed lookup. Clip names are matched by exact `AnimationClip.name`
 * (the name authored in the DCC tool / export — see README for the required
 * naming convention) case-insensitively, so "Fire", "fire" and "FIRE" all
 * resolve to `ClipName` "fire".
 *
 * This is a distinct capability from the existing procedural pose system
 * (`heroAnimator.ts`), which stays the default for the primitive-built hero
 * rig — this module exists for GLB-authored clips on real imported models,
 * driven through three's `AnimationMixer` by the consumer, not by this file
 * (extraction only — no mixer/playback state lives here).
 */
export function extractAnimationClips(clips: THREE.AnimationClip[]): AnimationClipMap {
  const byName = new Map<string, THREE.AnimationClip>();
  for (const clip of clips) {
    byName.set(clip.name.toLowerCase(), clip);
  }

  return {
    all: clips,
    get(name: ClipName | string) {
      return byName.get(name.toLowerCase());
    },
  };
}
