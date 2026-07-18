'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef } from 'react';
import { usePointerLock } from '@/hooks/usePointerLock';
import { useRangeKeyboardInput } from '@/lib/v2/range/useRangeKeyboardInput';
import { unlockVortexAudio } from '@/lib/v2/range/vortexAudio';
import { TRIAL_DIFFICULTIES, type TrialDifficulty } from '@/lib/v2/play/difficulty';
import { useSelectedDifficulty, useV2MatchStore } from '@/lib/v2/play/matchStore';
import V2PlayHud from './V2PlayHud';
import MatchOverlay from './MatchOverlay';
import PauseMenu from './PauseMenu';
import EndMatchScreen from './EndMatchScreen';
import MobileNotice from './MobileNotice';

const V2PlayScene = dynamic(() => import('@/components/three/play/V2PlayScene'), { ssr: false });

const DIFFICULTY_ORDER: TrialDifficulty[] = ['low', 'medium', 'max'];

/**
 * `/v2/play` — the Skyfront Trial vertical slice orchestrator (Milestone 6).
 * Owns the DOM shell, pointer-lock ↔ match-phase coordination, and which
 * overlay is showing. The scene (Canvas) is a separate lazy chunk so the 3D
 * code never lands in the landing/other-route bundles.
 *
 * Pointer-lock is the single pause pivot: losing the lock during a live
 * phase pauses; acquiring it advances ready→countdown or resumes from pause.
 * Victory/defeat deliberately release the lock for their menus. This keeps
 * "cursor is free" and "simulation is frozen" as one coupled fact.
 */
export default function V2PlayView() {
  const { locked, request, setTarget } = usePointerLock();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRangeKeyboardInput();
  const phase = useV2MatchStore((state) => state.phase);
  const selectedDifficulty = useSelectedDifficulty();

  useEffect(() => {
    setTarget(containerRef.current);
  }, [setTarget]);

  // Fresh session on every mount — the match store is a module singleton
  // that survives route navigation, so a prior 'victory'/'defeat' must not
  // leak into a re-entry. Also resets the shared weapon store.
  useEffect(() => {
    useV2MatchStore.getState().initSession();
  }, []);

  // Pointer-lock ↔ phase coupling — the one place these two are reconciled.
  useEffect(() => {
    const match = useV2MatchStore.getState();
    if (locked) {
      if (match.phase === 'ready') match.beginCountdown();
      else if (match.phase === 'paused') match.resume();
    } else if (match.phase === 'countdown' || match.phase === 'active' || match.phase === 'playerDead') {
      match.pause();
    }
  }, [locked]);

  // End of match releases the cursor for the end screen (not a pause).
  useEffect(() => {
    if ((phase === 'victory' || phase === 'defeat') && document.pointerLockElement) {
      document.exitPointerLock();
    }
  }, [phase]);

  const enter = () => {
    unlockVortexAudio();
    request();
  };

  // Restart + re-lock in the same user gesture — shared by the pause menu's
  // Restart and the end screen's Replay (both leave the pointer unlocked, so
  // both must re-request lock or the new countdown would start uncontrollable).
  const restartAndLock = () => {
    useV2MatchStore.getState().restart();
    request();
  };

  const showStart = phase === 'booting' || phase === 'ready';

  return (
    <div ref={containerRef} className="relative h-[100dvh] w-full overflow-hidden bg-storm-abyss">
      <V2PlayScene inputRef={inputRef} />

      {/* In-round HUD */}
      <V2PlayHud />

      {/* Countdown / title card */}
      <MatchOverlay />

      {/* Start prompt + difficulty selection — locked to the 'ready'/'booting' phases; selectDifficulty() itself no-ops once countdown begins. */}
      {showStart && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-storm-abyss/85 px-4 text-center text-white backdrop-blur-sm">
          <span className="text-xs uppercase tracking-[0.5em] text-storm-energy">WindArms V2 — First Playable</span>
          <span className="text-5xl font-black tracking-tight sm:text-6xl">SKYFRONT TRIAL</span>
          <span className="max-w-md text-sm text-white/70">
            Destroy every hostile wind drone before the clock runs out.
          </span>

          <div className="mt-2 flex flex-col gap-3 sm:flex-row" role="radiogroup" aria-label="Trial difficulty">
            {DIFFICULTY_ORDER.map((id) => {
              const preset = TRIAL_DIFFICULTIES[id];
              const selected = selectedDifficulty === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => useV2MatchStore.getState().selectDifficulty(id)}
                  className={`w-60 rounded-xl border px-4 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-storm-energy ${
                    selected
                      ? 'border-storm-energy bg-storm-energy/10 shadow-[0_0_0_1px_rgba(79,195,255,0.4)]'
                      : 'border-white/15 bg-storm-deep/40 hover:border-white/30'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-sm font-bold uppercase tracking-widest ${selected ? 'text-storm-energy' : 'text-white/80'}`}>{preset.label}</span>
                    {selected && <span className="h-2 w-2 rounded-full bg-storm-gold" />}
                  </div>
                  <p className="mt-1 text-xs leading-4 text-white/55">{preset.description}</p>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={enter}
            className="mt-2 rounded-full border border-storm-energy/50 bg-storm-energy/10 px-6 py-2 text-sm font-semibold uppercase tracking-widest text-storm-energy transition-colors hover:bg-storm-energy/20"
          >
            Deploy — {TRIAL_DIFFICULTIES[selectedDifficulty].label}
          </button>
          <span className="mt-3 max-w-md text-xs leading-5 text-white/45">
            WASD move · Shift sprint · Space jump · Mouse look
            <br />
            LMB fire · RMB aim · R reload · F inspect · Esc pause
          </span>
        </div>
      )}

      {/* Pause */}
      {phase === 'paused' && <PauseMenu onResume={request} onRestart={restartAndLock} />}

      {/* End */}
      {(phase === 'victory' || phase === 'defeat') && <EndMatchScreen onReplay={restartAndLock} />}

      <MobileNotice />
    </div>
  );
}
