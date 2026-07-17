import { MODEL_EXTENSIONS, resolveAsset } from '@/lib/v2/assetResolver';
import type { GraphicsQuality } from '@/stores/graphicsStore';
import type { LodLevel } from './types';

/**
 * LOD- and audio-aware asset resolution, built directly on top of the
 * existing `resolveAsset` primitive in `@/lib/v2/assetResolver` — this file
 * does not reimplement probing/caching, only the WindArms LOD/audio naming
 * convention on top of it. See ./README.md for the full filename scheme.
 */

export const AUDIO_EXTENSIONS = ['mp3', 'ogg', 'wav'];

/** Highest LOD `useGraphicsStore`'s 2-tier quality signal permits requesting. 'low' never requests LOD 0 — no point paying the download for detail that'll be culled anyway. */
export function maxLodForQuality(quality: GraphicsQuality): LodLevel {
  return quality === 'low' ? 1 : 0;
}

/**
 * Resolves the best available model URL at or below `preferredLod`,
 * falling back toward the un-suffixed base slot (treated as LOD 0) if no
 * explicit `.lodN` file exists at any tier. Returns the URL and which tier
 * actually resolved, or null/null if nothing exists (caller renders its
 * procedural fallback).
 */
export async function resolveModel(
  slot: string,
  preferredLod: LodLevel,
): Promise<{ url: string; lod: LodLevel } | null> {
  for (let lod = preferredLod; lod <= 2; lod++) {
    const lodSlot = lod === 0 ? slot : `${slot}.lod${lod}`;
    const url = await resolveAsset(lodSlot, MODEL_EXTENSIONS);
    if (url) return { url, lod: lod as LodLevel };
  }
  // Nothing at or below the preferred tier — try higher-detail tiers than
  // requested rather than giving up (a LOD1-only drop-in should still render
  // for a 'high'-quality client that asked for LOD0).
  for (let lod = preferredLod - 1; lod >= 0; lod--) {
    const lodSlot = lod === 0 ? slot : `${slot}.lod${lod}`;
    const url = await resolveAsset(lodSlot, MODEL_EXTENSIONS);
    if (url) return { url, lod: lod as LodLevel };
  }
  return null;
}

/** Resolves real audio for one event on a slot, or null (caller falls back to `audioEngine`'s procedural synthesis for that event). */
export function resolveAudio(slot: string, event: string): Promise<string | null> {
  return resolveAsset(`${slot}.sfx-${event}`, AUDIO_EXTENSIONS);
}
