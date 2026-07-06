'use client';

import { useEffect, useReducer } from 'react';
import { Crown, Medal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMultiplayerStore } from '@/stores/multiplayerStore';

const PLACE_STYLES = [
  'border-neon-orange/50 bg-neon-orange/10 text-neon-orange',
  'border-white/30 bg-white/10 text-white/80',
  'border-neon-purple/40 bg-neon-purple/10 text-neon-purple',
];

/** Round-end results shown during intermission; next round starts automatically. */
export default function EndPodium() {
  const podium = useMultiplayerStore((state) => state.podium);
  const winnerId = useMultiplayerStore((state) => state.winnerId);
  const selfId = useMultiplayerStore((state) => state.selfId);
  const phaseEndsAt = useMultiplayerStore((state) => state.phaseEndsAt);
  const [, forceRender] = useReducer((tick: number) => tick + 1, 0);

  useEffect(() => {
    const interval = window.setInterval(forceRender, 250);
    return () => window.clearInterval(interval);
  }, []);

  const remaining = Math.max(0, phaseEndsAt - Date.now());
  const selfWon = winnerId !== null && winnerId === selfId;

  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-void/70 backdrop-blur-md">
      <div className="glass-deep w-full max-w-md rounded-2xl p-6 text-center">
        <Crown
          className={cn('mx-auto h-8 w-8', selfWon ? 'text-neon-orange' : 'text-white/40')}
          aria-hidden
        />
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-white">
          {selfWon ? 'VICTORY' : 'ROUND OVER'}
        </h1>
        {podium && podium.length > 0 ? (
          <p className="mt-1 text-sm text-white/55">
            <span className="font-semibold text-neon-orange">{podium[0].name}</span> takes the round
          </p>
        ) : (
          <p className="mt-1 text-sm text-white/55">No eliminations this round</p>
        )}

        <div className="mt-5 space-y-2">
          {(podium ?? []).map((entry, index) => (
            <div
              key={entry.id}
              className={cn(
                'flex items-center gap-3 rounded-xl border px-4 py-2.5',
                PLACE_STYLES[index] ?? PLACE_STYLES[2],
                entry.id === selfId && 'ring-1 ring-neon-cyan/60',
              )}
            >
              <Medal className="h-4 w-4 shrink-0" aria-hidden />
              <span className="text-sm font-bold">#{index + 1}</span>
              <span className="min-w-0 flex-1 truncate text-left text-sm font-medium text-white/90">
                {entry.name}
              </span>
              <span className="text-sm tabular-nums text-white/70">
                {entry.kills} / {entry.deaths}
              </span>
            </div>
          ))}
        </div>

        <p className="mt-5 text-xs uppercase tracking-widest text-white/45">
          Next map in <span className="tabular-nums text-neon-cyan">{(remaining / 1000).toFixed(0)}s</span>
        </p>
      </div>
    </div>
  );
}
