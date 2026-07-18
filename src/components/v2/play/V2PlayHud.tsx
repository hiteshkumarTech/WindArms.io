'use client';

import { useEffect, useRef, useState } from 'react';
import { WIND_WEAPONS } from '@shared/windWeapons';
import { useVortexWeaponStore } from '@/lib/v2/weapons/vortexWeaponStore';
import { TRIAL } from '@/lib/v2/play/constants';
import { useDifficultyConfig, useV2MatchStore } from '@/lib/v2/play/matchStore';
import { isHudVisible } from '@/lib/v2/play/matchStateMachine';
import { useMatchClock } from './useMatchClock';

/** Timed boolean off a bumping nonce — the CombatHud `useFlash` idiom. */
function useFlash(nonce: number, durationMs: number): boolean {
  const [active, setActive] = useState(false);
  const mounted = useRef(nonce);
  const timeout = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (nonce === mounted.current) return;
    mounted.current = nonce;
    setActive(true);
    window.clearTimeout(timeout.current);
    timeout.current = window.setTimeout(() => setActive(false), durationMs);
    return () => window.clearTimeout(timeout.current);
  }, [nonce, durationMs]);
  return active;
}

/** Controls hint that fades out a few seconds into live play. */
function useHintVisible(phase: string): boolean {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (phase !== 'active') return;
    const timer = window.setTimeout(() => setVisible(false), TRIAL.HINT_FADE_S * 1000);
    return () => window.clearTimeout(timer);
  }, [phase]);
  return visible;
}

/**
 * Skyfront Trial in-round HUD (Milestone 6). STORM-token styling: white/
 * stone text, translucent titanium panels, cyan energy accent, restrained
 * gold. All important readouts sit inside a safe inset so nothing clips at
 * 1366×768 or 1920×1080. Frequently-changing timer is throttled to whole
 * seconds via useMatchClock (no per-frame React render). Ammo/health/score
 * come from narrow store selectors.
 */
export default function V2PlayHud() {
  const def = WIND_WEAPONS.vortex;
  const magSize = def.gameplayStats?.magSize ?? 30;

  const phase = useV2MatchStore((state) => state.phase);
  const playerHp = useV2MatchStore((state) => state.playerHp);
  const dronesDestroyed = useV2MatchStore((state) => state.dronesDestroyed);
  const damageNonce = useV2MatchStore((state) => state.damageNonce);
  const difficulty = useDifficultyConfig();

  const ammo = useVortexWeaponStore((state) => state.ammo);
  const reloadingUntil = useVortexWeaponStore((state) => state.reloadingUntil);
  const ads = useVortexWeaponStore((state) => state.ads);
  const hits = useVortexWeaponStore((state) => state.stats.hits);

  const { minutes, seconds, totalSeconds } = useMatchClock();
  const reloading = reloadingUntil !== 0;
  const damageFlash = useFlash(damageNonce, 260);
  const hitFlash = useFlash(hits, 150);
  const hintVisible = useHintVisible(phase);

  if (!isHudVisible(phase)) return null;

  const dronesLeft = difficulty.droneCount - dronesDestroyed;
  const timeLow = totalSeconds <= 30;
  const hpColor = playerHp > 50 ? 'bg-storm-energy' : playerHp > 25 ? 'bg-storm-gold' : 'bg-storm-crimson';

  return (
    <div className="pointer-events-none fixed inset-0 z-20 select-none font-sans text-white">
      {/* Damage vignette */}
      <div className={`absolute inset-0 transition-opacity duration-200 ${damageFlash ? 'opacity-100' : 'opacity-0'}`} style={{ boxShadow: 'inset 0 0 180px 60px rgba(176,46,46,0.55)' }} />

      {/* Crosshair + hit marker */}
      <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center">
        {ads ? (
          <div className="h-7 w-7 rounded-full border border-storm-energy/70" />
        ) : (
          <div className="relative h-4 w-4">
            <span className={`absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full ${hitFlash ? 'bg-storm-energy' : 'bg-white/85'}`} />
            {hitFlash && <span className="absolute inset-0 rotate-45 rounded-sm border border-storm-energy/80" />}
          </div>
        )}
      </div>

      {/* Top center — objective + timer */}
      <div className="absolute left-1/2 top-5 flex -translate-x-1/2 flex-col items-center gap-1.5">
        <div className={`rounded-lg border px-5 py-1.5 text-2xl font-bold tabular-nums backdrop-blur-md ${timeLow ? 'border-storm-crimson/50 bg-storm-crimson/15 text-storm-crimson' : 'border-white/15 bg-storm-deep/50 text-white'}`}>
          {minutes}:{seconds.toString().padStart(2, '0')}
        </div>
        <div className="rounded-full border border-white/10 bg-storm-deep/40 px-4 py-1 text-[11px] uppercase tracking-[0.25em] text-white/70 backdrop-blur-md">
          Drones remaining: <span className="font-bold text-storm-energy">{dronesLeft}</span> / {difficulty.droneCount}
        </div>
        <div className="rounded-full border border-white/10 bg-storm-deep/30 px-3 py-0.5 text-[10px] uppercase tracking-[0.3em] text-storm-gold/80 backdrop-blur-md">
          {difficulty.label}
        </div>
      </div>

      {/* Bottom left — health */}
      <div className="absolute bottom-6 left-6 w-56 rounded-xl border border-white/12 bg-storm-deep/50 px-4 py-3 backdrop-blur-md">
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] uppercase tracking-widest text-white/50">Integrity</span>
          <span className="text-lg font-bold tabular-nums">{Math.round(playerHp)}</span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10">
          <div className={`h-full rounded-full transition-[width] duration-200 ${hpColor}`} style={{ width: `${Math.max(0, playerHp)}%` }} />
        </div>
      </div>

      {/* Bottom right — ammo */}
      <div className="absolute bottom-6 right-6 rounded-xl border border-white/12 bg-storm-deep/50 px-4 py-3 text-right backdrop-blur-md">
        <div className="text-[11px] uppercase tracking-widest text-white/45">{def.name}</div>
        <div className="mt-0.5 flex items-baseline justify-end gap-1.5">
          <span className="text-3xl font-bold tabular-nums">{reloading ? '—' : ammo}</span>
          <span className="text-sm text-white/45">/ {magSize}</span>
        </div>
        <div className="text-[11px] uppercase tracking-widest text-storm-energy/80">{reloading ? 'Reloading…' : 'Automatic'}</div>
      </div>

      {/* Respawn notice */}
      {phase === 'playerDead' && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-storm-crimson/40 bg-storm-abyss/70 px-8 py-5 text-center backdrop-blur-md">
          <div className="text-lg font-bold uppercase tracking-widest text-storm-crimson">Integrity Lost</div>
          <div className="mt-1 text-sm text-white/70">Redeploying…</div>
        </div>
      )}

      {/* Controls hint (fades) */}
      <div className={`absolute bottom-6 left-1/2 -translate-x-1/2 rounded-lg border border-white/10 bg-storm-deep/40 px-4 py-2 text-[11px] text-white/55 backdrop-blur-md transition-opacity duration-1000 ${hintVisible && phase === 'active' ? 'opacity-100' : 'opacity-0'}`}>
        WASD move · Shift sprint · Space jump · LMB fire · RMB aim · R reload · Esc pause
      </div>
    </div>
  );
}
