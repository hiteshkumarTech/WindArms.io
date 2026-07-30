'use client';

import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { useLoadedPipelineAsset, useResolveModelSlot } from '@/lib/v2/pipeline';
import { getShadowWeaponWorldPose } from '@/lib/v2/operators/shadowWeaponWorldPose';
import { VORTEX_VIEWMODEL_POSES } from '@/lib/v2/weapons/vortexViewmodelPose';
import { useShadowArmTunerStore } from '@/lib/v2/operators/shadowArmTunerStore';
import { shadowArmDebugState } from '@/lib/v2/operators/shadowArmDebugState';
import { useShadowDebugStore } from '@/lib/v2/operators/shadowDebugStore';
import { applyOperatorRenderMode } from './renderModes';

/**
 * Step 8E-C.3 — a dedicated diagnostic-visible material for the shadow
 * weapon, used ONLY while `diagnosticVisibleMaterial` is on (dev-only
 * calibration). `applyOperatorRenderMode(instance, 'full')` — which
 * RESTORES the mesh's own authentic material — was tried first, since
 * that's exactly what the shadow BODY's own diagnostic toggle does. It
 * does not work for this asset: verified with a real-browser diagnostic
 * (a forced bright-magenta override proved the geometry/position/mounting
 * are all correct — the weapon really is where the grip-anchor math says
 * it is) that the weapon's OWN authentic PBR material renders essentially
 * black against this scene's lighting, indistinguishable from the
 * background at calibration viewing distance — the same underlying reason
 * the body's own "full" mode reads as a flat pale mannequin rather than its
 * true dark-clothed appearance, just more severe for the weapon's own
 * darker material.
 *
 * STEP 8E-C.3.1 REVISION: the original light-gray fill (0x9aa3ad, a mid
 * neutral only slightly darker than white) was readable against the dark
 * range background but NOT against the body's own diagnostic material,
 * which restores the character's real, near-white/pale skin+suit look
 * (see the paragraph above) — exactly where the weapon sits, between the
 * hands, it was low-contrast against that pale geometry, which is what the
 * human reviewer flagged as "not clearly readable between the hands" /
 * "looks empty-handed." A dark neutral gunmetal reads with strong contrast
 * against BOTH the pale body (dark-on-light) and the near-black scene
 * background `#0A1522` (still well above black), and the raised metalness
 * gives it a specular edge under the range's directional light that helps
 * its silhouette separate from both grounds at once. Still neutral, not a
 * saturated "obviously fake" diagnostic color.
 */
const WEAPON_DIAGNOSTIC_MATERIAL = new THREE.MeshStandardMaterial({ color: 0x3a4046, roughness: 0.35, metalness: 0.55 });
WEAPON_DIAGNOSTIC_MATERIAL.name = 'shadow_weapon_diagnostic_visible';

/**
 * Shadow-only Vortex Rifle follower (Milestone 8, Steps 8E-C/8E-C.2) —
 * DEVELOPMENT-ONLY, `/v2/range?shadow=1` exclusively (mounted by
 * `RangeScene.tsx` behind the same `useShadowDebugEnabled()` gate as
 * `KaelFirstPersonShadowBody.tsx`). One `SkeletonUtils.clone()` of the same
 * `vortex-rifle` LOD1 asset the visible viewmodel already uses, rendered
 * through the existing reversible `shadowOnly` mode — no independent
 * recoil/ADS/reload/inspect computation anywhere in this file.
 *
 * TRANSFORM OWNERSHIP (STEP 8E-C.2 REWORK): this component is now a PURE
 * READER of `shadowWeaponWorldPose.ts`, NOT `gripWorldPose.ts`. Step 8E-C's
 * original design copied `gripWorldPose.ts`'s CAMERA-RELATIVE
 * `weaponWorldPosition`/`weaponWorldQuaternion` directly — the same
 * intentionally camera-friendly transform that forced the shadow's arms
 * into up to 0.4m of shoulder translation to reach (rejected by human
 * review, see `docs/decisions.md`'s Step 8E-C.2 entry). This component now
 * follows the SEPARATE, chest-anchored transform
 * `KaelFirstPersonShadowBody.tsx` computes and publishes every frame
 * (`shadowWeaponPresentationPose.ts`) — reachable by construction, since
 * it's a small offset from the same chest bone the shadow's own arms solve
 * relative to. Still no independent recoil/ADS/reload/inspect computation
 * in THIS file: the weapon-transform math lives entirely in
 * `KaelFirstPersonShadowBody.tsx`/`shadowWeaponPresentationPose.ts`, this
 * component only reads the published result.
 */
