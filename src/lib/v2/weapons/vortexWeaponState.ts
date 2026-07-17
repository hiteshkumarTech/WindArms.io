/**
 * Pure weapon animation-state resolver — no Zustand, no React, no THREE.
 * Mirrors the project's existing convention (src/lib/game/movement.ts) of
 * keeping simulation logic as plain, unit-testable functions separate from
 * the store/component layer that drives them.
 *
 * The requested state list (Idle → Walk → Sprint → ADS → Fire → Reload →
 * Inspect → Equip → Unequip → Cooldown) is implemented as a priority-ordered
 * resolver rather than a graph of named transition edges — this is how real
 * FPS weapon state machines are conventionally built, since at any instant
 * the weapon is in exactly one dominant pose and higher-priority activities
 * (reloading, inspecting) always override lower ones (walking, sprinting)
 * rather than requiring an explicit edge between every pair of states.
 *
 * "Cooldown" is deliberately not a distinct member here: it's enforced as
 * the RPM fire-rate gate in VortexFireSystem (a shot can't be requested
 * again until the interval elapses) rather than a separate rendered pose —
 * there is no unique animation for "cooling down" beyond returning to
 * whatever state naturally follows (idle/walk/sprint/ads).
 */
export type VortexWeaponState =
  | 'equipping'
  | 'unequipping'
  | 'reloading'
  | 'inspecting'
  | 'firing'
  | 'ads'
  | 'sprint'
  | 'walk'
  | 'idle';

export interface WeaponStateContext {
  /** False only during the equip/unequip transition windows. */
  equipped: boolean;
  equipping: boolean;
  unequipping: boolean;
  reloading: boolean;
  inspecting: boolean;
  /** True for the single frame(s) immediately following a shot — see VortexFireSystem's fireSignal consumption. */
  firing: boolean;
  ads: boolean;
  sprinting: boolean;
  moving: boolean;
}

/** Highest-priority-wins resolution — see the module doc above for why this shape, not a transition graph. */
export function resolveWeaponState(ctx: WeaponStateContext): VortexWeaponState {
  if (ctx.equipping) return 'equipping';
  if (ctx.unequipping) return 'unequipping';
  if (ctx.reloading) return 'reloading';
  if (ctx.inspecting) return 'inspecting';
  if (ctx.firing) return 'firing';
  if (ctx.ads) return 'ads';
  if (ctx.sprinting) return 'sprint';
  if (ctx.moving) return 'walk';
  return 'idle';
}
