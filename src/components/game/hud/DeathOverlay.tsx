'use client';

import { useEffect, useState } from 'react';
import { Skull } from 'lucide-react';
import { getSocket } from '@/lib/network/socket';
import { useCombatStore } from '@/stores/combatStore';
import { useMultiplayerStore } from '@/stores/multiplayerStore';

/**
 * Shown while dead: killer callout, redeploy countdown, Space to respawn.
 * The respawn request is validated server-side (RESPAWN_DELAY_MS), so
 * spamming Space early does nothing.
 */
export default function DeathOverlay() {
  const killedBy = useCombatStore((state) => state.killedBy);
  const respawnAt = useCombatStore((state) => state.respawnAt);
  const kills = useCombatStore((state) => state.kills);
  const deaths = useCombatStore((state) => state.deaths);
  const [remainingMs, setRemainingMs] = useState(() => Math.max(0, respawnAt - Date.now()));

  useEffect(() => {
    const interval = window.setInterval(() => {
      setRemainingMs(Math.max(0, respawnAt - Date.now()));
    }, 100);
    return () => window.clearInterval(interval);
  }, [respawnAt]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || Date.now() < respawnAt) return;
      const session = useMultiplayerStore.getState();
      if (session.mode === 'online' && session.status === 'connected') {
        getSocket().emit('combat:respawn');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [respawnAt]);

  const ready = remainingMs <= 0;

  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-red-950/20 backdrop-blur-[3px]">
      <div className="pointer-events-none flex flex-col items-center text-center">
        <Skull className="h-10 w-10 text-red-400/90" aria-hidden />
        <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-white">ELIMINATED</h1>
        {killedBy ? (
          <p className="mt-1 text-sm text-white/60">
            taken down by <span className="font-semibold text-red-400">{killedBy}</span>
          </p>
        ) : null}
        <p className="mt-1 text-xs uppercase tracking-widest text-white/40">
          {kills} kills · {deaths} deaths
        </p>
        <div className="mt-6 glass rounded-xl px-6 py-3">
          {ready ? (
            <p className="text-sm font-semibold text-neon-cyan">
              Press <span className="rounded bg-white/10 px-1.5 py-0.5">SPACE</span> to redeploy
            </p>
          ) : (
            <p className="text-sm tabular-nums text-white/70">
              Redeploy in {(remainingMs / 1000).toFixed(1)}s
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