export default function KaelFirstPersonShadowWeapon() {
  return (
    <ShadowWeaponErrorBoundary>
      <ShadowWeaponInner />
    </ShadowWeaponErrorBoundary>
  );
}

class ShadowWeaponErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn(`[kael-fp-shadowweapon] dev prototype failed to load — omitting. ${String(error)}`);
  }
  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

function ShadowWeaponInner() {
  const { url, lod, resolving } = useResolveModelSlot('vortex-rifle', { requestedLod: 1 });
  if (resolving || !url || lod === null) return null;
  return (
    <Suspense fallback={null}>
      <LoadedShadowWeapon url={url} lod={lod} />
    </Suspense>
  );
}

function LoadedShadowWeapon({ url, lod }: { url: string; lod: 0 | 1 | 2 }) {
  const result = useLoadedPipelineAsset('vortex-rifle', url, lod);
  const groupRef = useRef<THREE.Group>(null);
  const diagnosticActiveRef = useRef(false);

  // Same convention as every other shadow prototype clone this pass builds
  // on — one clone per mount, `SkeletonUtils.clone` works correctly on a
  // non-skinned mesh too (the Vortex Rifle has no skeleton; this is a plain
  // deep clone in that case), rendered through the existing reversible
  // `shadowOnly` mode. `useLoadedPipelineAsset`'s `result.scene` is a
  // useGLTF-cached, SHARED scene object — the visible `VortexViewmodel`
  // already mounts it directly via `<primitive object={result.scene}/>`
  // (see `PipelineModel.tsx`), so mounting the SAME object a second time
  // here would silently steal it from the visible weapon (`Object3D.add`
  // reparents, it does not duplicate) — cloning is not optional here.
  const instance = useMemo(() => {
    if (!result.scene) return null;
    const cloned = cloneSkeleton(result.scene);
    applyOperatorRenderMode(cloned, 'shadowOnly');
    cloned.traverse((node) => {
      if (node instanceof THREE.Mesh) node.frustumCulled = false;
    });
    return cloned;
  }, [result.scene]);

  useEffect(() => {
    return () => {
      shadowArmDebugState.weaponPoseReady = false;
    };
  }, []);

  useFrame(() => {
    const group = groupRef.current;
    if (!group || !instance) return;

    // Step 8E-C.3 — mirrors `KaelFirstPersonShadowBody.tsx`'s own
    // diagnostic-visible toggle (`shadowDebugStore.ts`) so the weapon's OWN
    // grip surfaces are actually visible during calibration (wrist-basis
    // review needs to see what the hand is gripping, not just the hand).
    // Engineering inspection only — same "no separate production guard
    // needed, already dev-gated" reasoning the body's own toggle documents.
    const diagnostic = useShadowDebugStore.getState().diagnosticVisibleMaterial;
    if (diagnostic !== diagnosticActiveRef.current) {
      diagnosticActiveRef.current = diagnostic;
      // 'shadowOnly' first either way — establishes the correct baseline
      // visible/castShadow state (reusing that existing logic rather than
      // duplicating it); diagnostic mode then overrides just the material
      // with the dedicated visible one above (see its own doc comment for
      // why `applyOperatorRenderMode(instance, 'full')` doesn't work here).
      applyOperatorRenderMode(instance, 'shadowOnly');
      if (diagnostic) {
        instance.traverse((n) => {
          if (n instanceof THREE.Mesh) n.material = WEAPON_DIAGNOSTIC_MATERIAL;
        });
      }
    }

    const enabled = useShadowArmTunerStore.getState().weaponShadowEnabled;
    const pose = getShadowWeaponWorldPose();
    const ready = enabled && pose.ready;
    group.visible = ready;
    shadowArmDebugState.weaponPoseReady = ready;
    if (!ready) return;

    group.position.copy(pose.position);
    group.quaternion.copy(pose.quaternion);
    shadowArmDebugState.weaponWorldPosition.copy(pose.position);
  });

  if (!instance) return null;
  return (
    <group ref={groupRef} name="kael_fp_shadowweapon_root_DEV_PROTOTYPE" scale={VORTEX_VIEWMODEL_POSES.hip.scale}>
      <primitive object={instance} />
    </group>
  );
}
