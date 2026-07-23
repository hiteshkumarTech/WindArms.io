'use client';

import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { FIRST_PERSON_ARM_IK_CONFIG } from '@/lib/v2/operators/firstPersonArmIkConfig';
import { formatIkConfigAsCode, useIkTunerStore } from '@/lib/v2/weapons/ikTunerStore';
import { kaelArmDebugState, type KaelArmBoundsDebugStats } from '@/lib/v2/weapons/kaelArmDebugState';

type Vec3 = readonly [number, number, number];
const AXIS_LABELS: readonly ['X', 'Y', 'Z'] = ['X', 'Y', 'Z'];

interface HandAccuracyReadout {
  positionErrorCm: number;
  rotationErrorDeg: number;
  ikWeight: number;
  reachClamped: boolean;
  // Step 6G reach diagnostics
  shoulderToTargetCm: number;
  upperLengthCm: number;
  lowerLengthCm: number;
  totalChainLengthCm: number;
  maxReachRatio: number;
  effectiveMaxReachCm: number;
  reachDeficitCm: number;
  shoulderBoneName: string | null;
  upperArmBoneName: string;
}

function readHandAccuracy(side: typeof kaelArmDebugState.right): HandAccuracyReadout {
  return {
    positionErrorCm: side.positionErrorM * 100,
    rotationErrorDeg: THREE.MathUtils.radToDeg(side.rotationErrorRad),
    ikWeight: side.ikWeight,
    reachClamped: side.reachClamped,
    shoulderToTargetCm: side.shoulderToTargetM * 100,
    upperLengthCm: side.upperLengthM * 100,
    lowerLengthCm: side.lowerLengthM * 100,
    totalChainLengthCm: side.totalChainLengthM * 100,
    maxReachRatio: side.maxReachRatio,
    effectiveMaxReachCm: side.effectiveMaxReachM * 100,
    reachDeficitCm: side.reachDeficitM * 100,
    shoulderBoneName: side.shoulderBoneName,
    upperArmBoneName: side.upperArmBoneName,
  };
}

/**
 * Dev-only Kael FP-arm IK authoring panel (Milestone 7, Phase F, Step 13;
 * extended Step 6F for hand-basis/wrist/finger calibration). Plain DOM
 * overlay, `/v2/range` only, gated by `useIkDebugEnabled()` at the mount
 * site — same convention as `VortexGripTunerPanel.tsx`. Edits `ikTunerStore`
 * only; `KaelArmIkDebug.tsx`'s 3D markers and `KaelFirstPersonArms.tsx`'s
 * live solve both read this same store, so moving a slider here immediately
 * changes the actual solved arm pose, not just a preview.
 */
