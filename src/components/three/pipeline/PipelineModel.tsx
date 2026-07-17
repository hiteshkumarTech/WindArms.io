'use client';

import { Suspense, useEffect, type ReactNode } from 'react';
import { applyAccentTint } from '@/lib/v2/pipeline/materials';
import type { LodLevel, PipelineAssetResult } from '@/lib/v2/pipeline/types';
import { useLoadedPipelineAsset, useResolveModelSlot } from '@/lib/v2/pipeline/useAssetPipeline';

/**
 * The drop-in entry point for the asset pipeline — mirrors the exact
 * resolve-or-fallback pattern already proven in `AeolusShowpiece.tsx`,
 * generalized to any slot and extended with sockets/clips/validation.
 *
 * Usage:
 *   <PipelineModel slot="vortex-rifle" fallback={<ProceduralVortexRifle />} onReady={(r) => (weaponRef.current = r)} />
 *
 * Renders `fallback` immediately if no GLB exists for the slot at any LOD,
 * and while the initial resolve is in flight — so a procedural placeholder
 * never flashes empty. Once a GLB resolves, it Suspends on `fallback` again
 * for the (usually brief) parse time, then swaps to the real model.
 */
export interface PipelineModelProps {
  slot: string;
  fallback: ReactNode;
  /** Applied to whichever material is named as this asset's tintable "identity" material — see materials.ts. */
  accentTint?: string;
  /**
   * Uniform or per-axis scale applied ONLY to the loaded real model, never to
   * `fallback` — raw source scale is whatever the DCC/generation tool
   * exported (rarely this project's real-world-meters convention), while a
   * caller's procedural fallback is already sized correctly on its own.
   * Wrapping both under one shared scale would silently resize the fallback
   * too. Omit for 1:1 scale (rare — most real assets need this set).
   */
  scale?: number | [number, number, number];
  /** Fired once, after the real model loads and sockets/clips/validation are available. Not called at all if the slot has no GLB (fallback stays procedural forever). */
  onReady?: (result: PipelineAssetResult) => void;
  /**
   * Force a specific LOD tier for this call site, overriding the
   * quality-driven default — e.g. a first-person viewmodel that always
   * wants the lighter tier regardless of the global render-quality
   * setting, independent of another consumer (a hero showpiece, say)
   * using the same `slot` at a heavier tier. See `useResolveModelSlot`'s
   * `ResolveModelSlotOptions`.
   */
  requestedLod?: LodLevel;
}

function LoadedModel({
  slot,
  url,
  lod,
  accentTint,
  scale,
  onReady,
}: {
  slot: string;
  url: string;
  lod: LodLevel;
  accentTint?: string;
  scale?: number | [number, number, number];
  onReady?: (result: PipelineAssetResult) => void;
}) {
  const result = useLoadedPipelineAsset(slot, url, lod);

  useEffect(() => {
    if (accentTint && result.scene) applyAccentTint(result.scene, accentTint);
  }, [result.scene, accentTint]);

  useEffect(() => {
    onReady?.(result);
    // Intentionally excluding `onReady`/`result` from deps beyond `result.scene` —
    // this should fire once per load, not on every validation-object identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.scene]);

  // useLoadedPipelineAsset always populates `scene` from a successfully-loaded
  // gltf — this null-check is purely to satisfy PipelineAssetResult's general
  // shape (other, not-yet-loaded states of that type do allow null).
  if (!result.scene) return null;
  return (
    <group scale={scale}>
      <primitive object={result.scene} />
    </group>
  );
}

export default function PipelineModel({ slot, fallback, accentTint, scale, onReady, requestedLod }: PipelineModelProps) {
  const { url, lod, resolving } = useResolveModelSlot(slot, { requestedLod });

  if (resolving || !url || lod === null) {
    return <>{fallback}</>;
  }

  return (
    <Suspense fallback={fallback}>
      <LoadedModel slot={slot} url={url} lod={lod} accentTint={accentTint} scale={scale} onReady={onReady} />
    </Suspense>
  );
}
