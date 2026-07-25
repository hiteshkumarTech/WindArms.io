'use client';

import { useEffect, useState } from 'react';
import { RELOAD_LEFT_HAND_LOCAL, INSPECT_LEFT_HAND_LOCAL } from '@/lib/v2/weapons/actionTargets';
import { actionPoseState } from '@/lib/v2/weapons/actionPoseState';
import { useAnimDebugStore } from '@/lib/v2/weapons/animDebugStore';

/**
 * Dev-only FP-arm reload/inspect action-pose preview panel (Milestone 7,
 * Phase G, Step 7C). Plain DOM overlay, `/v2/range` only, gated by
 * `useAnimDebugEnabled()` at the mount site — same convention as
 * `KaelArmIkTunerPanel.tsx`/`VortexGripTunerPanel.tsx`. Edits
 * `animDebugStore` only; `VortexViewmodel.tsx`'s per-frame action-pose
 * computation reads this same store, so a scrub/play action here
 * immediately drives the real solved pose, not a separate preview replica.
 */
export default function ArmActionDebugPanel() {
  const anim = useAnimDebugStore();
  const [copied, setCopied] = useState(false);
  const [readout, setReadout] = useState<{
    phase: string;
    rightWeight: number;
    leftWeight: number;
    targetWeight: number;
    rightCurl: number;
    leftCurl: number;
    ready: boolean;
  } | null>(null);

  // `actionPoseState` is a plain mutable object written every frame inside
  // the R3F render loop (VortexViewmodel) — this DOM panel lives outside
  // the Canvas and can't use useFrame, so it polls at a human-perceptible
  // rate, same convention as KaelArmIkTunerPanel's bounds/accuracy readout.
  useEffect(() => {
    const id = window.setInterval(() => {
      setReadout({
        phase: actionPoseState.actionPhase,
        rightWeight: actionPoseState.rightHandIkWeight,
        leftWeight: actionPoseState.leftHandIkWeight,
        targetWeight: actionPoseState.leftActionTargetWeight,
        rightCurl: actionPoseState.rightFingerCurlScale,
        leftCurl: actionPoseState.leftFingerCurlScale,
        ready: actionPoseState.ready,
      });
    }, 100);
    return () => window.clearInterval(id);
  }, []);

  const handleCopy = async () => {
    const anchor = anim.scrubKind === 'inspect' ? INSPECT_LEFT_HAND_LOCAL : RELOAD_LEFT_HAND_LOCAL;
    const label = anim.scrubKind === 'inspect' ? 'INSPECT_LEFT_HAND_LOCAL' : 'RELOAD_LEFT_HAND_LOCAL';
    const code = `${label}: {\n  position: [${anchor.position.map((v) => v.toFixed(4)).join(', ')}],\n  rotationEuler: [${anchor.rotationEuler.map((v) => v.toFixed(4)).join(', ')}],\n  rotationOrder: '${anchor.rotationOrder}',\n}`;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Graceful degrade — nothing else to do without clipboard access; the value is still visible below for manual copy.
    }
  };

  return (
    <div className="pointer-events-auto absolute left-4 top-4 z-40 w-72 rounded-lg border border-white/15 bg-black/80 p-3 font-mono text-xs text-white/90 backdrop-blur-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-bold uppercase tracking-wide text-storm-energy">Arm Action Preview</span>
        <span className="text-[10px] text-white/40">?anim=1 · dev only</span>
      </div>

      <div className="mb-2 flex gap-2">
        <button type="button" className="flex-1 rounded bg-storm-energy/20 px-2 py-1 hover:bg-storm-energy/30" onClick={() => anim.playReload()}>
          Play reload
        </button>
        <button type="button" className="flex-1 rounded bg-storm-energy/20 px-2 py-1 hover:bg-storm-energy/30" onClick={() => anim.playInspect()}>
          Play inspect
        </button>
      </div>
      <div className="mb-2 flex gap-2">
        <button type="button" className="flex-1 rounded bg-white/10 px-2 py-1 hover:bg-white/20" onClick={() => anim.setPlaying(!anim.playing)} disabled={anim.mode !== 'scrub'}>
          {anim.playing ? 'Freeze' : 'Resume'}
        </button>
        <button type="button" className="flex-1 rounded bg-white/10 px-2 py-1 hover:bg-white/20" onClick={() => anim.returnToLive()}>
          Return to live
        </button>
      </div>

      <label className="mb-2 block">
        <div className="mb-1 flex justify-between text-white/60">
          <span>scrub progress ({anim.scrubKind})</span>
          <span>{anim.scrubProgress.toFixed(2)}</span>
        </div>
        <input type="range" min={0} max={1} step={0.01} value={anim.scrubProgress} onChange={(e) => anim.setScrubProgress(Number(e.target.value))} className="w-full" />
      </label>

      <label className="mb-2 flex items-center gap-2">
        <input type="checkbox" checked={anim.loop} onChange={() => anim.setLoop(!anim.loop)} />
        <span>replay loop</span>
      </label>

      <div className="mb-2 flex gap-2">
        <label className="flex flex-1 items-center gap-2">
          <input type="checkbox" checked={anim.showActionTarget} onChange={() => anim.toggleShowActionTarget()} />
          <span>show action target</span>
        </label>
      </div>
      <div className="mb-2 flex gap-2">
        <label className="flex flex-1 items-center gap-2">
          <input type="checkbox" checked={anim.showGripTarget} onChange={() => anim.toggleShowGripTarget()} />
          <span>show grip target</span>
        </label>
      </div>

      <div className="mb-2 rounded bg-black/60 p-2 text-[10px] leading-tight text-white/70">
        {readout ? (
          <>
            <div>phase: {readout.phase}</div>
            <div>
              right weight: {readout.rightWeight.toFixed(2)} · left weight: {readout.leftWeight.toFixed(2)}
            </div>
            <div>left action-target weight: {readout.targetWeight.toFixed(2)}</div>
            <div>
              curl right: {readout.rightCurl.toFixed(2)} · left: {readout.leftCurl.toFixed(2)}
            </div>
            <div>action target ready: {readout.ready ? 'yes' : 'no'}</div>
          </>
        ) : (
          <div>waiting for first frame…</div>
        )}
      </div>

      <button type="button" className="w-full rounded bg-white/10 px-2 py-1 hover:bg-white/20" onClick={handleCopy}>
        {copied ? 'Copied!' : 'Copy action-target config'}
      </button>
    </div>
  );
}
