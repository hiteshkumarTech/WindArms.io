/**
 * TEMPORARY runtime weapon anchors for the Vortex Rifle v0.2 runtime
 * derivative. The GLB has NO authored `socket_muzzle`, `socket_grip_hand`,
 * or `socket_grip_support` — confirmed via `tools/inspect-glb.mjs` (see
 * `src/lib/v2/pipeline/manifest.ts`'s `vortex-rifle` entry:
 * `requiredSockets: []`; all three real target names now tracked in
 * `plannedSockets`, added there in the same pass that added
 * `gripHandLocal`/`gripSupportLocal` below). `socket_grip_hand`/
 * `socket_grip_support` were already reserved names in
 * `src/lib/v2/pipeline/types.ts`'s `SocketName` union before this pass —
 * this file is what makes them load-bearing today, not the union entry
 * alone. This is NOT a renamed node pretending to be a socket — every
 * field below is a hand-measured or geometrically-derived coordinate in
 * the RAW MODEL's own local space (before `VIEWMODEL_SCALE` and the
 * viewmodel pose rotation are applied), consumed by `VortexViewmodel.tsx`
 * to publish world-space poses every frame (see
 * `src/lib/v2/range/muzzleWorldPose.ts` for the muzzle,
 * `src/lib/v2/weapons/gripWorldPose.ts` for the two hand grips — note the
 * different folder, `weapons/` not `range/`, a deliberate choice recorded
 * in `docs/decisions.md`).
 *
 * Delete this file (and its consumers) once a Blender-authored v1.0 asset
 * ships with real `socket_*` nodes — at that point `PipelineModel`'s
 * existing `sockets`/`SocketAnchor` machinery is the correct path, not this.
 */

/** Immutable 3-tuple — same convention as this file's existing position tuples, just named for reuse across the new grip-anchor types below. */
export type Vec3Tuple = readonly [number, number, number];

/**
 * A full local transform for a weapon-owned hand target — position AND
 * orientation, unlike `muzzleLocal`/`casingLocal` above (position only,
 * because the muzzle only ever needs a direction vector, not a full hand
 * basis). Milestone 7, Phase F, Step 5 ("Vortex Grip-Anchor Authoring
 * System").
 *
 * COORDINATE CONTRACT — read this before touching any grip-anchor value:
 *
 * - `position` is in the SAME raw-model-local meters as `muzzleLocal` —
 *   X-long (muzzle at +X), Y-up, Z-lateral (see the module doc above and
 *   docs/forge/vortex-rifle-v0.2.md §6 for the confirmed axis convention
 *   and the measured 1.000 × 0.270 × 0.139 m bounds this must stay inside).
 * - `rotationEuler` is in radians, applied via `rotationOrder` (always
 *   `'XYZ'` today — see `runtimeAnchorMath.ts`), and is relative to
 *   WEAPON-LOCAL space (the same raw-model space `position` is in), NOT
 *   camera space and NOT the hand bone's own rest-pose space.
 * - The rotation defines a HAND-LOCAL basis, meaning: composing
 *   `rotationEuler` onto the identity gives a quaternion whose local +X/+Y/+Z
 *   axes (once rotated by it) point along the directions below, expressed
 *   in weapon-local space:
 *     local +X  → hand-forward (the direction from wrist toward
 *                 fingertips/trigger — NOT weapon-forward; these usually
 *                 differ, since a gripping hand's fingers curl toward the
 *                 trigger guard, not straight down the barrel)
 *     local +Y  → thumb-side (the direction from the palm's center toward
 *                 the thumb, i.e. "up" relative to a natural grip, not
 *                 necessarily world/weapon up)
 *     local +Z  → palm-normal (the direction the palm itself faces — into
 *                 the grip surface, i.e. pointing FROM the hand's position
 *                 INTO the weapon it's holding)
 * - This target quaternion represents WRIST orientation (the hand-bone-
 *   compatible basis), not palm-surface-contact orientation alone — chosen
 *   because that's what a future two-bone IK solver needs as its end-
 *   effector target, and it's directly comparable against
 *   `tools/blender/inspect-kael-hand-basis.py`'s measured
 *   finger_forward_direction / thumb_direction / palm_normal_raw output
 *   for Kael's actual mixamorig:LeftHand/RightHand rest-pose bones.
 * - HANDEDNESS: `gripHandLocal` (right hand, primary/trigger grip) and
 *   `gripSupportLocal` (left hand, support/foregrip) are NOT mirror images
 *   of each other by a simple axis negation. Kael's own measured hand
 *   bones aren't simple mirrors either — see inspect-kael-hand-basis.py's
 *   `mirrored_axis_dot_products` output (X mirrors cleanly at -0.99, but Y
 *   and Z do NOT: 0.75 and -0.74 respectively). Author and consume each
 *   hand's values independently; never derive one from the other by
 *   negating a single axis.
 * - A future IK consumer should read `position`/`rotationEuler` as the
 *   TARGET wrist transform in weapon-local space, convert to world space
 *   via the exact same `resolveRuntimeAnchorWorldPose` chain this file's
 *   consumers use (see `runtimeAnchorMath.ts`), and solve the arm's
 *   two-bone IK to place the hand bone at that world position/orientation.
 *   This file does not implement or assume any particular IK algorithm.
 */
