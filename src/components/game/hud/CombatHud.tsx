'use client';

import { useEffect, useState } from 'react';
import { WEAPONS, WEAPON_ORDER } from '@shared/weapons';
import { cn } from '@/lib/utils';
import { useCombatStore } from '@/stores/combatStore';
import { useWeaponStore } from '@/stores/weaponStore';

/** Briefly true whenever `nonce` changes — drives one-shot HUD flashes. */
function useFlash(nonce: number, durationMs: number): boolean {
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (nonce === 0) return;
    setActive(true);
    const timer = window.setTimeout(() => setActive(false), durationMs);
    return () => window.clearTimeout(timer);
  }, [nonce, durationMs]);
  return active;
}

/** Health, ammo, weapon strip, hitmarker and damage vignette. */
export default function CombatHud() {
  const health = useCombatStore((state) => state.health);
  const kills = useCombatStore((state) => state.kills);
  const deaths = useCombatStore((state) => state.deaths);
  const hitmarkerNonce = useCombatStore((state) => state.hitmarkerNonce);
  const damageNonce = useCombatStore((state) => state.damageNonce);

  const current = useWeaponStore((state) => state.current);
  const mags = useWeaponStore((state) => state.mags);
  const reloadingUntil = useWeaponStore((state) => state.reloadingUntil);

  const def = WEAPONS[current];
  const reloading = reloadingUntil !== 0;
  const hitmarker = useFlash(hitmarkerNonce, 120);
  const damaged = useFlash(damageNonce, 280);

  const healthColor =
    health > 60 ? 'bg-neon-cyan' : health > 30 ? 'bg-neon-orange' : 'bg-red-500';

  return (
    <>
      {/* Damage vignette */}
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(90%_90%_at_50%_50%,transparent_55%,rgba(220,38,38,0.35))] transition-opacity duration-300',
          damaged ? 'opacity-100' : 'opacity-0',
        )}
      />

      {/* Hitmarker */}
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-0 z-20 grid place-items-center transition-opacity duration-100',
          hitmarker ? 'opacity-100' : 'opacity-0',
        )}
      >
        <div className="relative h-6 w-6 rotate-45">
          <span className="absolute left-1/2 top-0 h-1.5 w-0.5 -translate-x-1/2 bg-white" />
          <span className="absolute bottom-0 left-1/2 h-1.5 w-0.5 -translate-x-1/2 bg-white" />
          <span className="absolute left-0 top-1/2 h-0.5 w-1.5 -translate-y-1/2 bg-white" />
          <span className="absolute right-0 top-1/2 h-0.5 w-1.5 -translate-y-1/2 bg-white" />
        </div>
      </div>

      {/* Health (above the movement debug readout) */}
      <div className="pointer-events-none absolute bottom-[7.25rem] left-5 z-20">
        <div className="glass rounded-xl px-4 py-3">
          <div className="flex items-end gap-3">
            <span className="text-2xl font-extrabold tabular-nums leading-none text-white">
              {health}
            </span>
            <span className="pb-0.5 text-[10px] uppercase tracking-widest text-white/45">HP</span>
            <span className="ml-auto pb-0.5 text-[10px] uppercase tracking-widest text-white/45">
              {kills} / {deaths} K/D
            </span>
          </div>
          <div className="mt-2 h-1.5 w-52 overflow-hidden rounded-full bg-white/10">
            <div
              className={cn('h-full rounded-full transition-all duration-200', healthColor)}
              style={{ width: `${health}%` }}
            />
          </div>
        </div>
      </div>

      {/* Ammo + weapon strip */}
      <div className="pointer-events-none absolute bottom-5 right-5 z-20 flex flex-col items-end gap-2">
        <div className="flex gap-1.5">
          {WEAPON_ORDER.map((id) => (
            <div
              key={id}
              className={cn(
                'glass grid h-8 w-8 place-items-center rounded-lg text-[11px] font-semibold transition-colors duration-200',
                id === current
                  ? 'border-neon-cyan/60 text-neon-cyan shadow-glow-cyan'
                  : 'text-white/40',
              )}
              title={WEAPONS[id].name}
            >
              {WEAPONS[id].slot}
            </div>
          ))}
        </div>
        <div className="glass min-w-[13rem] rounded-xl px-4 py-3 text-right">
          <p className="text-[10px] uppercase tracking-widest text-white/45">{def.name}</p>
          <p className="mt-0.5 text-3xl font-extrabold leading-none text-white">
            <span className={cn('tabular-nums', mags[current] === 0 && 'text-red-400')}>
              {mags[current]}
            </span>
            <span className="text-sm font-semibold text-white/40"> / {def.magSize}</span>
          </p>
          {reloading ? (
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
              <div
                key={reloadingUntil}
                className="reload-fill h-full rounded-full bg-neon-cyan"
                style={{ animationDuration: `${def.reloadTimeS}s` }}
              />
            </div>
          ) : (
            <p className="mt-2 text-[10px] uppercase tracking-widest text-white/30">
              R to reload · 1-7 to switch
            </p>
          )}
        </div>
      </div>
    </>
  );
}
