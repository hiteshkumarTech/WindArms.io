import * as THREE from 'three';

/**
 * Kael FP-arms bone resolution and rest-pose metrics (Milestone 7, Phase
 * F, Step 6). This is the RUNTIME (browser, per-loaded-skeleton) analog of
 * `tools/blender/inspect-kael-hand-basis.py` — same normalize/candidate
 * bone-resolution convention as every prior Blender script in this
 * pipeline (`inspect-kael-rig.py`, `make-kael-fp-arms.py`), ported to
 * TypeScript because the Python side can't run in a browser. Measures
 * hand basis FRESH from whatever skeleton is actually loaded rather than
 * hardcoding the Blender-measured numbers from the source-GLB inspection —
 * more robust (self-verifying against the real runtime asset, not a
 * potentially-stale constant) and matches this step's explicit
 * instruction: "from the real cloned Kael skeleton, measure once."
 */

const PREFIX_STRIP = ['mixamorig:', 'mixamorig_', 'mixamorig', 'def-', 'def_', 'armature_'];

export function normalizeBoneName(name: string): string {
  const lower = name.trim().toLowerCase();
  for (const prefix of PREFIX_STRIP) {
    if (lower.startsWith(prefix.toLowerCase())) return lower.slice(prefix.length);
  }
  return lower;
}

const SIDE_CHAIN_CANDIDATES: Record<string, Record<'left' | 'right', string[]>> = {
  shoulder: { left: ['leftshoulder', 'shoulder_l', 'clavicle_l', 'clavicle.l'], right: ['rightshoulder', 'shoulder_r', 'clavicle_r', 'clavicle.r'] },
  upper_arm: { left: ['leftarm', 'upperarm_l', 'arm_l', 'upperarm.l'], right: ['rightarm', 'upperarm_r', 'arm_r', 'upperarm.r'] },
  lower_arm: { left: ['leftforearm', 'lowerarm_l', 'forearm_l', 'lowerarm.l'], right: ['rightforearm', 'lowerarm_r', 'forearm_r', 'lowerarm.r'] },
  hand: { left: ['lefthand', 'hand_l', 'hand.l'], right: ['righthand', 'hand_r', 'hand.r'] },
};

const FINGER_PREFIXES: Record<string, Record<'left' | 'right', string>> = {
  thumb: { left: 'lefthandthumb', right: 'righthandthumb' },
  index: { left: 'lefthandindex', right: 'righthandindex' },
  middle: { left: 'lefthandmiddle', right: 'righthandmiddle' },
  ring: { left: 'lefthandring', right: 'righthandring' },
  pinky: { left: 'lefthandpinky', right: 'righthandpinky' },
};

export interface ResolvedSideBones {
  shoulder: THREE.Bone | null;
  upperArm: THREE.Bone;
  lowerArm: THREE.Bone;
  hand: THREE.Bone;
  /** Finger chains, each an ordered array of 1+ segment bones (1st = MCP joint nearest the hand). Missing entirely if unresolved — a finger is cosmetic, never a hard-fail bone. */
  fingers: Partial<Record<'thumb' | 'index' | 'middle' | 'ring' | 'pinky', THREE.Bone[]>>;
}

export interface ResolvedArmBones {
  left: ResolvedSideBones;
  right: ResolvedSideBones;
}

export class MissingCriticalBoneError extends Error {
  constructor(public readonly side: 'left' | 'right', public readonly chain: string) {
    super(`Kael FP-arms: required bone chain "${chain}" not found on the ${side} side.`);
    this.name = 'MissingCriticalBoneError';
  }
}

/**
 * Resolves the required arm chains + finger chains against a loaded
 * skeleton root. Throws `MissingCriticalBoneError` for a missing shoulder/
 * upper-arm/lower-arm/hand bone (caller must catch this and fall back per
 * Step 3/16 — "omit the arms, keep Vortex playable, warn once, never
 * crash"). A missing shoulder specifically is NOT critical (many rigs
 * fold clavicle rotation into the upper-arm bone) — only upper-arm/
 * lower-arm/hand are hard requirements. Missing finger chains are never
 * critical (fingers are cosmetic additive posing, Step 10).
 */
