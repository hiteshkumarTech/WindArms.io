import * as THREE from 'three';

/**
 * World-space muzzle pose bridge — same singleton-bridge convention as
 * `rangeLocalPose`/`viewKick`/`fireSignal` (plain mutable object, written
 * every frame by the one component that owns the full viewmodel transform
 * chain, read anywhere without a subscription or a scene-graph ref).
 *
 * `VortexViewmodel` owns the viewmodel's group transform (camera pose +
 * base pose + sway/bob/recoil) and is the only place that can correctly
 * resolve the runtime muzzle anchor (`vortexRuntimeAnchors.ts`) into world
 * space every frame; `VortexFireSystem` reads it when spawning the visible
 * tracer/muzzle-flash/casing, so the visual effect origin tracks the
 * barrel through every pose (hip, ADS, recoil, sway) without either
 * component needing a ref into the other's scene graph.
 *
 * Deliberately NOT used for the gameplay aim ray or hit-scan — that stays
 * camera-based (`camera.position`/`camera.getWorldDirection`) in
 * `VortexFireSystem.tsx`, unaffected by this. `position`/`direction` are
 * mutated in place every frame (zero allocation), matching this project's
 * frame-loop convention.
 */
export const muzzleWorldPose = {
  position: new THREE.Vector3(),
  direction: new THREE.Vector3(0, 0, -1),
  /**
   * True only while THIS mounted `VortexViewmodel` instance has published at
   * least one frame's worth of world-space position/direction. `VortexViewmodel`
   * sets this `false` on mount (before its first frame runs) and on unmount,
   * and `true` at the end of every `useFrame`. That reset-on-(un)mount is
   * what keeps this a genuinely reachable fallback rather than dead code:
   * without it, this being a module-singleton means a remount would start
   * with `ready` still `true` from the PREVIOUS instance's last frame, so
   * `VortexFireSystem` would read a stale, possibly off-screen position
   * instead of falling back. With it, `ready` correctly reads `false` for
   * every frame between a mount and that instance's first `useFrame` —
   * initial load, a GLB swap, or a scene remount — and `VortexFireSystem`
   * uses its own camera-relative estimate (`MUZZLE` in VortexFireSystem.tsx)
   * during that window instead of stale or uninitialized data.
   */
  ready: false,
};
