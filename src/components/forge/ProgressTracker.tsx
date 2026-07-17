/**
 * WindArms Forge — training roadmap progress indicator. Placeholder
 * component: not imported by any route, not connected to real data. Levels
 * correspond to docs/forge/training-roadmap.md's 10 levels. See
 * docs/forge/README.md — Forge components are scaffolding only.
 */

export interface ProgressTrackerProps {
  currentLevel: number;
  totalLevels?: number;
}

export default function ProgressTracker({ currentLevel, totalLevels = 10 }: ProgressTrackerProps) {
  const clampedLevel = Math.min(totalLevels, Math.max(0, currentLevel));
  const percent = totalLevels > 0 ? (clampedLevel / totalLevels) * 100 : 0;

  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-center justify-between text-xs uppercase tracking-wider text-white/50">
        <span>Level {clampedLevel}</span>
        <span>of {totalLevels}</span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div className="h-2 rounded-full bg-cyan-400" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
