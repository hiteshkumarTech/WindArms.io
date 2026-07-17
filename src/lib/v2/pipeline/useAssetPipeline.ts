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

/** Step 1: resolve which LOD tier's URL exists for this slot, at the quality tier's preferred LOD. Safe to call unconditionally. */
export function useResolveModelSlot(slot: string): ResolvedModelSlot {
  const quality = useGraphicsStore((state) => state.quality);
  const [result, setResult] = useState<ResolvedModelSlot>({ url: null, lod: null, resolving: true });

  useEffect(() => {
    let cancelled = false;
    setResult((previous) => ({ ...previous, resolving: true }));
    if (isDev) console.info(`[asset-pipeline] "${slot}": resolving (quality=${quality})...`);
    void resolveModel(slot, maxLodForQuality(quality)).then((resolved) => {
      if (cancelled) return;
      if (isDev) {
        if (resolved) {
          console.info(
            `[asset-pipeline] "${slot}": real asset found at lod${resolved.lod} (${resolved.url}) — starting load. Large assets can take several seconds; the fallback renders until this resolves, not because the asset is missing or broken.`,
          );
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
  }, [slot, quality]);

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
    const result = validateAsset(entry, gltf.scene, sockets, clips);
    logValidation(result);
    return result;
  }, [slot, gltf.scene, sockets, clips]);

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
