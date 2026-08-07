'use client';

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { resolveDroneSpawns } from '@/lib/v2/play/difficulty';
import { createStepAccumulator, stepFixed } from '@/lib/v2/play/fixedStep';
import { useV2MatchStore } from '@/lib/v2/play/matchStore';
import { resolveDroneAiDifficultyProfile } from '@/lib/v2/ai/droneAiDifficulty';
import type { DroneTargetSnapshot } from '@/lib/v2/ai/droneAiTypes';
import type { DroneSpatialSnapshot } from '@/lib/v2/ai/droneAiMovementIntent';
import {
  createDroneSquadCoordinatorRuntime,
  resetDroneSquadCoordinatorRuntime,
  resolveDroneSquadCoordination,
  resolveDroneSquadCoordinationProfile,
  type DroneAttackPermit,
  type DroneAttackRequest,
} from '@/lib/v2/ai/droneAiSquad';
import {
  clearDroneAiDebugDroneSnapshot,
  reregisterDroneAiDebugRoster,
  resetDroneAiDebugSquadMeta,
  type DroneAiDebugDroneSnapshot,
  type DroneAiDebugRuntime,
} from '@/lib/v2/ai/droneAiDebugState';
import DroneEnemy, { type DroneHandle } from './DroneEnemy';
import DroneBoltPool, { type DroneBoltHandle } from './DroneBoltPool';

