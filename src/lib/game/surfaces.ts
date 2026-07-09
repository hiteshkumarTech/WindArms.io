import type * as THREE from 'three';
import type { SurfaceKind } from '@shared/maps';

export type { SurfaceKind };

export interface ImpactStyle {
  color: string;
  /** Relative to the default spark size (1 = unchanged). */
  scale: number;
  /** Lifetime in ms (the default spark uses 160). */
  life: number;
}

export const SURFACE_IMPACT: Record<SurfaceKind, ImpactStyle> = {
  metal: { color: '#eaf6ff', scale: 0.85, life: 140 },
  stone: { color: '#b7c2b0', scale: 1.55, life: 250 },
  snow: { color: '#ffffff', scale: 1.85, life: 300 },
  wood: { color: '#c68a4e', scale: 1.15, life: 190 },
  crystal: { color: '#bfe8ff', scale: 0.95, life: 170 },
};

/** Stylized energy-weapon hit — overrides surface styling entirely. */
export const ENERGY_IMPACT: ImpactStyle = { color: '#d8c4ff', scale: 2.1, life: 260 };

/**
 * Walks an intersected object's ancestor chain for a tagged surface or the
 * player-rig marker. Meshes are tagged directly (`TestArena`) or inherit the
 * tag from a parent group (`HeroRig`'s body root), so the walk covers both.
 */
export function surfaceOf(object: THREE.Object3D): SurfaceKind | 'player' | null {
  let node: THREE.Object3D | null = object;
  while (node) {
    const data = node.userData as { surface?: SurfaceKind; isPlayer?: boolean };
    if (data.surface) return data.surface;
    if (data.isPlayer) return 'player';
    node = node.parent;
  }
  return null;
}
