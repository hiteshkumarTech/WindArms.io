import type { WeaponId } from './protocol';

/**
 * Weapon balance — shared verbatim by client (firing feel, HUD) and server
 * (damage, fire-rate enforcement) so they can never disagree.
 *
 * Balance philosophy: ~0.3–0.8 s time-to-kill at 100 HP inside each
 * weapon's effective range, with falloff pushing every weapon toward its
 * intended engagement distance.
 */

export interface WeaponVisual {
  /** Barrel/body length of the procedural viewmodel (m). */
  length: number;
  /** Body thickness multiplier. */
  bulk: number;
  accent: string;
}

export interface WeaponRecoil {
  /** Radians of view kick per shot. */
  vertical: number;
  horizontal: number;
}

export interface WeaponDef {
  id: WeaponId;
  name: string;
  /** Keyboard slot (Digit1–Digit7). */
  slot: number;
  damage: number;
  /** Projectiles per trigger pull (shotgun > 1). */
  pellets: number;
  fireRateRpm: number;
  /** Hold-to-fire when true; semi-auto otherwise. */
  auto: boolean;
  magSize: number;
  reloadTimeS: number;
  /** Base spread half-cone in degrees. */
  spreadDeg: number;
  /** Hard max hit distance (m). */
  range: number;
  falloffStart: number;
  falloffEnd: number;
  minDamageMultiplier: number;
  recoil: WeaponRecoil;
  tracerColor: string;
  visual: WeaponVisual;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pistol: {
    id: 'pistol',
    name: 'P-77 Sidearm',
    slot: 1,
    damage: 26,
    pellets: 1,
    fireRateRpm: 300,
    auto: false,
    magSize: 12,
    reloadTimeS: 1.2,
    spreadDeg: 0.9,
    range: 80,
    falloffStart: 20,
    falloffEnd: 45,
    minDamageMultiplier: 0.6,
    recoil: { vertical: 0.012, horizontal: 0.004 },
    tracerColor: '#9fe8ff',
    visual: { length: 0.3, bulk: 0.8, accent: '#00F5FF' },
  },
  smg: {
    id: 'smg',
    name: 'Vortex SMG',
    slot: 2,
    damage: 14,
    pellets: 1,
    fireRateRpm: 820,
    auto: true,
    magSize: 32,
    reloadTimeS: 1.6,
    spreadDeg: 1.8,
    range: 60,
    falloffStart: 14,
    falloffEnd: 30,
    minDamageMultiplier: 0.5,
    recoil: { vertical: 0.007, horizontal: 0.006 },
    tracerColor: '#00F5FF',
    visual: { length: 0.42, bulk: 0.9, accent: '#00F5FF' },
  },
  ar: {
    id: 'ar',
    name: 'Tempest AR',
    slot: 3,
    damage: 22,
    pellets: 1,
    fireRateRpm: 600,
    auto: true,
    magSize: 30,
    reloadTimeS: 1.9,
    spreadDeg: 1.1,
    range: 100,
    falloffStart: 25,
    falloffEnd: 50,
    minDamageMultiplier: 0.65,
    recoil: { vertical: 0.01, horizontal: 0.005 },
    tracerColor: '#ffd27f',
    visual: { length: 0.55, bulk: 1, accent: '#FF7A00' },
  },
  shotgun: {
    id: 'shotgun',
    name: 'Breaker 8',
    slot: 4,
    damage: 12,
    pellets: 8,
    fireRateRpm: 70,
    auto: false,
    magSize: 6,
    reloadTimeS: 2.4,
    spreadDeg: 5.5,
    range: 30,
    falloffStart: 6,
    falloffEnd: 18,
    minDamageMultiplier: 0.3,
    recoil: { vertical: 0.035, horizontal: 0.01 },
    tracerColor: '#ffb066',
    visual: { length: 0.5, bulk: 1.15, accent: '#FF7A00' },
  },
  sniper: {
    id: 'sniper',
    name: 'Longshot DMR',
    slot: 5,
    damage: 95,
    pellets: 1,
    fireRateRpm: 45,
    auto: false,
    magSize: 5,
    reloadTimeS: 2.6,
    spreadDeg: 0.1,
    range: 150,
    falloffStart: 150,
    falloffEnd: 151,
    minDamageMultiplier: 1,
    recoil: { vertical: 0.05, horizontal: 0.012 },
    tracerColor: '#d9c2ff',
    visual: { length: 0.72, bulk: 0.95, accent: '#7C5CFF' },
  },
  lmg: {
    id: 'lmg',
    name: 'Bulwark LMG',
    slot: 6,
    damage: 18,
    pellets: 1,
    fireRateRpm: 720,
    auto: true,
    magSize: 60,
    reloadTimeS: 3.2,
    spreadDeg: 2.2,
    range: 90,
    falloffStart: 20,
    falloffEnd: 45,
    minDamageMultiplier: 0.6,
    recoil: { vertical: 0.011, horizontal: 0.008 },
    tracerColor: '#ffe08a',
    visual: { length: 0.6, bulk: 1.25, accent: '#FF7A00' },
  },
  energy: {
    id: 'energy',
    name: 'Ion Lance',
    slot: 7,
    damage: 40,
    pellets: 1,
    fireRateRpm: 180,
    auto: false,
    magSize: 20,
    reloadTimeS: 2,
    spreadDeg: 0.4,
    range: 110,
    falloffStart: 35,
    falloffEnd: 70,
    minDamageMultiplier: 0.7,
    recoil: { vertical: 0.018, horizontal: 0.006 },
    tracerColor: '#b18cff',
    visual: { length: 0.58, bulk: 1.05, accent: '#7C5CFF' },
  },
};

export const WEAPON_ORDER: WeaponId[] = ['pistol', 'smg', 'ar', 'shotgun', 'sniper', 'lmg', 'energy'];

export const DEFAULT_WEAPON: WeaponId = 'ar';

export function isWeaponId(value: unknown): value is WeaponId {
  return typeof value === 'string' && value in WEAPONS;
}

export function fireIntervalMs(def: WeaponDef): number {
  return 60000 / def.fireRateRpm;
}

/** Head-zone damage multiplier (sniper one-shots heads). */
export function headshotMultiplier(id: WeaponId): number {
  return id === 'sniper' ? 2 : 1.75;
}

/** Linear damage falloff between falloffStart and falloffEnd. */
export function damageAtDistance(def: WeaponDef, distance: number): number {
  if (distance <= def.falloffStart) return def.damage;
  if (distance >= def.falloffEnd) return def.damage * def.minDamageMultiplier;
  const t = (distance - def.falloffStart) / (def.falloffEnd - def.falloffStart);
  return def.damage * (1 - t * (1 - def.minDamageMultiplier));
}
