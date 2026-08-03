'use client';

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { resolveDroneConfig, resolveDroneSpawns } from '@/lib/v2/play/difficulty';
import { createStepAccumulator, stepFixed } from '@/lib/v2/play/fixedStep';
import { useV2MatchStore } from '@/lib/v2/play/matchStore';
import type { DroneTargetSnapshot } from '@/lib/v2/ai/droneAiTypes';
import type { DroneSpatialSnapshot } from '@/lib/v2/ai/droneAiMovementIntent';
import DroneEnemy, { type DroneHandle } from './DroneEnemy';
import DroneBoltPool, { type DroneBoltHandle } from './DroneBoltPool';

/**
 * Drives the Skyfront Trial drone squad (5 on Low, 8 on Medium/Max — see
 * `resolveDroneSpawns`) + the shared bolt pool (Milestone 6). ONE useFrame
 * ticks the whole squad (each drone's `update` is a pure ref-driven step —
 * no per-drone render loop, no per-frame React state). Restart is
 * nonce-driven: when matchStore.restartNonce changes, every drone resets and
 * the pool clears — no remount, no duplicated groups, no stale projectiles.
 *
 * MOVEMENT runs through a fixed-step accumulator (`fixedStep.ts`) instead of
 * a single `Math.min(rawDelta, cap)` step — at a normal frame rate this
 * costs exactly one `update()` call per drone per frame (unchanged from
 * before), but under a slow frame it runs several fixed 1/60s substeps to
 * catch movement back up to real elapsed time instead of letting it run in
 * slow motion. `DroneEnemy.update()` is idempotent within a single rendered
 * frame's substeps (cooldowns/windup/stun/destroy all key off the one
 * `now` timestamp passed in, not off substep count — see DroneEnemy.tsx),
 * so calling it multiple times per frame is safe and does not double-fire.
 *
 * MILESTONE 9C — this component now owns building the single
 * `DroneTargetSnapshot` every drone reads: camera position read ONCE per
 * frame (unchanged from 9B — still `playerPos.copy(camera.position)`, just
 * written into the snapshot's own plain `position` field instead of a bare
 * `THREE.Vector3`), plus `matchStore.respawnNonce` as the player's current
 * life generation. ONE reusable object (`targetSnapshotRef`, never
 * reallocated), passed to every drone's `update()` call this frame — never a
 * per-drone camera read, never a second player-position bridge alongside
 * this one. `alive` is populated for the snapshot's own self-documentation
 * even though every consumer already only runs while `match.phase ===
 * 'active'` (this function returns before ever reaching the drone-update
 * loop otherwise) — see `droneAiTypes.ts`'s own doc comment on
 * `DroneTargetSnapshot`.
 *
 * MILESTONE 9D — the fixed-step substep callback below is now TWO PASSES,
 * not one: PASS 1 calls every mounted drone's `writeSpatialSnapshot()` into
 * one shared, preallocated `DroneSpatialSnapshot[]` (reused every substep,
 * resized only when `spawns` itself changes — i.e. on a difficulty switch —
 * never per-frame); PASS 2 then calls every drone's `update()`, passing that
 * SAME just-captured array as its `neighbours` input. Both passes re-run
 * every fixed substep (not once per rendered frame) so a slow-frame catch-up
 * burst still gives each substep its own correct pre-movement snapshot,
 * never a stale one from an earlier substep. This is what makes local
 * separation (`droneAiMovementIntent.ts`) order-independent: without it, a
 * drone earlier in `droneRefs.current` would always see the LATER drones'
 * stale pre-tick positions while later drones would see the earlier ones'
 * already-moved positions — a systematic bias this two-pass split removes
 * entirely. `spatialSnapshots` is rebuilt (via `useMemo` keyed on `spawns`)
 * exactly when the mounted `<DroneEnemy>` roster itself changes, so its
 * length always matches `droneRefs.current`'s current length 1:1 by index —
 * no stale entries are possible after a difficulty switch, restart, death,
 * or route remount (a remount discards this whole component instance and
 * its refs/memos together).
 */
