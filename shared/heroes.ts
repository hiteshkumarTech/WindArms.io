/**
 * Hero appearance catalog — silhouettes, accent skins and a deterministic
 * per-player picker. Pure data with no engine dependencies, so it is shared
 * verbatim by the client (rig rendering + the future loadout UI) and the
 * server (equip validation in a later milestone), exactly like weapons.ts
 * and maps.ts.
 *
 * Phase 9.3 uses `pickHeroAppearance(id)` to give every remote player a
 * stable, distinct look with zero protocol changes — the rig is driven
 * purely by the already-replicated pose. Phase 9.6 (F8, cosmetic loadout)
 * will swap that call for the player's replicated `equippedHeroSkin` via
 * `appearanceForSkin`, reusing this same catalog and the `unlockLevel`
 * gates. The Prisma `equippedHeroSkin` default ("gale_cyan") is one of the
 * ids below by design.
 */

export type SilhouetteId = 'gale' | 'bastion';

export interface Silhouette {
  id: SilhouetteId;
  name: string;
  /** Overall vertical scale of the rig. */
  heightScale: number;
  /** Limb/torso thickness multiplier. */
  build: number;
  /** Half-distance between the shoulders (m). */
  shoulderWidth: number;
  /** Half-distance between the hips (m). */
  hipWidth: number;
}

export const SILHOUETTES: Record<SilhouetteId, Silhouette> = {
  gale: { id: 'gale', name: 'Gale', heightScale: 1.0, build: 0.86, shoulderWidth: 0.19, hipWidth: 0.12 },
  bastion: { id: 'bastion', name: 'Bastion', heightScale: 1.05, build: 1.24, shoulderWidth: 0.26, hipWidth: 0.15 },
};

export interface HeroSkin {
  id: string;
  name: string;
  silhouette: SilhouetteId;
  /** Armor / body base color. */
  primary: string;
  /** Secondary panel color (limbs, pelvis). */
  secondary: string;
  /** Emissive accent — visor and trim; drives 40 m readability. */
  accent: string;
  /** Account level required to equip (F8, milestone 9.6). 0 = always free. */
  unlockLevel: number;
}

/**
 * Six accent skins, three per silhouette. Ids encode silhouette + accent so
 * a single persisted `equippedHeroSkin` string fully describes a look.
 */
export const HERO_SKINS: readonly HeroSkin[] = [
  { id: 'gale_cyan', name: 'Gale · Cyan', silhouette: 'gale', primary: '#1a2530', secondary: '#0e1620', accent: '#00F5FF', unlockLevel: 0 },
  { id: 'gale_violet', name: 'Gale · Violet', silhouette: 'gale', primary: '#211a30', secondary: '#130e20', accent: '#7C5CFF', unlockLevel: 5 },
  { id: 'gale_rose', name: 'Gale · Rose', silhouette: 'gale', primary: '#2b1922', secondary: '#1c0f16', accent: '#f472b6', unlockLevel: 12 },
  { id: 'bastion_ember', name: 'Bastion · Ember', silhouette: 'bastion', primary: '#2a1d14', secondary: '#1a1009', accent: '#FF7A00', unlockLevel: 0 },
  { id: 'bastion_jade', name: 'Bastion · Jade', silhouette: 'bastion', primary: '#152a20', secondary: '#0c1a14', accent: '#34d399', unlockLevel: 8 },
  { id: 'bastion_gold', name: 'Bastion · Gold', silhouette: 'bastion', primary: '#2a2414', secondary: '#1a1609', accent: '#ffd27f', unlockLevel: 18 },
] as const;

const HERO_SKINS_BY_ID: Record<string, HeroSkin> = Object.fromEntries(
  HERO_SKINS.map((skin): [string, HeroSkin] => [skin.id, skin]),
);

/** Schema default — the first free Gale skin. Matches Prisma's column default. */
export const DEFAULT_HERO_SKIN_ID = 'gale_cyan';

/** Resolve a skin id to its definition, falling back to the default. */
export function heroSkinById(id: string): HeroSkin {
  return HERO_SKINS_BY_ID[id] ?? HERO_SKINS_BY_ID[DEFAULT_HERO_SKIN_ID];
}

/** True when `id` is a real, equippable skin — used by the 9.6 equip whitelist. */
export function isHeroSkinId(id: unknown): id is string {
  return typeof id === 'string' && id in HERO_SKINS_BY_ID;
}

/** Skins a given account level is allowed to equip (F8 unlock gate). */
export function unlockedSkins(level: number): HeroSkin[] {
  return HERO_SKINS.filter((skin) => level >= skin.unlockLevel);
}

export interface HeroAppearance {
  silhouette: Silhouette;
  skin: HeroSkin;
}

/**
 * Stable 32-bit string hash (FNV-1a) for deterministic per-id selection.
 * `Math.imul` keeps the multiply in 32-bit space across engines.
 */
function hashId(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Deterministic look for a player id: the same id always yields the same
 * skin, so a remote player renders identically on every client with no
 * replicated cosmetic data. Replaced by the equipped skin in 9.6.
 */
export function pickHeroAppearance(id: string): HeroAppearance {
  const skin = HERO_SKINS[hashId(id) % HERO_SKINS.length];
  return { silhouette: SILHOUETTES[skin.silhouette], skin };
}

/** Concrete appearance from an equipped skin id — the 9.6 replication path. */
export function appearanceForSkin(skinId: string): HeroAppearance {
  const skin = heroSkinById(skinId);
  return { silhouette: SILHOUETTES[skin.silhouette], skin };
}

export interface WeaponTint {
  id: string;
  name: string;
  /** Accent color applied to the weapon (viewmodel + held rig weapon). */
  color: string;
  /** Account level required to equip. 0 = always free. */
  unlockLevel: number;
}

/** Weapon accent tints, level-gated like skins. `default` matches the schema. */
export const WEAPON_TINTS: readonly WeaponTint[] = [
  { id: 'default', name: 'Standard', color: '#00F5FF', unlockLevel: 0 },
  { id: 'ember', name: 'Ember', color: '#FF7A00', unlockLevel: 3 },
  { id: 'violet', name: 'Violet', color: '#7C5CFF', unlockLevel: 7 },
  { id: 'jade', name: 'Jade', color: '#34d399', unlockLevel: 11 },
  { id: 'rose', name: 'Rose', color: '#f472b6', unlockLevel: 15 },
  { id: 'gold', name: 'Gold', color: '#ffd27f', unlockLevel: 20 },
] as const;

const WEAPON_TINTS_BY_ID: Record<string, WeaponTint> = Object.fromEntries(
  WEAPON_TINTS.map((tint): [string, WeaponTint] => [tint.id, tint]),
);

/** Schema default — the free Standard tint. */
export const DEFAULT_TINT_ID = 'default';

export function weaponTintById(id: string): WeaponTint {
  return WEAPON_TINTS_BY_ID[id] ?? WEAPON_TINTS_BY_ID[DEFAULT_TINT_ID];
}

/** True when `id` is a real, equippable tint — used by the equip whitelist. */
export function isWeaponTintId(id: unknown): id is string {
  return typeof id === 'string' && id in WEAPON_TINTS_BY_ID;
}

/** Tints a given account level is allowed to equip. */
export function unlockedTints(level: number): WeaponTint[] {
  return WEAPON_TINTS.filter((tint) => level >= tint.unlockLevel);
}