/** A permit no request should ever actually need to fall back to (every live drone's index has a matching preallocated `attackRequests`/`permits` entry) — kept only as a defensive `?? EMPTY_PERMIT` default, mirroring this file's own general "never let a missing map entry propagate as undefined" discipline. */
const EMPTY_PERMIT: DroneAttackPermit = { granted: false, sector: null };

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
 *
 * MILESTONE 9E — the per-frame `resolveDroneConfig(match.selectedDifficulty)`
 * call this component used to make every frame is gone: `droneProfile`
 * (below) resolves the richer `DroneAiDifficultyProfile` — which EXTENDS the
 * old `ResolvedDroneConfig` shape with `acquireReactionDelayMs`/
 * `targetMemoryDurationMs`/`attackWindupMs` — exactly ONCE per difficulty
 * change via `useMemo`, mirroring `spawns`/`spatialSnapshots`'s own existing
 * memoization pattern. Every drone's `update()` reads this one shared
 * object; no drone (and no per-frame call) resolves its own.
 *
 * MILESTONE 9G — the fixed-step substep callback gains a THIRD pass, run
 * between the existing PASS 1 (`writeSpatialSnapshot`) and PASS 2
 * (`update`): each drone reports a side-effect-free attack-permit REQUEST
 * (`prepareAttackRequest`, into `attackRequests` — a shared, preallocated
 * array mirroring `spatialSnapshots`'s own "one reused object per drone,
 * resized only on a spawns change" convention), then ONE squad-level, pure
 * `resolveDroneSquadCoordination()` call (`droneAiSquad.ts`) resolves every
 * request into a permit in a single deterministic pass — EXPLICITLY NOT by
 * calling into each drone in array order and letting the first ones win
 * (see that module's own doc comment on why this would be an order-
 * dependent design, and its own test suite proving the granted SET is
 * identical regardless of request order). PASS 2's `update()` calls are
 * unchanged in ORDER, only gaining one new trailing argument — this
 * substep's already-resolved `permit` for that drone. `coordinatorRuntimeRef`
 * (below) is the ONE piece of new squad-owned state this phase introduces —
 * held here, never duplicated per-drone, never merged into
 * `spatialSnapshots`/`targetSnapshot`. It resets alongside every drone on a
 * restart (see the existing restart branch below), exactly like
 * `boltRef.current?.clear()` already does for the shared bolt pool.
 *
 * MILESTONE 9H — accepts one new, OPTIONAL prop, `debugRuntime`
 * (`DroneAiDebugRuntime | null`, `droneAiDebugState.ts`) — the dev-only,
 * route-owned observability container, `null` whenever observability is not
 * armed (every production request and every request without the explicit
 * `?droneAiDebug=1` opt-in, see `useDroneAiDebugEnabled.ts`). `null` is the
 * ENTIRE gate: when null, `debugRecords` below is a stable empty array, no
 * squad-meta field is ever written, and every drone's own `update()` call
 * receives a `null` debug context each substep, so a "debug disabled" run
 * performs genuinely zero debug-related writes, not merely inert-but-present
 * ones. When non-null, this component owns building the SAME kind of reused,
 * index-matched `debugRecords` array `spatialSnapshots`/`attackRequests`
 * already establish (rebuilt on a `spawns` change via
 * `reregisterDroneAiDebugRoster`, cleared IN PLACE — object identity
 * preserved — on a mid-session restart via `clearDroneAiDebugDroneSnapshot`,
 * so a restart alone can never desync this array from the object identities
 * the debug runtime's own Map still holds).
 */
export default function DroneSquad({ debugRuntime }: { debugRuntime: DroneAiDebugRuntime | null }) {
  const camera = useThree((state) => state.camera);
  const droneRefs = useRef<Array<DroneHandle | null>>([]);
  const boltRef = useRef<DroneBoltHandle>(null);
  const lastRestartNonce = useRef(0);
  const targetSnapshot = useMemo<DroneTargetSnapshot>(() => ({ position: { x: 0, y: 0, z: 0 }, alive: false, generation: 0 }), []);
  const stepAcc = useRef(createStepAccumulator());

  // Milestone 9G — the squad-owned attack-permit coordinator runtime (see
  // this component's own doc comment above). Reset alongside every drone on
  // restart, below.
  const coordinatorRuntimeRef = useRef(createDroneSquadCoordinatorRuntime());

  // Reactive to the selected difficulty so switching Low↔Medium↔Max during
  // the pre-countdown 'ready' screen mounts/unmounts the right drone count
  // immediately — not just on the next restart. beginCountdown()/restart()
  // both bump restartNonce right as combat starts, which re-seeds every
  // currently-mounted drone (including ones added by a late switch) with
  // the locked-in difficulty's stats before any damage can be dealt.
  const selectedDifficulty = useV2MatchStore((state) => state.selectedDifficulty);
  const spawns = useMemo(() => resolveDroneSpawns(selectedDifficulty), [selectedDifficulty]);

  // Milestone 9E — the combat-cadence profile (reaction delay, target-memory
  // duration, windup) is resolved ONCE per difficulty change, not per frame
  // or per drone, and handed to every drone's `update()` call below —
  // extends the existing `ResolvedDroneConfig` shape (same object now also
  // carries maxHp/boltDamage/fireIntervalMs/etc.), so this replaces the old
  // per-frame `resolveDroneConfig()` call entirely rather than sitting
  // alongside it.
  const droneProfile = useMemo(() => resolveDroneAiDifficultyProfile(selectedDifficulty), [selectedDifficulty]);

  // Milestone 9G — the squad attack-coordination profile (concurrent-
  // attacker cap, sector count), resolved ONCE per difficulty change, mirroring
  // `droneProfile`'s own memoization convention exactly.
  const coordinationProfile = useMemo(() => resolveDroneSquadCoordinationProfile(selectedDifficulty), [selectedDifficulty]);

  // Milestone 9D — one shared, reused spatial-snapshot collection sized 1:1
  // to `spawns`, rebuilt only when `spawns` itself changes (never per
  // frame/substep) — see this component's own doc comment above.
  const spatialSnapshots = useMemo<DroneSpatialSnapshot[]>(
    () => spawns.map((spawn) => ({ id: spawn.id, position: { x: 0, y: 0, z: 0 }, state: 'spawning', participatesInSeparation: false })),
    [spawns],
  );

  // Milestone 9G — one shared, reused attack-request collection, sized 1:1
  // to `spawns`, mirroring `spatialSnapshots`'s own "rebuilt only on a
  // spawns change, mutated in place every substep otherwise" convention.
  const attackRequests = useMemo<DroneAttackRequest[]>(
    () => spawns.map((spawn) => ({ droneId: spawn.id, wantsAttack: false, dronePosition: { x: 0, y: 0, z: 0 }, targetPosition: { x: 0, y: 0, z: 0 }, attackReadyAtMs: 0 })),
    [spawns],
  );

  // Milestone 9H — one shared, reused, index-matched debug-telemetry record
  // array, mirroring `spatialSnapshots`/`attackRequests`'s own "rebuilt only
  // on a spawns change" convention exactly. A stable EMPTY array whenever
  // `debugRuntime` is null (observability not armed) — no roster is ever
  // registered into a null runtime, so this is a true no-op, not merely an
  // inert one.
  const debugRecords = useMemo<DroneAiDebugDroneSnapshot[]>(
    () => (debugRuntime ? reregisterDroneAiDebugRoster(debugRuntime, spawns.map((spawn) => spawn.id), performance.now()) : []),
    [spawns, debugRuntime],
  );

  // Match lifecycle (session init → countdown) is owned by V2PlayView +
  // MatchDirector, not here — this component only spawns and drives drones.

  useFrame((_, rawDelta) => {
    const match = useV2MatchStore.getState();

    if (match.phase === 'paused') return; // fully frozen

    // Restart: reset every drone + clear bolts + clear squad coordination, no remount.
    if (match.restartNonce !== lastRestartNonce.current) {
      lastRestartNonce.current = match.restartNonce;
      for (const drone of droneRefs.current) drone?.reset();
      boltRef.current?.clear();
      // Milestone 9G — every lease/fairness-history entry clears on restart,
      // exactly like the bolt pool above (see this component's own doc
      // comment).
      coordinatorRuntimeRef.current = resetDroneSquadCoordinatorRuntime();
      // Milestone 9H — a restart doesn't change the roster (same IDs, same
      // count), so this clears every existing debug record IN PLACE rather
      // than rebuilding the array (see `debugRecords`'s own doc comment on
      // why object identity must survive a restart). No-op cost when
      // `debugRuntime` is null.
      if (debugRuntime) {
        const restartNow = performance.now();
        for (const record of debugRecords) clearDroneAiDebugDroneSnapshot(record, restartNow);
        resetDroneAiDebugSquadMeta(debugRuntime, restartNow);
      }
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

      // Milestone 9G — PASS "prepare": every drone reports its own
      // side-effect-free attack-permit REQUEST into the same shared,
      // preallocated `attackRequests` array (bounded by `attackRequests.length`,
      // mirroring PASS 1's own defensive `snapshotCount` guard against a
      // transient React-commit-window length mismatch). A drone whose ref is
      // momentarily missing simply keeps its request's stale `wantsAttack`
      // from a prior substep for this one substep — informational only,
      // since `resolveDroneSquadCoordination` below only ever GRANTS a
      // request whose owning drone was actually reachable, and a stale
      // `wantsAttack:true` with no corresponding real update() call this
      // substep is harmless (worst case: one substep's wasted candidacy,
      // self-corrects next substep).
      const requestCount = Math.min(droneRefs.current.length, attackRequests.length);
      for (let i = 0; i < requestCount; i++) {
        droneRefs.current[i]?.prepareAttackRequest(targetSnapshot, now, droneProfile, attackRequests[i]);
      }

      // Milestone 9G — squad-level coordination: ONE deterministic pass
      // resolves every request into a permit, order-independent (see
      // `droneAiSquad.ts`'s own doc comment) — never "first drone to call
      // wins".
      const coordination = resolveDroneSquadCoordination(coordinatorRuntimeRef.current, attackRequests, coordinationProfile, now);
      coordinatorRuntimeRef.current = coordination.runtime;

      // PASS 2 — every drone decides/moves against that SAME snapshot set,
      // now also consuming this substep's own already-resolved attack
      // permit (looked up by this drone's own stable spawn id — `spawns`/
      // `droneRefs.current` share the same 1:1 index correspondence
      // `spatialSnapshots`/`attackRequests` already rely on). `droneProfile`
      // (Milestone 9E) is captured from the render closure — memoized once
      // per difficulty change, not recomputed here.
      const droneCount = Math.min(droneRefs.current.length, spawns.length);
      for (let i = 0; i < droneCount; i++) {
        const drone = droneRefs.current[i];
        const permit = coordination.permits.get(spawns[i].id) ?? EMPTY_PERMIT;
        // Milestone 9H — `null` unless observability is armed (see this
        // component's own doc comment) — a genuinely zero-cost, zero-write
        // path when disabled. `attackEligible` reuses the SAME `wantsAttack`
        // value this drone's own `prepareAttackRequest` call already
        // computed this substep (PASS "prepare", above) — never
        // recomputed.
        const debugContext = debugRuntime ? { attackEligible: attackRequests[i].wantsAttack, record: debugRecords[i] } : null;
        drone?.update(targetSnapshot, simulationDeltaS, now, bolts, droneProfile, spatialSnapshots, permit, debugContext);
      }

      // Milestone 9H — squad-level telemetry, one write per substep,
      // entirely skipped when `debugRuntime` is null. Every field here is a
      // direct read of a value this same substep already computed for real
      // gameplay (`coordination.permits`/`coordinatorRuntimeRef`/
      // `coordinationProfile`) — no second, parallel computation.
      if (debugRuntime) {
        let reservedSectorCount = 0;
        const seenSectors: number[] = [];
        for (const grantedPermit of coordination.permits.values()) {
          if (grantedPermit.granted && grantedPermit.sector !== null && !seenSectors.includes(grantedPermit.sector)) {
            seenSectors.push(grantedPermit.sector);
            reservedSectorCount++;
          }
        }
        debugRuntime.squad.difficultyId = selectedDifficulty;
        debugRuntime.squad.mountedDroneCount = droneCount;
        debugRuntime.squad.shooterCap = coordinationProfile.maxConcurrentAttackers;
        debugRuntime.squad.sectorCount = coordinationProfile.sectorCount;
        debugRuntime.squad.activeLeaseCount = coordination.runtime.leases.size;
        debugRuntime.squad.reservedSectorCount = reservedSectorCount;
        debugRuntime.squad.simulationSubsteps += 1;
        debugRuntime.squad.lastUpdatedAtMs = now;
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
