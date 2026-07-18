/**
 * TEMPORARY runtime weapon anchors for the Vortex Rifle v0.2 runtime
 * derivative. The GLB has NO authored `socket_muzzle` — confirmed via
 * `tools/inspect-glb.mjs` (see `src/lib/v2/pipeline/manifest.ts`'s
 * `vortex-rifle` entry: `requiredSockets: []`, real target tracked only in
 * `plannedSockets`). This is NOT a renamed node pretending to be a socket —
 * it's a hand-measured coordinate in the RAW MODEL's own local space
 * (before `VIEWMODEL_SCALE` and the viewmodel pose rotation are applied),
 * consumed by `VortexViewmodel.tsx` to publish a world-space muzzle
 * position every frame (see `src/lib/v2/range/muzzleWorldPose.ts`).
 *
 * Delete this file (and its one consumer) once a Blender-authored v1.0
 * asset ships with a real `socket_muzzle` node — at that point
 * `PipelineModel`'s existing `sockets`/`SocketAnchor` machinery is the
 * correct path, not this.
 */
export interface RuntimeWeaponAnchors {
  /** Local coordinates, meters, in the raw GLB's own space (X-long, muzzle at +X — see docs/forge/vortex-rifle-v0.2.md). */
  muzzleLocal: [number, number, number];
  casingLocal?: [number, number, number];
}

/**
 * Measured against the runtime derivative's confirmed world bounds
 * (1.000 × 0.270 × 0.139 m, X-long, pivot at bounding-box center — see
 * docs/forge/vortex-rifle-v0.2.md §2/§6): muzzleLocal.x sits just short of
 * the +0.5 geometric extent (the visible bore mouth, not the outermost
 * vertex), y is below the bounding box's vertical center (the box includes
 * the raised scope; the barrel bore itself sits lower), z is centered
 * (rifle is left-right symmetric). Verified visually with a temporary
 * colored-sphere + axis helper against the running scene, not derived from
 * the bounding box alone — see docs/decisions.md "Vortex Rifle FP pose
 * correction" for the verification pass; helper code removed after.
 */
export const VORTEX_RUNTIME_ANCHORS: RuntimeWeaponAnchors = {
  muzzleLocal: [0.47, -0.035, 0],
  casingLocal: [0.05, 0.02, 0.045],
};
