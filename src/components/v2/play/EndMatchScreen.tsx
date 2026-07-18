'use client';

import Link from 'next/link';
import { WIND_WEAPONS } from '@shared/windWeapons';
import { useVortexWeaponStore } from '@/lib/v2/weapons/vortexWeaponStore';
import { useDifficultyConfig, useV2MatchStore } from '@/lib/v2/play/matchStore';

function formatTime(totalSeconds: number | null): string {
  if (totalSeconds === null) return '—';
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-white/8 py-2">
      <span className="text-xs uppercase tracking-widest text-white/50">{label}</span>
      <span className="text-lg font-bold tabular-nums text-white">{value}</span>
    </div>
  );
}

/**
 * Victory / Defeat screen (Milestone 6). Final stats pull from the two
 * authoritative stores — never a recomputation: match facts (drones, deaths,
 * time) from the match store, shot facts (shots, hits, accuracy) from the
 * single weapon store. Replay restarts in place (no page reload) via the
 * parent, which also re-locks the pointer in the same click.
 */
export default function EndMatchScreen({ onReplay }: { onReplay: () => void }) {
  const phase = useV2MatchStore((state) => state.phase);
  const dronesDestroyed = useV2MatchStore((state) => state.dronesDestroyed);
  const deaths = useV2MatchStore((state) => state.deaths);
  const completionTimeS = useV2MatchStore((state) => state.completionTimeS);
  const difficulty = useDifficultyConfig();

  const shotsFired = useVortexWeaponStore((state) => state.stats.shotsFired);
  const hits = useVortexWeaponStore((state) => state.stats.hits);

  const won = phase === 'victory';
  const accuracy = shotsFired > 0 ? Math.round((hits / shotsFired) * 100) : 0;

  return (
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-5 bg-storm-abyss/85 text-white backdrop-blur-md">
      <span className="text-xs uppercase tracking-[0.5em] text-storm-energy">Skyfront Trial · {difficulty.label}</span>
      <span className={`text-5xl font-black tracking-tight ${won ? 'text-storm-energy' : 'text-storm-crimson'}`}>
        {won ? 'Victory' : 'Defeat'}
      </span>
      <span className="max-w-md text-center text-sm text-white/65">
        {won ? 'All hostile drones neutralized. The Skyfront holds.' : 'The clock ran out. Drones still hold the Skyfront.'}
      </span>

      <div className="w-80 rounded-2xl border border-white/12 bg-storm-deep/50 px-6 py-4">
        <StatRow label="Completion time" value={won ? formatTime(completionTimeS) : '—'} />
        <StatRow label="Drones destroyed" value={`${dronesDestroyed} / ${difficulty.droneCount}`} />
        <StatRow label="Shots fired" value={`${shotsFired}`} />
        <StatRow label="Hits" value={`${hits}`} />
        <StatRow label="Accuracy" value={`${accuracy}%`} />
        <div className="flex items-baseline justify-between py-2">
          <span className="text-xs uppercase tracking-widest text-white/50">Deaths</span>
          <span className="text-lg font-bold tabular-nums text-white">{deaths}</span>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onReplay}
          className="rounded-xl bg-storm-energy px-8 py-3 text-sm font-bold uppercase tracking-widest text-storm-abyss transition-transform hover:scale-[1.03]"
        >
          Replay
        </button>
        <Link
          href="/"
          className="rounded-xl border border-white/20 px-8 py-3 text-sm font-semibold uppercase tracking-widest text-white/85 transition-colors hover:bg-white/5"
        >
          Return to Landing
        </Link>
      </div>
      <span className="text-[11px] uppercase tracking-widest text-white/40">Weapon: {WIND_WEAPONS.vortex.name} · Skyfront Trial is a temporary training scenario</span>
    </div>
  );
}