export default function KaelArmIkTunerPanel() {
  const tuner = useIkTunerStore();
  const [copied, setCopied] = useState(false);
  const [bounds, setBounds] = useState<KaelArmBoundsDebugStats | null>(null);
  const [rightAccuracy, setRightAccuracy] = useState<HandAccuracyReadout | null>(null);
  const [leftAccuracy, setLeftAccuracy] = useState<HandAccuracyReadout | null>(null);
  const [showReachDetail, setShowReachDetail] = useState(false);

  // `kaelArmDebugState.bounds` is a plain mutable object written every
  // frame inside the R3F render loop (ArmBoundingBoxHelper) — this DOM
  // panel lives outside the Canvas and can't use useFrame, so it polls at
  // a human-perceptible rate (5/sec) rather than trying to sync every
  // frame, which would be wasted work for a text readout.
  useEffect(() => {
    if (!tuner.showBoundingBox) {
      setBounds(null);
      return;
    }
    const id = window.setInterval(() => setBounds(kaelArmDebugState.bounds), 200);
    return () => window.clearInterval(id);
  }, [tuner.showBoundingBox]);

  // Step 6F: hand positional/rotational accuracy readout — same polling
  // convention as bounds above, but always active (not gated behind a
  // toggle) since this is the primary "is the solve correct" number the
  // whole calibration pass hinges on, per the brief's own decision rule
  // (>1cm position error means fix the solve; ≤1cm means basis/finger
  // calibration only). Only updates while the rig has actually published a
  // frame (`kaelArmDebugState.ready`) — stale zeros would be misleading.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (!kaelArmDebugState.ready) {
        setRightAccuracy(null);
        setLeftAccuracy(null);
        return;
      }
      setRightAccuracy(readHandAccuracy(kaelArmDebugState.right));
      setLeftAccuracy(readHandAccuracy(kaelArmDebugState.left));
    }, 200);
    return () => window.clearInterval(id);
  }, []);

  const rightPole = tuner.rightElbowPoleLocal ?? FIRST_PERSON_ARM_IK_CONFIG.rightElbowPoleLocal;
  const leftPole = tuner.leftElbowPoleLocal ?? FIRST_PERSON_ARM_IK_CONFIG.leftElbowPoleLocal;
  const shoulderOffset = tuner.shoulderRootOffset ?? FIRST_PERSON_ARM_IK_CONFIG.shoulderRootOffset;
  const rightBasisAdjust = tuner.rightHandBasisAdjustDeg ?? FIRST_PERSON_ARM_IK_CONFIG.rightHandBasisAdjustDeg;
  const leftBasisAdjust = tuner.leftHandBasisAdjustDeg ?? FIRST_PERSON_ARM_IK_CONFIG.leftHandBasisAdjustDeg;
  const rightWristWeight = tuner.rightWristRotationWeight ?? FIRST_PERSON_ARM_IK_CONFIG.rotationWeight;
  const leftWristWeight = tuner.leftWristRotationWeight ?? FIRST_PERSON_ARM_IK_CONFIG.rotationWeight;
  const rightFingerCurl = tuner.rightFingerCurlScale ?? FIRST_PERSON_ARM_IK_CONFIG.rightFingerCurlScale;
  const leftFingerCurl = tuner.leftFingerCurlScale ?? FIRST_PERSON_ARM_IK_CONFIG.leftFingerCurlScale;
  const ikWeight = tuner.ikWeight ?? (tuner.ikDisabled ? 0 : 1);
  const rightShoulderAssist = tuner.rightShoulderAssistLocal ?? FIRST_PERSON_ARM_IK_CONFIG.rightShoulderAssistLocal;
  const leftShoulderAssist = tuner.leftShoulderAssistLocal ?? FIRST_PERSON_ARM_IK_CONFIG.leftShoulderAssistLocal;

  const setPoleAxis = (setter: (v: Vec3) => void, current: Vec3, axis: 0 | 1 | 2, value: number) => {
    const next: [number, number, number] = [current[0], current[1], current[2]];
    next[axis] = value;
    setter(next);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formatIkConfigAsCode(tuner));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Same graceful-degrade as VortexGripTunerPanel — the code block below still shows the text for manual selection.
    }
  };

  return (
    <div className="pointer-events-auto absolute right-4 top-72 bottom-4 z-40 w-80 overflow-y-auto rounded-lg border border-white/15 bg-black/80 p-3 font-mono text-xs text-white/90 backdrop-blur-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-bold uppercase tracking-wide text-storm-energy">Kael Arm IK Tuner</span>
        <span className="text-[10px] text-white/40">?ik=1 · dev only</span>
      </div>

      <div className="mb-2 rounded bg-black/60 p-2 text-[10px] leading-tight">
        <div className="mb-1 flex items-center justify-between text-white/50">
          <span>hand accuracy (Step 6F/6G — measured post-solve)</span>
          <button type="button" className="text-storm-energy/80 underline" onClick={() => setShowReachDetail((v) => !v)}>
            {showReachDetail ? 'hide reach detail' : 'show reach detail'}
          </button>
        </div>
        <AccuracyRow label="RIGHT" data={rightAccuracy} showReachDetail={showReachDetail} />
        <AccuracyRow label="LEFT" data={leftAccuracy} showReachDetail={showReachDetail} />
        <div className="mt-1 text-white/40">rule: &gt;1cm → solve/target-space bug; ≤1cm → basis/finger calibration only</div>
      </div>

      <SliderRow label={`IK weight (both sides): ${ikWeight.toFixed(2)}`} value={ikWeight} onChange={tuner.setIkWeight} />

      <Vec3Row label="right pole" value={rightPole} onChange={(axis, v) => setPoleAxis(tuner.setRightPole, rightPole, axis, v)} />
      <Vec3Row label="left pole" value={leftPole} onChange={(axis, v) => setPoleAxis(tuner.setLeftPole, leftPole, axis, v)} />
      <Vec3Row label="shoulder offset" value={shoulderOffset} onChange={(axis, v) => setPoleAxis(tuner.setShoulderOffset, shoulderOffset, axis, v)} />

      <div className="mb-1 mt-2 text-[10px] font-bold uppercase tracking-wide text-storm-energy/80">shoulder assist (Step 6G — reach deficit fix)</div>
      <Vec3Row label="right shoulder assist" value={rightShoulderAssist} step={0.005} onChange={(axis, v) => setPoleAxis(tuner.setRightShoulderAssistLocal, rightShoulderAssist, axis, v)} />
      <Vec3Row label="left shoulder assist" value={leftShoulderAssist} step={0.005} onChange={(axis, v) => setPoleAxis(tuner.setLeftShoulderAssistLocal, leftShoulderAssist, axis, v)} />
      <div className="mb-2 -mt-1 text-[10px] text-white/40">camera-relative, same frame as shoulder offset — moves only that side&apos;s shoulder attachment, never the weapon</div>

      <div className="mb-1 mt-2 text-[10px] font-bold uppercase tracking-wide text-storm-energy/80">hand-basis calibration</div>
      <Vec3Row label="right hand basis adjust" value={rightBasisAdjust} unit="deg" step={0.5} onChange={(axis, v) => setPoleAxis(tuner.setRightHandBasisAdjustDeg, rightBasisAdjust, axis, v)} />
      <Vec3Row label="left hand basis adjust" value={leftBasisAdjust} unit="deg" step={0.5} onChange={(axis, v) => setPoleAxis(tuner.setLeftHandBasisAdjustDeg, leftBasisAdjust, axis, v)} />
      <SliderRow label={`right wrist rotation weight: ${rightWristWeight.toFixed(2)}`} value={rightWristWeight} onChange={tuner.setRightWristRotationWeight} />
      <SliderRow label={`left wrist rotation weight: ${leftWristWeight.toFixed(2)}`} value={leftWristWeight} onChange={tuner.setLeftWristRotationWeight} />
      <SliderRow label={`right finger curl: ${rightFingerCurl.toFixed(2)}`} value={rightFingerCurl} onChange={tuner.setRightFingerCurlScale} />
      <SliderRow label={`left finger curl: ${leftFingerCurl.toFixed(2)}`} value={leftFingerCurl} onChange={tuner.setLeftFingerCurlScale} />

      <div className="mb-2 grid grid-cols-2 gap-1">
        <ToggleButton label="axes/markers" active={tuner.showTargetMarkers} onClick={tuner.toggleTargetMarkers} />
        <ToggleButton label="pole markers" active={tuner.showPoleMarkers} onClick={tuner.togglePoleMarkers} />
        <ToggleButton label="chain lines" active={tuner.showChainLines} onClick={tuner.toggleChainLines} />
        <ToggleButton label="hand basis axes" active={tuner.showHandBasisAxes} onClick={tuner.toggleHandBasisAxes} />
        <ToggleButton label="freeze pose" active={tuner.frozen} onClick={tuner.toggleFrozen} />
        <ToggleButton label="IK disabled (rest pose)" active={tuner.ikDisabled} onClick={tuner.toggleIkDisabled} />
        <ToggleButton label="bounding box" active={tuner.showBoundingBox} onClick={tuner.toggleBoundingBox} />
        <ToggleButton label="REST MESH DIAGNOSTIC" active={tuner.restPoseDiagnostic} onClick={tuner.toggleRestPoseDiagnostic} />
        <ToggleButton label="DIRECT CAMERA MOUNT" active={tuner.directCameraMount} onClick={tuner.toggleDirectCameraMount} />
      </div>

      {tuner.showBoundingBox && (
        <div className="mb-2 rounded bg-black/60 p-2 text-[10px] leading-tight">
          <div className="mb-1 text-white/50">deformed mesh bounds (true, not bind-pose)</div>
          {!bounds ? (
            <div className="text-white/40">no data — arms not visible / not mounted</div>
          ) : (
            <>
              <div className={bounds.finite ? 'text-storm-energy/90' : 'text-red-400'}>finite: {String(bounds.finite)}</div>
              <div>size: [{bounds.sizeM.map((v) => v.toFixed(3)).join(', ')}] m</div>
              <div>min: [{bounds.minM.map((v) => v.toFixed(3)).join(', ')}]</div>
              <div>max: [{bounds.maxM.map((v) => v.toFixed(3)).join(', ')}]</div>
              <div>nearest vertex: {bounds.nearestVertexDistM.toFixed(3)} m</div>
              <div>farthest vertex: {bounds.farthestVertexDistM.toFixed(3)} m</div>
              <div>mesh count: {bounds.meshCount}</div>
            </>
          )}
        </div>
      )}

      <div className="mb-2 flex gap-1">
        <button type="button" className="flex-1 rounded bg-white/10 px-2 py-1 hover:bg-white/20" onClick={tuner.resetToShipped}>
          reset
        </button>
        <button type="button" className="flex-1 rounded bg-storm-energy px-2 py-1 text-black hover:opacity-90" onClick={handleCopy}>
          {copied ? 'copied!' : 'copy code'}
        </button>
      </div>

      <pre className="max-h-32 overflow-auto rounded bg-black/60 p-2 text-[10px] leading-tight text-storm-energy/90">{formatIkConfigAsCode(tuner)}</pre>
    </div>
  );
}

