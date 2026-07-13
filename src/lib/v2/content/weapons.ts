import { WIND_WEAPONS, WIND_WEAPON_ORDER, type WindWeaponDef } from '@shared/windWeapons';

/**
 * Arsenal section content. Weapon data itself lives in
 * `shared/windWeapons.ts` (game-adoptable single source of truth) —
 * this file only adds landing-page presentation: headings and art slots.
 */

export const ARSENAL_HEADING = {
  eyebrow: 'ARSENAL',
  title: 'WIND-POWERED WEAPONRY',
  subtitle:
    'Every weapon channels the storm itself — mechanical, powerful, and satisfying. Pressure in, devastation out.',
} as const;

export interface WeaponCardContent {
  weapon: WindWeaponDef;
  /** Asset slot: public/v2-art/<slot>.(webp|png|jpg) */
  artSlot: string;
}

export const WEAPON_CARDS: WeaponCardContent[] = WIND_WEAPON_ORDER.map((id) => ({
  weapon: WIND_WEAPONS[id],
  artSlot: `weapon-${id}`,
}));

export const STAT_LABELS: Array<{ key: keyof WindWeaponDef['stats']; label: string }> = [
  { key: 'power', label: 'Power' },
  { key: 'rate', label: 'Rate' },
  { key: 'range', label: 'Range' },
  { key: 'mobility', label: 'Mobility' },
];
