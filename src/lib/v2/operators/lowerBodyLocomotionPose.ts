import { MathUtils } from 'three';
import { PLAYER } from '@/lib/game/constants';

/**
 * Pure, testable procedural lower-body LOCOMOTION layer (Milestone 8, Step
 * 8D) — same "no React, no Zustand, no scene dependency" convention as
 * `actionPose.ts` (only `THREE.MathUtils`'s plain math helpers, not a scene
 * object). Deterministic: the same `(input, runtimeState)` pair always
 * produces the same output, so this is fully unit-testable without a
 * browser or a mounted skeleton. PLAYER is imported ONLY for its
 * WALK_SPEED/SPRINT_SPEED reference numbers (visual amplitude/frequency
 * scaling), never for movement/physics logic — this module never
 * recomputes friction, acceleration, gravity, or grounded state; all of
 * that keeps coming from whichever controller already computed it this
 * frame (see `firstPersonBodyPose.ts`'s Step 8D fields).
 *
 * PROCEDURAL, NOT AUTHORED: every curve below is a hand-tuned function of
 * time/phase, not a baked animation clip — there are no keyframes, no
 * skeletal animation data, nothing sampled from a DCC tool.
 *
 * OUTPUT CONVENTION: every rotation below is a PITCH angle (radians) meant
 * to be applied around the character's world-space LOCAL-RIGHT axis (see
 * `lowerBodyRig.ts`'s `applyLowerBodyLocomotionPose`, which is the only
 * consumer) — never a bone-local Euler triple. This sidesteps needing to
 * know each individual leg bone's own (possibly nonstandard) local axis
 * convention entirely: the rig layer always expresses "swing forward/back"
 * in one shared, unambiguous world-relative axis. Sign convention (derived
 * once, verified in the real-browser calibration pass — see
 * `docs/decisions.md`): POSITIVE pitch on a LEG bone swings its child end
 * FORWARD (toward -Z, the direction the character faces); POSITIVE pitch
 * on the PELVIS root tips it BACKWARD (opposite sense, since the pelvis's
 * rig-rotation is measured from its own up/child-ward direction rather
 * than a downward-hanging limb) — forward lean therefore uses a NEGATIVE
 * pelvis pitch constant below.
 *
 * SHIN/FOOT ARE ABSOLUTE, NOT RELATIVE: `leftLowerLegRotation`/
 * `rightLowerLegRotation`/foot rotations are each an ABSOLUTE world-pitch
 * offset (composed against THAT bone's own rest orientation by the rig
 * layer, independent of what the thigh is doing) — NOT a "bend amount
 * relative to the thigh." A visually bent knee therefore requires the
 * shin's absolute pitch to trail BEHIND the thigh's (see `shinPitch =
 * thighPitch - kneeBend` below), not simply "thigh pitch plus a knee
 * term." Getting this backward would read as a leg that never bends,
 * or bends the wrong way — this is the single easiest sign mistake to
 * make in this file, which is why it's called out explicitly.
 */

export type LowerBodyLocomotionState = 'idle' | 'walk' | 'sprint' | 'airRise' | 'airFall' | 'landing' | 'takeoff' | 'windLift';

export interface LowerBodyLocomotionInput {
  /** Already clamped by the caller is fine but not required — this module clamps internally too (belt and suspenders, matches `actionPose.ts`'s convention). */
  readonly deltaSeconds: number;
  readonly horizontalSpeed: number;
  readonly verticalVelocity: number;
  readonly grounded: boolean;
  /** Reused verbatim from the controller's already-computed `rangeLocalPose.state`/`firstPersonBodyPose` movement classification — this module never re-derives walk/sprint/air thresholds itself. */
  readonly movementState: 'idle' | 'walk' | 'sprint' | 'air';
  readonly windLiftActive: boolean;
  /** Increments on every teleport-class event (respawn, recovery-volume reset) — a change since the last call resets ALL runtime state (stride phase, envelopes, smoothed blends) before this frame is processed, so a teleport can never look like a footstep or a landing. */
  readonly respawnNonce: number;
}

export interface LowerBodyLocomotionPose {
  /** Meters, in the pelvis bone's own local space (bob/side-shift), added on top of its rest local position by the rig layer. Mutated in place. */
  pelvisPositionOffset: [number, number, number];
  /** [pitch, yaw, roll] radians — yaw is always 0 in this pass (no pelvis twist). Mutated in place. */
  pelvisRotationEuler: [number, number, number];

