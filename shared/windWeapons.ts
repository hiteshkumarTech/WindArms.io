/**
 * WindArms V2 — wind-powered arsenal, single source of truth.
 *
 * Consumed today by the V2 landing page (cards, stats, copy). Designed so
 * the game itself adopts this exact config when the V2 combat phase lands:
 * ids become weapon ids, `stats` seed the balance pass, `accent` drives
 * tracers/materials. Do not fork this data into the landing layer.
 */

export type WindWeaponId = 'aeolus' | 'vortex' | 'tempest' | 'gust';

export type WindWeaponClass = 'rifle' | 'carbine' | 'cannon' | 'blade';

export interface WindWeaponDef {
  id: WindWeaponId;
  name: string;
  weaponClass: WindWeaponClass;
  /** Board copy — the canonical one-line description. */
  description: string;
  /** Signature mechanic called out on cards and, later, in-game. */
  mechanic: string;
  /**
   * Design-target stats, 0..1. Presentation now; the future combat
   * implementation derives real numbers from these ratios.
   */
  stats: {
    power: number;
    rate: number;
    range: number;
    mobility: number;
  };
  /** Identity color (tracers, card glow, material accents). */
  accent: string;
}

export const WIND_WEAPONS: Record<WindWeaponId, WindWeaponDef> = {
  aeolus: {
    id: 'aeolus',
    name: 'Aeolus Rifle',
    weaponClass: 'rifle',
    description: 'High-velocity kinetic rounds powered by compressed wind.',
    mechanic: 'Precision spine — tightens while aimed',
    stats: { power: 0.72, rate: 0.55, range: 0.85, mobility: 0.55 },
    accent: '#4FC3FF',
  },
  vortex: {
    id: 'vortex',
    name: 'Vortex Carbine',
    weaponClass: 'carbine',
    description: 'Rapid-fire turbine driven projectiles.',
    mechanic: 'Turbine spin-up — rate climbs as you hold',
    stats: { power: 0.45, rate: 0.92, range: 0.55, mobility: 0.8 },
    accent: '#58B7E6',
  },
  tempest: {
    id: 'tempest',
    name: 'Tempest Cannon',
    weaponClass: 'cannon',
    description: 'Charges wind pressure for devastating explosive bursts.',
    mechanic: 'Charge & release — pressure decides the blast',
    stats: { power: 0.95, rate: 0.2, range: 0.65, mobility: 0.35 },
    accent: '#E3A23C',
  },
  gust: {
    id: 'gust',
    name: 'Gust Blade',
    weaponClass: 'blade',
    description: 'Wind-channeled blade that cuts with compressed force.',
    mechanic: 'Dash-strike — momentum feeds the edge',
    stats: { power: 0.8, rate: 0.7, range: 0.15, mobility: 1 },
    accent: '#EDEAE3',
  },
};

export const WIND_WEAPON_ORDER: WindWeaponId[] = ['aeolus', 'vortex', 'tempest', 'gust'];
