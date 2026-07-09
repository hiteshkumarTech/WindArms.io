'use client';

import { usePlayerStore } from '@/stores/playerStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { cn } from '@/lib/utils';
import type { MovementState } from '@/types/game';

const STATE_COLORS: Record<MovementState, string> = {
  idle: 'text-white/60',
  run: 'text-white',
  wallrun: "text-cyan-400",
  sprint: 'text-neon-cyan',
  slide: 'text-neon-orange',
  dash: 'text-neon-purple',
  air: 'text-white/80',
};

/** Movement telemetry readout (Phase 2 debug HUD, bottom-left). */
export default function DebugHud() {
  const { state, speed, fps, grounded, dashCooldown } = usePlayerStore();
  const showPerfHud = useSettingsStore((settings) => settings.showPerfHud);

  if (!showPerfHud) return null;

  return (
    <div className="pointer-events-none absolute bottom-5 left-5 z-20">
      <div className="glass rounded-xl px-4 py-3 text-xs font-medium">
        <div className="flex items-center gap-3">
          <span className={cn('w-14 uppercase tracking-widest', STATE_COLORS[state])}>{state}</span>
          <span className="tabular-nums text-white/70">{speed.toFixed(1)} m/s</span>
          <span className="tabular-nums text-white/50">{fps} FPS</span>
          <span
            className={cn('h-1.5 w-1.5 rounded-full', grounded ? 'bg-emerald-400' : 'bg-white/30')}
            title={grounded ? 'Grounded' : 'Airborne'}
          />
        </div>
        <div className="mt-2 h-1 w-48 overflow-hidden rounded-full bg-white/10">
          <div
            className={cn(
              'h-full rounded-full transition-[width] duration-100 ease-linear',
              dashCooldown >= 1 ? 'bg-neon-cyan' : 'bg-neon-purple',
            )}
            style={{ width: `${dashCooldown * 100}%` }}
          />
        </div>
        <p className="mt-1 text-[10px] uppercase tracking-wider text-white/40">
          Dash {dashCooldown >= 1 ? 'ready — press Q' : 'charging'}
        </p>
      </div>
    </div>
  );
}