  /** Absolute world-pitch offsets, radians — see this module's doc comment. Only index 0 (pitch) is ever nonzero in this pass; index 1/2 exist for interface stability but are always 0. Mutated in place. */
  leftUpperLegRotation: [number, number, number];
  rightUpperLegRotation: [number, number, number];
  leftLowerLegRotation: [number, number, number];
  rightLowerLegRotation: [number, number, number];
  leftFootRotation: [number, number, number];
  rightFootRotation: [number, number, number];

  /** 0..1, normalized gait cycle position (0/1 = left-leg-forward reference). Not meaningful outside 'walk'/'sprint'. */
  phase: number;
  /** 0..1 diagnostic overall pose intensity — the max of every active blend/envelope this frame. Informational (debug readout), not a gate any consumer needs to branch on for correctness. */
  blendWeight: number;
  state: LowerBodyLocomotionState;
}

export function createLowerBodyLocomotionPose(): LowerBodyLocomotionPose {
  return {
    pelvisPositionOffset: [0, 0, 0],
    pelvisRotationEuler: [0, 0, 0],
    leftUpperLegRotation: [0, 0, 0],
    rightUpperLegRotation: [0, 0, 0],
    leftLowerLegRotation: [0, 0, 0],
    rightLowerLegRotation: [0, 0, 0],
    leftFootRotation: [0, 0, 0],
    rightFootRotation: [0, 0, 0],
    phase: 0,
    blendWeight: 0,
    state: 'idle',
  };
}

/**
 * Persistent, caller-owned per-instance runtime state — deliberately NOT
 * module-level (a module-level singleton would leak between a `/v2/range`
 * mount and a `/v2/play` mount, or between two Fast Refresh instances).
 * `KaelFirstPersonLowerBody.tsx` holds exactly one of these in a `useRef`,
 * created via `createLowerBodyLocomotionRuntimeState()` once per mount.
 */
export interface LowerBodyLocomotionRuntimeState {
  /** Radians, 0..2π, the walk/sprint gait cycle position. Advances only while grounded and moving; frozen otherwise. */
  gaitPhase: number;
  /** Always-advancing slow timer driving idle breathing/sway — frozen only when `deltaSeconds` is 0 (pause/stall), never gated by grounded/moving. */
  idleTimer: number;
  /** 0..1 smoothed idle<->walk blend, tracks `movementState !== 'idle' && !== 'air'`. */
  locomotionIntensity: number;
  /** 0..1 smoothed walk<->sprint blend, tracks `movementState === 'sprint'`. */
  sprintFactor: number;
  /** 0..1 smoothed grounded-gait<->airborne blend, tracks `movementState === 'air'`. */
  airBlend: number;
  /** 0..1 smoothed falling<->rising blend while airborne, tracks the sign of `verticalVelocity`. */
  riseFallBlend: number;
  /** 0..1 smoothed in/out of the Wind Lift posture. */
  windLiftBlend: number;

  landingActive: boolean;
  landingT: number;
  /** 0..1, captured once at the landing edge from the impact speed; drives how deep the landing compression reads. */
  landingStrength: number;

  takeoffActive: boolean;
  takeoffT: number;

  prevGrounded: boolean;
  /** Captured every call BEFORE this call's edge detection — used as the "impact velocity" for a landing that's detected THIS call, since by the time `grounded` flips true the controller has already clamped `vel.y` to a small constant (see this module's doc comment / `firstPersonBodyPose.ts`). */
  prevVerticalVelocity: number;
  prevRespawnNonce: number;
  /** First-call guard so `prevRespawnNonce`'s initial value (0) never falsely reads as "a teleport just happened." */
  initialized: boolean;
}

export function createLowerBodyLocomotionRuntimeState(): LowerBodyLocomotionRuntimeState {
  return {
    gaitPhase: 0,
    idleTimer: 0,
    locomotionIntensity: 0,
    sprintFactor: 0,
    airBlend: 0,
    riseFallBlend: 0,
    windLiftBlend: 0,
    landingActive: false,
    landingT: 0,
    landingStrength: 0,
    takeoffActive: false,
    takeoffT: 0,
    prevGrounded: true,
    prevVerticalVelocity: 0,
    prevRespawnNonce: 0,
    initialized: false,
  };
}

