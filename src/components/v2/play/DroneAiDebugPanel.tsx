'use client';

import { useEffect, useState } from 'react';
import {
  formatDroneAiDebugNumber,
  listDroneAiDebugDrones,
  type DroneAiDebugDroneSnapshot,
  type DroneAiDebugRuntime,
} from '@/lib/v2/ai/droneAiDebugState';
import { useDroneAiDebugHelperToggles } from '@/lib/v2/ai/droneAiDebugHelperToggles';

/** Panel presentation-poll cadence — deliberately low-rate and independent of the 60Hz simulation, per this milestone's own Section 6 ("no React state update per fixed substep"). Bounded within the brief's own suggested 250-500ms range. */
const PANEL_POLL_MS = 300;

const STATE_COLORS: Record<string, string> = {
  spawning: 'text-white/50',
  searching: 'text-white/70',
  investigating: 'text-amber-300',
  engaging: 'text-storm-energy',
  attacking: 'text-red-400',
  destroyed: 'text-white/30',
};

function fmtPos(v: { x: number; y: number; z: number }): string {
  return `${formatDroneAiDebugNumber(v.x, 1)}, ${formatDroneAiDebugNumber(v.y, 1)}, ${formatDroneAiDebugNumber(v.z, 1)}`;
}

/**
 * Milestone 9H — dev-only, READ-ONLY Drone AI observability panel.
 * `/v2/play?droneAiDebug=1` only, mounted by `V2PlayView.tsx` behind
 * `useDroneAiDebugEnabled()` exactly like every sibling debug panel in this
 * codebase is mounted behind its own hook (`KaelShadowDebugPanel.tsx` behind
 * `useShadowDebugEnabled()`, etc.).
 *
 * READ-ONLY BY CONSTRUCTION: this component contains no button, input, or
 * handler that writes into `runtime` (the telemetry container) or into any
 * gameplay module. The only interactive controls here are the six helper
 * checkboxes below, which write EXCLUSIVELY into `droneAiDebugHelperToggles.ts`
 * — a presentation-only store `DroneAiDebugHelpers.tsx` reads to decide what
 * to RENDER, never consumed by any gameplay code.
 *
 * POLLING: one `setInterval` at `PANEL_POLL_MS`, owned solely by this
 * mounted component, cleaned up on unmount — mirrors
 * `KaelShadowDebugPanel.tsx`'s own established polling convention exactly.
 * The interval body does no computation beyond `listDroneAiDebugDrones()`
 * (a stable sort over already-live record references, no cloning) — the
 * live 60Hz WRITE path (`DroneEnemy.tsx`/`DroneSquad.tsx`) is entirely
 * unaffected by how often this panel chooses to re-render.
 */