export function resolveKaelArmBones(root: THREE.Object3D): ResolvedArmBones {
  const byNormalizedName = new Map<string, THREE.Bone>();
  root.traverse((node) => {
    if ((node as THREE.Bone).isBone) {
      const key = normalizeBoneName(node.name);
      if (!byNormalizedName.has(key)) byNormalizedName.set(key, node as THREE.Bone);
    }
  });

  function resolveChain(chainKey: string, side: 'left' | 'right'): THREE.Bone | null {
    for (const candidate of SIDE_CHAIN_CANDIDATES[chainKey][side]) {
      const found = byNormalizedName.get(candidate);
      if (found) return found;
    }
    return null;
  }

  function resolveFinger(finger: string, side: 'left' | 'right'): THREE.Bone[] {
    const prefix = FINGER_PREFIXES[finger][side];
    const segments: THREE.Bone[] = [];
    // Segments 1..6 covers every rig convention seen in this pipeline so far
    // (Mixamo goes to 4; generous upper bound costs nothing, a missing
    // segment number just isn't found and the loop naturally stops being
    // useful past the real count).
    for (let i = 1; i <= 6; i++) {
      const bone = byNormalizedName.get(`${prefix}${i}`);
      if (bone) segments.push(bone);
    }
    return segments;
  }

  function resolveSide(side: 'left' | 'right'): ResolvedSideBones {
    const upperArm = resolveChain('upper_arm', side);
    const lowerArm = resolveChain('lower_arm', side);
    const hand = resolveChain('hand', side);
    if (!upperArm) throw new MissingCriticalBoneError(side, 'upper_arm');
    if (!lowerArm) throw new MissingCriticalBoneError(side, 'lower_arm');
    if (!hand) throw new MissingCriticalBoneError(side, 'hand');

    const fingers: ResolvedSideBones['fingers'] = {};
    for (const finger of ['thumb', 'index', 'middle', 'ring', 'pinky'] as const) {
      const segments = resolveFinger(finger, side);
      if (segments.length > 0) fingers[finger] = segments;
    }

    return { shoulder: resolveChain('shoulder', side), upperArm, lowerArm, hand, fingers };
  }

  return { left: resolveSide('left'), right: resolveSide('right') };
}

/**
 * Per-side rest-pose metrics, measured ONCE per mounted skeleton instance
 * (never re-traversed per frame — Step 6/17's explicit requirement).
 * Positions/directions/quaternions are expressed CONTAINER-RELATIVE (i.e.
 * relative to the arm-rig root group's own local frame at measurement
 * time), NOT raw THREE.js world space — the container itself moves every
 * frame (camera-follow, see KaelFirstPersonArms.tsx), so a cached "world"
 * value would go stale the instant the camera moves. The consuming
 * component re-projects these into CURRENT world space each frame via one
 * cheap `localToWorld`/quaternion-compose per side, using the container's
 * own already-current-this-frame transform — see that file's useFrame.
 */
export interface ArmRestMetrics {
  shoulderLocalPos: THREE.Vector3;
  elbowLocalPos: THREE.Vector3;
  handLocalPos: THREE.Vector3;
  upperLength: number;
  lowerLength: number;
  /** Upper-arm bone's rest quaternion, container-relative. */
  restUpperQuat: THREE.Quaternion;
  /** Lower-arm bone's rest quaternion, container-relative. */
  restLowerQuat: THREE.Quaternion;
  /** Container-relative direction, shoulder->elbow, unit length. */
  restUpperDir: THREE.Vector3;
  /** Container-relative direction, elbow->hand, unit length. */
  restLowerDir: THREE.Vector3;
  /** Hand bone's rest quaternion, container-relative. */
  restHandQuat: THREE.Quaternion;
  /**
   * Basis-correction quaternion Q such that, in the HAND BONE'S OWN LOCAL
   * space, `Q.apply((1,0,0))` = this hand's measured finger-forward
   * direction, `Q.apply((0,1,0))` = thumb direction, `Q.apply((0,0,1))` =
   * palm-normal — i.e. Q maps the CANONICAL weapon-grip-anchor basis
   * (see vortexRuntimeAnchors.ts's RuntimeGripAnchor coordinate contract)
   * onto THIS hand's actual measured rest geometry. Purely local-to-local
   * (bone-space to bone-space) — independent of the container/camera, so
   * it never needs recomputation after the initial measurement.
   */
  handBasisCorrection: THREE.Quaternion;
}

/**
 * Measures one side's rest metrics. `container` must be the arm-rig root
 * the bones are (transitively) parented under; measurement reads each
 * bone's CURRENT world transform and converts to container-relative via
 * the container's CURRENT world matrix — call this once, immediately
 * after the skeleton is parented under the container and BEFORE any IK
 * has been applied (bones must still be in their authored rest pose).
 */
