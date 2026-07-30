'use client';

import { useEffect, useState } from 'react';
import { useBodyDebugStore } from '@/lib/v2/operators/bodyDebugStore';
import { bodyDebugReadout } from '@/lib/v2/operators/bodyDebugReadout';
import { getFirstPersonBodyWorldPose } from '@/lib/v2/operators/firstPersonBodyPose';
import { getSharedLowerBodyLocomotionPose } from '@/lib/v2/operators/lowerBodyLocomotionPoseBridge';
import { RANGE_SHADOW_CAMERA_BOUNDS } from '@/lib/v2/range/rangeEnvironmentBounds';
import { shadowBodyDebugReadout } from '@/lib/v2/operators/shadowBodyDebugReadout';
import { shadowArmDebugState } from '@/lib/v2/operators/shadowArmDebugState';
import { useShadowDebugStore } from '@/lib/v2/operators/shadowDebugStore';
import { useShadowArmTunerStore, formatShadowArmConfigAsCode } from '@/lib/v2/operators/shadowArmTunerStore';
import { SHADOW_ARM_IK_CONFIG } from '@/lib/v2/operators/shadowArmIkConfig';
import { SHADOW_BODY_PHYSICAL_LOCAL_OFFSET } from '@/lib/v2/operators/shadowBodyTransform';
import { getGripWorldPose } from '@/lib/v2/weapons/gripWorldPose';

/**
 * Dev-only Kael first-person shadow panel (Milestone 8, Steps 8E-B + 8E-C)
 * — `/v2/range?shadow=1` only, gated by `useShadowDebugEnabled()` at the
 * mount site (`RangeView.tsx`), same convention as `KaelBodyDebugPanel.tsx`.
 * The "freeze shared locomotion" checkbox below calls
 * `useBodyDebugStore`'s existing `toggleFreezeStride()` directly (Step
 * 8D) — NOT a separate control — proving by construction that the visible
 * body and this shadow prototype share one runtime, not two.
 */
