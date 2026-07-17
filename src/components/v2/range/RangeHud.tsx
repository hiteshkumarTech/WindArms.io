'use client';

import { useEffect, useRef, useState } from 'react';
import { WIND_WEAPONS } from '@shared/windWeapons';
import { useVortexWeaponStore } from '@/lib/v2/weapons/vortexWeaponStore';

/** Nonce-triggered timed boolean — same idiom as v1's CombatHud `useFlash` hook. */
function useFlash(nonce: number, durationMs: number): boolean {
  const [active, setActive] = useState(false);
  const timeoutRef = useRef<number | undefined>(undefined);
  const mountedNonce = useRef(nonce);

  useEffect(() => {
    if (nonce === mountedNonce.current) return;
    mountedNonce.current = nonce;
    setActive(true);
    window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => setActive(false), durationMs);
    return () => window.clearTimeout(timeoutRef.current);
  }, [nonce, durationMs]);

  return active;
}

/**
 * Ammo/reload/weapon-name/fire-mode overlay for `/v2/range`, reading
 * directly from `WIND_WEAPONS.vortex` (runtime metadata — manufacturer,
 * name, fire mode) and `useVortexWeaponStore` (live ammo/reload/hit state),
 * per the brief's "connect ... using existing runtime metadata" requirement.
 * Narrow per-field selectors, same convention as v1's CombatHud, so each
 * piece only re-renders on its own slice changing.
 */
export default function RangeHud() {
  const def = WIND_WEAPONS.vortex;
  const magSize = def.gameplayStats?.magSize ?? 30;

  const ammo = useVortexWeaponStore((state) => state.ammo);
  const reloadingUntil = useVortexWeaponStore((state) => state.reloadingUntil);
  const ads = useVortexWeaponStore((state) => state.ads);
  const hits = useVortexWeaponStore((state) => state.stats.hits);
  const shotsFired = useVortexWeaponStore((state) => state.stats.shotsFired);
  const targetsDestroyed = useVortexWeaponStore((state) => state.stats.targetsDestroyed);
  const reloading = reloadingUntil !== 0;
  const hitFlash = useFlash(hits, 180);

  return (
    <div className="pointer-events-none fixed inset-0 z-20 select-none font-sans text-white">
      <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center">
        {ads ? (
          <div className="h-8 w-8 rounded-full border border-storm-energy/70" />
        ) : (
          <div className={`h-1.5 w-1.5 rounded-full transition-colors ${hitFlash ? 'bg-storm-energy' : 'bg-white/80'}`} />
        )}
      </div>

      <div className="absolute bottom-6 right-6 rounded-lg border border-white/10 bg-storm-abyss/60 px-4 py-3 backdrop-blur-sm">
        <div className="text-[11px] uppercase tracking-wide text-white/45">{def.manufacturer ?? 'Unknown manufacturer'}</div>
        <div className="text-lg font-semibold">{def.name}</div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-3xl font-bold tabular-nums">{reloading ? '—' : ammo}</span>
          <span className="text-sm text-white/45">/ {magSize}</span>
        </div>
        <div className="mt-1 text-[11px] uppercase tracking-wide text-white/40">
          {reloading ? 'Reloading…' : def.fireMode === 'auto' ? 'Automatic' : (def.fireMode ?? 'Unknown fire mode')}
        </div>
      </div>

      <div className="absolute bottom-6 left-6 rounded-lg border border-white/10 bg-storm-abyss/60 px-4 py-3 text-xs text-white/60 backdrop-blur-sm">
        <div>Shots fired: {shotsFired}</div>
        <div>Hits: {hits}</div>
        <div>Targets destroyed: {targetsDestroyed}</div>
      </div>

      <div className="absolute left-6 top-6 rounded-lg border border-white/10 bg-storm-abyss/45 px-3 py-2 text-[11px] leading-5 text-white/50 backdrop-blur-sm">
        WASD move · Shift sprint · Space jump
        <br />
        LMB fire · RMB aim · R reload · F inspect
      </div>
    </div>
  );
}
