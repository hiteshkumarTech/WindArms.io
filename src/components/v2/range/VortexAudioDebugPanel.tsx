'use client';

import { useEffect, useRef, useState } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  getVortexAudioDebugState,
  playVortexDryFire,
  playVortexReload,
  playVortexShot,
  playVortexSpinDown,
  renderVortexBurstOffline,
  renderVortexDryFireOffline,
  renderVortexReloadOffline,
  renderVortexShotOffline,
  resetVortexAudioState,
  unlockVortexAudio,
  type VortexAudioMeasurement,
} from '@/lib/v2/range/vortexAudio';

/** Max-RPM shot interval (900rpm) — matches the Vortex's fastest realistic fire cadence for burst previews. */
const BURST_INTERVAL_MS = 66;

function playBurst(shotCount: number): void {
  for (let i = 0; i < shotCount; i++) {
    const sustain = shotCount <= 1 ? 0 : i / (shotCount - 1);
    window.setTimeout(() => playVortexShot(sustain), i * BURST_INTERVAL_MS);
  }
}

function formatMeasurement(m: VortexAudioMeasurement | null): string {
  if (!m) return '—';
  return `peak ${m.peakAmplitude.toFixed(3)} · rms ${m.rms.toFixed(3)}`;
}

/**
 * Dev-only Vortex audio diagnostic + listening panel (Milestone 7, Phase G,
 * Step 7G). Plain DOM overlay, `/v2/range` only, gated by
 * `useAudioDebugEnabled()` at the mount site — same convention as
 * `ArmActionDebugPanel.tsx`. Exposes the controls the brief's "human
 * listening gate" needs (single/burst/full-magazine fire, reload, dry-fire,
 * turbine attack/release preview) plus offline peak/RMS measurement — never
 * an editor, no project-file writing, no gameplay-state dependency.
 */
export default function VortexAudioDebugPanel() {
  const masterVolume = useSettingsStore((state) => state.masterVolume);
  const setMasterVolume = useSettingsStore((state) => state.setMasterVolume);
  const [state, setState] = useState(() => getVortexAudioDebugState());
  const [measurement, setMeasurement] = useState<{ label: string; value: VortexAudioMeasurement } | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const measureToken = useRef(0);

  useEffect(() => {
    const id = window.setInterval(() => setState(getVortexAudioDebugState()), 200);
    return () => window.clearInterval(id);
  }, []);

  const runMeasurement = async (label: string, render: () => Promise<VortexAudioMeasurement>) => {
    const token = ++measureToken.current;
    setMeasuring(true);
    const value = await render();
    if (measureToken.current === token) {
      setMeasurement({ label, value });
      setMeasuring(false);
    }
  };

  return (
    <div className="pointer-events-auto absolute right-4 top-4 z-40 w-72 rounded-lg border border-white/15 bg-black/80 p-3 font-mono text-xs text-white/90 backdrop-blur-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-bold uppercase tracking-wide text-storm-energy">Vortex Audio</span>
        <span className="text-[10px] text-white/40">?audio=1 · dev only</span>
      </div>

      <div className="mb-1 text-[10px] uppercase tracking-wide text-white/40">Listening</div>
      <div className="mb-2 grid grid-cols-2 gap-2">
        <button type="button" className="rounded bg-storm-energy/20 px-2 py-1 hover:bg-storm-energy/30" onClick={() => unlockVortexAudio()}>
          Unlock
        </button>
        <button type="button" className="rounded bg-storm-energy/20 px-2 py-1 hover:bg-storm-energy/30" onClick={() => playVortexShot(0)}>
          Single shot
        </button>
        <button type="button" className="rounded bg-storm-energy/20 px-2 py-1 hover:bg-storm-energy/30" onClick={() => playBurst(3)}>
          3-shot burst
        </button>
        <button type="button" className="rounded bg-storm-energy/20 px-2 py-1 hover:bg-storm-energy/30" onClick={() => playBurst(10)}>
          10-shot burst
        </button>
        <button type="button" className="rounded bg-storm-energy/20 px-2 py-1 hover:bg-storm-energy/30" onClick={() => playBurst(30)}>
          Full magazine (30)
        </button>
        <button type="button" className="rounded bg-white/10 px-2 py-1 hover:bg-white/20" onClick={() => playVortexSpinDown()}>
          Turbine release
        </button>
        <button type="button" className="rounded bg-storm-energy/20 px-2 py-1 hover:bg-storm-energy/30" onClick={() => playVortexReload()}>
          Reload
        </button>
        <button type="button" className="rounded bg-white/10 px-2 py-1 hover:bg-white/20" onClick={() => playVortexDryFire()}>
          Dry-fire
        </button>
      </div>

      <label className="mb-2 block">
        <div className="mb-1 flex justify-between text-white/60">
          <span>master volume</span>
          <span>{masterVolume.toFixed(2)}</span>
        </div>
        <input type="range" min={0} max={1} step={0.05} value={masterVolume} onChange={(e) => setMasterVolume(Number(e.target.value))} className="w-full" />
      </label>

      <div className="mb-1 text-[10px] uppercase tracking-wide text-white/40">Offline measurement (peak / RMS)</div>
      <div className="mb-2 grid grid-cols-2 gap-2">
        <button type="button" className="rounded bg-white/10 px-2 py-1 hover:bg-white/20 disabled:opacity-40" disabled={measuring} onClick={() => void runMeasurement('single shot', () => renderVortexShotOffline(0))}>
          Measure shot
        </button>
        <button type="button" className="rounded bg-white/10 px-2 py-1 hover:bg-white/20 disabled:opacity-40" disabled={measuring} onClick={() => void runMeasurement('full-magazine burst (30 @ 66ms)', () => renderVortexBurstOffline(30, BURST_INTERVAL_MS / 1000))}>
          Measure burst
        </button>
        <button type="button" className="rounded bg-white/10 px-2 py-1 hover:bg-white/20 disabled:opacity-40" disabled={measuring} onClick={() => void runMeasurement('reload', renderVortexReloadOffline)}>
          Measure reload
        </button>
        <button type="button" className="rounded bg-white/10 px-2 py-1 hover:bg-white/20 disabled:opacity-40" disabled={measuring} onClick={() => void runMeasurement('dry-fire', renderVortexDryFireOffline)}>
          Measure dry-fire
        </button>
      </div>
      {measurement && (
        <div className="mb-2 rounded bg-black/60 p-2 text-[10px] leading-tight text-white/70">
          <div>{measurement.label}</div>
          <div>{formatMeasurement(measurement.value)}</div>
        </div>
      )}

      <div className="mb-2 rounded bg-black/60 p-2 text-[10px] leading-tight text-white/70">
        <div>context: {state.contextState}</div>
        <div>
          shot voices: {state.shotVoices} / {state.shotVoiceCapacity}
        </div>
        <div>reload active: {state.reloadActive ? 'yes' : 'no'}</div>
        <div>turbine sustain: {state.turbineSustain.toFixed(2)}</div>
      </div>

      <button type="button" className="w-full rounded bg-white/10 px-2 py-1 hover:bg-white/20" onClick={() => resetVortexAudioState()}>
        Reset audio state
      </button>
    </div>
  );
}