export function measureArmRestMetrics(container: THREE.Object3D, side: ResolvedSideBones): ArmRestMetrics {
  container.updateWorldMatrix(true, false);
  const containerInverse = new THREE.Matrix4().copy(container.matrixWorld).invert();
  const containerWorldQuat = new THREE.Quaternion();
  container.getWorldQuaternion(containerWorldQuat);
  const containerQuatInverse = containerWorldQuat.clone().invert();

  const shoulderWorld = new THREE.Vector3();
  side.upperArm.getWorldPosition(shoulderWorld);
  const elbowWorld = new THREE.Vector3();
  side.lowerArm.getWorldPosition(elbowWorld);
  const handWorld = new THREE.Vector3();
  side.hand.getWorldPosition(handWorld);

  const shoulderLocalPos = shoulderWorld.clone().applyMatrix4(containerInverse);
  const elbowLocalPos = elbowWorld.clone().applyMatrix4(containerInverse);
  const handLocalPos = handWorld.clone().applyMatrix4(containerInverse);

  const upperArmWorldQuat = new THREE.Quaternion();
  side.upperArm.getWorldQuaternion(upperArmWorldQuat);
  const lowerArmWorldQuat = new THREE.Quaternion();
  side.lowerArm.getWorldQuaternion(lowerArmWorldQuat);
  const handWorldQuat = new THREE.Quaternion();
  side.hand.getWorldQuaternion(handWorldQuat);

  const restUpperQuat = containerQuatInverse.clone().multiply(upperArmWorldQuat);
  const restLowerQuat = containerQuatInverse.clone().multiply(lowerArmWorldQuat);
  const restHandQuat = containerQuatInverse.clone().multiply(handWorldQuat);

  const upperLength = shoulderLocalPos.distanceTo(elbowLocalPos);
  const lowerLength = elbowLocalPos.distanceTo(handLocalPos);
  const restUpperDir = elbowLocalPos.clone().sub(shoulderLocalPos).normalize();
  const restLowerDir = handLocalPos.clone().sub(elbowLocalPos).normalize();

  const handBasisCorrection = measureHandBasisCorrection(side, handWorld, handWorldQuat);

  return {
    shoulderLocalPos,
    elbowLocalPos,
    handLocalPos,
    upperLength,
    lowerLength,
    restUpperQuat,
    restLowerQuat,
    restUpperDir,
    restLowerDir,
    restHandQuat,
    handBasisCorrection,
  };
}

/**
 * Recenters both sides' measured rest positions around their shared
 * shoulder midpoint, returning that midpoint (the "anchor") for the caller
 * to also apply as a position offset to the mesh/skeleton root itself.
 *
 * WHY THIS EXISTS (blocker fix, 2026-07-22): `measureArmRestMetrics` reads
 * bone positions relative to whatever frame `container` had AT MEASUREMENT
 * TIME. `KaelFirstPersonArms.tsx` measures with the freshly-cloned skeleton
 * still unparented (identity transform) — so the returned "local" positions
 * equal the RAW skeleton-authored world coordinates. `operator-kael-arms.glb`
 * is authored in full-body character space (hips/shoulders around y=1.0-
 * 1.5m, matching the body derivative's "feet at origin" convention), NOT
 * shoulder/camera-relative — left uncorrected, those raw coordinates get
 * reprojected through the camera-following arm-rig container at runtime,
 * placing both the rendered mesh and the IK solver's own shoulder-position
 * reference roughly 1.5m above the camera (arms mounted, IK "running," but
 * nothing visible in the normal forward view — the exact reported bug).
 *
 * This function performs HALF the fix (the cached metrics); the caller must
 * ALSO apply the same anchor, negated, as the mesh root's own position —
 * shifting metrics alone is not sufficient, since IK only ever writes bone
 * ROTATIONS (never positions), so the arm's true rendered pivot is fixed by
 * the untouched rest-pose chain above it and can only be relocated by
 * moving the mesh root itself. See `KaelFirstPersonArms.tsx`'s `runtime`
 * useMemo for the paired call.
 *
 * A pure rigid translation: `upperLength`/`lowerLength`/`restUpperDir`/
 * `restLowerDir`/every quaternion are differences or rotations, unaffected
 * by subtracting a constant from three absolute positions — untouched here.
 */
export function recenterArmMetrics(left: ArmRestMetrics, right: ArmRestMetrics): THREE.Vector3 {
  const anchor = left.shoulderLocalPos.clone().add(right.shoulderLocalPos).multiplyScalar(0.5);
  for (const metrics of [left, right]) {
    metrics.shoulderLocalPos.sub(anchor);
    metrics.elbowLocalPos.sub(anchor);
    metrics.handLocalPos.sub(anchor);
  }
  return anchor;
}

