'use client';

import { useEffect, useState } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  getVortexAudioDebugState,
  playVortexDryFire,
  playVortexReload,
  playVortexShot,
  unlockVortexAudio,
} from '@/lib/v2/range/vortexAudio';

/**
 * Dev-only Vortex audio diagnostic panel (Milestone 7, Phase G, Step 7F).
 * Plain DOM overlay, `/v2/range` only, gated by `useAudioDebugEnabled()` at
 * the mount site — same convention as `ArmActionDebugPanel.tsx`. Polls
 * `getVortexAudioDebugState()` at a human-perceptible rate since the synth
 * lives outside the R3F render loop and has no reactive store of its own.
 */
export default function VortexAudioDebugPanel() {
  const masterVolume = useSettingsStore((state) => state.masterVolume);
  const setMasterVolume = useSettingsStore((state) => state.setMasterVolume);
  const [state, setState] = useState(() => getVortexAudioDebugState());

  useEffect(() => {
    const id = window.setInterval(() => setState(getVortexAudioDebugState()), 200);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="pointer-events-auto absolute right-4 top-4 z-40 w-64 rounded-lg border border-white/15 bg-black/80 p-3 font-mono text-xs text-white/90 backdrop-blur-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-bold uppercase tracking-wide text-storm-energy">Vortex Audio</span>
        <span className="text-[10px] text-white/40">?audio=1 · dev only</span>
      </div>

      <div className="mb-2 flex gap-2">
        <button type="button" className="flex-1 rounded bg-storm-energy/20 px-2 py-1 hover:bg-storm-energy/30" onClick={() => unlockVortexAudio()}>
          Unlock
        </button>
        <button type="button" className="flex-1 rounded bg-storm-energy/20 px-2 py-1 hover:bg-storm-energy/30" onClick={() => playVortexShot(0)}>
          Fire
        </button>
      </div>
      <div className="mb-2 flex gap-2">
        <button type="button" className="flex-1 rounded bg-storm-energy/20 px-2 py-1 hover:bg-storm-energy/30" onClick={() => playVortexReload()}>
          Reload
        </button>
        <button type="button" className="flex-1 rounded bg-white/10 px-2 py-1 hover:bg-white/20" onClick={() => playVortexDryFire()}>
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

      <div className="rounded bg-black/60 p-2 text-[10px] leading-tight text-white/70">
        <div>context: {state.contextState}</div>
        <div>
          shot voices: {state.shotVoices} / {state.shotVoiceCapacity}
        </div>
        <div>reload active: {state.reloadActive ? 'yes' : 'no'}</div>
      </div>
    </div>
  );
}
