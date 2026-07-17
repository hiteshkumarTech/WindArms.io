/**
 * Pure damage-falloff math — same linear-falloff shape as v1's
 * `shared/weapons.ts` `damageAtDistance` helper (not imported directly:
 * that one is typed against v1's `WeaponDef`, this against
 * `WindWeaponDef['gameplayStats']` — different shapes, same formula).
 */
export interface FalloffStats {
  damage: number;
  falloffStartM: number;
  falloffEndM: number;
  minDamageMultiplier: number;
}

export function damageAtDistance(distance: number, stats: FalloffStats): number {
  if (distance <= stats.falloffStartM) return stats.damage;
  if (distance >= stats.falloffEndM) return stats.damage * stats.minDamageMultiplier;
  const t = (distance - stats.falloffStartM) / (stats.falloffEndM - stats.falloffStartM);
  return stats.damage * (1 - t * (1 - stats.minDamageMultiplier));
}
