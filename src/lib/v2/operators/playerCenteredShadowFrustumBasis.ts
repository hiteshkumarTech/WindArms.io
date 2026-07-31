import * as THREE from 'three';

/**
 * Step 8E-D.1 — fixed light-space basis math for the player-centered
 * shadow frustum. Split out of `KaelPlayerCenteredShadowController.tsx` so
 * this part of the tracking pipeline (unlike the controller itself, which
 * needs a live R3F/Canvas context this codebase has no test harness for —
 * see `shadowReviewStore.test.ts`'s own scoping note) stays unit-testable
 * in plain Node via `tsx --test`. Depends on `three` for `Vector3`/`Matrix4`
 * (unavoidable for real projection math — see `playerCenteredShadowFrustum.ts`'s
 * own doc comment for why ITS math stays framework-free instead), but has no
 * React/browser/Canvas dependency of its own: every function here is a pure
 * function of its explicit inputs, never reads global/module state.
 *
 * The canonical light/target geometry `(12,22,8)` → `(0,0,0)` is the SAME
 * pair `docs/decisions.md`'s Step 8E-D entry confirmed empirically — this
 * module takes them as parameters rather than hardcoding them a second time,
 * so the controller's own constants stay the single source of truth.
 */

/** A fixed (never-moving) world↔light-space transform pair, built once from a light position and its target. */
export interface FixedLightSpaceBasis {
  /** Light-space → world-space. */
  readonly worldMatrix: THREE.Matrix4;
  /** World-space → light-space (the inverse of `worldMatrix`). */
  readonly viewMatrix: THREE.Matrix4;
}

/**
 * Builds a FIXED light-space reference frame from a light position and the
 * point it looks at — uses a detached `THREE.Camera` (never parented into
 * any scene graph, never rendered through) so the result can only change if
 * this function is called again, never as a side effect of anything else in
 * the scene updating.
 *
 * MUST be a `Camera` (or `Light`), NOT a plain `Object3D` — `Object3D.lookAt`
 * special-cases `this.isCamera || this.isLight`: camera/light objects orient
 * with the standard -Z-forward convention (`Matrix4.lookAt(eye, target,
 * up)`), while a plain `Object3D` gets the OPPOSITE, swapped-argument
 * convention (meant for e.g. an arrow mesh whose +Z should point at a
 * target) — a real, easy-to-miss THREE.js behavior difference (caught by
 * this module's own round-trip test, which failed with a mirrored basis
 * before this was a `Camera`). THREE's real `DirectionalLightShadow.camera`
 * IS a `THREE.OrthographicCamera` and calls this exact same
 * `camera.lookAt(target)` — using a `Camera` here, not `Object3D`, is what
 * makes this basis's rotation identical to the real (live) shadow camera's
 * own, so a snap computed in this basis lines up with the shadow map's
 * actual texel grid.
 */
export function buildFixedLightSpaceBasis(lightPosition: THREE.Vector3, targetPosition: THREE.Vector3): FixedLightSpaceBasis {
  const referenceFrame = new THREE.Camera();
  referenceFrame.position.copy(lightPosition);
  referenceFrame.lookAt(targetPosition);
  referenceFrame.updateMatrixWorld(true);
  const worldMatrix = referenceFrame.matrixWorld.clone();
  const viewMatrix = worldMatrix.clone().invert();
  return { worldMatrix, viewMatrix };
}

/** Projects a world-space point into the given fixed light-space basis. Writes into `out`, returns `out`. */
export function projectWorldToLightSpace(worldPoint: THREE.Vector3, basis: FixedLightSpaceBasis, out: THREE.Vector3): THREE.Vector3 {
  return out.copy(worldPoint).applyMatrix4(basis.viewMatrix);
}

/** Reconstructs a world-space point from a light-space point, using the given fixed basis. Writes into `out`, returns `out`. */
export function reconstructWorldFromLightSpace(lightSpacePoint: THREE.Vector3, basis: FixedLightSpaceBasis, out: THREE.Vector3): THREE.Vector3 {
  return out.copy(lightSpacePoint).applyMatrix4(basis.worldMatrix);
}