export default function DroneSquad() {
  const camera = useThree((state) => state.camera);
  const droneRefs = useRef<Array<DroneHandle | null>>([]);
  const boltRef = useRef<DroneBoltHandle>(null);
  const lastRestartNonce = useRef(0);
  const targetSnapshot = useMemo<DroneTargetSnapshot>(() => ({ position: { x: 0, y: 0, z: 0 }, alive: false, generation: 0 }), []);
  const stepAcc = useRef(createStepAccumulator());

  // Reactive to the selected difficulty so switching Low↔Medium↔Max during
  // the pre-countdown 'ready' screen mounts/unmounts the right drone count
  // immediately — not just on the next restart. beginCountdown()/restart()
  // both bump restartNonce right as combat starts, which re-seeds every
  // currently-mounted drone (including ones added by a late switch) with
  // the locked-in difficulty's stats before any damage can be dealt.
  const selectedDifficulty = useV2MatchStore((state) => state.selectedDifficulty);
  const spawns = useMemo(() => resolveDroneSpawns(selectedDifficulty), [selectedDifficulty]);

  // Milestone 9D — one shared, reused spatial-snapshot collection sized 1:1
  // to `spawns`, rebuilt only when `spawns` itself changes (never per
  // frame/substep) — see this component's own doc comment above.
  const spatialSnapshots = useMemo<DroneSpatialSnapshot[]>(
    () => spawns.map((spawn) => ({ id: spawn.id, position: { x: 0, y: 0, z: 0 }, state: 'spawning', participatesInSeparation: false })),
    [spawns],
  );

  // Match lifecycle (session init → countdown) is owned by V2PlayView +
  // MatchDirector, not here — this component only spawns and drives drones.

  useFrame((_, rawDelta) => {
    const match = useV2MatchStore.getState();

    if (match.phase === 'paused') return; // fully frozen

    // Restart: reset every drone + clear bolts, no remount.
    if (match.restartNonce !== lastRestartNonce.current) {
      lastRestartNonce.current = match.restartNonce;
      for (const drone of droneRefs.current) drone?.reset();
      boltRef.current?.clear();
    }

    // Drones only think during live combat (active). During countdown they
    // hold their spawn-in; during death/menus they're frozen but not reset.
    if (match.phase !== 'active') return;

    const now = performance.now();
    targetSnapshot.position.x = camera.position.x;
    targetSnapshot.position.y = camera.position.y;
    targetSnapshot.position.z = camera.position.z;
    targetSnapshot.alive = true; // match.phase === 'active', already gated above
    targetSnapshot.generation = match.respawnNonce;
    const bolts = boltRef.current;
    if (!bolts) return;

    // Resolved once per frame (cheap, pure arithmetic) — same function every
    // consumer uses, so drone AI, bolts and the HUD can never disagree.
    const droneConfig = resolveDroneConfig(match.selectedDifficulty);
    stepFixed(stepAcc.current, rawDelta, (simulationDeltaS) => {
      // Milestone 9D — PASS 1: capture every mounted drone's pre-movement
      // spatial snapshot BEFORE any drone in PASS 2 moves this substep (see
      // this component's own doc comment above for why this must re-run
      // every substep, not once per rendered frame). Bounded by
      // `spatialSnapshots.length` (not `droneRefs.current.length`) — a
      // defensive guard against the narrow React commit window where a
      // difficulty-driven re-render's ref callbacks and this `useMemo` can
      // transiently disagree in length; out-of-range drones simply skip
      // PASS 1 for this one substep rather than indexing past the array.
      const snapshotCount = Math.min(droneRefs.current.length, spatialSnapshots.length);
      for (let i = 0; i < snapshotCount; i++) {
        droneRefs.current[i]?.writeSpatialSnapshot(spatialSnapshots[i]);
      }
      // PASS 2 — every drone decides/moves against that SAME snapshot set.
      for (const drone of droneRefs.current) {
        drone?.update(targetSnapshot, simulationDeltaS, now, bolts, droneConfig, spatialSnapshots);
      }
    });
  });

  return (
    <group name="drone_squad">
      {spawns.map((spawn, index) => (
        <DroneEnemy
          key={spawn.id}
          spawn={spawn}
          ref={(handle) => {
            droneRefs.current[index] = handle;
          }}
        />
      ))}
      <DroneBoltPool ref={boltRef} />
    </group>
  );
}
