'use client';

import { Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { applyAccentTint, useLoadedPipelineAsset, useResolveModelSlot, type LodLevel } from '@/lib/v2/pipeline';
import {
  getOperatorDefinition,
  getOperatorSkin,
  resolveOperatorModelSlot,
  type OperatorAnimationState,
  type OperatorDefinition,
  type OperatorId,
  type OperatorSkinDef,
} from '@/lib/v2/operators';
import OperatorSilhouette from './OperatorSilhouette';
import { applyOperatorRenderMode, type OperatorRenderMode } from './renderModes';
import { useOperatorAnimations, type OperatorAnimator } from './hooks/useOperatorAnimations';
import { useOperatorSockets, type OperatorSocketLookup } from './hooks/useOperatorSockets';

/**
 * THE operator component (Phase 5, 2026-07-17). Lobby character, hero
 * page, killcam, spectator, victory podium, and the future in-game third-
 * person model all render THIS — never a bespoke wrapper per context.
 * First-person contexts mount it through FirstPersonOperatorRig.
 *
 * What it owns: slot resolution (LOD-aware, via the existing pipeline),
 * per-instance skeleton cloning (two pawns of the same operator must not
 * fight over one skeleton — SkeletonUtils.clone, the three.js-sanctioned
 * path for skinned meshes), socket resolution (typed, with humanoid bone
 * fallbacks), animation state playback (sixteen states, config-driven),
 * render modes (full / armsOnly / bodyHidden / shadowOnly), skin
 * resolution (accent tint via the pipeline's existing material system, or
 * full model-slot override), and the procedural silhouette fallback.
 *
 * What it deliberately does NOT own: movement, input, networking, ability
 * logic — no gameplay. Consumers drive it entirely through props and the
 * OperatorModelHandle it hands back.
 */
export interface OperatorModelHandle {
  operatorId: OperatorId;
  def: OperatorDefinition;
  /** The live per-instance scene root (the clone — safe to read transforms from; do not reparent). */
  object: THREE.Object3D;
  animator: OperatorAnimator;
  sockets: OperatorSocketLookup;
  skin: OperatorSkinDef;
  resolvedLod: LodLevel;
}

export interface OperatorModelProps {
  operatorId: OperatorId;
  /** Skin to render — falls back to the operator's default skin when omitted/unknown. */
  skinId?: string;
  renderMode?: OperatorRenderMode;
  /**
   * Animation state to be in. Changing this prop crossfades states with
   * zero component rewrites — every current and future state (types.ts's
   * OperatorAnimationState) arrives through this one prop.
   */
  animationState?: OperatorAnimationState;
  /** Replaces the default procedural silhouette while no GLB exists / is loading. */
  fallback?: ReactNode;
  /** Passed to the silhouette's breathing today; the GLB path keys nothing off it (clip playback isn't motion-reduced — pausing a character mid-pose reads as a bug, not an accommodation). */
  reducedMotion?: boolean;
  /** Fired once per loaded instance (model + sockets + animator ready). Never fires while the slot resolves to the fallback. */
  onReady?: (handle: OperatorModelHandle) => void;
}

/** Applies the render mode to the procedural fallback subtree (armsOnly hides everything — there IS no arms asset until Phase 7, and pretending otherwise would be a fake implementation). */
function FallbackWrapper({ mode, children }: { mode: OperatorRenderMode; children: ReactNode }) {
  const wrapperRef = useRef<THREE.Group>(null);

  useEffect(() => {
    if (wrapperRef.current) applyOperatorRenderMode(wrapperRef.current, mode);
  }, [mode]);

  return <group ref={wrapperRef}>{children}</group>;
}

function LoadedOperator({
  def,
  skin,
  slot,
  url,
  lod,
  renderMode,
  animationState,
  onReady,
}: {
  def: OperatorDefinition;
  skin: OperatorSkinDef;
  slot: string;
  url: string;
  lod: LodLevel;
  renderMode: OperatorRenderMode;
  animationState: OperatorAnimationState;
  onReady?: (handle: OperatorModelHandle) => void;
}) {
  const result = useLoadedPipelineAsset(slot, url, lod);

  // Per-instance clone. useGLTF caches one scene per URL; rendering that
  // cached graph in two places at once reparents it back and forth, and a
  // second AnimationMixer on it fights the first. SkeletonUtils.clone
  // duplicates the node/bone hierarchy while SHARING geometry/materials
  // (cheap), which is also why we never dispose it here — the useGLTF
  // cache owns those resources.
  const instance = useMemo(() => {
    if (!result.scene) return null;
    const cloned = cloneSkeleton(result.scene);
    cloned.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        node.castShadow = true;
        node.frustumCulled = false; // skinned bounds lag the pose; standard practice for characters
      }
    });
    return cloned;
  }, [result.scene]);

  const sockets = useOperatorSockets(instance, def.attachments);
  const animator = useOperatorAnimations(instance, result.clips, def.animation, animationState);

  useEffect(() => {
    if (instance) applyOperatorRenderMode(instance, renderMode);
  }, [instance, renderMode]);

  // Skin accent tint — the pipeline's existing single-accent system. Only
  // applied when the skin actually declares one; the base model's authored
  // materials are otherwise untouched.
  useEffect(() => {
    if (instance && skin.accentTint) applyAccentTint(instance, skin.accentTint);
  }, [instance, skin.accentTint]);

  useEffect(() => {
    animator.play(animationState);
  }, [animator, animationState]);

  useEffect(() => {
    if (!instance) return;
    onReady?.({
      operatorId: def.id,
      def,
      object: instance,
      animator,
      sockets,
      skin,
      resolvedLod: lod,
    });
    // Fire once per loaded instance — not on every animator/sockets identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance]);

  if (!instance) return null;
  return (
    <group scale={def.visual.scale} position={[0, def.visual.groundOffsetY, 0]}>
      <primitive object={instance} />
    </group>
  );
}

export default function OperatorModel({
  operatorId,
  skinId,
  renderMode = 'full',
  animationState = 'idle',
  fallback,
  reducedMotion = false,
  onReady,
}: OperatorModelProps) {
  const def = getOperatorDefinition(operatorId);
  const skin = getOperatorSkin(def, skinId);
  const slot = resolveOperatorModelSlot(def, skin);
  const { url, lod, resolving } = useResolveModelSlot(slot);

  const fallbackNode = (
    <FallbackWrapper mode={renderMode}>
      {fallback ?? <OperatorSilhouette accent={def.meta.content.accent} reducedMotion={reducedMotion} />}
    </FallbackWrapper>
  );

  if (resolving || !url || lod === null) {
    return fallbackNode;
  }

  return (
    <Suspense fallback={fallbackNode}>
      <LoadedOperator
        def={def}
        skin={skin}
        slot={slot}
        url={url}
        lod={lod}
        renderMode={renderMode}
        animationState={animationState}
        onReady={onReady}
      />
    </Suspense>
  );
}
