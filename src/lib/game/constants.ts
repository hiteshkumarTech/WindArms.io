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

  // Wall-run (F5) — tune live; movement feel needs playtesting.
  WALLRUN_MIN_SPEED: 7, // horizontal speed (m/s) needed to stick to a wall
  WALLRUN_PROBE: 0.75, // side-ray length from the capsule center (radius 0.4 + reach)
  WALLRUN_GRAVITY_SCALE: 0.32, // fraction of gravity while wall-running
  WALLRUN_MAX_SINK: 2.5, // max downward speed (m/s) while stuck
  WALLRUN_SPEED_FLOOR: 8, // maintained horizontal speed along the wall
  WALLRUN_MAX_DURATION: 1.6, // seconds of wall-run per wall
  WALLRUN_COOLDOWN: 0.35, // re-stick delay after a wall-jump
  WALLRUN_CAMERA_ROLL: 0.21, // camera roll while wall-running (~12°)
  WALLJUMP_OUT_SPEED: 9, // horizontal ejection off the wall
  WALLJUMP_UP_SPEED: 7.5, // vertical ejection (≈45° with OUT)

  // Slide-hop (F5)
  SLIDE_HOP_BOOST: 1.05, // speed multiplier when jumping out of a slide
  SLIDE_HOP_MAX_SPEED: 12.5, // cap on chained slide-hop speed
  SLIDE_HOP_CHAIN_WINDOW: 0.3, // land-into-slide window that preserves momentum
};
