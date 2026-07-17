'use client';

import { forwardRef, useImperativeHandle, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { getOperatorDefinition, type OperatorAnimationState, type OperatorId } from '@/lib/v2/operators';
import OperatorModel, { type OperatorModelHandle } from './OperatorModel';
import type { OperatorRenderMode } from './renderModes';

/**
 * First-person mounting architecture (Phase 5, 2026-07-17). Mount this
 * under the camera (or a camera-following group); it establishes the
 * pivot chain every future FP system drives WITHOUT touching this file:
 *
 *   cameraMount (eye alignment: model dropped so eyes sit at the camera)
 *     └─ swayPivot    ← future weapon/hand sway writes rotation here
 *          └─ recoilPivot  ← future procedural recoil (the existing
 *               │            src/lib/v2/range/viewKick.ts spring is the
 *               │            intended driver — per-frame ref writes, no
 *               │            React state, per the repo's camera rule)
 *               └─ OperatorModel (renderMode per `bodyMode`)
 *
 * Pivots are exposed imperatively via ref — the same contract the range's
 * viewmodel systems already use. Hand IK and full-body FP animation attach
 * at the OperatorModel handle (bones/sockets) in later phases; nothing
 * here needs rewriting for that, which is the entire point of the split.
 *
 * NO input, NO shooting, NO movement — this is the mount, not the game.
 */
export type FirstPersonBodyMode = 'armsOnly' | 'fullBody' | 'bodyHidden' | 'shadowOnly';

const BODY_MODE_TO_RENDER_MODE: Record<FirstPersonBodyMode, OperatorRenderMode> = {
  armsOnly: 'armsOnly',
  fullBody: 'full',
  bodyHidden: 'bodyHidden',
  shadowOnly: 'shadowOnly',
};

export interface FirstPersonOperatorRigHandle {
  /** Write rotation/position offsets here every frame for sway. Never read back into React state. */
  swayPivot: THREE.Group | null;
  /** Write recoil kick offsets here (viewKick-style spring output). */
  recoilPivot: THREE.Group | null;
  /** Loaded model handle (sockets/animator) — null until the operator GLB loads. */
  model: OperatorModelHandle | null;
}

export interface FirstPersonOperatorRigProps {
  operatorId: OperatorId;
  bodyMode?: FirstPersonBodyMode;
  skinId?: string;
  animationState?: OperatorAnimationState;
  /**
   * Eye-line correction: how far below the camera the model's feet sit.
   * Defaults to -targetHeightM × 0.93 (standing eye height ≈ 93% of
   * stature — standard anthropometric ratio). Override per-context once a
   * real rig's measured eye bone says otherwise.
   */
  eyeOffsetY?: number;
  /** Extra content mounted inside recoilPivot alongside the body — e.g. the held weapon's viewmodel, so sway/recoil move body and weapon as one. */
  children?: ReactNode;
  onModelReady?: (handle: OperatorModelHandle) => void;
}

const FirstPersonOperatorRig = forwardRef<FirstPersonOperatorRigHandle, FirstPersonOperatorRigProps>(
  function FirstPersonOperatorRig(
    { operatorId, bodyMode = 'armsOnly', skinId, animationState = 'idle', eyeOffsetY, children, onModelReady },
    ref,
  ) {
    const def = getOperatorDefinition(operatorId);
    const swayRef = useRef<THREE.Group>(null);
    const recoilRef = useRef<THREE.Group>(null);
    // A loaded-model handle is genuinely async state (arrives once, on GLB
    // load) — this is not per-frame data, so useState is correct here.
    const [model, setModel] = useState<OperatorModelHandle | null>(null);

    useImperativeHandle(
      ref,
      () => ({
        get swayPivot() {
          return swayRef.current;
        },
        get recoilPivot() {
          return recoilRef.current;
        },
        model,
      }),
      [model],
    );

    const resolvedEyeOffsetY = eyeOffsetY ?? -def.visual.targetHeightM * 0.93;

    const handleReady = (handle: OperatorModelHandle) => {
      setModel(handle);
      onModelReady?.(handle);
    };

    return (
      <group name="fp_operator_rig" position={[0, resolvedEyeOffsetY, 0]}>
        <group ref={swayRef} name="fp_sway_pivot">
          <group ref={recoilRef} name="fp_recoil_pivot">
            <OperatorModel
              operatorId={operatorId}
              skinId={skinId}
              renderMode={BODY_MODE_TO_RENDER_MODE[bodyMode]}
              animationState={animationState}
              onReady={handleReady}
            />
            {children}
          </group>
        </group>
      </group>
    );
  },
);

export default FirstPersonOperatorRig;
