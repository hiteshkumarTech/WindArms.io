'use client';

import { useCallback, useEffect, useState } from 'react';
import { Play, RotateCcw, Trophy } from 'lucide-react';
import type { LeaderboardEntry } from '@shared/accounts';
import BackgroundFallback from '@/components/three/BackgroundFallback';
import GlassButton from '@/components/ui/GlassButton';
import Logo from '@/components/ui/Logo';
import { api } from '@/lib/network/api';
import { cn } from '@/lib/utils';

const RANK_ACCENTS = ['text-neon-cyan', 'text-neon-orange', 'text-neon-purple'];

type ViewState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; entries: LeaderboardEntry[] };

/** Global standings fetched from the game server's REST API. */
export default function LeaderboardView() {
  const [state, setState] = useState<ViewState>({ status: 'loading' });

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    const result = await api.leaderboard();
    if (!result.ok) {
      setState({ status: 'error', message: result.error });
      return;
    }
    setState({ status: 'ready', entries: result.data.entries });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="relative min-h-[100dvh] bg-void">
      <BackgroundFallback />
      <div className="noise-overlay pointer-events-none absolute inset-0 opacity-[0.05] mix-blend-overlay" aria-hidden />

      <div className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-2xl flex-col px-4 py-6">
        <header className="flex items-center justify-between gap-3">
          <Logo />
          <div className="flex items-center gap-2">
            <GlassButton variant="glass" size="sm" href="/">
              Home
            </GlassButton>
            <GlassButton variant="primary" size="sm" icon={Play} href="/play">
              Play
            </GlassButton>
          </div>
        </header>

        <div className="glass-deep mt-6 rounded-2xl p-6">
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-neon-orange" aria-hidden />
            <h1 className="text-2xl font-extrabold tracking-tight text-white">LEADERBOARD</h1>
          </div>
          <p className="mt-1 text-sm text-white/55">
            Top pilots by account XP. Sign in from the play lobby to start climbing.
          </p>

          {state.status === 'loading' ? (
            <div className="mt-6 space-y-2">
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index} className="h-11 animate-pulse rounded-xl bg-white/5" />
              ))}
            </div>
          ) : state.status === 'error' ? (
            <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-5 text-center">
              <p className="text-sm text-white/70">{state.message}</p>
              <p className="mt-1 text-xs text-white/40">
                The game server must be running with a database configured.
              </p>
              <div className="mt-4 flex justify-center">
                <GlassButton variant="glass" size="sm" icon={RotateCcw} onClick={() => void load()}>
                  Retry
                </GlassButton>
              </div>
            </div>
          ) : state.entries.length === 0 ? (
            <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-5 text-center">
              <p className="text-sm text-white/70">No ranked pilots yet.</p>
              <p className="mt-1 text-xs text-white/40">Be the first — create an account and score some kills.</p>
            </div>
          ) : (
            <div className="mt-5 overflow-hidden rounded-xl border border-white/10">
              <div className="grid grid-cols-[3rem_1fr_4rem_4.5rem_4rem_4rem] gap-2 bg-white/5 px-4 py-2 text-[10px] uppercase tracking-widest text-white/45">
                <span>Rank</span>
                <span>Pilot</span>
                <span className="text-right">Level</span>
                <span className="text-right">XP</span>
                <span className="text-right">Kills</span>
                <span className="text-right">K/D</span>
              </div>
              {state.entries.map((entry, index) => (
                <div
                  key={entry.rank}
                  className={cn(
                    'grid grid-cols-[3rem_1fr_4rem_4.5rem_4rem_4rem] gap-2 px-4 py-2.5 text-sm',
                    index % 2 === 1 && 'bg-white/[0.03]',
                  )}
                >
                  <span className={cn('font-bold tabular-nums', RANK_ACCENTS[index] ?? 'text-white/40')}>
                    #{entry.rank}
                  </span>
                  <span className="truncate font-medium text-white/90">{entry.username}</span>
                  <span className="text-right tabular-nums text-white/70">{entry.level}</span>
                  <span className="text-right tabular-nums text-white/70">
                    {entry.xp.toLocaleString('en-US')}
                  </span>
                  <span className="text-right tabular-nums text-white/70">{entry.kills}</span>
                  <span className="text-right tabular-nums text-white/50">
                    {entry.deaths === 0 ? entry.kills.toFixed(1) : (entry.kills / entry.deaths).toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
