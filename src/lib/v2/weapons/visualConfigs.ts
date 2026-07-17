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
    // Computed, not guessed — see docs/design/weapons/vortex-rifle.md §5
    // and AeolusShowpiece.tsx's original derivation comment (preserved in
    // git history): GLB world-space longest axis 1.000 m ÷ blueprint's 68 cm
    // target = 0.68.
    scale: 0.68,
    rotationBaseY: -0.55,
    rotationOscillation: 0.14,
    rimLightColor: STORM.energy,
    rimLightIntensity: { base: 2.2, pulseAmplitude: 1.4 },
    rimLightOffset: [-0.25, 0.35, -0.65],
    glowColor: STORM.energy,
    glowOffset: [0, 0.05, -0.15],
    glowScale: 0.22,
    // No idleClip/muzzleSocket — the real GLB has neither (confirmed via
    // tools/inspect-glb.mjs). Left unset rather than pointed at a name that
    // doesn't exist, per "never add sockets/animations that do not exist."
  },
};

/** Looks up a weapon's visual config, falling back to a generic default (same rim/glow treatment, no clip/socket assumptions) so WeaponShowpiece is usable for a weapon nobody has tuned yet. */
export function getWeaponVisualConfig(id: WindWeaponId, slot: string): WeaponVisualConfig {
  return WEAPON_VISUAL_CONFIGS[id] ?? { ...DEFAULT_WEAPON_VISUAL_CONFIG, slot, scale: 1 };
}
