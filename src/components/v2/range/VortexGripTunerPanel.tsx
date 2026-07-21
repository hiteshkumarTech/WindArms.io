'use client';

import { useState } from 'react';
import { formatAnchorAsCode, radToDegDisplay, useGripTunerStore, type TunedHandTarget } from '@/lib/v2/weapons/gripTunerStore';

const AXIS_LABELS: readonly ['X', 'Y', 'Z'] = ['X', 'Y', 'Z'];

/**
 * Dev-only grip-anchor authoring panel (Milestone 7, Phase F, Step 7).
 * Plain DOM overlay (not inside the R3F Canvas) — sibling of `RangeHud` in
 * `RangeView.tsx`, gated the same way (`useGripDebugEnabled()` at the
 * mount site, this component does no gating itself).
 *
 * Edits `gripTunerStore` only — never touches `vortexRuntimeAnchors.ts`,
 * never mounts/affects gameplay. The 3D markers in
 * `VortexGripAnchorDebug.tsx` read this same store and move live as these
 * inputs change. "Copy code" is the ONE intended path from here back into
 * the real source file — a human pastes the generated snippet in
 * manually.
 */
export default function VortexGripTunerPanel() {
  const tuner = useGripTunerStore();
  const [copiedFor, setCopiedFor] = useState<TunedHandTarget | null>(null);

  const active = tuner[tuner.selected];

  const handleCopy = async (target: TunedHandTarget) => {
    const code = formatAnchorAsCode(tuner[target], target === 'hand' ? 'gripHandLocal (right, primary)' : 'gripSupportLocal (left, support)');
    try {
      await navigator.clipboard.writeText(code);
      setCopiedFor(target);
      window.setTimeout(() => setCopiedFor((cur) => (cur === target ? null : cur)), 1500);
    } catch {
      // Clipboard API can be denied by browser permissions — the panel
      // still shows the code below for manual selection, so this isn't
      // fatal, just quietly degrades to "select and copy by hand."
    }
  };

  return (
    <div className="pointer-events-auto absolute right-4 top-4 z-40 w-80 rounded-lg border border-white/15 bg-black/80 p-3 font-mono text-xs text-white/90 backdrop-blur-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-bold uppercase tracking-wide text-storm-energy">Vortex Grip Tuner</span>
        <span className="text-[10px] text-white/40">?grips=1 · dev only</span>
      </div>

      <div className="mb-2 flex gap-1">
        <HandTab label="Right (hand)" active={tuner.selected === 'hand'} onClick={() => tuner.setSelected('hand')} />
        <HandTab label="Left (support)" active={tuner.selected === 'support'} onClick={() => tuner.setSelected('support')} />
      </div>

      <div className="mb-2 grid grid-cols-3 gap-1">
        {AXIS_LABELS.map((label, axis) => (
          <AxisControl
            key={`pos-${label}`}
            label={`pos ${label}`}
            value={active.position[axis]}
            unit="m"
            decimals={4}
            onNudge={(dir) => tuner.nudgePosition(tuner.selected, axis as 0 | 1 | 2, dir)}
            onSet={(v) => tuner.setPositionAxis(tuner.selected, axis as 0 | 1 | 2, v)}
          />
        ))}
      </div>
      <div className="mb-2 grid grid-cols-3 gap-1">
        {AXIS_LABELS.map((label, axis) => (
          <AxisControl
            key={`rot-${label}`}
            label={`rot ${label}`}
            value={radToDegDisplay(active.rotationEuler[axis])}
            unit="deg"
            decimals={1}
            onNudge={(dir) => tuner.nudgeRotation(tuner.selected, axis as 0 | 1 | 2, dir)}
            onSet={(v) => tuner.setRotationAxisDegrees(tuner.selected, axis as 0 | 1 | 2, v)}
          />
        ))}
      </div>

      <div className="mb-2 flex items-center gap-2">
        <button
          type="button"
          className={`rounded px-2 py-1 ${tuner.stepSize === 'coarse' ? 'bg-storm-energy text-black' : 'bg-white/10'}`}
          onClick={() => tuner.setStepSize('coarse')}
        >
          coarse (1cm/5°)
        </button>
        <button
          type="button"
          className={`rounded px-2 py-1 ${tuner.stepSize === 'fine' ? 'bg-storm-energy text-black' : 'bg-white/10'}`}
          onClick={() => tuner.setStepSize('fine')}
        >
          fine (1mm/1°)
        </button>
      </div>

      <div className="mb-2 grid grid-cols-2 gap-1">
        <ToggleButton label="axes" active={tuner.showAxes} onClick={tuner.toggleAxes} />
        <ToggleButton label="palm proxy" active={tuner.showPalmProxy} onClick={tuner.togglePalmProxy} />
        <ToggleButton label="hand proxy" active={tuner.showHandProxy} onClick={tuner.toggleHandProxy} />
        <ToggleButton label="freeze pose" active={tuner.frozen} onClick={tuner.toggleFrozen} />
      </div>

      <div className="mb-2 flex gap-1">
        <button type="button" className="flex-1 rounded bg-white/10 px-2 py-1 hover:bg-white/20" onClick={() => tuner.resetToShipped(tuner.selected)}>
          reset
        </button>
        <button type="button" className="flex-1 rounded bg-white/10 px-2 py-1 hover:bg-white/20" onClick={tuner.swapHands}>
          swap L/R
        </button>
        <button type="button" className="flex-1 rounded bg-storm-energy px-2 py-1 text-black hover:opacity-90" onClick={() => handleCopy(tuner.selected)}>
          {copiedFor === tuner.selected ? 'copied!' : 'copy code'}
        </button>
      </div>

      <pre className="max-h-28 overflow-auto rounded bg-black/60 p-2 text-[10px] leading-tight text-storm-energy/90">
        {formatAnchorAsCode(active, tuner.selected === 'hand' ? 'gripHandLocal' : 'gripSupportLocal')}
      </pre>
    </div>
  );
}

function HandTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`flex-1 rounded px-2 py-1 text-[11px] ${active ? 'bg-storm-energy text-black' : 'bg-white/10'}`}>
      {label}
    </button>
  );
}

function ToggleButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`rounded px-2 py-1 text-[11px] ${active ? 'bg-storm-energy text-black' : 'bg-white/10'}`}>
      {active ? '●' : '○'} {label}
    </button>
  );
}

function AxisControl({
  label,
  value,
  unit,
  decimals,
  onNudge,
  onSet,
}: {
  label: string;
  value: number;
  unit: string;
  decimals: number;
  onNudge: (direction: 1 | -1) => void;
  onSet: (value: number) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 rounded bg-white/5 p-1">
      <span className="text-[10px] text-white/50">
        {label} ({unit})
      </span>
      <input
        type="number"
        value={Number(value.toFixed(decimals))}
        step={decimals >= 4 ? 0.001 : 1}
        onChange={(e) => {
          const parsed = Number(e.target.value);
          if (Number.isFinite(parsed)) onSet(parsed);
        }}
        className="w-full rounded bg-black/50 px-1 py-0.5 text-center text-[11px] text-white outline-none"
      />
      <div className="flex w-full gap-0.5">
        <button type="button" className="flex-1 rounded bg-white/10 text-[10px] hover:bg-white/20" onClick={() => onNudge(-1)}>
          −
        </button>
        <button type="button" className="flex-1 rounded bg-white/10 text-[10px] hover:bg-white/20" onClick={() => onNudge(1)}>
          +
        </button>
      </div>
    </div>
  );
}
