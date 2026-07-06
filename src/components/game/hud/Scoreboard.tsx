'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/stores/chatStore';
import { useCombatStore } from '@/stores/combatStore';
import { useMultiplayerStore, type PlayerScore } from '@/stores/multiplayerStore';

interface ScoreRow {
  id: string;
  name: string;
  kills: number;
  deaths: number;
  self: boolean;
}

function formatMatchTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** Hold Tab to view standings — authoritative K/D from server snapshots. */
export default function Scoreboard() {
  const [visible, setVisible] = useState(false);

  const mode = useMultiplayerStore((state) => state.mode);
  const players = useMultiplayerStore((state) => state.players);
  const scores = useMultiplayerStore((state) => state.scores);
  const selfId = useMultiplayerStore((state) => state.selfId);
  const roomCode = useMultiplayerStore((state) => state.roomCode);
  const matchSeconds = useMultiplayerStore((state) => state.matchSeconds);
  const offlineKills = useCombatStore((state) => state.kills);
  const offlineDeaths = useCombatStore((state) => state.deaths);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Tab') return;
      if (useChatStore.getState().open) return;
      event.preventDefault();
      setVisible(true);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Tab') setVisible(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  if (!visible) return null;

  const rows: ScoreRow[] =
    mode === 'online'
      ? players
          .map((player) => {
            const score: PlayerScore = scores[player.id] ?? { kills: 0, deaths: 0 };
            return {
              id: player.id,
              name: player.name,
              kills: score.kills,
              deaths: score.deaths,
              self: player.id === selfId,
            };
          })
          .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || a.name.localeCompare(b.name))
      : [{ id: 'self', name: 'You (offline)', kills: offlineKills, deaths: offlineDeaths, self: true }];

  return (
    <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center bg-void/30 backdrop-blur-[2px]">
      <div className="glass-deep w-full max-w-lg rounded-2xl p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-extrabold tracking-tight text-white">SCOREBOARD</h2>
          <p className="text-xs text-white/50">
            {roomCode ? (
              <span className="mr-3 tracking-[0.2em] text-neon-cyan">{roomCode}</span>
            ) : null}
            <span className="tabular-nums">{formatMatchTime(matchSeconds)}</span>
          </p>
        </div>

        <div className="mt-3 overflow-hidden rounded-xl border border-white/10">
          <div className="grid grid-cols-[2rem_1fr_3rem_3rem_3.5rem] gap-2 bg-white/5 px-3 py-2 text-[10px] uppercase tracking-widest text-white/45">
            <span>#</span>
            <span>Player</span>
            <span className="text-right">K</span>
            <span className="text-right">D</span>
            <span className="text-right">K/D</span>
          </div>
          {rows.map((row, index) => (
            <div
              key={row.id}
              className={cn(
                'grid grid-cols-[2rem_1fr_3rem_3rem_3.5rem] gap-2 px-3 py-2 text-sm',
                index % 2 === 1 && 'bg-white/[0.03]',
                row.self && 'bg-neon-cyan/10',
              )}
            >
              <span className="text-white/40">{index + 1}</span>
              <span className={cn('truncate font-medium', row.self ? 'text-neon-cyan' : 'text-white/85')}>
                {row.name}
              </span>
              <span className="text-right tabular-nums text-white/85">{row.kills}</span>
              <span className="text-right tabular-nums text-white/60">{row.deaths}</span>
              <span className="text-right tabular-nums text-white/60">
                {row.deaths === 0 ? row.kills.toFixed(1) : (row.kills / row.deaths).toFixed(1)}
              </span>
            </div>
          ))}
        </div>

        <p className="mt-3 text-center text-[10px] uppercase tracking-widest text-white/30">
          Release Tab to close
        </p>
      </div>
    </div>
  );
}
