'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { audio } from '@/lib/audio/audioEngine';
import { useMultiplayer } from '@/hooks/useMultiplayer';
import { usePointerLock } from '@/hooks/usePointerLock';
import { useCombatStore } from '@/stores/combatStore';
import { useMultiplayerStore } from '@/stores/multiplayerStore';
import ChatPanel from './hud/ChatPanel';
import CombatHud from './hud/CombatHud';
import Crosshair from './hud/Crosshair';
import DeathOverlay from './hud/DeathOverlay';
import DebugHud from './hud/DebugHud';
import KillFeed from './hud/KillFeed';
import PauseOverlay from './hud/PauseOverlay';
import RoomHud from './hud/RoomHud';
import Scoreboard from './hud/Scoreboard';
import StartOverlay from './hud/StartOverlay';

const GameCanvas = dynamic(() => import('./GameCanvas'), {
  ssr: false,
  loading: () => <CanvasLoading />,
});

function CanvasLoading() {
  return (
    <div className="absolute inset-0 grid place-items-center bg-void">
      <p className="animate-pulse text-sm uppercase tracking-[0.3em] text-white/40">
        Loading arena
      </p>
    </div>
  );
}

/**
 * Game shell state machine:
 *   menu    → lobby overlay (quickplay / private room / offline)
 *   session → pointer locked  → HUD
 *           → pointer released → pause overlay (roster, room code, leave)
 */
export default function GameView() {
  const { locked, request, setTarget } = usePointerLock();
  const { quickplay, createRoom, joinByCode, playOffline, leave } = useMultiplayer();
  const mode = useMultiplayerStore((state) => state.mode);
  const alive = useCombatStore((state) => state.alive);
  const [hasPlayed, setHasPlayed] = useState(false);

  useEffect(() => {
    if (locked) {
      setHasPlayed(true);
      // The lock-granting click is our user gesture: unlock the audio context.
      audio.unlock();
    }
  }, [locked]);

  useEffect(() => {
    if (mode === 'menu') setHasPlayed(false);
  }, [mode]);

  return (
    <main className="relative h-[100dvh] overflow-hidden bg-void">
      <GameCanvas onCanvasReady={setTarget} />

      {mode !== 'menu' ? (
        <>
          <ChatPanel />
          <Scoreboard />
        </>
      ) : null}

      {mode === 'menu' ? (
        <StartOverlay
          onQuickplay={quickplay}
          onCreateRoom={createRoom}
          onJoinCode={joinByCode}
          onPlayOffline={playOffline}
        />
      ) : !alive ? (
        <>
          <DeathOverlay />
          <KillFeed />
        </>
      ) : locked ? (
        <>
          <Crosshair />
          <DebugHud />
          <RoomHud />
          <CombatHud />
          <KillFeed />
        </>
      ) : (
        <PauseOverlay hasPlayed={hasPlayed} onResume={request} onLeave={leave} />
      )}
    </main>
  );
}
