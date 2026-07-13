/**
 * Scroll → canvas bridge. ScrollTrigger writes here; the storm backdrop
 * reads (and smooths) in useFrame.
 *
 * INVARIANT: camera and scroll data NEVER pass through React state.
 * This module ref is the only channel — zero re-renders per frame.
 */
export const scrollState = {
  /** Raw page progress 0..1, written by the choreography hook. */
  progress: 0,
  /** Canvas-side smoothed value, owned by StormBackdrop's frame loop. */
  smoothed: 0,
};
