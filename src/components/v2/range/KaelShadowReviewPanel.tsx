'use client';

import { useShadowReviewStore } from '@/lib/v2/operators/shadowReviewStore';
import { SHADOW_REVIEW_CAMERA_PRESETS, type ShadowReviewCameraPreset } from '@/lib/v2/operators/shadowReviewCameraPresets';
import { useShadowDebugStore } from '@/lib/v2/operators/shadowDebugStore';
import { useShadowArmTunerStore } from '@/lib/v2/operators/shadowArmTunerStore';

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

      <div className="mt-2 border-t border-white/10 pt-2 text-[10px] text-white/40">
        Marker-free + shadow-only + receiver-on = primary evidence.
        <br />
        Diagnostic-visible + markers-on = calibration views.
      </div>
    </div>
  );
}
