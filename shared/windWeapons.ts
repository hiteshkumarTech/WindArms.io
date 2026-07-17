/**
 * WindArms V2 — wind-powered arsenal, single source of truth.
 *
 * Consumed today by the V2 landing page (cards, stats, copy). Designed so
 * the game itself adopts this exact config when the V2 combat phase lands:
 * ids become weapon ids, `stats` seed the balance pass, `accent` drives
 * tracers/materials. Do not fork this data into the landing layer.
 *
 * NAMING RESOLVED 2026-07-16 (see docs/decisions.md): `vortex` was "Vortex
 * Carbine" — renamed to "Vortex Rifle" per explicit user direction declaring
 * it the project's flagship weapon, matching the real production blueprint
 * (docs/design/weapons/vortex-rifle.md) and the real integrated GLB
 * (public/v2-art/vortex-rifle.glb). This does not touch `aeolus` — Kael
 * Aurin's signature weapon is unaffected. `docs/gameplay/operators.md` still
 * describes Veyra Solace's signature weapon as "Vortex Carbine" — that's now
 * stale and needs a follow-up pass, not resolved by this change.
 */

export type WindWeaponId = 'aeolus' | 'vortex' | 'tempest' | 'gust';

export type WindWeaponClass = 'rifle' | 'carbine' | 'cannon' | 'blade';

/** How the weapon is actually triggered — extension point, only populated where a real production blueprint states it. */
export type WeaponFireMode = 'semi' | 'auto' | 'charge' | 'melee';

/** Matches `WeaponFrame` in shared/weapons.ts (v1) — 'kinetic' vs 'energy' — so the two systems agree on this axis if V2 combat ever reuses v1 patterns. */
export type WeaponElement = 'kinetic' | 'energy' | 'wind';

/**
 * Real, blueprint-grounded gameplay numbers — distinct from `stats` above
 * (0..1 marketing-card ratios). Populated only where a real production
 * blueprint actually states a value; NOT invented balance numbers. Absence
 * of a field means "not yet decided," not zero.
 */
export interface WeaponGameplayStats {
  /** Not yet decided for any weapon — real balance work happens once V2 combat exists, see shared/weapons.ts's v1 damage philosophy for precedent. */
  damage?: number;
  /**
   * For a weapon whose `mechanic` describes a spin-up (Vortex Rifle: "rate
   * climbs as you hold"), this is the STEADY-STATE rate once fully spun up.
   * See `rpmSpinUpFrom`/`rpmSpinUpTimeS` for the ramp. Otherwise the flat rate.
   */
  rpm?: number;
  /** Spin-up starting RPM (Vortex Rifle only today) — undefined ⇒ no ramp, `rpm` applies immediately. */
  rpmSpinUpFrom?: number;
  /** Seconds of sustained trigger hold to go from `rpmSpinUpFrom` to `rpm`. */
  rpmSpinUpTimeS?: number;
  reloadTimeS?: number;
  magSize?: number;
  effectiveRangeM?: number;
  /** 0..1. */
  accuracy?: number;
  /** Hip-fire spread half-cone, degrees. */
  spreadDeg?: number;
  /** Multiplier applied to `spreadDeg` while aiming down sights. */
  adsSpreadMultiplier?: number;
  /** Hard raycast distance (m) — beyond this, no hit is possible regardless of falloff. */
  rangeM?: number;
  /** Distance (m) at which damage falloff begins. */
  falloffStartM?: number;
  /** Distance (m) at which damage reaches `minDamageMultiplier` and stops dropping further. */
  falloffEndM?: number;
  /** Damage multiplier floor at/beyond `falloffEndM`. */
  minDamageMultiplier?: number;
  /** View-kick per shot, radians — matches shared/weapons.ts's `WeaponRecoil` shape. */
  recoilVertical?: number;
  recoilHorizontal?: number;
}

/**
 * Tier system extension point — no rarity/tier design exists anywhere in
 * WindArms yet (checked: not in any doc). Left as a type, not a decision.
 */
export type WeaponRarity = 'standard' | 'rare' | 'epic' | 'legendary';

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

  // ---- Extension fields below: optional, only populated where a real
  // source (a written production blueprint) exists. Undefined ≠ "empty" —
  // it means nobody has decided yet, which the UI must be able to represent
  // (e.g. render "TBD" or hide the row), not silently show 0/"".

  manufacturer?: string;
  ammoType?: string;
  fireMode?: WeaponFireMode;
  element?: WeaponElement;
  gameplayStats?: WeaponGameplayStats;
  /** Short in-world lore hook, not the full blueprint. */
  lore?: string;
  /** Category names, not concrete attachment ids — no attachment system exists yet. */
  attachmentSlots?: string[];
  skinCompatible?: boolean;
  /** Unset — no rarity/tier design exists yet, see WeaponRarity's own note. */
  rarity?: WeaponRarity;
  /** Path to the full production blueprint doc, if one exists. */
  blueprintDoc?: string;
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
    name: 'Vortex Rifle',
    weaponClass: 'rifle',
    description: 'Rapid-fire turbine driven projectiles.',
    mechanic: 'Turbine spin-up — rate climbs as you hold',
    stats: { power: 0.45, rate: 0.92, range: 0.55, mobility: 0.8 },
    accent: '#58B7E6',
    manufacturer: 'Windforge Armory',
    ammoType: 'Kinetic slug, compressed-air propelled',
    fireMode: 'auto',
    element: 'kinetic',
    gameplayStats: {
      // reloadTimeS and magSize are blueprint-stated. Everything else below
      // is FIRST-PASS balance derived from `stats` (0..1 design-target
      // ratios, already real) calibrated against v1's real automatic-weapon
      // numbers (shared/weapons.ts: smg 820rpm/14dmg/32mag, ar 600rpm/22dmg/30mag,
      // lmg 720rpm/18dmg/60mag) — not invented from nothing, but also not a
      // final balance pass; see docs/decisions.md 2026-07-16 (Phase 4).
      // rate:0.92 (near-max) → fast; power:0.45 (below AR) → low per-shot
      // damage; mobility:0.8 → light, spray-profile weapon, smg-adjacent.
      damage: 15,
      // "Turbine spin-up — rate climbs as you hold": implemented literally,
      // not just flavor text — see src/components/three/range/VortexFireSystem.tsx.
      rpm: 900,
      rpmSpinUpFrom: 480,
      rpmSpinUpTimeS: 0.7,
      reloadTimeS: 2.2,
      magSize: 30,
      // range:0.55 (mid-pack) → shorter effective range than the AR, longer than the SMG.
      effectiveRangeM: 45,
      rangeM: 60,
      falloffStartM: 16,
      falloffEndM: 34,
      minDamageMultiplier: 0.55,
      accuracy: 0.6,
      spreadDeg: 2.1,
      adsSpreadMultiplier: 0.4,
      // Fast-firing + high mobility → modest per-shot kick, mostly horizontal (turbine wobble).
      recoilVertical: 0.0062,
      recoilHorizontal: 0.0075,
    },
    lore: "Descends from a compact turbine-driven maintenance tool used by the engineers who built the Wind Temples, adapted into a weapon once the first territorial conflicts began.",
    attachmentSlots: ['scope', 'suppressor', 'magazine', 'stock', 'grip', 'barrel', 'energyModule'],
    skinCompatible: true,
    blueprintDoc: 'docs/design/weapons/vortex-rifle.md',
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
