'use client';

import { useDifficultyConfig, useV2MatchStore } from '@/lib/v2/play/matchStore';
import { TRIAL } from '@/lib/v2/play/constants';
import { useCountdownValue } from './useMatchClock';

/**
 * Title card + countdown (Milestone 6). Shows only during the `countdown`
 * phase: the SKYFRONT TRIAL name over a 3→2→1 ring. Non-interactive; the
 * HUD and scene are already live beneath it so the arena is visible while
 * the count runs.
 */
export default function MatchOverlay() {
  const phase = useV2MatchStore((state) => state.phase);
  const countdown = useCountdownValue();
  const difficulty = useDifficultyConfig();

  if (phase !== 'countdown') return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-storm-abyss/35 backdrop-blur-[2px]">
      <span className="text-xs uppercase tracking-[0.6em] text-storm-energy">WindArms V2</span>
      <span className="text-5xl font-black tracking-tight text-white drop-shadow-[0_2px_20px_rgba(79,195,255,0.35)] sm:text-6xl">{TRIAL.MATCH_NAME}</span>
      <span className="max-w-md text-center text-sm text-white/70">Destroy all {difficulty.droneCount} wind drones — {difficulty.label}</span>
      <div className="mt-2 flex h-24 w-24 items-center justify-center rounded-full border-2 border-storm-energy/60 bg-storm-deep/40">
        <span className="text-5xl font-black tabular-nums text-storm-energy">{Math.max(1, countdown)}</span>
      </div>
    </div>
  );
}