/** Hard reset — respawn/recovery-volume teleport, or a fresh mount. Never leaves a stale envelope/phase/blend running into a teleported frame. */
function resetRuntimeState(state: LowerBodyLocomotionRuntimeState, grounded: boolean): void {
  state.gaitPhase = 0;
  state.idleTimer = 0;
  state.locomotionIntensity = 0;
  state.sprintFactor = 0;
  state.airBlend = grounded ? 0 : 1;
  state.riseFallBlend = 0;
  state.windLiftBlend = 0;
  state.landingActive = false;
  state.landingT = 0;
  state.landingStrength = 0;
  state.takeoffActive = false;
  state.takeoffT = 0;
  state.prevGrounded = grounded;
  state.prevVerticalVelocity = 0;
}

// ---- Tunable constants (meters, radians, Hz) ---------------------------
const MAX_DELTA_S = 0.1; // clamp — no giant phase jump after tab inactivity/a long stall
const BLEND_RATE = 9; // 1/s, exponential smoothing rate for locomotionIntensity/sprintFactor/airBlend/windLiftBlend — same "1 - exp(-rate*dt)" idiom as PLAYER.FOV_LERP
const RISE_FALL_BLEND_RATE = 14; // faster than BLEND_RATE — rise/fall should read promptly at the apex of a jump, not lag visibly

const IDLE_BREATH_FREQ_HZ = 0.35;
const IDLE_BREATH_AMP_M = 0.006;
const IDLE_SWAY_FREQ_HZ = 0.23;
const IDLE_SWAY_AMP_M = 0.005;
const IDLE_KNEE_SOFTEN_RAD = 0.035; // both knees, faded out as locomotionIntensity rises

const WALK_MIN_FREQ_HZ = 1.5;
const WALK_MAX_FREQ_HZ = 2.0;
const SPRINT_EXTRA_FREQ_HZ = 0.9;

const WALK_HIP_AMP_MIN_RAD = 0.16;
const WALK_HIP_AMP_MAX_RAD = 0.3;
const SPRINT_EXTRA_HIP_AMP_RAD = 0.12;

const WALK_KNEE_AMP_MIN_RAD = 0.2;
const WALK_KNEE_AMP_MAX_RAD = 0.36;
const SPRINT_EXTRA_KNEE_AMP_RAD = 0.18;
const KNEE_PHASE_LEAD_RAD = 0.35; // knee bend peaks slightly before the hip's own peak forward position
const FOOT_COMPENSATION = -0.3; // ankle partially counter-rotates the shin's swing — a stylized approximation, not real foot-planting IK (explicitly out of scope, see the Step 8D brief)

const PELVIS_BOB_AMP_WALK_M = 0.028;
const PELVIS_BOB_AMP_SPRINT_EXTRA_M = 0.016;
const PELVIS_SIDE_AMP_WALK_M = 0.018;
const PELVIS_SIDE_AMP_SPRINT_EXTRA_M = 0.008;
const SPRINT_FORWARD_LEAN_RAD = -0.07; // negative — see this module's doc comment on the pelvis sign convention

const AIR_RISE_HIP_RAD = 0.08;
const AIR_RISE_KNEE_RAD = 0.16;
const AIR_FALL_HIP_RAD = -0.04;
const AIR_FALL_KNEE_RAD = 0.24;

const WIND_LIFT_HIP_RAD = -0.12; // legs trail slightly back/down relative to the rising body
const WIND_LIFT_KNEE_RAD = 0.16;
const WIND_LIFT_FOOT_RAD = 0.1;

const TAKEOFF_DURATION_S = 0.16;
const TAKEOFF_PELVIS_DIP_M = 0.045;
const TAKEOFF_KNEE_SPIKE_RAD = 0.22;
/** Below this upward speed at the leaving-ground edge, treat it as "walked off a ledge," not a real jump — no takeoff envelope. */
const TAKEOFF_MIN_VERTICAL_VELOCITY = PLAYER.JUMP_VELOCITY * 0.5;

const LANDING_DURATION_S = 0.28;
const LANDING_PELVIS_DIP_M = 0.09;
const LANDING_KNEE_SPIKE_RAD = 0.34;
/** Impact speed (m/s) at or above which the landing envelope reads at full strength — a reference magnitude, not a hard physics limit (`PLAYER.MAX_FALL` is far higher; a fall from that speed still only ever produces the CLAMPED max visual response below). */
const LANDING_MAX_REFERENCE_SPEED = 12;

function clamp01(v: number): number {
  return Number.isFinite(v) ? MathUtils.clamp(v, 0, 1) : 0;
}

function expSmoothTowards(current: number, target: number, rate: number, dt: number): number {
  const t = 1 - Math.exp(-rate * dt);
  return MathUtils.lerp(current, target, clamp01(t));
}

