'use client';

import { useEffect, useState } from 'react';
import { useBodyDebugStore } from '@/lib/v2/operators/bodyDebugStore';
import { bodyDebugReadout } from '@/lib/v2/operators/bodyDebugReadout';
import { getFirstPersonBodyWorldPose } from '@/lib/v2/operators/firstPersonBodyPose';
import { getSharedLowerBodyLocomotionPose } from '@/lib/v2/operators/lowerBodyLocomotionPoseBridge';
import { RANGE_SHADOW_CAMERA_BOUNDS } from '@/lib/v2/range/rangeEnvironmentBounds';
import { shadowBodyDebugReadout } from '@/lib/v2/operators/shadowBodyDebugReadout';
import { useShadowDebugStore } from '@/lib/v2/operators/shadowDebugStore';
import { SHADOW_BODY_PHYSICAL_LOCAL_OFFSET } from '@/lib/v2/operators/shadowBodyTransform';

/**
 * Dev-only Kael first-person shadow foundation panel (Milestone 8, Step
 * 8E-B) — `/v2/range?shadow=1` only, gated by `useShadowDebugEnabled()` at
 * the mount site (`RangeView.tsx`), same convention as `KaelBodyDebugPanel.tsx`.
 * The "freeze shared locomotion" checkbox below calls
 * `useBodyDebugStore`'s existing `toggleFreezeStride()` directly (Step
 * 8D) — NOT a separate control — proving by construction that the visible
 * body and this shadow prototype share one runtime, not two.
 */
export default function KaelShadowDebugPanel() {
  const bodyDebug = useBodyDebugStore();
  const shadowDebug = useShadowDebugStore();
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
  } | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => {
      const pose = getFirstPersonBodyWorldPose();
      const shared = getSharedLowerBodyLocomotionPose();
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
      });
    }, 100);
    return () => window.clearInterval(id);
  }, []);

  const statesMatch = readout ? readout.sharedState === readout.visibleState : false;

  return (
    <div className="pointer-events-auto absolute left-4 top-4 z-40 w-80 rounded-lg border border-white/15 bg-black/80 p-3 font-mono text-xs text-white/90 backdrop-blur-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-bold uppercase tracking-wide text-storm-energy">Kael Shadow Foundation</span>
        <span className="text-[10px] text-white/40">?shadow=1 · dev only</span>
      </div>

      <div className="mb-3 rounded border border-amber-400/60 bg-amber-400/10 p-2 text-[10px] font-bold uppercase leading-tight text-amber-300">
        UPPER-BODY SHADOW UNSYNCHRONISED — STEP 8E-C REQUIRED
        <div className="mt-1 font-normal normal-case text-amber-200/80">
          Arms/spine render the source GLB&apos;s relaxed-A-pose bind pose, static, unrelated to the held weapon. Legs only are synced this pass.
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

      <button type="button" className="mb-2 w-full rounded bg-white/10 px-2 py-1 hover:bg-white/20" onClick={() => shadowDebug.reset()}>
        Reset
      </button>

      <div className="rounded bg-black/60 p-2 text-[10px] leading-tight text-white/70">
        {readout ? (
          <>
            <div>world pose ready: {readout.poseReady ? 'yes' : 'no'}</div>
            <div>locomotion bridge generation: {readout.bridgeGeneration}</div>
            <div>
              shared stride phase: {readout.sharedPhase.toFixed(3)}
            </div>
            <div className={statesMatch ? 'text-emerald-400' : 'text-red-400'}>
              visible state: {readout.visibleState} · shadow state: {readout.sharedState} {statesMatch ? '(match)' : '(MISMATCH)'}
            </div>
            <div className="mt-1 border-t border-white/10 pt-1">
              shadow clone ready: {readout.shadowReady ? 'yes' : 'no'}
            </div>
            <div>
              shadow meshes: {readout.shadowMeshCount} · joints: {readout.shadowJointCount} · castShadow meshes: {readout.shadowCastShadowMeshCount}
            </div>
            {readout.boneResolutionFailed && <div className="text-red-400">leg-bone resolution FAILED — legs at rest, see console</div>}
            <div>
              shadow root world pos: [{readout.shadowRootWorldPosition.map((v) => v.toFixed(2)).join(', ')}]
            </div>
            <div>shadow effective yaw: {readout.shadowEffectiveYaw.toFixed(3)}</div>
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
