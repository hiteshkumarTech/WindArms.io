/**
 * Player movement tuning. All speeds in m/s, times in seconds, angles in
 * radians. Values are tuned for a fast, snappy arena-shooter feel:
 * stronger-than-real gravity, high ground friction, limited air control.
 */
export const PLAYER = {
  // Capsule
  RADIUS: 0.4,
  HALF_HEIGHT: 0.6,
  EYE_STAND: 0.7,
  EYE_SLIDE: 0.15,

  // Ground movement
  WALK_SPEED: 6.2,
  SPRINT_SPEED: 9.5,
  ACCEL_GROUND: 12,
  ACCEL_AIR: 3.5,
  FRICTION_GROUND: 9,

  // Vertical
  GRAVITY: -24,
  JUMP_VELOCITY: 8.2,
  MAX_FALL: -40,
  COYOTE_TIME: 0.12,
  JUMP_BUFFER: 0.12,

  // Slide
  SLIDE_DURATION: 0.9,
  SLIDE_BOOST: 11.5,
  SLIDE_END_SPEED: 5,
  SLIDE_STEER: 2.2,
  SLIDE_COOLDOWN: 0.5,

  // Dash
  DASH_SPEED: 18,
  DASH_DURATION: 0.22,
  DASH_COOLDOWN: 2,

  // Camera
  FOV_BASE: 75,
  FOV_SPRINT: 82,
  FOV_DASH: 90,
  FOV_LERP: 8,
  MOUSE_SENSITIVITY: 0.0023,
  PITCH_LIMIT: Math.PI / 2 - 0.02,

  // World
  SPAWN: [0, 3, 10] as [number, number, number],
  KILL_Y: -25,
};
