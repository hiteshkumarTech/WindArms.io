'use client';

import { useEffect, useMemo, useState } from 'react';
import { useGLTF } from '@react-three/drei';
import { useGraphicsStore } from '@/stores/graphicsStore';
import { extractAnimationClips } from './animationClips';
import { getManifestEntry } from './manifest';
import { maxLodForQuality, resolveModel } from './modelResolver';
import { extractSockets } from './sockets';
import type { LodLevel, PipelineAssetResult } from './types';
import { logValidation, validateAsset } from './validation';

/**
 * Split into two hooks because of React's rules-of-hooks: whether a GLB
 * exists for a slot is only known asynchronously, but `useGLTF` (which
 * Suspends) can't be called conditionally. `useResolveModelSlot` is safe to
 * call unconditionally from any component every render; `useLoadedPipelineAsset`
 * must only be called from a component that mounts *after* a URL is known
 * non-null (see `PipelineModel.tsx`, which is the intended entry point for
 * most consumers — reach for these two hooks directly only if you need
 * layout control `PipelineModel` doesn't give you).
 */

export interface ResolvedModelSlot {
  url: string | null;
  lod: LodLevel | null;
  /** True while the initial resolve is still in flight — distinct from `url === null`, which also means "resolved, nothing found." */
  resolving: boolean;
}

export interface ResolveModelSlotOptions {
  /**
   * Force this exact LOD tier for this consumer, overriding the
   * quality-store-driven default — e.g. a first-person viewmodel that
   * always wants the lighter tier regardless of the player's render-quality
   * setting, independent of a landing-page showpiece using the same slot
   * at the heavier tier. Still goes through `resolveModel`'s normal
   * higher/lower fallback search if this exact tier's file doesn't exist,
   * so it degrades the same way the quality-driven path already does.
   */
  requestedLod?: LodLevel;
}

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Dev-only load timers, keyed by URL. Root-caused 2026-07-16 (Phase 4.1,
 * see docs/decisions.md): an earlier session concluded the real Vortex
 * Rifle GLB "never loads" after waiting only ~2-3s and seeing the fallback
 * — the asset was never broken, it just genuinely takes multiple seconds
 * (a real, expected consequence of 1.99M triangles, ~111x this project's
 * own weapon budget) and there was no signal distinguishing "no real asset
 * exists for this slot" from "a real asset is still loading" — both looked
 * identical: the fallback, in silence. This timer pair exists so that
 * distinction is never invisible again.
 */
const loadStartedAt = new Map<string, number>();

/**
 * Step 1: resolve which LOD tier's URL exists for this slot. Defaults to
 * the quality tier's preferred LOD; pass `requestedLod` to force a specific
 * tier for this call site instead (see `ResolveModelSlotOptions`) — two
 * consumers of the *same* slot can independently request different tiers
 * without a second manifest entry or a second slot. Safe to call
 * unconditionally.
 */
export function useResolveModelSlot(slot: string, options?: ResolveModelSlotOptions): ResolvedModelSlot {
  const quality = useGraphicsStore((state) => state.quality);
  const requestedLod = options?.requestedLod;
  const preferredLod = requestedLod ?? maxLodForQuality(quality);
  const [result, setResult] = useState<ResolvedModelSlot>({ url: null, lod: null, resolving: true });

  useEffect(() => {
    let cancelled = false;
    setResult((previous) => ({ ...previous, resolving: true }));
    if (isDev) console.info(`[asset-pipeline] "${slot}": resolving (${requestedLod !== undefined ? `requestedLod=${requestedLod}` : `quality=${quality}`})...`);
    void resolveModel(slot, preferredLod).then((resolved) => {
      if (cancelled) return;
      if (isDev) {
        if (resolved) {
          console.info(
            `[asset-pipeline] "${slot}": real asset found at lod${resolved.lod} (${resolved.url}) — starting load. Large assets can take several seconds; the fallback renders until this resolves, not because the asset is missing or broken.`,
          );
          // Separate from budget validation on purpose: `validateAsset` only
          // ever checks the RESOLVED tier against its own matching budget,
          // which it trivially passes by definition (that's what "resolved"
          // means) — it has no visibility into what this call site actually
          // asked for. A consumer that forced a specific tier (e.g. /v2/range
          // requesting lod1 for its lighter budget) but silently got a
          // different one back — most likely because the requested tier's
          // file is missing and resolveModel's higher/lower search kicked in
          // — needs its own signal; this is intentionally NOT a mismatch
          // check for the normal quality-driven path (no requestedLod), only
          // for a call site that asked for something specific and didn't get it.
          if (requestedLod !== undefined && resolved.lod !== requestedLod) {
            console.warn(
              `[asset-pipeline] "${slot}": requested lod${requestedLod} but resolved lod${resolved.lod} — the requested tier's file is likely missing. resolveModel's fallback search is intentional and still renders correctly, but this consumer is now paying a different tier's cost than it asked for.`,
            );
          }
          loadStartedAt.set(resolved.url, performance.now());
        } else {
          console.info(`[asset-pipeline] "${slot}": no real asset for any LOD tier — rendering the fallback permanently, this is expected until one is added.`);
        }
      }
      setResult({ url: resolved?.url ?? null, lod: resolved?.lod ?? null, resolving: false });
    });
    return () => {
      cancelled = true;
    };
  }, [slot, quality, requestedLod, preferredLod]);

  return result;
}

/**
 * Step 2: given a *known-resolved* URL, loads the GLB, extracts sockets and
 * animation clips, and runs dev-time validation against the slot's manifest
 * entry. Only call this from a component gated on a non-null URL (Suspense
 * boundary above it, per `PipelineModel.tsx`) — `useGLTF` suspends on first
 * load of a given URL.
 */
export function useLoadedPipelineAsset(slot: string, url: string, lod: LodLevel): PipelineAssetResult {
  const gltf = useGLTF(url);

  // This line only runs once useGLTF's Suspense has resolved — if a start
  // timestamp is missing (e.g. useGLTF.preload warmed the cache before this
  // component ever mounted), that's fine, there's just nothing to report.
  if (isDev) {
    const startedAt = loadStartedAt.get(url);
    if (startedAt !== undefined) {
      loadStartedAt.delete(url);
      console.info(`[asset-pipeline] "${slot}": real asset loaded and parsed in ${(performance.now() - startedAt).toFixed(0)}ms (${url}).`);
    }
  }

  const sockets = useMemo(() => extractSockets(gltf.scene), [gltf.scene]);
  const clips = useMemo(() => extractAnimationClips(gltf.animations), [gltf.animations]);

  const validation = useMemo(() => {
    if (process.env.NODE_ENV === 'production') return null;
    const entry = getManifestEntry(slot);
    if (!entry) {
      console.warn(`[asset-pipeline] "${slot}" has no manifest entry — add one to manifest.ts before shipping this asset.`);
      return null;
    }
    const result = validateAsset(entry, gltf.scene, sockets, clips, lod);
    logValidation(result);
    return result;
  }, [slot, gltf.scene, sockets, clips, lod]);

  return {
    scene: gltf.scene,
    sockets,
    clips,
    isReal: true,
    resolvedLod: lod,
    loading: false,
    validation,
  };
}

/** Preloads a slot's LOD-0 GLB ahead of when it's needed (e.g. a loadout screen preloading the next map's showpiece weapon). Fire-and-forget; safe to call outside React render. */
export function preloadAsset(slot: string): void {
  void resolveModel(slot, 0).then((resolved) => {
    if (resolved) useGLTF.preload(resolved.url);
  });
}