/** Ease-in-out bump: 0 at t=0, 1 at t=peak, 0 at t=1 — used for the takeoff/landing one-shot envelopes. `peak` in (0,1). */
function bumpCurve(t01: number, peak: number): number {
  const c = clamp01(t01);
  if (c < peak) return MathUtils.smoothstep(c, 0, peak);
  return 1 - MathUtils.smoothstep(c, peak, 1);
}

/**
 * Computes one frame of lower-body locomotion pose. Mutates `state`
 * (advances the runtime) and writes into `out` (or a fresh
 * `createLowerBodyLocomotionPose()` if omitted — tests/one-off calls only,
 * never the per-frame hot path). Deterministic and finite for any finite
 * input; clamps `deltaSeconds` internally.
 */
export function computeLowerBodyLocomotionPose(
  input: LowerBodyLocomotionInput,
  state: LowerBodyLocomotionRuntimeState,
  out?: LowerBodyLocomotionPose,
): LowerBodyLocomotionPose {
  const target = out ?? createLowerBodyLocomotionPose();

  const dt = Number.isFinite(input.deltaSeconds) ? MathUtils.clamp(input.deltaSeconds, 0, MAX_DELTA_S) : 0;
  const horizontalSpeed = Number.isFinite(input.horizontalSpeed) ? Math.max(0, input.horizontalSpeed) : 0;
  const verticalVelocity = Number.isFinite(input.verticalVelocity) ? input.verticalVelocity : 0;
  const grounded = input.grounded === true;
  const windLiftActive = input.windLiftActive === true;

  if (!state.initialized) {
    state.initialized = true;
    state.prevRespawnNonce = input.respawnNonce;
    resetRuntimeState(state, grounded);
  } else if (input.respawnNonce !== state.prevRespawnNonce) {
    state.prevRespawnNonce = input.respawnNonce;
    resetRuntimeState(state, grounded);
  }

  // ---- Edge detection (BEFORE prevGrounded is overwritten this call) ----
  const justLeftGround = state.prevGrounded && !grounded;
  const justLanded = !state.prevGrounded && grounded;

  // Takeoff uses THIS frame's verticalVelocity (not prevVerticalVelocity):
  // unlike landing, the controller's jump impulse (`vel.y = JUMP_VELOCITY`)
  // and the grounded->false flip happen in the SAME published frame, so the
  // true takeoff velocity is available immediately — there is no same-frame
  // clamp destroying it the way there is for landing (see `justLanded` below).
  if (justLeftGround && verticalVelocity >= TAKEOFF_MIN_VERTICAL_VELOCITY) {
    state.takeoffActive = true;
    state.takeoffT = 0;
  }
  if (justLanded) {
    state.landingActive = true;
    state.landingT = 0;
    state.landingStrength = clamp01(Math.abs(state.prevVerticalVelocity) / LANDING_MAX_REFERENCE_SPEED);
  }

  // ---- Smoothed high-level blends ----
  const movingOnGround = grounded && input.movementState !== 'air' && input.movementState !== 'idle';
  state.locomotionIntensity = expSmoothTowards(state.locomotionIntensity, movingOnGround ? 1 : 0, BLEND_RATE, dt);
  state.sprintFactor = expSmoothTowards(state.sprintFactor, input.movementState === 'sprint' ? 1 : 0, BLEND_RATE, dt);
  state.airBlend = expSmoothTowards(state.airBlend, input.movementState === 'air' ? 1 : 0, BLEND_RATE, dt);
  state.riseFallBlend = expSmoothTowards(state.riseFallBlend, verticalVelocity > 0 ? 1 : 0, RISE_FALL_BLEND_RATE, dt);
  state.windLiftBlend = expSmoothTowards(state.windLiftBlend, windLiftActive ? 1 : 0, BLEND_RATE, dt);

  // ---- Timers ----
  state.idleTimer += dt;
  if (movingOnGround) {
    const speedFactor = clamp01(horizontalSpeed / PLAYER.WALK_SPEED);
    const strideFrequencyHz = MathUtils.lerp(WALK_MIN_FREQ_HZ, WALK_MAX_FREQ_HZ, speedFactor) + SPRINT_EXTRA_FREQ_HZ * state.sprintFactor;
    state.gaitPhase = (state.gaitPhase + strideFrequencyHz * Math.PI * 2 * dt) % (Math.PI * 2);
  }
  if (state.takeoffActive) {
    state.takeoffT += dt;
    if (state.takeoffT >= TAKEOFF_DURATION_S) state.takeoffActive = false;
  }
  if (state.landingActive) {
    state.landingT += dt;
    if (state.landingT >= LANDING_DURATION_S) state.landingActive = false;
  }

  // ---- Grounded gait pose (per leg, absolute world pitches) ----
  const speedFactor = clamp01(horizontalSpeed / PLAYER.WALK_SPEED);
  const hipAmp = (MathUtils.lerp(WALK_HIP_AMP_MIN_RAD, WALK_HIP_AMP_MAX_RAD, speedFactor) + SPRINT_EXTRA_HIP_AMP_RAD * state.sprintFactor) * state.locomotionIntensity;
  const kneeAmp = (MathUtils.lerp(WALK_KNEE_AMP_MIN_RAD, WALK_KNEE_AMP_MAX_RAD, speedFactor) + SPRINT_EXTRA_KNEE_AMP_RAD * state.sprintFactor) * state.locomotionIntensity;

  function legSwing(legPhase: number): { thighPitch: number; shinPitch: number; footPitch: number } {
    const thighPitch = Math.sin(legPhase) * hipAmp;
    const kneeRaw = Math.max(0, Math.sin(legPhase + KNEE_PHASE_LEAD_RAD));
    const kneeBend = Math.pow(kneeRaw, 1.4) * kneeAmp;
    const shinPitch = thighPitch - kneeBend;
    const footPitch = shinPitch * FOOT_COMPENSATION;
    return { thighPitch, shinPitch, footPitch };
  }

  const idleKneeFade = 1 - state.locomotionIntensity;
  const left = legSwing(state.gaitPhase);
  const right = legSwing(state.gaitPhase + Math.PI);
  const idleKneeL = IDLE_KNEE_SOFTEN_RAD * idleKneeFade;
  const idleKneeR = IDLE_KNEE_SOFTEN_RAD * idleKneeFade;

  const groundedLeftThigh = left.thighPitch;
  const groundedLeftShin = left.shinPitch - idleKneeL;
  const groundedLeftFoot = left.footPitch;
  const groundedRightThigh = right.thighPitch;
  const groundedRightShin = right.shinPitch - idleKneeR;
  const groundedRightFoot = right.footPitch;

  // ---- Airborne pose (symmetric — no left/right gait phase in the air) ----
  const airHip = MathUtils.lerp(AIR_FALL_HIP_RAD, AIR_RISE_HIP_RAD, state.riseFallBlend);
  const airKnee = MathUtils.lerp(AIR_FALL_KNEE_RAD, AIR_RISE_KNEE_RAD, state.riseFallBlend);
  const airFoot = airKnee * FOOT_COMPENSATION;

  // ---- Blend grounded-gait -> airborne ----
  const groundedToAir = state.airBlend;
  let leftThigh = MathUtils.lerp(groundedLeftThigh, airHip, groundedToAir);
  let leftShin = MathUtils.lerp(groundedLeftShin, airHip - airKnee, groundedToAir);
  let leftFoot = MathUtils.lerp(groundedLeftFoot, airFoot, groundedToAir);
  let rightThigh = MathUtils.lerp(groundedRightThigh, airHip, groundedToAir);
  let rightShin = MathUtils.lerp(groundedRightShin, airHip - airKnee, groundedToAir);
  let rightFoot = MathUtils.lerp(groundedRightFoot, airFoot, groundedToAir);

  // ---- Wind Lift posture — overrides on top, distinct from a normal jump ----
  if (state.windLiftBlend > 0) {
    const wlShin = WIND_LIFT_HIP_RAD - WIND_LIFT_KNEE_RAD;
    leftThigh = MathUtils.lerp(leftThigh, WIND_LIFT_HIP_RAD, state.windLiftBlend);
    leftShin = MathUtils.lerp(leftShin, wlShin, state.windLiftBlend);
    leftFoot = MathUtils.lerp(leftFoot, WIND_LIFT_FOOT_RAD, state.windLiftBlend);
    rightThigh = MathUtils.lerp(rightThigh, WIND_LIFT_HIP_RAD, state.windLiftBlend);
    rightShin = MathUtils.lerp(rightShin, wlShin, state.windLiftBlend);
    rightFoot = MathUtils.lerp(rightFoot, WIND_LIFT_FOOT_RAD, state.windLiftBlend);
  }

  // ---- Takeoff / landing one-shot additive envelopes (both legs equally) ----
  let pelvisDipM = 0;
  let envelopeKneeSpike = 0;
  if (state.takeoffActive) {
    const shape = bumpCurve(state.takeoffT / TAKEOFF_DURATION_S, 0.4);
    pelvisDipM += -TAKEOFF_PELVIS_DIP_M * shape;
    envelopeKneeSpike += TAKEOFF_KNEE_SPIKE_RAD * shape;
  }
  if (state.landingActive) {
    const shape = bumpCurve(state.landingT / LANDING_DURATION_S, 0.25) * MathUtils.lerp(0.35, 1, state.landingStrength);
    pelvisDipM += -LANDING_PELVIS_DIP_M * shape;
    envelopeKneeSpike += LANDING_KNEE_SPIKE_RAD * shape;
  }
  leftShin -= envelopeKneeSpike;
  rightShin -= envelopeKneeSpike;

  // ---- Pelvis position (bob/side-shift/breathing/envelope dip) ----
  const bobAmp = (PELVIS_BOB_AMP_WALK_M + PELVIS_BOB_AMP_SPRINT_EXTRA_M * state.sprintFactor) * state.locomotionIntensity;
  const sideAmp = (PELVIS_SIDE_AMP_WALK_M + PELVIS_SIDE_AMP_SPRINT_EXTRA_M * state.sprintFactor) * state.locomotionIntensity;
  const gaitBobY = (Math.abs(Math.sin(state.gaitPhase)) - 0.5) * bobAmp;
  const gaitSideX = Math.sin(state.gaitPhase) * sideAmp;
  const idleBreathY = Math.sin(state.idleTimer * IDLE_BREATH_FREQ_HZ * Math.PI * 2) * IDLE_BREATH_AMP_M * idleKneeFade;
  const idleSwayX = Math.sin(state.idleTimer * IDLE_SWAY_FREQ_HZ * Math.PI * 2) * IDLE_SWAY_AMP_M * idleKneeFade;

  target.pelvisPositionOffset[0] = gaitSideX + idleSwayX;
  target.pelvisPositionOffset[1] = gaitBobY + idleBreathY + pelvisDipM;
  target.pelvisPositionOffset[2] = 0;

  target.pelvisRotationEuler[0] = SPRINT_FORWARD_LEAN_RAD * state.sprintFactor;
  target.pelvisRotationEuler[1] = 0;
  target.pelvisRotationEuler[2] = gaitSideX * 0.4; // small roll accompanying the side-shift — reads as a natural weight transfer, not an independent wobble

  target.leftUpperLegRotation[0] = leftThigh;
  target.leftUpperLegRotation[1] = 0;
  target.leftUpperLegRotation[2] = 0;
  target.rightUpperLegRotation[0] = rightThigh;
  target.rightUpperLegRotation[1] = 0;
  target.rightUpperLegRotation[2] = 0;
  target.leftLowerLegRotation[0] = leftShin;
  target.leftLowerLegRotation[1] = 0;
  target.leftLowerLegRotation[2] = 0;
  target.rightLowerLegRotation[0] = rightShin;
  target.rightLowerLegRotation[1] = 0;
  target.rightLowerLegRotation[2] = 0;
  target.leftFootRotation[0] = leftFoot;
  target.leftFootRotation[1] = 0;
  target.leftFootRotation[2] = 0;
  target.rightFootRotation[0] = rightFoot;
  target.rightFootRotation[1] = 0;
  target.rightFootRotation[2] = 0;

  target.phase = state.gaitPhase / (Math.PI * 2);
  const landingShape = state.landingActive ? bumpCurve(state.landingT / LANDING_DURATION_S, 0.25) : 0;
  const takeoffShape = state.takeoffActive ? bumpCurve(state.takeoffT / TAKEOFF_DURATION_S, 0.4) : 0;
  target.blendWeight = Math.max(state.locomotionIntensity, state.airBlend, state.windLiftBlend, landingShape, takeoffShape);

  target.state = state.windLiftBlend > 0.5
    ? 'windLift'
    : state.landingActive
      ? 'landing'
      : state.takeoffActive
        ? 'takeoff'
        : state.airBlend > 0.5
          ? state.riseFallBlend > 0.5 ? 'airRise' : 'airFall'
          : state.locomotionIntensity < 0.05
            ? 'idle'
            : state.sprintFactor > 0.5
              ? 'sprint'
              : 'walk';

  // ---- Advance edge-detection state for the NEXT call ----
  state.prevGrounded = grounded;
  state.prevVerticalVelocity = verticalVelocity;

  return target;
}
