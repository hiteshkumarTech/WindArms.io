'use client';

import { ArrowLeft, RotateCcw } from 'lucide-react';
import GlassButton from '@/components/ui/GlassButton';
import { SETTINGS_LIMITS, useSettingsStore } from '@/stores/settingsStore';

interface SettingsPanelProps {
  onClose: () => void;
}

interface ToggleRowProps {
  label: string;
  description: string;
  value: boolean;
  onChange: (value: boolean) => void;
}

function ToggleRow({ label, description, value, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-white/85">{label}</p>
        <p className="text-xs text-white/45">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={label}
        onClick={() => onChange(!value)}
        className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-cyan/70 ${
          value ? 'border-neon-cyan/60 bg-neon-cyan/30' : 'border-white/15 bg-white/10'
        }`}
      >
        <span
          className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full transition-all duration-200 ${
            value ? 'left-6 bg-neon-cyan' : 'left-1 bg-white/50'
          }`}
        />
      </button>
    </div>
  );
}

/** Player preferences — persisted locally, applied live to the simulation. */
export default function SettingsPanel({ onClose }: SettingsPanelProps) {
  const sensitivity = useSettingsStore((state) => state.sensitivity);
  const fov = useSettingsStore((state) => state.fov);
  const viewBob = useSettingsStore((state) => state.viewBob);
  const showPerfHud = useSettingsStore((state) => state.showPerfHud);
  const store = useSettingsStore;

  return (
    <div>
      <h2 className="text-2xl font-extrabold tracking-tight text-white">SETTINGS</h2>
      <p className="mt-1 text-sm text-white/55">Saved locally and applied instantly.</p>

      <div className="mt-5 space-y-5">
        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor="setting-sensitivity" className="text-sm font-medium text-white/85">
              Mouse sensitivity
            </label>
            <span className="text-sm tabular-nums text-neon-cyan">{sensitivity.toFixed(2)}x</span>
          </div>
          <input
            id="setting-sensitivity"
            type="range"
            min={SETTINGS_LIMITS.sensitivity.min}
            max={SETTINGS_LIMITS.sensitivity.max}
            step={SETTINGS_LIMITS.sensitivity.step}
            value={sensitivity}
            onChange={(event) => store.getState().setSensitivity(Number(event.target.value))}
            className="mt-2 w-full accent-[#00F5FF]"
          />
        </div>

        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor="setting-fov" className="text-sm font-medium text-white/85">
              Field of view
            </label>
            <span className="text-sm tabular-nums text-neon-cyan">{fov}°</span>
          </div>
          <input
            id="setting-fov"
            type="range"
            min={SETTINGS_LIMITS.fov.min}
            max={SETTINGS_LIMITS.fov.max}
            step={SETTINGS_LIMITS.fov.step}
            value={fov}
            onChange={(event) => store.getState().setFov(Number(event.target.value))}
            className="mt-2 w-full accent-[#00F5FF]"
          />
        </div>

        <ToggleRow
          label="Weapon bob"
          description="Viewmodel movement while running"
          value={viewBob}
          onChange={(value) => store.getState().setViewBob(value)}
        />
        <ToggleRow
          label="Performance HUD"
          description="Movement state, speed and FPS readout"
          value={showPerfHud}
          onChange={(value) => store.getState().setShowPerfHud(value)}
        />
      </div>

      <div className="mt-6 flex items-center gap-3">
        <GlassButton variant="primary" icon={ArrowLeft} onClick={onClose}>
          Back
        </GlassButton>
        <GlassButton variant="glass" icon={RotateCcw} onClick={() => store.getState().resetDefaults()}>
          Reset Defaults
        </GlassButton>
      </div>
    </div>
  );
}