export default function KaelShadowDebugPanel() {
  const bodyDebug = useBodyDebugStore();
  const shadowDebug = useShadowDebugStore();
  const armTuner = useShadowArmTunerStore();
  const [readout, setReadout] = useState<{
    poseReady: boolean;
    bridgeGeneration: number;
    sharedPhase: number;
    sharedState: string;
    visibleState: string;
    shadowReady: boolean;
    shadowMeshCount: number;
    shadowJointCount: number;
    shadowCastShadowMeshCount: number;
    shadowRootWorldPosition: [number, number, number];
    shadowEffectiveYaw: number;
    boneResolutionFailed: boolean;
    armsReady: boolean;
    armBoneResolutionFailed: boolean;
    gripGeneration: number;
    gripReady: boolean;
    weaponPoseReady: boolean;
    rightPositionErrorCm: number;
    leftPositionErrorCm: number;
    rightRotationErrorDeg: number;
    leftRotationErrorDeg: number;
    rightReachClamped: boolean;
    leftReachClamped: boolean;
    chestResolved: boolean;
    chestBoneCount: number;
    aimPitchRawDeg: number;
    aimPitchSmoothedDeg: number;
    appliedChestPitchDeg: number;
    rightReachDeficitCm: number;
    leftReachDeficitCm: number;
    rightShoulderWorldPos: [number, number, number];
    leftShoulderWorldPos: [number, number, number];
    rightTargetWorldPos: [number, number, number];
    leftTargetWorldPos: [number, number, number];
    rightPreAssistShoulderWorldPos: [number, number, number];
    leftPreAssistShoulderWorldPos: [number, number, number];
    rightAssistMagCm: number;
    leftAssistMagCm: number;
    rightFinite: boolean;
    leftFinite: boolean;
    adsBlend: number;
  } | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => {
      const pose = getFirstPersonBodyWorldPose();
      const shared = getSharedLowerBodyLocomotionPose();
      const gripPose = getGripWorldPose();
      setReadout({
        poseReady: pose.ready,
        bridgeGeneration: shared.generation,
        sharedPhase: shared.pose?.phase ?? 0,
        sharedState: shared.pose?.state ?? '(none yet)',
        visibleState: bodyDebugReadout.locomotionState,
        shadowReady: shadowBodyDebugReadout.ready,
        shadowMeshCount: shadowBodyDebugReadout.meshCount,
        shadowJointCount: shadowBodyDebugReadout.jointCount,
        shadowCastShadowMeshCount: shadowBodyDebugReadout.castShadowMeshCount,
        shadowRootWorldPosition: [...shadowBodyDebugReadout.rootWorldPosition],
        shadowEffectiveYaw: shadowBodyDebugReadout.effectiveYaw,
        boneResolutionFailed: shadowBodyDebugReadout.boneResolutionFailed,
        armsReady: shadowArmDebugState.ready,
        armBoneResolutionFailed: shadowArmDebugState.boneResolutionFailed,
        gripGeneration: gripPose.generation,
        gripReady: gripPose.ready,
        weaponPoseReady: shadowArmDebugState.weaponPoseReady,
        rightPositionErrorCm: shadowArmDebugState.right.positionErrorM * 100,
        leftPositionErrorCm: shadowArmDebugState.left.positionErrorM * 100,
        rightRotationErrorDeg: (shadowArmDebugState.right.rotationErrorRad * 180) / Math.PI,
        leftRotationErrorDeg: (shadowArmDebugState.left.rotationErrorRad * 180) / Math.PI,
        rightReachClamped: shadowArmDebugState.right.reachClamped,
        leftReachClamped: shadowArmDebugState.left.reachClamped,
        chestResolved: shadowArmDebugState.chest.boneResolved,
        chestBoneCount: shadowArmDebugState.chest.boneCount,
        aimPitchRawDeg: (shadowArmDebugState.chest.aimPitchRawRad * 180) / Math.PI,
        aimPitchSmoothedDeg: (shadowArmDebugState.chest.aimPitchSmoothedRad * 180) / Math.PI,
        appliedChestPitchDeg: (shadowArmDebugState.chest.appliedChestPitchRad * 180) / Math.PI,
        rightReachDeficitCm: shadowArmDebugState.right.reachDeficitM * 100,
        leftReachDeficitCm: shadowArmDebugState.left.reachDeficitM * 100,
        rightShoulderWorldPos: shadowArmDebugState.right.shoulderWorldPos.toArray(),
        leftShoulderWorldPos: shadowArmDebugState.left.shoulderWorldPos.toArray(),
        rightTargetWorldPos: shadowArmDebugState.right.targetWorldPos.toArray(),
        leftTargetWorldPos: shadowArmDebugState.left.targetWorldPos.toArray(),
        rightPreAssistShoulderWorldPos: shadowArmDebugState.right.preAssistShoulderWorldPos.toArray(),
        leftPreAssistShoulderWorldPos: shadowArmDebugState.left.preAssistShoulderWorldPos.toArray(),
        rightAssistMagCm: shadowArmDebugState.right.assistMagnitudeM * 100,
        leftAssistMagCm: shadowArmDebugState.left.assistMagnitudeM * 100,
        rightFinite: shadowArmDebugState.right.finite,
        leftFinite: shadowArmDebugState.left.finite,
        adsBlend: shadowArmDebugState.adsBlend,
      });
    }, 100);
    return () => window.clearInterval(id);
  }, []);

  const statesMatch = readout ? readout.sharedState === readout.visibleState : false;

  return (
    <div className="pointer-events-auto absolute left-4 top-4 z-40 w-80 rounded-lg border border-white/15 bg-black/80 p-3 font-mono text-xs text-white/90 backdrop-blur-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-bold uppercase tracking-wide text-storm-energy">Kael Shadow Prototype</span>
        <span className="text-[10px] text-white/40">?shadow=1 · dev only</span>
      </div>

      <div className="mb-3 rounded border border-amber-400/60 bg-amber-400/10 p-2 text-[10px] font-bold uppercase leading-tight text-amber-300">
        UPPER-BODY: STEP 8E-C.2 IN PROGRESS — NO HUMAN VISUAL APPROVAL YET
        <div className="mt-1 font-normal normal-case text-amber-200/80">
          Shadow weapon is now CHEST-ANCHORED (not camera-relative) — see the R/L assist readouts below, which should stay small (preferred
          ≤6cm, hard cap 8cm) in every normal state. Elbow poles / hand-basis values are still first-pass estimates pending calibration.
        </div>
      </div>

      <label className="mb-2 flex items-center gap-2">
        <input type="checkbox" checked={shadowDebug.diagnosticVisibleMaterial} onChange={() => shadowDebug.toggleDiagnosticVisibleMaterial()} />
        <span>show shadow body as diagnostic visible material</span>
      </label>
      <label className="mb-2 flex items-center gap-2">
        <input type="checkbox" checked={bodyDebug.freezeStride} onChange={() => bodyDebug.toggleFreezeStride()} />
        <span>freeze shared locomotion (same toggle as ?body=1)</span>
      </label>
      <label className="mb-2 flex items-center gap-2">
        <input type="checkbox" checked={armTuner.armIkEnabled} onChange={() => armTuner.toggleArmIkEnabled()} />
        <span>shadow arm IK enabled</span>
      </label>
      <label className="mb-2 flex items-center gap-2">
        <input type="checkbox" checked={armTuner.weaponShadowEnabled} onChange={() => armTuner.toggleWeaponShadowEnabled()} />
        <span>shadow weapon enabled</span>
      </label>
      <label className="mb-2 flex items-center gap-2">
        <input type="checkbox" checked={armTuner.showShoulderMarkers} onChange={() => armTuner.toggleShoulderMarkers()} />
        <span>show shoulder markers</span>
      </label>
      <label className="mb-2 flex items-center gap-2">
        <input type="checkbox" checked={armTuner.showElbowPoleMarkers} onChange={() => armTuner.toggleElbowPoleMarkers()} />
        <span>show elbow-pole markers</span>
      </label>
      <label className="mb-2 flex items-center gap-2">
        <input type="checkbox" checked={armTuner.showGripTargetMarkers} onChange={() => armTuner.toggleGripTargetMarkers()} />
        <span>show grip-target markers</span>
      </label>

      <div className="mb-2 flex gap-2">
        <button
          type="button"
          className="flex-1 rounded bg-white/10 px-2 py-1 hover:bg-white/20"
          onClick={() => {
            shadowDebug.reset();
            armTuner.reset();
          }}
        >
          Reset
        </button>
        <button
          type="button"
          className="flex-1 rounded bg-storm-energy/20 px-2 py-1 hover:bg-storm-energy/30"
          onClick={() => navigator.clipboard?.writeText(formatShadowArmConfigAsCode(armTuner))}
        >
          Copy config
        </button>
      </div>

      <div className="rounded bg-black/60 p-2 text-[10px] leading-tight text-white/70">
        {readout ? (
          <>
            <div>world pose ready: {readout.poseReady ? 'yes' : 'no'}</div>
            <div>locomotion bridge generation: {readout.bridgeGeneration}</div>
            <div>shared stride phase: {readout.sharedPhase.toFixed(3)}</div>
            <div className={statesMatch ? 'text-emerald-400' : 'text-red-400'}>
              visible state: {readout.visibleState} · shadow state: {readout.sharedState} {statesMatch ? '(match)' : '(MISMATCH)'}
            </div>
            <div className="mt-1 border-t border-white/10 pt-1">shadow clone ready: {readout.shadowReady ? 'yes' : 'no'}</div>
            <div>
              shadow meshes: {readout.shadowMeshCount} · joints: {readout.shadowJointCount} · castShadow meshes: {readout.shadowCastShadowMeshCount}
            </div>
            {readout.boneResolutionFailed && <div className="text-red-400">leg-bone resolution FAILED — legs at rest, see console</div>}
            <div>shadow root world pos: [{readout.shadowRootWorldPosition.map((v) => v.toFixed(2)).join(', ')}]</div>
            <div>shadow effective yaw: {readout.shadowEffectiveYaw.toFixed(3)}</div>

            <div className="mt-1 border-t border-white/10 pt-1">
              grip-pose generation: {readout.gripGeneration} · ready: {readout.gripReady ? 'yes' : 'no'}
            </div>
            <div>weapon-pose ready: {readout.weaponPoseReady ? 'yes' : 'no'} · shadow weapon clones: {readout.weaponPoseReady ? 1 : 0}</div>
            <div>upper-body pose status: {readout.armsReady ? 'IK solving' : 'rest pose (disabled or pose not ready)'}</div>
            {readout.armBoneResolutionFailed && <div className="text-red-400">arm-bone resolution FAILED — arms at rest, see console</div>}
            <div className={readout.rightPositionErrorCm <= 2 ? 'text-emerald-400' : 'text-amber-300'}>
              right position error: {readout.rightPositionErrorCm.toFixed(2)}cm{readout.rightReachClamped ? ' (reach-clamped)' : ''}
            </div>
            <div className={readout.leftPositionErrorCm <= 2 ? 'text-emerald-400' : 'text-amber-300'}>
              left position error: {readout.leftPositionErrorCm.toFixed(2)}cm{readout.leftReachClamped ? ' (reach-clamped)' : ''}
            </div>
            <div>right rotation error: {readout.rightRotationErrorDeg.toFixed(1)}° · left rotation error: {readout.leftRotationErrorDeg.toFixed(1)}°</div>
            <div className={readout.rightFinite && readout.leftFinite ? 'text-emerald-400' : 'text-red-400'}>
              finite/fail-soft status: R {readout.rightFinite ? 'OK' : 'NON-FINITE'} · L {readout.leftFinite ? 'OK' : 'NON-FINITE'}
            </div>

            <div className="mt-1 border-t border-white/10 pt-1">
              chest-aim: {readout.chestResolved ? `resolved (${readout.chestBoneCount} bones)` : 'no bone (root fallback)'}
            </div>
            <div>aim pitch: raw {readout.aimPitchRawDeg.toFixed(1)}° · smoothed {readout.aimPitchSmoothedDeg.toFixed(1)}°</div>
            <div>applied chest pitch: {readout.appliedChestPitchDeg.toFixed(1)}°</div>

            <div className="mt-1 border-t border-white/10 pt-1">ADS blend (shadow-local smoothing): {readout.adsBlend.toFixed(2)}</div>

            <div className="mt-1 border-t border-white/10 pt-1">
              R pre-assist shoulder: [{readout.rightPreAssistShoulderWorldPos.map((v) => v.toFixed(3)).join(', ')}]
            </div>
            <div>
              R post-assist shoulder: [{readout.rightShoulderWorldPos.map((v) => v.toFixed(3)).join(', ')}] ·{' '}
              <span className={readout.rightAssistMagCm > 8 ? 'text-red-400' : readout.rightAssistMagCm > 6 ? 'text-amber-300' : 'text-emerald-400'}>
                R assist: {readout.rightAssistMagCm.toFixed(1)}cm
              </span>
            </div>
            <div>R target: [{readout.rightTargetWorldPos.map((v) => v.toFixed(3)).join(', ')}] · R deficit: {readout.rightReachDeficitCm.toFixed(1)}cm</div>
            <div>L pre-assist shoulder: [{readout.leftPreAssistShoulderWorldPos.map((v) => v.toFixed(3)).join(', ')}]</div>
            <div>
              L post-assist shoulder: [{readout.leftShoulderWorldPos.map((v) => v.toFixed(3)).join(', ')}] ·{' '}
              <span className={readout.leftAssistMagCm > 8 ? 'text-red-400' : readout.leftAssistMagCm > 6 ? 'text-amber-300' : 'text-emerald-400'}>
                L assist: {readout.leftAssistMagCm.toFixed(1)}cm
              </span>
            </div>
            <div>L target: [{readout.leftTargetWorldPos.map((v) => v.toFixed(3)).join(', ')}] · L deficit: {readout.leftReachDeficitCm.toFixed(1)}cm</div>
            <div className="text-white/40">anatomical bounds: preferred ≤6cm · hard cap {(SHADOW_ARM_IK_CONFIG.shoulderAssistWarnThresholdM * 100).toFixed(0)}cm</div>

            <div className="mt-1 border-t border-white/10 pt-1">
              physical offset (fixed): [{SHADOW_BODY_PHYSICAL_LOCAL_OFFSET.map((v) => v.toFixed(3)).join(', ')}]
            </div>
            <div>
              range shadow bounds: L{RANGE_SHADOW_CAMERA_BOUNDS.left} R{RANGE_SHADOW_CAMERA_BOUNDS.right} T{RANGE_SHADOW_CAMERA_BOUNDS.top} B
              {RANGE_SHADOW_CAMERA_BOUNDS.bottom} near{RANGE_SHADOW_CAMERA_BOUNDS.near} far{RANGE_SHADOW_CAMERA_BOUNDS.far}
            </div>
          </>
        ) : (
          <div>waiting for first frame…</div>
        )}
      </div>
    </div>
  );
}
