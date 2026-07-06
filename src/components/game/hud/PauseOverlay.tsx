'use client';

import { useState } from 'react';
import { Copy, LogOut, Play, Settings } from 'lucide-react';
import GlassButton from '@/components/ui/GlassButton';
import Logo from '@/components/ui/Logo';
import { useMultiplayerStore } from '@/stores/multiplayerStore';
import SettingsPanel from './SettingsPanel';

interface PauseOverlayProps {
  hasPlayed: boolean;
  onResume: () => void;
  onLeave: () => void;
}

/**
 * Shown whenever a session exists but the pointer is not captured:
 * right after joining ("match ready") and after pressing Esc ("paused").
 */
export default function PauseOverlay({ hasPlayed, onResume, onLeave }: PauseOverlayProps) {
  const mode = useMultiplayerStore((state) => state.mode);
  const roomCode = useMultiplayerStore((state) => state.roomCode);
  const players = useMultiplayerStore((state) => state.players);
  const selfId = useMultiplayerStore((state) => state.selfId);
  const rttMs = useMultiplayerStore((state) => state.rttMs);
  const [copied, setCopied] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const copyCode = async () => {
    if (!roomCode) return;
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (permissions): the code is still visible.
    }
  };

  if (showSettings) {
    return (
      <div className="absolute inset-0 z-30 grid place-items-center bg-void/60 p-4 backdrop-blur-md">
        <div className="glass-deep w-full max-w-md rounded-2xl p-6">
          <SettingsPanel onClose={() => setShowSettings(false)} />
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-void/60 p-4 backdrop-blur-md">
      <div className="glass-deep w-full max-w-md rounded-2xl p-6">
        <Logo />
        <h1 className="mt-5 text-2xl font-extrabold tracking-tight text-white">
          {hasPlayed ? 'PAUSED' : 'MATCH READY'}
        </h1>

        {mode === 'online' ? (
          <div className="mt-4 space-y-3">
            {roomCode ? (
              <div className="flex items-center justify-between rounded-xl border border-neon-cyan/25 bg-neon-cyan/5 px-4 py-3">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-white/45">Room code</p>
                  <p className="text-lg font-bold tracking-[0.3em] text-neon-cyan">{roomCode}</p>
                </div>
                <button
                  type="button"
                  onClick={copyCode}
                  className="pointer-events-auto flex items-center gap-1.5 rounded-lg glass px-3 py-2 text-xs text-white/75 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-cyan/70"
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden />
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            ) : null}

            <div className="rounded-xl glass px-4 py-3">
              <p className="text-[10px] uppercase tracking-widest text-white/45">
                Players ({players.length}) {rttMs !== null ? `· ${rttMs} ms` : ''}
              </p>
              <ul className="mt-2 space-y-1">
                {players.map((player) => (
                  <li key={player.id} className="flex items-center gap-2 text-sm text-white/80">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
                    {player.name}
                    {player.id === selfId ? (
                      <span className="text-[10px] uppercase tracking-wider text-neon-cyan">you</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm leading-relaxed text-white/55">
            Offline practice — movement sandbox with no other players.
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <GlassButton variant="primary" icon={Play} onClick={onResume}>
            {hasPlayed ? 'Resume' : 'Enter Arena'}
          </GlassButton>
          <GlassButton variant="glass" icon={Settings} onClick={() => setShowSettings(true)}>
            Settings
          </GlassButton>
          <GlassButton variant="outline" icon={LogOut} onClick={onLeave}>
            {mode === 'online' ? 'Leave Match' : 'Exit to Menu'}
          </GlassButton>
        </div>

        <p className="mt-4 text-[11px] text-white/40">
          Esc releases the cursor and pauses. Your slot stays reserved while paused.
        </p>
      </div>
    </div>
  );
}
