import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { createRng } from '@/lib/utils';

/**
 * A BoxGeometry with a baked-in per-face (plus a touch of per-vertex)
 * color-jitter attribute — breaks up flat single-color gray-box surfaces
 * using MeshStandardMaterial's built-in, fully-supported `vertexColors`
 * multiply (`diffuseColor.rgb *= vColor`), not a hand-patched shader.
 * BoxGeometry doesn't share vertices between faces (24 unique verts for a
 * 6-face box), so each face gets a clean, seamless jitter with no seams at
 * edges. Computed once at build time from a seed, never per-frame.
 */
export function buildVariedBoxGeometry(
  width: number,
  height: number,
  depth: number,
  seed: number,
  strength = 0.06,
): THREE.BoxGeometry {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const vertexCount = geometry.getAttribute('position').count;
  const colors = new Float32Array(vertexCount * 3);
  const rng = createRng(seed);
  // BoxGeometry lays out exactly 6 faces x 4 verts each, in a fixed order.
  for (let face = 0; face < 6; face++) {
    const faceJitter = 1 + (rng() - 0.5) * strength * 2;
    for (let v = 0; v < 4; v++) {
      const i = face * 4 + v;
      const vertexJitter = 1 + (rng() - 0.5) * strength;
      const value = faceJitter * vertexJitter;
      colors[i * 3] = value;
      colors[i * 3 + 1] = value;
      colors[i * 3 + 2] = value;
    }
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

interface VariedBox {
  size: [number, number, number];
}

/**
 * Builds one varied geometry per box, memoized and disposed as a unit.
 * Must be called at a component's top level (it's a hook), never inside a
 * `.map()` callback — see TestArena.tsx for the call sites, one per role.
 */
export function useVariedBoxGeometries(
  boxes: readonly VariedBox[],
  seedBase: number,
  strength = 0.06,
): THREE.BoxGeometry[] {
  const geometries = useMemo(
    () => boxes.map((box, i) => buildVariedBoxGeometry(box.size[0], box.size[1], box.size[2], seedBase + i * 97, strength)),
    [boxes, seedBase, strength],
  );
  useEffect(() => () => geometries.forEach((g) => g.dispose()), [geometries]);
  return geometries;
}
