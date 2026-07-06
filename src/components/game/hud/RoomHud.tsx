'use client';

import { Signal, Timer, Users } from 'lucide-react';
import { MAPS } from '@shared/maps';
import { cn } from '@/lib/utils';
import { useMultiplayerStore } from '@/stores/multiplayerStore';

function formatMatchTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** In-match room panel (top-right): code, player count, RTT. Online only. */
export default function RoomHud() {
  const mode = useMultiplayerStore((state) => state.mode);
  const roomCode = useMultiplayerStore((state) => state.roomCode);
  const players = useMultiplayerStore((state) => state.players);
  const rttMs = useMultiplayerStore((state) => state.rttMs);
  const status = useMultiplayerStore((state) => state.status);
  const matchSeconds = useMultiplayerStore((state) => state.matchSeconds);
  const mapId = useMultiplayerStore((state) => state.mapId);

  if (mode !== 'online') return null;

  return (
    <div className="pointer-events-none absolute right-5 top-5 z-20">
      <div className="glass flex items-center gap-3 rounded-xl px-4 py-2.5 text-xs font-medium">
        <span
          className={cn(
            'h-2 w-2 rounded-full',
            status === 'connected' ? 'bg-emerald-400' : 'bg-red-400',
          )}
          title={status}
        />
        {roomCode ? (
          <span className="tracking-[0.2em] text-neon-cyan">{roomCode}</span>
        ) : (
          <span className="text-white/60">Quickplay</span>
        )}
        <span className="text-white/50">{MAPS[mapId].name}</span>
        <span className="flex items-center gap-1 text-white/70">
          <Users className="h-3 w-3" aria-hidden />
          {players.length}
        </span>
        <span className="flex items-center gap-1 tabular-nums text-white/50">
          <Signal className="h-3 w-3" aria-hidden />
          {rttMs === null ? '—' : `${rttMs} ms`}
        </span>
        <span className="flex items-center gap-1 tabular-nums text-white/70">
          <Timer className="h-3 w-3" aria-hidden />
          {formatMatchTime(matchSeconds)}
        </span>
      </div>
    </div>
  );
}
