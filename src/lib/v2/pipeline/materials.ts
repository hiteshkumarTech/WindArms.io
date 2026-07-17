import * as THREE from 'three';
import { STORM } from '@/lib/v2/tokens';

/**
 * Material-layer helpers for imported GLBs. Two jobs: (1) flag materials
 * whose base color doesn't trace to a `STORM` token, per the Art Bible's
 * "every color traces to a STORM token" rule — dev-only, non-blocking; (2)
 * apply the existing operator/weapon tint convention (a single accent-color
 * swap — see `shared/heroes.ts`'s `WeaponTint`/`HeroSkin`) to whichever
 * material an artist has named as the tintable "identity" material, so a
 * dropped-in GLB participates in the real, already-shipped tint system with
 * zero extra wiring.
 */

const STORM_HEXES = new Set(Object.values(STORM).map((hex) => hex.toLowerCase()));

/** Materials named to contain any of these (case-insensitive) are the tint target — matches the convention already implied by AeolusShowpiece.tsx's `energy` material role. */
const TINTABLE_NAME_HINTS = ['accent', 'energy', 'tint'];

export interface MaterialAudit {
  materialName: string;
  hex: string;
  matchesStormToken: boolean;
}

/** Dev-only: lists every unique material color in a scene and whether it's a known STORM token. Does not mutate anything. */
export function auditMaterials(scene: THREE.Object3D): MaterialAudit[] {
  const seen = new Map<string, MaterialAudit>();
  scene.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      const hex = `#${material.color.getHexString()}`;
      const key = material.name || hex;
      if (seen.has(key)) continue;
      seen.set(key, {
        materialName: material.name || '(unnamed)',
        hex,
        matchesStormToken: STORM_HEXES.has(hex.toLowerCase()),
      });
    }
  });
  return Array.from(seen.values());
}

/**
 * Applies an accent-color override to whichever material(s) match
 * `TINTABLE_NAME_HINTS`, in place. Mirrors `WeaponTint`/`HeroSkin`'s existing
 * "one accent color per skin" model — this is the GLB-model equivalent of
 * that same system, not a new tinting scheme.
 */
export function applyAccentTint(scene: THREE.Object3D, accentHex: string): void {
  const color = new THREE.Color(accentHex);
  scene.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      const name = material.name.toLowerCase();
      if (!TINTABLE_NAME_HINTS.some((hint) => name.includes(hint))) continue;
      if (material.emissive) {
        material.emissive.copy(color);
      } else {
        material.color.copy(color);
      }
    }
  });
}