/**
 * Measures the hand-basis correction directly from the loaded skeleton's
 * rest pose — the runtime equivalent of
 * `tools/blender/inspect-kael-hand-basis.py`'s finger_forward_direction /
 * thumb_direction / palm_normal_raw computation (same landmark bones:
 * Hand, Thumb1, Index1, Pinky1; same three-point cross-product method for
 * the palm normal). Entirely LOCAL-TO-LOCAL (hand bone's own local space
 * in, hand bone's own local space out via the world quaternion divide) —
 * never needs the container or any other external frame.
 */
function measureHandBasisCorrection(side: ResolvedSideBones, handWorldPos: THREE.Vector3, handWorldQuat: THREE.Quaternion): THREE.Quaternion {
  const index1 = side.fingers.index?.[0];
  const thumb1 = side.fingers.thumb?.[0];
  const pinky1 = side.fingers.pinky?.[0] ?? side.fingers.middle?.[0];

  if (!index1 || !thumb1 || !pinky1) {
    // No finger data to measure a real basis from — identity correction
    // (better than throwing; caller decides whether this is acceptable,
    // see the "missing fingers" fallback note in KaelFirstPersonArms.tsx).
    return new THREE.Quaternion();
  }

  const index1World = new THREE.Vector3();
  index1.getWorldPosition(index1World);
  const thumb1World = new THREE.Vector3();
  thumb1.getWorldPosition(thumb1World);
  const pinky1World = new THREE.Vector3();
  pinky1.getWorldPosition(pinky1World);

  const fingerForwardWorld = index1World.clone().sub(handWorldPos).normalize();
  const thumbWorld = thumb1World.clone().sub(handWorldPos).normalize();
  const edge1 = thumb1World.clone().sub(handWorldPos);
  const edge2 = pinky1World.clone().sub(handWorldPos);
  let palmNormalWorld = edge1.clone().cross(edge2);
  if (palmNormalWorld.lengthSq() < 1e-9) palmNormalWorld = fingerForwardWorld.clone();
  palmNormalWorld.normalize();

  const handQuatInverse = handWorldQuat.clone().invert();
  const fingerForwardLocal = fingerForwardWorld.clone().applyQuaternion(handQuatInverse).normalize();
  const palmNormalRaw = palmNormalWorld.clone().applyQuaternion(handQuatInverse).normalize();

  // makeBasis()/setFromRotationMatrix() require a genuinely ORTHONORMAL
  // input — the three raw measured directions (finger-forward, thumb,
  // palm-normal-via-cross-product) are NOT guaranteed mutually
  // perpendicular for arbitrary real hand geometry (only the cross-product
  // is perpendicular to the two edges it was built from, not to
  // finger-forward). Feeding a non-orthogonal basis into makeBasis silently
  // produces an invalid (non-unit, non-finite-after-normalization)
  // quaternion — caught by a test asserting unit length on a synthetic rig
  // with non-perpendicular finger offsets, exactly the kind of real-world
  // geometry this needs to survive. Fixed with Gram-Schmidt: keep
  // finger-forward as the trusted primary axis, orthogonalize palm-normal
  // against it, then derive thumb-side algebraically as the exact cross
  // product of the other two — guarantees a valid orthonormal right-handed
  // basis (X x Y = Z: fingerForward x thumbSide = palmNormal) instead of
  // trusting three independently-measured, not-quite-perpendicular vectors.
  const palmNormalLocal = palmNormalRaw.clone().addScaledVector(fingerForwardLocal, -palmNormalRaw.dot(fingerForwardLocal));
  if (palmNormalLocal.lengthSq() < 1e-9) {
    // finger-forward and the raw palm-normal ended up collinear (degenerate
    // hand geometry) — fall back to an arbitrary stable perpendicular.
    palmNormalLocal.set(0, 1, 0);
    if (Math.abs(palmNormalLocal.dot(fingerForwardLocal)) > 0.99) palmNormalLocal.set(1, 0, 0);
    palmNormalLocal.addScaledVector(fingerForwardLocal, -fingerForwardLocal.dot(palmNormalLocal));
  }
  palmNormalLocal.normalize();
  const thumbLocal = palmNormalLocal.clone().cross(fingerForwardLocal).normalize();

  // Q maps canonical X/Y/Z -> [fingerForwardLocal, thumbLocal, palmNormalLocal].
  const basisMatrix = new THREE.Matrix4().makeBasis(fingerForwardLocal, thumbLocal, palmNormalLocal);
  const q = new THREE.Quaternion().setFromRotationMatrix(basisMatrix);
  return q;
}