export default function DroneAiDebugPanel({ runtime }: { runtime: DroneAiDebugRuntime }) {
  const [drones, setDrones] = useState<readonly DroneAiDebugDroneSnapshot[]>([]);
  const [pollCount, setPollCount] = useState(0);
  const toggles = useDroneAiDebugHelperToggles();

  useEffect(() => {
    const id = window.setInterval(() => {
      setDrones(listDroneAiDebugDrones(runtime));
      setPollCount((n) => n + 1);
    }, PANEL_POLL_MS);
    return () => window.clearInterval(id);
  }, [runtime]);

  const squad = runtime.squad;
  const engagingCount = drones.filter((d) => d.runtimeState === 'engaging').length;
  const attackingCount = drones.filter((d) => d.runtimeState === 'attacking').length;
  const investigatingCount = drones.filter((d) => d.runtimeState === 'investigating').length;
  const searchingCount = drones.filter((d) => d.runtimeState === 'searching').length;
  const destroyedCount = drones.filter((d) => d.runtimeState === 'destroyed').length;
  const recoveringCount = drones.filter((d) => d.recoveryPhase !== 'idle' && d.recoveryPhase !== 'cooldown').length;
  const clampedCount = drones.filter((d) => d.horizontalClamped || d.altitudeClamped || d.windLiftCorrected).length;

  return (
    <div className="pointer-events-auto absolute right-4 top-4 z-40 w-[30rem] max-w-[92vw] rounded-lg border border-white/15 bg-black/85 p-3 font-mono text-[11px] text-white/90 backdrop-blur-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-bold uppercase tracking-wide text-storm-energy">Drone AI Debug</span>
        <span className="text-[10px] text-white/40">?droneAiDebug=1 · dev only · read-only</span>
      </div>

      <div className="mb-2 rounded bg-black/60 p-2 leading-tight text-white/80">
        <div>
          difficulty: <span className="text-white">{squad.difficultyId || '—'}</span> · mounted: <span className="text-white">{squad.mountedDroneCount}</span> · session #{squad.sessionId}
        </div>
        <div>
          shooter cap: <span className="text-white">{squad.shooterCap}</span> · active leases:{' '}
          <span className={squad.activeLeaseCount > squad.shooterCap ? 'text-red-400' : 'text-emerald-400'}>{squad.activeLeaseCount}</span> · reserved
          sectors: <span className="text-white">{squad.reservedSectorCount}</span> / {squad.sectorCount}
        </div>
        <div>
          states — search {searchingCount} · engage {engagingCount} · attack {attackingCount} · investigate {investigatingCount} · destroyed {destroyedCount}
        </div>
        <div>
          recovering: <span className="text-white">{recoveringCount}</span> · constraint-corrected this poll:{' '}
          <span className="text-white">{clampedCount}</span>
        </div>
        <div className="text-white/40">
          substeps: {squad.simulationSubsteps} · panel polls: {pollCount} · poll rate: {PANEL_POLL_MS}ms · last update: {formatDroneAiDebugNumber(squad.lastUpdatedAtMs, 0)}ms
        </div>
      </div>

      <div className="mb-2 grid grid-cols-2 gap-x-3 gap-y-1 rounded bg-black/60 p-2 leading-tight text-white/70">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={toggles.stateLabels} onChange={toggles.toggleStateLabels} /> state labels
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={toggles.targetLines} onChange={toggles.toggleTargetLines} /> target/memory lines
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={toggles.movementArrows} onChange={toggles.toggleMovementArrows} /> movement arrows
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={toggles.leaseSectorMarkers} onChange={toggles.toggleLeaseSectorMarkers} /> lease/sector markers
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={toggles.recoveryMarkers} onChange={toggles.toggleRecoveryMarkers} /> recovery markers
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={toggles.arenaBounds} onChange={toggles.toggleArenaBounds} /> arena/Wind Lift bounds
        </label>
      </div>

      <div className="max-h-[46vh] overflow-y-auto overflow-x-auto rounded bg-black/60 p-1.5">
        <table className="w-full min-w-[27rem] border-collapse text-left text-[10px] leading-tight">
          <thead>
            <tr className="text-white/40">
              <th className="pr-2">id</th>
              <th className="pr-2">state</th>
              <th className="pr-2">t</th>
              <th className="pr-2">vis</th>
              <th className="pr-2">dist</th>
              <th className="pr-2">mem</th>
              <th className="pr-2">mode</th>
              <th className="pr-2">recovery</th>
              <th className="pr-2">lease</th>
              <th className="pr-2">windup</th>
              <th className="pr-2">cd</th>
              <th>pos</th>
            </tr>
          </thead>
          <tbody>
            {drones.map((d) => (
              <tr key={d.id} className="border-t border-white/5">
                <td className="pr-2 text-white/80">{d.id}</td>
                <td className={`pr-2 font-semibold ${STATE_COLORS[d.runtimeState] ?? 'text-white'}`}>{d.runtimeState}</td>
                <td className="pr-2">{formatDroneAiDebugNumber(d.timeInStateMs / 1000, 1)}s</td>
                <td className="pr-2">{d.targetVisible ? 'yes' : 'no'}</td>
                <td className="pr-2">{formatDroneAiDebugNumber(d.targetDistanceM, 1)}</td>
                <td className="pr-2">{formatDroneAiDebugNumber(d.memoryRemainingMs, 0)}</td>
                <td className="pr-2">{d.movementMode}</td>
                <td className="pr-2">{d.recoveryPhase === 'idle' ? '—' : d.recoveryPhase}</td>
                <td className={`pr-2 ${d.hasAttackLease ? 'text-emerald-400' : 'text-white/40'}`}>
                  {d.hasAttackLease ? `#${d.sectorIndex}` : d.coordinationBlocked ? 'blocked' : '—'}
                </td>
                <td className="pr-2">{formatDroneAiDebugNumber(d.windupRemainingMs, 0)}</td>
                <td className="pr-2">{formatDroneAiDebugNumber(d.cooldownRemainingMs, 0)}</td>
                <td className="text-white/50">{fmtPos(d.tacticalPosition)}</td>
              </tr>
            ))}
            {drones.length === 0 && (
              <tr>
                <td colSpan={12} className="py-2 text-center text-white/40">
                  waiting for first poll…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-1 text-[9px] leading-tight text-white/30">
        last transition — {drones.find((d) => d.lastTransitionReason)?.id ?? '—'}: {drones.find((d) => d.lastTransitionReason)?.lastTransitionReason ?? '—'}
      </div>
    </div>
  );
}
