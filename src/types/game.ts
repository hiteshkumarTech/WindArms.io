/** Keys currently held down, sampled by the frame loop via a ref. */
export interface HeldInput {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  sprint: boolean;
  slide: boolean;
}

/**
 * `performance.now()` timestamps of the most recent key presses.
 * Used for jump buffering and edge-triggered actions (dash, slide, reset).
 * Consumed actions are reset to `-Infinity`.
 */
export interface PressTimestamps {
  jump: number;
  dash: number;
  slide: number;
  reset: number;
}

export interface InputSnapshot {
  held: HeldInput;
  pressedAt: PressTimestamps;
}

/** Re-exported from the network protocol — one source of truth on both sides of the wire. */
export type { MovementState } from '@shared/protocol';
