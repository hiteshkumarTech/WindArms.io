'use client';

import Link from 'next/link';

/**
 * Pause screen (Milestone 6). The simulation is already frozen (Physics
 * paused, every frame loop early-returns on the `paused` phase) — this is
 * purely the menu. Resume re-requests pointer lock via the parent, which
 * flips the phase back through the store on lock acquisition. Restart also
 * routes through the parent so it re-locks the pointer into the new
 * countdown (otherwise the fresh match would be uncontrollable).
 */
export default function PauseMenu({ onResume, onRestart }: { onResume: () => void; onRestart: () => void }) {
  return (
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-6 bg-storm-abyss/80 text-white backdrop-blur-md">
      <span className="text-xs uppercase tracking-[0.5em] text-storm-energy">Skyfront Trial</span>
      <span className="text-4xl font-black tracking-tight">Paused</span>

      <div className="flex w-64 flex-col gap-3">
        <button
          type="button"
          onClick={onResume}
          className="rounded-xl bg-storm-energy px-6 py-3 text-sm font-bold uppercase tracking-widest text-storm-abyss transition-transform hover:scale-[1.03]"
        >
          Resume
        </button>
        <button
          type="button"
          onClick={onRestart}
          className="rounded-xl border border-white/20 bg-white/5 px-6 py-3 text-sm font-semibold uppercase tracking-widest text-white transition-colors hover:bg-white/10"
        >
          Restart Match
        </button>
        <Link
          href="/"
          className="rounded-xl border border-white/15 px-6 py-3 text-center text-sm font-semibold uppercase tracking-widest text-white/80 transition-colors hover:bg-white/5"
        >
          Return to V2 Landing
        </Link>
      </div>

      <div className="mt-2 max-w-sm rounded-lg border border-white/10 bg-storm-deep/40 px-5 py-3 text-center text-xs leading-6 text-white/55">
        WASD move · Shift sprint · Space jump · Mouse look
        <br />
        LMB fire · RMB aim · R reload · F inspect · Esc pause
      </div>
    </div>
  );
}
