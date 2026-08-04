/**
 * Milestone 9E.2 — source-controlled drone visual-presentation offsets,
 * factored out of `DroneEnemy.tsx`'s own JSX so the muzzle-flash placement
 * (a real, shipped-then-fixed regression — see `docs/decisions.md`'s Step
 * 9E.1 entry) is one named, permanently-tested constant rather than an
 * unexplained numeric literal buried in JSX, where a future edit could
 * silently flip its sign back with no test ever noticing.
 *
 * FACING CONVENTION (the actual root cause of the original defect):
 * `DroneEnemy.tsx`'s `group.lookAt(facingTarget)` call uses
 * `THREE.Object3D.lookAt()`, which — for a plain (non-Camera/non-Light)
 * object — orients the object's LOCAL -Z AXIS AWAY from the look target,
 * not toward it (confirmed directly against this repo's own installed
 * `three` build, not from memory — see `droneVisualConfig.test.ts`). Any
 * child mesh that must render on the FACING (toward-target) side — the
 * muzzle flash, specifically — therefore has to sit at a POSITIVE local Z,
 * never negative. The pre-existing eye mesh (`position={[0, 0, -0.3]}`,
 * unchanged since Milestone 6) is NOT migrated to this constant — it
 * predates Milestone 9 entirely and very likely has the identical facing
 * issue, but fixing it is a separate, larger, out-of-scope change; see the
 * Step 9E.1 decisions.md entry for the full disclosure. This module is
 * scoped to the NEW 9E muzzle-flash mesh only.
 */
export const DRONE_MUZZLE_LOCAL_OFFSET: readonly [number, number, number] = [0, 0, 0.42] as const;
