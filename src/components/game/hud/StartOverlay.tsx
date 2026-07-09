'use client';

import { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  KeyRound,
  Loader2,
  LogOut,
  Palette,
  Settings,
  Swords,
  User,
  UserPlus,
  Zap,
} from 'lucide-react';
import { levelProgress } from '@shared/progression';
import { MAPS, MAP_ORDER } from '@shared/maps';
import GlassButton from '@/components/ui/GlassButton';
import IconButton from '@/components/ui/IconButton';
import Logo from '@/components/ui/Logo';
import { useAuthStore } from '@/stores/authStore';
import { useMultiplayerStore } from '@/stores/multiplayerStore';
import AuthPanel from './AuthPanel';
import LoadoutPanel from './LoadoutPanel';
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
  { keys: 'F', action: 'Inspect' },
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
  const [showAuth, setShowAuth] = useState(false);
  const [showLoadout, setShowLoadout] = useState(false);
  const status = useMultiplayerStore((state) => state.status);
  const lastError = useMultiplayerStore((state) => state.lastError);
  const mapId = useMultiplayerStore((state) => state.mapId);
  const profile = useAuthStore((state) => state.profile);
  const busy = status === 'connecting';

  // Signed-in players are identified by their account call sign server-side.
  const callSign = profile?.username ?? (name.trim() || 'Recruit');
  const map = MAPS[mapId];
  const progress = profile ? levelProgress(profile.xp) : null;

  const cycleMap = (direction: 1 | -1) => {
    const index = MAP_ORDER.indexOf(mapId);
    const next = MAP_ORDER[(index + direction + MAP_ORDER.length) % MAP_ORDER.length];
    useMultiplayerStore.getState().setOfflineMap(next);
  };

  if (showSettings || showAuth || showLoadout) {
    return (
      <div className="absolute inset-0 z-30 grid place-items-center overflow-y-auto bg-void/60 p-4 backdrop-blur-md">
        <div className="glass-deep w-full max-w-md rounded-2xl p-6">
          {showSettings ? (
            <SettingsPanel onClose={() => setShowSettings(false)} />
          ) : showLoadout ? (
            <LoadoutPanel onClose={() => setShowLoadout(false)} />
          ) : (
            <AuthPanel onClose={() => setShowAuth(false)} />
          )}
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

        {profile && progress ? (
          <div className="mt-5 rounded-xl border border-neon-cyan/25 bg-neon-cyan/5 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{profile.username}</p>
                <p className="text-[10px] uppercase tracking-widest text-white/45">
                  Level {progress.level} · {profile.kills} kills · {profile.matchesPlayed} matches
                </p>
              </div>
              <div className="flex items-center gap-1">
                <IconButton label="Loadout" onClick={() => setShowLoadout(true)}>
                  <Palette className="h-4 w-4" aria-hidden />
                </IconButton>
                <IconButton label="Sign out" onClick={() => useAuthStore.getState().logout()}>
                  <LogOut className="h-4 w-4" aria-hidden />
                </IconButton>
              </div>
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-neon-cyan transition-all duration-500"
                style={{ width: `${progress.fraction * 100}%` }}
              />
            </div>
            <p className="mt-1 text-[10px] tabular-nums text-white/40">
              {progress.intoLevel} / {progress.required} XP to level {progress.level + 1}
            </p>
          </div>
        ) : (
          <>
            <label className="mt-5 block">
              <span className="text-[10px] uppercase tracking-widest text-white/45">
                Call sign (guest)
              </span>
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
            <button
              type="button"
              onClick={() => setShowAuth(true)}
              className="mt-2 flex items-center gap-1.5 text-xs text-neon-cyan/80 transition-colors hover:text-neon-cyan focus-visible:outline-none"
            >
              <User className="h-3.5 w-3.5" aria-hidden />
              Sign in or create an account to save XP and stats
            </button>
          </>
        )}

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
          <div className="mb-3 flex items-center justify-between gap-2 rounded-xl glass px-3 py-2">
            <button
              type="button"
              aria-label="Previous map"
              onClick={() => cycleMap(-1)}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white/60 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-cyan/70"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <div className="min-w-0 text-center">
              <p className="text-sm font-semibold text-white">{map.name}</p>
              <p className="truncate text-[10px] text-white/45">{map.description}</p>
            </div>
            <button
              type="button"
              aria-label="Next map"
              onClick={() => cycleMap(1)}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white/60 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-cyan/70"
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <GlassButton variant="glass" icon={Swords} onClick={onPlayOffline}>
            Practice Offline
          </GlassButton>
          <p className="mt-2 text-[10px] uppercase tracking-widest text-white/30">
            Online matches rotate maps automatically
          </p>
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
