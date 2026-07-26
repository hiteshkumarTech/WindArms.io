'use client';

import { useEffect, useState } from 'react';
import { bodyDebugReadout } from '@/lib/v2/operators/bodyDebugReadout';
import { formatBodyConfigAsCode, useBodyDebugStore } from '@/lib/v2/operators/bodyDebugStore';
import { getFirstPersonBodyWorldPose } from '@/lib/v2/operators/firstPersonBodyPose';
import { rangeLocalPose } from '@/lib/v2/range/localPose';

/**
 * Dev-only Kael lower-body calibration panel (Milestone 8, Step 8C). Plain
 * DOM overlay, `/v2/range?body=1` only, gated by `useBodyDebugEnabled()` at
 * the mount site — same convention as `KaelArmIkTunerPanel.tsx`/
 * `ArmActionDebugPanel.tsx`. Edits `bodyDebugStore` only;
 * `KaelFirstPersonLowerBody.tsx`'s per-frame transform reads this same
 * store, so an offset changed here immediately drives the real rendered
 * position — no separate preview replica.
 */
export default function KaelBodyDebugPanel() {
  const body = useBodyDebugStore();
  const [copied, setCopied] = useState(false);
  const [readout, setReadout] = useState<{
    poseReady: boolean;
    poseGeneration: number;
    worldPosition: [number, number, number];
    worldYaw: number;
    respawnNonce: number;
    playerYaw: number;
    playerPitch: number;
    effectiveYaw: number;
    cameraToBodyRootDistance: number;
    meshCount: number;
    triangleCount: number;
    materialName: string;
  } | null>(null);

  // Both `getFirstPersonBodyWorldPose()` and `rangeLocalPose` are plain
  // mutable objects written every frame inside the R3F render loop — this
  // DOM panel lives outside the Canvas and can't use useFrame, so it polls
  // at a human-perceptible rate, same convention as ArmActionDebugPanel's
  // `actionPoseState` readout.
  useEffect(() => {
    const id = window.setInterval(() => {
      const pose = getFirstPersonBodyWorldPose();
      setReadout({
        poseReady: pose.ready,
        poseGeneration: pose.generation,
        worldPosition: pose.worldPosition.toArray() as [number, number, number],
        worldYaw: pose.worldYaw,
        respawnNonce: pose.respawnNonce,
        playerYaw: rangeLocalPose.yaw,
        playerPitch: rangeLocalPose.pitch,
        effectiveYaw: bodyDebugReadout.effectiveYaw,
        cameraToBodyRootDistance: bodyDebugReadout.cameraToBodyRootDistance,
        meshCount: bodyDebugReadout.meshCount,
        triangleCount: bodyDebugReadout.triangleCount,
        materialName: bodyDebugReadout.materialName,
      });
    }, 100);
    return () => window.clearInterval(id);
  }, []);

  const [offX, offY, offZ] = body.positionOffsetLocal;
  const setOffset = (index: 0 | 1 | 2, value: number) => {
    const next: [number, number, number] = [offX, offY, offZ];
    next[index] = value;
    body.setPositionOffsetLocal(next);
  };

  const handleCopy = async () => {
    const code = formatBodyConfigAsCode(body);
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Graceful degrade — nothing else to do without clipboard access; the value is still visible via the readouts below.
    }
  };

  return (
    <div className="pointer-events-auto absolute right-4 top-4 z-40 w-80 rounded-lg border border-white/15 bg-black/80 p-3 font-mono text-xs text-white/90 backdrop-blur-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-bold uppercase tracking-wide text-storm-energy">Kael Lower-Body Calibration</span>
        <span className="text-[10px] text-white/40">?body=1 · dev only</span>
      </div>

      <label className="mb-2 flex items-center gap-2">
        <input type="checkbox" checked={body.visible} onChange={() => body.toggleVisible()} />
        <span>show lower body</span>
      </label>

      {(['X', 'Y', 'Z'] as const).map((axis, i) => (
        <label key={axis} className="mb-2 block">
          <div className="mb-1 flex justify-between text-white/60">
            <span>position offset {axis} (m)</span>
            <span>{[offX, offY, offZ][i].toFixed(3)}</span>
          </div>
          <input
            type="range"
            min={-1}
            max={1}
            step={0.005}
            value={[offX, offY, offZ][i]}
            onChange={(e) => setOffset(i as 0 | 1 | 2, Number(e.target.value))}
            className="w-full"
          />
        </label>
      ))}

      <label className="mb-2 block">
        <div className="mb-1 flex justify-between text-white/60">
          <span>yaw offset (deg)</span>
          <span>{body.yawOffsetDeg.toFixed(1)}</span>
        </div>
        <input type="range" min={-180} max={180} step={0.5} value={body.yawOffsetDeg} onChange={(e) => body.setYawOffsetDeg(Number(e.target.value))} className="w-full" />
      </label>

      <div className="mb-2 flex flex-col gap-1">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={body.showBodyRootMarker} onChange={() => body.toggleBodyRootMarker()} />
          <span>show body root marker</span>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={body.showCameraMarker} onChange={() => body.toggleCameraMarker()} />
          <span>show camera marker</span>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={body.showDeformedBodyBounds} onChange={() => body.toggleDeformedBodyBounds()} />
          <span>show deformed body bounds</span>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={body.showSkeletonLandmarks} onChange={() => body.toggleSkeletonLandmarks()} />
          <span>show skeleton landmarks (gold=waist, magenta=hips, cyan=knees, lime=boots)</span>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={body.neutralMaterial} onChange={() => body.toggleNeutralMaterial()} />
          <span>diagnostic neutral material</span>
        </label>
      </div>

      <div className="mb-2 flex gap-2">
        <button type="button" className="flex-1 rounded bg-white/10 px-2 py-1 hover:bg-white/20" onClick={() => body.reset()}>
          Reset
        </button>
        <button type="button" className="flex-1 rounded bg-storm-energy/20 px-2 py-1 hover:bg-storm-energy/30" onClick={handleCopy}>
          {copied ? 'Copied!' : 'Copy config'}
        </button>
      </div>

      <div className="rounded bg-black/60 p-2 text-[10px] leading-tight text-white/70">
        {readout ? (
          <>
            <div>pose ready: {readout.poseReady ? 'yes' : 'no'} · generation: {readout.poseGeneration}</div>
            <div>
              body world pos: [{readout.worldPosition.map((v) => v.toFixed(2)).join(', ')}]
            </div>
            <div>
              player yaw: {readout.playerYaw.toFixed(3)} · effective yaw: {readout.effectiveYaw.toFixed(3)}
            </div>
            <div>camera pitch: {readout.playerPitch.toFixed(3)}</div>
            <div>camera-to-body-root distance: {readout.cameraToBodyRootDistance.toFixed(3)}m</div>
            <div>respawn nonce: {readout.respawnNonce}</div>
            <div>
              meshes: {readout.meshCount} · tris: {readout.triangleCount}
            </div>
            <div>material: {readout.materialName || '(loading)'}</div>
          </>
        ) : (
          <div>waiting for first frame…</div>
        )}
      </div>
    </div>
  );
}
