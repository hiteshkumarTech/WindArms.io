import type { ClipName } from '@/lib/v2/pipeline';
import type { WindWeaponId } from '@shared/windWeapons';

/**
 * The VISUAL presentation layer for a weapon showpiece — deliberately
 * separate from `shared/windWeapons.ts` (gameplay metadata/stats, the
 * canonical source the future combat implementation adopts directly) and
 * from `src/lib/v2/pipeline/manifest.ts` (asset validation requirements).
 * This is "how does it present," not "what is it" or "is the asset valid."
 *
 * Runtime/architecture split this project now has for a weapon:
 *   Configuration/Statistics → shared/windWeapons.ts (WindWeaponDef)
 *   Asset validation         → src/lib/v2/pipeline/manifest.ts (AssetManifestEntry)
 *   Visual presentation      → this file (WeaponVisualConfig)
 *   Materials/tinting        → src/lib/v2/pipeline/materials.ts (applyAccentTint, reused not duplicated)
 *   Audio                    → src/lib/v2/pipeline/audio.ts (resolveAudio/playAudioEvent, reused not duplicated)
 *   Animation                → src/lib/v2/pipeline/animationClips.ts (extractAnimationClips, reused not duplicated)
 *   Effects (VFX) mounting   → src/components/three/pipeline/SocketAnchor.tsx (reused not duplicated)
 */
export interface WeaponVisualConfig {
  /** Pipeline manifest slot — see src/lib/v2/pipeline/manifest.ts. Must match a real ASSET_MANIFEST entry. */
  slot: string;
  /** Applied only to the loaded real model, never the procedural fallback — see PipelineModel's `scale` prop for why. */
  scale: number;
  /** Base three-quarter presentation angle (Y, radians) the silhouette reads clearest at. */
  rotationBaseY: number;
  /** How far presentation rotation oscillates from rotationBaseY, radians — small and bounded, never a full spin. */
  rotationOscillation: number;
  /** STORM token hex — rim/key light color, keeps the model from blending into the sky. */
  rimLightColor: string;
  rimLightIntensity: { base: number; pulseAmplitude: number };
  /** Local offset (relative to the weapon's own group, pre-scale) for the rim light. */
  rimLightOffset: [number, number, number];
  /** STORM token hex — the wind-core glow sprite's color. */
  glowColor: string;
  /** Local offset for the wind-core glow sprite. */
  glowOffset: [number, number, number];
  glowScale: number;

  // ---- Extension points below: real, typed, and read by WeaponShowpiece
  // today — just nothing populates them for Vortex Rifle yet, because the
  // underlying data doesn't exist (confirmed via tools/inspect-glb.mjs: 0
  // clips, 0 sockets on the current GLB). Populating these for a FUTURE
  // weapon that ships with real clips/sockets requires no component
  // changes — only a new WeaponVisualConfig entry.

  /** Clip WeaponShowpiece plays automatically while idle, if present on the loaded GLB. No-ops if the clip doesn't exist. */
  idleClip?: ClipName;
  /** Socket name WeaponShowpiece exposes for a consumer to mount muzzle VFX via SocketAnchor, if present on the loaded GLB. */
  muzzleSocket?: string;
}

/** Config for a weapon with no WeaponVisualConfig entry yet — same rim/glow treatment, generic angle, no clip/socket assumptions. Keeps WeaponShowpiece usable for a weapon before anyone writes its specific tuning. */
export const DEFAULT_WEAPON_VISUAL_CONFIG: Omit<WeaponVisualConfig, 'slot' | 'scale'> = {
  rotationBaseY: -0.55,
  rotationOscillation: 0.14,
  rimLightColor: '#4FC3FF',
  rimLightIntensity: { base: 2.2, pulseAmplitude: 1.4 },
  rimLightOffset: [-0.25, 0.35, -0.65],
  glowColor: '#4FC3FF',
  glowOffset: [0, 0.05, -0.15],
  glowScale: 0.22,
};

export type WeaponVisualConfigRegistry = Partial<Record<WindWeaponId, WeaponVisualConfig>>;
