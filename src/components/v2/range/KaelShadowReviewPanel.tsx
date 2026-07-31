'use client';

import { useEffect, useState } from 'react';
import { useShadowReviewStore, type ShadowFrustumMode } from '@/lib/v2/operators/shadowReviewStore';
import { SHADOW_REVIEW_CAMERA_PRESETS, type ShadowReviewCameraPreset } from '@/lib/v2/operators/shadowReviewCameraPresets';
import { useShadowDebugStore } from '@/lib/v2/operators/shadowDebugStore';
import { useShadowArmTunerStore } from '@/lib/v2/operators/shadowArmTunerStore';
import { PERMITTED_SHADOW_MAP_SIZES, type ShadowMapSize, type ShadowReceiverMode } from '@/lib/v2/operators/shadowLightCalibration';
import { playerCenteredShadowFrustumDebugState } from '@/lib/v2/operators/playerCenteredShadowFrustumDebugState';

const FRUSTUM_MODE_LABELS: Record<ShadowFrustumMode, string> = {
  'static-full-floor': 'Static (full floor)',
  'player-centered': 'Player-centered',
};

const PRESET_LABELS: Record<ShadowReviewCameraPreset, string> = {
  threeQuarterFront: '3/4 front',
  threeQuarterRear: '3/4 rear',
  leftSide: 'Left side',
  rightSide: 'Right side',
  highOblique: 'High oblique',
  lightFacing: 'Light-facing (shadow)',
  receiverWide: 'Receiver wide',
  bodyCloseThreeQuarter: 'Body close — 3/4',
  bodyCloseSide: 'Body close — side',
  handsCloseRight: 'Hands close — right (trigger)',
  handsCloseLeft: 'Hands close — left (support)',
  shadowClose: 'Shadow close',
  shadowWide: 'Shadow wide',
};

/**
 * Dev-only panel for the Step 8E-C.3 shadow review harness —
 * `/v2/range?shadow=1&shadowReview=1` only. Drives its OWN camera-preset
 * state (`shadowReviewStore.ts`) plus the EXISTING diagnostic-material
 * toggle (`shadowDebugStore.ts`) and marker toggles (`shadowArmTunerStore.ts`)
 * directly — no duplicate state for "hide markers for a marker-free shot."
 */
