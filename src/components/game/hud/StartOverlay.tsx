'use client';

import { useState } from 'react';
import { KeyRound, Loader2, Settings, Swords, UserPlus, Zap } from 'lucide-react';
import GlassButton from '@/components/ui/GlassButton';
import IconButton from '@/components/ui/IconButton';
import Logo from '@/components/ui/Logo';
import { useMultiplayerStore } from '@/stores/multiplayerStore';
import SettingsPanel from './SettingsPanel';

interface ControlBinding {
  keys: string;
  action: string;
}

const CONTROLS: ControlBinding[] = [
  { keys: 'W A S D', action: 'Move' },
  { keys: 'LMB', action: 'Fire' },
  { keys: 'Space', action: 'Jump' },
  { keys: 'Shift', action: 'Sprint' },
  { keys: 'C', action: 'Slide' },
  { keys: 'Q', action: 'Dash' },
  { keys: 'R', action: 'Reload' },
  { keys: '1-7', action: 'Weapons' },
  { keys: 'Tab', action: 'Scoreboard' },
  { keys: 'Enter', action: 'Chat' },
  { keys: 'Esc', action: 'Pause' },
];

interface StartOverlayProps {
  onQuickplay: (name: string) => Promise<boolean>;
  onCreateRoom: (name: string) => Promise<boolean>;
  onJoinCode: (name: string, code: string) => Promise<boolean>;
  onPlayOffline: () => void;
}

/** Multiplayer lobby: call sign, quickplay matchmaking, private rooms, offline practice. */
export default function StartOverlay({
  onQuickplay,
  onCreateRoom,
  onJoinCode,
  onPlayOffline,
}: StartOverlayProps) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const status = useMultiplayerStore((state) => state.status);
  const lastError = useMultiplayerStore((state) => state.lastError);
  const busy = status === 'connecting';

  const callSign = name.trim() || 'Recruit';

  if (showSettings) {
    return (
      <div className="absolute inset-0 z-30 grid place-items-center overflow-y-auto bg-void/60 p-4 backdrop-blur-md">
        <div className="glass-deep w-full max-w-md rounded-2xl p-6">
          <SettingsPanel onClose={() => setShowSettings(false)} />
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-30 grid place-items-center overflow-y-auto bg-void/60 p-4 backdrop-blur-md">
      <div className="glass-deep w-full max-w-md rounded-2xl p-6">
        <div className="flex items-start justify-between">
          <Logo />
          <IconButton label="Settings" onClick={() => setShowSettings(true)}>
            <Settings className="h-4 w-4" aria-hidden />
          </IconButton>
        </div>
        <h1 className="mt-5 text-2xl font-extrabold tracking-tight text-white">ENTER THE ARENA</h1>
        <p className="mt-1 text-sm leading-relaxed text-white/55">
          Quickplay drops you into an open match. Private rooms share a six-letter code.
        </p>

        <label className="mt-5 block">
          <span className="text-[10px] uppercase tracking-widest text-white/45">Call sign</span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={16}
            placeholder="Recruit"
            disabled={busy}
            className="mt-1 h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/30 focus:border-neon-cyan/50 focus:outline-none focus:ring-2 focus:ring-neon-cyan/40"
          />
        </label>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <GlassButton
            variant="primary"
            icon={busy ? Loader2 : Zap}
            className="w-full"
            onClick={() => {
              if (!busy) void onQuickplay(callSign);
            }}
          >
            {busy ? 'Connecting' : 'Quick Play'}
          </GlassButton>
          <GlassButton
            variant="glass"
            icon={UserPlus}
            className="w-full"
            onClick={() => {
              if (!busy) void onCreateRoom(callSign);
            }}
          >
            Create Room
          </GlassButton>
        </div>

        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            maxLength={6}
            placeholder="ROOM CODE"
            disabled={busy}
            className="h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 text-sm uppercase tracking-[0.25em] text-white placeholder:tracking-normal placeholder:text-white/30 focus:border-neon-cyan/50 focus:outline-none focus:ring-2 focus:ring-neon-cyan/40"
          />
          <GlassButton
            variant="outline"
            icon={KeyRound}
            onClick={() => {
              if (!busy && code.trim().length > 0) void onJoinCode(callSign, code);
            }}
          >
            Join
          </GlassButton>
        </div>

        {lastError ? <p className="mt-3 text-xs text-red-400">{lastError}</p> : null}

        <div className="mt-5 border-t border-white/10 pt-4">
          <GlassButton variant="glass" icon={Swords} onClick={onPlayOffline}>
            Practice Offline
          </GlassButton>
        </div>

        <ul className="mt-5 grid grid-cols-3 gap-x-4 gap-y-2">
          {CONTROLS.map((control) => (
            <li key={control.keys} className="flex items-baseline justify-between gap-2 text-xs">
              <span className="rounded bg-white/10 px-1.5 py-0.5 font-semibold text-white/90">
                {control.keys}
              </span>
              <span className="text-right text-white/55">{control.action}</span>
            </li>
          ))}
        </ul>

        <div className="mt-5">
          <GlassButton variant="glass" size="sm" href="/">
            Back to Home
          </GlassButton>
        </div>
      </div>
    </div>
  );
}
