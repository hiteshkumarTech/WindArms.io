'use client';

import { useEffect, useState } from 'react';

/**
 * Asset resolution for `public/v2-art/`. Probes candidate files by
 * extension priority and caches the verdict for the session. Components
 * never know whether art exists — they render the resolved URL or their
 * procedural fallback. Dropping `aeolus.glb` into the folder upgrades the
 * showpiece with zero code changes; deleting it degrades gracefully.
 */

const BASE_PATH = '/v2-art';

const cache = new Map<string, Promise<string | null>>();

async function probe(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD', cache: 'force-cache' });
    return response.ok;
  } catch {
    return false;
  }
}

export function resolveAsset(slot: string, extensions: string[]): Promise<string | null> {
  const key = `${slot}|${extensions.join(',')}`;
  const existing = cache.get(key);
  if (existing) return existing;

  const lookup = (async () => {
    for (const extension of extensions) {
      const url = `${BASE_PATH}/${slot}.${extension}`;
      if (await probe(url)) return url;
    }
    return null;
  })();

  cache.set(key, lookup);
  return lookup;
}

export const IMAGE_EXTENSIONS = ['webp', 'png', 'jpg'];
export const MODEL_EXTENSIONS = ['glb'];

/**
 * Hook form: returns the resolved URL once probing completes, or null
 * (render the fallback). `slot: null` disables probing entirely.
 */
export function useResolvedAsset(slot: string | null, extensions: string[]): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!slot) return;
    let cancelled = false;
    void resolveAsset(slot, extensions).then((resolved) => {
      if (!cancelled && resolved) setUrl(resolved);
    });
    return () => {
      cancelled = true;
    };
    // extensions is stable per call site (module const arrays).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot]);

  return url;
}