export default function KaelShadowReviewPanel() {
  const review = useShadowReviewStore();
  const shadowDebug = useShadowDebugStore();
  const armTuner = useShadowArmTunerStore();

  const allMarkersHidden = !armTuner.showShoulderMarkers && !armTuner.showElbowPoleMarkers && !armTuner.showGripTargetMarkers;

  // Step 8E-D.1 — same "poll a plain mutable singleton at a human-
  // perceptible rate" convention as `KaelShadowDebugPanel.tsx`; the
  // controller writes `playerCenteredShadowFrustumDebugState` every frame,
  // this panel only samples it, never subscribes to it directly.
  const [frustumReadout, setFrustumReadout] = useState(() => ({ ...playerCenteredShadowFrustumDebugState }));
  useEffect(() => {
    const id = window.setInterval(() => {
      const d = playerCenteredShadowFrustumDebugState;
      setFrustumReadout({
        active: d.active,
        groundAnchorWorld: [...d.groundAnchorWorld] as [number, number, number],
        snappedLightSpace: [...d.snappedLightSpace] as [number, number],
        texelSizeX: d.texelSizeX,
        texelSizeY: d.texelSizeY,
        activeWidth: d.activeWidth,
        activeHeight: d.activeHeight,
        activeNear: d.activeNear,
        activeFar: d.activeFar,
        lightWorldPosition: [...d.lightWorldPosition] as [number, number, number],
        targetWorldPosition: [...d.targetWorldPosition] as [number, number, number],
      });
    }, 100);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="pointer-events-auto absolute right-4 top-4 z-40 w-72 rounded-lg border border-white/15 bg-black/80 p-3 font-mono text-xs text-white/90 backdrop-blur-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-bold uppercase tracking-wide text-storm-energy">Shadow Review Camera</span>
        <span className="text-[10px] text-white/40">&amp;shadowReview=1</span>
      </div>

      <div className="mb-3 rounded border border-amber-400/60 bg-amber-400/10 p-2 text-[10px] leading-tight text-amber-200">
        External, dev-only observation camera. The real gameplay camera is untouched underneath — disable this flag to return to it exactly as it was.
      </div>

      <div className="mb-3 grid grid-cols-1 gap-1">
        {SHADOW_REVIEW_CAMERA_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => review.setCameraPreset(preset)}
            className={`rounded px-2 py-1 text-left ${review.cameraPreset === preset ? 'bg-storm-energy/30 text-storm-energy' : 'bg-white/5 hover:bg-white/10'}`}
          >
            {PRESET_LABELS[preset]}
          </button>
        ))}
      </div>

      <label className="mb-2 flex items-center gap-2">
        <input type="checkbox" checked={review.receiverEnabled} onChange={() => review.toggleReceiver()} />
        <span>neutral receiver surface</span>
      </label>
      <label className="mb-2 flex items-center gap-2">
        <input type="checkbox" checked={shadowDebug.diagnosticVisibleMaterial} onChange={() => shadowDebug.toggleDiagnosticVisibleMaterial()} />
        <span>diagnostic-visible body material</span>
      </label>
      <label className="mb-2 flex items-center gap-2">
        <input
          type="checkbox"
          checked={!allMarkersHidden}
          onChange={() => {
            const next = allMarkersHidden;
            if (armTuner.showShoulderMarkers !== next) armTuner.toggleShoulderMarkers();
            if (armTuner.showElbowPoleMarkers !== next) armTuner.toggleElbowPoleMarkers();
            if (armTuner.showGripTargetMarkers !== next) armTuner.toggleGripTargetMarkers();
          }}
        />
        <span>show debug markers (uncheck for marker-free capture)</span>
      </label>

      <div className="mt-3 border-t border-white/10 pt-2">
        <div className="mb-1 font-bold uppercase tracking-wide text-storm-energy">Step 8E-D calibration</div>

        <div className="mb-1 text-white/50">receiver mode</div>
        <div className="mb-2 grid grid-cols-2 gap-1">
          {(['production', 'readable'] as ShadowReceiverMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => review.setReceiverMode(mode)}
              className={`rounded px-2 py-1 capitalize ${review.receiverMode === mode ? 'bg-storm-energy/30 text-storm-energy' : 'bg-white/5 hover:bg-white/10'}`}
            >
              {mode}
            </button>
          ))}
        </div>

        <div className="mb-1 text-white/50">shadow-map resolution (requires route re-entry to apply)</div>
        <div className="mb-2 grid grid-cols-2 gap-1">
          {(PERMITTED_SHADOW_MAP_SIZES as readonly ShadowMapSize[]).map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => review.setShadowMapSize(size)}
              className={`rounded px-2 py-1 ${review.shadowMapSize === size ? 'bg-storm-energy/30 text-storm-energy' : 'bg-white/5 hover:bg-white/10'}`}
            >
              {size}²
            </button>
          ))}
        </div>

        <label className="mb-2 flex items-center gap-2">
          <input type="checkbox" checked={review.selfShadowEnabled} onChange={() => review.toggleSelfShadow()} />
          <span>self-shadowing (weapon-on-arm, arm-on-torso)</span>
        </label>

        <div className="mb-2 text-[10px] text-white/50">
          bias: <span className="text-white/80">{review.shadowBias}</span> · normalBias: <span className="text-white/80">{review.shadowNormalBias}</span>
        </div>

        <button
          type="button"
          onClick={() => review.resetCalibration()}
          className="mb-1 w-full rounded bg-white/5 px-2 py-1 text-left hover:bg-white/10"
        >
          Reset to canonical Step 8E-D values
        </button>
      </div>

      <div className="mt-3 border-t border-white/10 pt-2">
        <div className="mb-1 font-bold uppercase tracking-wide text-storm-energy">Step 8E-D.1 shadow frustum</div>

        <div className="mb-1 text-white/50">tracking mode</div>
        <div className="mb-2 grid grid-cols-1 gap-1">
          {(['player-centered', 'static-full-floor'] as ShadowFrustumMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => review.setFrustumMode(mode)}
              className={`rounded px-2 py-1 text-left ${review.frustumMode === mode ? 'bg-storm-energy/30 text-storm-energy' : 'bg-white/5 hover:bg-white/10'}`}
            >
              {FRUSTUM_MODE_LABELS[mode]}
            </button>
          ))}
        </div>

        <label className="mb-2 flex items-center gap-2">
          <input type="checkbox" checked={review.showFrustumHelper} onChange={() => review.toggleFrustumHelper()} />
          <span>show frustum helper (uncheck for marker-free capture)</span>
        </label>

        <div className="rounded bg-black/60 p-2 text-[10px] leading-tight text-white/70">
          <div>tracking active: {frustumReadout.active ? 'yes (player-centered)' : 'no (static)'}</div>
          <div>ground anchor: [{frustumReadout.groundAnchorWorld.map((v) => v.toFixed(2)).join(', ')}]</div>
          <div>snapped light-space center: [{frustumReadout.snappedLightSpace.map((v) => v.toFixed(3)).join(', ')}]</div>
          <div>
            texel size: X {(frustumReadout.texelSizeX * 1000).toFixed(2)}mm · Y {(frustumReadout.texelSizeY * 1000).toFixed(2)}mm
          </div>
          <div>
            active frustum: {frustumReadout.activeWidth.toFixed(2)}m × {frustumReadout.activeHeight.toFixed(2)}m · near {frustumReadout.activeNear.toFixed(1)} · far{' '}
            {frustumReadout.activeFar.toFixed(1)}
          </div>
          <div>light world pos: [{frustumReadout.lightWorldPosition.map((v) => v.toFixed(2)).join(', ')}]</div>
          <div>target world pos: [{frustumReadout.targetWorldPosition.map((v) => v.toFixed(2)).join(', ')}]</div>
        </div>
      </div>

      <div className="mt-2 border-t border-white/10 pt-2 text-[10px] text-white/40">
        Marker-free + shadow-only + receiver-on = primary evidence.
        <br />
        Diagnostic-visible + markers-on = calibration views.
      </div>
    </div>
  );
}