function AccuracyRow({ label, data, showReachDetail }: { label: string; data: HandAccuracyReadout | null; showReachDetail: boolean }) {
  if (!data) {
    return (
      <div>
        {label} POSITION ERROR: <span className="text-white/40">no data</span>
      </div>
    );
  }
  const posOk = data.positionErrorCm <= 1;
  return (
    <div className="mb-1">
      <div className={posOk ? 'text-storm-energy/90' : 'text-red-400'}>
        {label} POSITION ERROR: {data.positionErrorCm.toFixed(2)} cm {data.reachClamped ? '(reach-clamped)' : ''}
      </div>
      <div className="text-white/70">
        {label} ROTATION ERROR: {data.rotationErrorDeg.toFixed(2)}° · weight={data.ikWeight.toFixed(2)}
      </div>
      {showReachDetail && (
        <div className="mt-0.5 pl-2 text-white/50">
          <div>
            shoulder→target: {data.shoulderToTargetCm.toFixed(2)}cm · chain: {data.upperLengthCm.toFixed(2)}+{data.lowerLengthCm.toFixed(2)}={data.totalChainLengthCm.toFixed(2)}cm
          </div>
          <div>
            maxReach({data.maxReachRatio.toFixed(2)}): {data.effectiveMaxReachCm.toFixed(2)}cm · deficit: <span className={data.reachDeficitCm > 0 ? 'text-red-400' : 'text-storm-energy/70'}>{data.reachDeficitCm.toFixed(2)}cm</span>
          </div>
          <div>
            bones: shoulder={data.shoulderBoneName ?? '(none)'} upperArm={data.upperArmBoneName}
          </div>
        </div>
      )}
    </div>
  );
}

function ToggleButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`rounded px-2 py-1 text-[11px] ${active ? 'bg-storm-energy text-black' : 'bg-white/10'}`}>
      {active ? '●' : '○'} {label}
    </button>
  );
}

function SliderRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="mb-2">
      <div className="mb-0.5 text-[10px] text-white/50">{label}</div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(e) => {
          const parsed = Number(e.target.value);
          if (Number.isFinite(parsed)) onChange(parsed);
        }}
        className="w-full"
        aria-label={label}
      />
    </div>
  );
}

function Vec3Row({ label, value, onChange, unit = 'm', step = 0.01 }: { label: string; value: Vec3; onChange: (axis: 0 | 1 | 2, value: number) => void; unit?: string; step?: number }) {
  return (
    <div className="mb-2">
      <div className="mb-0.5 text-[10px] text-white/50">
        {label} ({unit})
      </div>
      <div className="grid grid-cols-3 gap-1">
        {AXIS_LABELS.map((axisLabel, axis) => (
          <input
            key={axisLabel}
            type="number"
            step={step}
            value={Number(value[axis].toFixed(3))}
            onChange={(e) => {
              const parsed = Number(e.target.value);
              if (Number.isFinite(parsed)) onChange(axis as 0 | 1 | 2, parsed);
            }}
            className="w-full rounded bg-white/5 px-1 py-0.5 text-center text-[11px] text-white outline-none"
            aria-label={`${label} ${axisLabel}`}
          />
        ))}
      </div>
    </div>
  );
}
