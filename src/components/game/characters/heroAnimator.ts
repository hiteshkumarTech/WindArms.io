import type { MovementState } from '@shared/protocol';

/**
 * Pure procedural animation for the hero rig. No three.js, no React — just
 * math, so every pose is deterministic and unit-testable (see the sibling
 * .test.ts). The rig component feeds measured speed + look pitch in and
 * applies the returned angles to bone groups.
 *
 * Convention: the rig faces -Z; body yaw is applied by the parent group.
 * All angles are radians, all offsets metres. `rotation.x > 0` swings a
 * downward-pointing limb's free end toward -Z (forward).
 *
 * NOTE: the only import is a *type* from the shared protocol, which the
 * compiler erases — this module has no runtime dependency on the path
 * alias, so it runs under a bare `tsx --test` without alias resolution.
 */

/**
 * Locomotion mode the rig actually poses to. Derived from the replicated
 * MovementState plus measured speed so the run⇄idle boundary doesn't flicker
 * with the 20 Hz network state (design §9, bug #5). Deliberately distinct
 * from MovementState: 'sprint' collapses into 'run', and 'dead' is driven by
 * the alive flag rather than a movement state.
 */
export type Locomotion = 'idle' | 'run' | 'air' | 'slide' | 'dash' | 'dead';

/** Hysteresis band (m/s) for the grounded idle⇄run decision. */
export const RUN_ENTER_SPEED = 2.2;
export const RUN_EXIT_SPEED = 1.6;

export interface LocomotionInput {
  state: MovementState;
  /** Measured horizontal speed, m/s. */
  speed: number;
  alive: boolean;
}

/**
 * Hysteresis resolver: given the previous locomotion, the replicated state
 * and measured speed, return the next locomotion. Pure and allocation-free.
 */
export function resolveLocomotion(previous: Locomotion, input: LocomotionInput): Locomotion {
  if (!input.alive) return 'dead';
  if (input.state === 'dash') return 'dash';
  if (input.state === 'slide') return 'slide';
  if (input.state === 'air') return 'air';
  // Grounded ('idle' | 'run' | 'sprint'): let measured speed decide, with a
  // hysteresis band so a player hovering near the threshold doesn't strobe.
  if (previous === 'run') return input.speed < RUN_EXIT_SPEED ? 'idle' : 'run';
  return input.speed > RUN_ENTER_SPEED ? 'run' : 'idle';
}

/** Stride angular velocity (rad/s) used to advance the animation phase. */
export function strideCadence(loco: Locomotion, speed: number): number {
  if (loco === 'run') return Math.PI * (1.7 + Math.min(speed, 12) * 0.16); // faster steps at speed
  if (loco === 'idle') return Math.PI * 0.5; // slow breathing
  return 0; // air / slide / dash / dead have no cyclic motion
}

/**
 * Every joint angle (rad) / offset (m) for one frame. Plain numbers so poses
 * can be snapshot-tested without a renderer.
 */
export interface HeroPose {
  /** Vertical body offset — bob, crouch or death sink. */
  rootY: number;
  torsoPitch: number;
  torsoRoll: number;
  headPitch: number;
  headYaw: number;
  armLPitch: number;
  armLRoll: number;
  elbowL: number;
  armRPitch: number;
  armRRoll: number;
  elbowR: number;
  legLPitch: number;
  legRPitch: number;
  weaponPitch: number;
}

/** Rest pose: right arm braced forward holding the weapon, left arm relaxed. */
const NEUTRAL: Readonly<HeroPose> = {
  rootY: 0,
  torsoPitch: 0,
  torsoRoll: 0,
  headPitch: 0,
  headYaw: 0,
  armLPitch: 0,
  armLRoll: 0.08,
  elbowL: 0.3,
  armRPitch: -1.4,
  armRRoll: 0.12,
  elbowR: 0.55,
  legLPitch: 0,
  legRPitch: 0,
  weaponPitch: 0,
};

/** Fresh pose object initialised to the rest pose. */
export function createHeroPose(): HeroPose {
  return { ...NEUTRAL };
}

function clampPitch(value: number): number {
  return value < -1.2 ? -1.2 : value > 1.2 ? 1.2 : value;
}

/**
 * Compute the rig pose for a locomotion at a given animation phase, speed and
 * look pitch. Writes into `out` (reused per rig for zero per-frame allocation)
 * and returns it; omit `out` in tests to get a fresh object.
 *
 * `pitch` is the look pitch in radians (+up); it drives the weapon arm, head
 * and barrel so the character visibly aims where it is looking, in every
 * upright locomotion.
 */
export function poseFor(
  loco: Locomotion,
  phase: number,
  speed: number,
  pitch: number,
  out: HeroPose = createHeroPose(),
): HeroPose {
  Object.assign(out, NEUTRAL);
  const aim = clampPitch(pitch);

  // Aim wiring shared by every upright state.
  out.armRPitch = -1.4 - aim * 0.5;
  out.headPitch = aim * 0.5;
  out.weaponPitch = aim;

  switch (loco) {
    case 'run': {
      const gait = Math.min(speed / 6, 1); // 0..1 blend by speed
      const swing = 0.75 * gait;
      const s = Math.sin(phase);
      out.legLPitch = s * swing;
      out.legRPitch = -s * swing; // legs strictly opposed
      out.armLPitch = -s * swing * 0.7; // left arm opposes the left leg
      out.elbowL = 0.5 + Math.max(0, s) * 0.3;
      out.torsoPitch = 0.12 + gait * 0.1; // lean into the run
      out.torsoRoll = Math.cos(phase) * 0.04;
      out.rootY = Math.abs(Math.sin(phase)) * 0.06 - 0.02; // footfall bob
      out.headPitch = aim * 0.5 - out.torsoPitch * 0.6; // keep the head level-ish
      break;
    }
    case 'idle': {
      const breathe = Math.sin(phase);
      out.rootY = breathe * 0.015;
      out.torsoRoll = breathe * 0.03;
      out.headYaw = Math.sin(phase * 0.5) * 0.12; // idle look-around
      out.armLPitch = 0.05;
      break;
    }
    case 'air': {
      out.legLPitch = 0.35; // legs part, one knee up
      out.legRPitch = -0.15;
      out.armLPitch = -0.5; // free arm out for balance
      out.armLRoll = 0.35;
      out.torsoPitch = 0.05;
      break;
    }
    case 'dash': {
      out.torsoPitch = 0.4; // hard forward lunge
      out.legLPitch = 0.5;
      out.legRPitch = -0.4;
      out.armLPitch = 0.6; // trailing arm swept back
      out.rootY = -0.05;
      break;
    }
    case 'slide': {
      out.rootY = -0.45; // drop low
      out.torsoPitch = 0.55; // tuck forward
      out.legLPitch = 0.8; // legs thrown forward
      out.legRPitch = 0.55;
      out.armLPitch = 0.7; // arm back, bracing
      out.armLRoll = 0.25;
      out.headPitch = aim * 0.3 - 0.2;
      break;
    }
    case 'dead': {
      out.rootY = -0.55; // collapsed to the ground
      out.torsoPitch = 1.25; // face-down crumple
      out.torsoRoll = 0.35;
      out.headPitch = 0.4;
      out.armLPitch = 0.5;
      out.armLRoll = 0.5;
      out.elbowL = 0.9;
      out.armRPitch = 0.3;
      out.armRRoll = -0.4;
      out.elbowR = 0.8;
      out.legLPitch = 0.25;
      out.legRPitch = -0.15;
      out.weaponPitch = 0.3;
      break;
    }
  }

  return out;
}