export interface RuntimeGripAnchor {
  readonly position: Vec3Tuple;
  readonly rotationEuler: Vec3Tuple;
  readonly rotationOrder: 'XYZ';
}

export interface RuntimeWeaponAnchors {
  /** Local coordinates, meters, in the raw GLB's own space (X-long, muzzle at +X — see docs/forge/vortex-rifle-v0.2.md). */
  muzzleLocal: Vec3Tuple;
  casingLocal?: Vec3Tuple;
  /** Right hand — primary/trigger grip. See `RuntimeGripAnchor`'s doc comment for the full coordinate contract. */
  gripHandLocal: RuntimeGripAnchor;
  /** Left hand — support/foregrip. See `RuntimeGripAnchor`'s doc comment for the full coordinate contract. */
  gripSupportLocal: RuntimeGripAnchor;
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
 *
 * `gripHandLocal`/`gripSupportLocal` (Step 5, 2026-07-21, FINALIZED
 * 2026-07-21) — the values below are the CANONICAL, visually-calibrated
 * anchors, not the earlier provisional estimates. Calibration was done in
 * `/v2/range?grips=1` (`VortexGripTunerPanel`/`VortexGripAnchorDebug`,
 * both built this same step) with axes, palm proxies, and Kael-hand-basis
 * proxies enabled, against the real Vortex Rifle LOD1, checked across
 * hip-fire, ADS, single-shot, sustained fire, recoil recovery, reload,
 * inspect, and movement sway. `gripHandLocal` (named `rightHandGripLocal`
 * in the approval — mapped to this file's existing field name, no rename,
 * see docs/decisions.md) sits around the pistol grip with a believable
 * wrist angle; `gripSupportLocal` (approved as `leftHandGripLocal`) sits
 * at the forward support/handguard region, behind the muzzle. Superseded
 * provenance, kept for the record:
 * - `gripHandLocal.position`'s PROVISIONAL value came from a real
 *   geometric measurement (cross-sectional scan of the decompressed LOD1
 *   mesh, pistol-grip Y-min dip at x≈-0.258/y≈-0.135 against a
 *   y≈-0.060 baseline) — the approved x=-0.25/y=-0.065 is a small visual
 *   refinement of that same measured region, not a different feature.
 * - `gripSupportLocal.position`'s PROVISIONAL value (x=0.12/y=-0.02) was
 *   an ergonomic estimate on the handguard's near-uniform cylinder (no
 *   sharp geometric signature there) — the approved x=0.22/y=-0.05 moves
 *   it forward along that same cylinder to where it visually read
 *   correctly against the real geometry.
 * - Both `rotationEuler` PROVISIONAL values (-1.3/-0.3 rad) were
 *   deliberate starting estimates, explicitly flagged as not visually
 *   verified. The approved -1.1519/-0.5061 rad (-66°/-29°) replace them
 *   with values actually checked against the running scene.
 *
 * These remain TEMPORARY RUNTIME PROXIES, not authored GLB sockets — same
 * status as `muzzleLocal` above. A future Blender-authored v1.0 pass
 * should replace them with real `socket_grip_hand`/`socket_grip_support`
 * empties (see `manifest.ts`'s `plannedSockets` for the promotion path).
 * Kael's arms are still not mounted anywhere and no IK exists — these are
 * hand TARGETS, not a held weapon. The rifle still visibly floats in
 * normal `/v2/range` and `/v2/play` gameplay.
 */
export const VORTEX_RUNTIME_ANCHORS: RuntimeWeaponAnchors = {
  muzzleLocal: [0.47, -0.035, 0],
  casingLocal: [0.05, 0.02, 0.045],
  gripHandLocal: {
    position: [-0.25, -0.065, 0.0],
    rotationEuler: [0.0, 0.0, -1.1519],
    rotationOrder: 'XYZ',
  },
  gripSupportLocal: {
    position: [0.22, -0.05, 0.0],
    rotationEuler: [0.0, 0.0, -0.5061],
    rotationOrder: 'XYZ',
  },
};
