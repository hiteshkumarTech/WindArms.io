import { STORM } from '@/lib/v2/tokens';
import type { WindWeaponId } from '@shared/windWeapons';
import { DEFAULT_WEAPON_VISUAL_CONFIG, type WeaponVisualConfig, type WeaponVisualConfigRegistry } from './types';

/**
 * Registry of per-weapon visual presentation tuning. One real entry today
 * (`vortex`) — the values here are exactly what was hand-tuned and visually
 * verified in the 2026-07-16 cinematic composition pass (screenshot-checked
 * at 1600/1440/1024/390px), just moved out of AeolusShowpiece.tsx into a
 * reusable, weapon-keyed location so the NEXT weapon copies this shape
 * instead of duplicating the presentation logic.
 */
export const WEAPON_VISUAL_CONFIGS: WeaponVisualConfigRegistry = {
  vortex: {
    slot: 'vortex-rifle',
    // DISPLAY scale for the hero stage — not physical scale. Derivation
    // (2026-07-17 v0.2 integration pass, documented not guessed):
    // the hero composition was designed and screenshot-approved around the
    // ProceduralAeolus fallback, whose measured span is ~4.4 local units
    // × 0.78 internal group scale ≈ 3.43 m. The real v0.2 GLB's long axis
    // is exactly 1.000 m (builder-measured, X-long), so at the previous
    // physical scale (0.68 — blueprint's 68 cm ÷ 1.000 m axis, see
    // docs/design/weapons/vortex-rifle.md §5) it rendered ~5× smaller than
    // the stage was composed for: tiny and lost at the group's right-side
    // anchor. 2.9 presents the real rifle at ≈85% of the fallback's
    // approved footprint (2.9 m span) — hero-prop presence, still clearly
    // subordinate to the headline column on the left. Physical 0.68 m
    // stays the right number for physical contexts; the first-person
    // viewmodel already has its own independent scale (VortexViewmodel's
    // VIEWMODEL_SCALE).
    scale: 2.9,
    rotationBaseY: -0.55,
    rotationOscillation: 0.14,
    rimLightColor: STORM.energy,
    rimLightIntensity: { base: 2.2, pulseAmplitude: 1.4 },
    // Rim/glow offsets and glow size retuned proportionally (×4.26 =
    // 2.9/0.68) from the previously verified values — same relative
    // placement against the model's footprint. Verify on the next hero
    // screenshot; these are geometric rescales, not fresh eyeballing.
    rimLightOffset: [-1.05, 1.5, -2.75],
    glowColor: STORM.energy,
    glowOffset: [0, 0.2, -0.65],
    glowScale: 0.95,
    // No idleClip/muzzleSocket — the real GLB has neither (confirmed via
    // tools/inspect-glb.mjs). Left unset rather than pointed at a name that
    // doesn't exist, per "never add sockets/animations that do not exist."
  },
};

/** Looks up a weapon's visual config, falling back to a generic default (same rim/glow treatment, no clip/socket assumptions) so WeaponShowpiece is usable for a weapon nobody has tuned yet. */
export function getWeaponVisualConfig(id: WindWeaponId, slot: string): WeaponVisualConfig {
  return WEAPON_VISUAL_CONFIGS[id] ?? { ...DEFAULT_WEAPON_VISUAL_CONFIG, slot, scale: 1 };
}
