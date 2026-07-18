/**
 * Shared V2 combat damage contract (extracted from RangeTargets 2026-07-17,
 * Milestone 6). Anything hittable by VortexFireSystem's raycast carries this
 * on `userData` of its hit mesh; the fire system mutates hp/flash/destroyed
 * in place. Range targets AND Skyfront Trial drones both implement it —
 * one damage model, zero per-enemy weapon code.
 */
export interface TargetUserData {
  isTarget: boolean;
  hp: number;
  maxHp: number;
  hitFlashUntil: number;
  destroyedAt: number;
}

export function createTargetUserData(maxHp: number): TargetUserData {
  return { isTarget: true, hp: maxHp, maxHp, hitFlashUntil: 0, destroyedAt: 0 };
}
