import type { MatchPhase } from './types';

/**
 * Legal phase transitions — the single authority matchStore consults before
 * ANY phase change. Pure data + pure functions (unit-testable, mirrors the
 * project's movement.ts / vortexWeaponState.ts convention).
 *
 *   booting → ready → countdown → active ⇄ playerDead
 *                        ↑           ├→ victory / defeat → restarting → countdown
 *                        │           └⇄ paused (also reachable from playerDead)
 *                        └── restarting
 */
export const MATCH_TRANSITIONS: Record<MatchPhase, readonly MatchPhase[]> = {
  booting: ['ready'],
  ready: ['countdown'],
  countdown: ['active', 'paused', 'restarting'],
  active: ['playerDead', 'victory', 'defeat', 'paused', 'restarting'],
  playerDead: ['active', 'defeat', 'paused', 'restarting'],
  victory: ['restarting'],
  defeat: ['restarting'],
  // Resume returns to whichever phase was paused — matchStore records it.
  paused: ['countdown', 'active', 'playerDead', 'restarting'],
  restarting: ['countdown'],
};

export function canTransition(from: MatchPhase, to: MatchPhase): boolean {
  return MATCH_TRANSITIONS[from].includes(to);
}

/** Phases in which the weapon may fire / drones simulate / the match clock runs. */
export function isCombatPhase(phase: MatchPhase): boolean {
  return phase === 'active';
}

/** Phases in which the match clock keeps counting (timer continues through a normal respawn, per the brief). */
export function isClockRunning(phase: MatchPhase): boolean {
  return phase === 'active' || phase === 'playerDead';
}

/** Phases where the in-round HUD renders. */
export function isHudVisible(phase: MatchPhase): boolean {
  return phase === 'active' || phase === 'playerDead' || phase === 'countdown';
}
