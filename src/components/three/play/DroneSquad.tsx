'use client';

import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { resolveDroneConfig, resolveDroneSpawns } from '@/lib/v2/play/difficulty';
import { useV2MatchStore } from '@/lib/v2/play/matchStore';
import DroneEnemy, { type DroneHandle } from './DroneEnemy';
import DroneBoltPool, { type DroneBoltHandle } from './DroneBoltPool';

/**
 * Drives the Skyfront Trial drone squad (5 on Low, 8 on Medium/Max — see
 * `resolveDroneSpawns`) + the shared bolt pool (Milestone 6). ONE useFrame
 * ticks the whole squad (each drone's `update` is a pure ref-driven step —
 * no per-drone render loop, no per-frame React state). Restart is
 * nonce-driven: when matchStore.restartNonce changes, every drone resets and
 * the pool clears — no remount, no duplicated groups, no stale projectiles.
 */
export default function DroneSquad() {
  const camera = useThree((state) => state.camera);
  const droneRefs = useRef<Array<DroneHandle | null>>([]);
  const boltRef = useRef<DroneBoltHandle>(null);
  const lastRestartNonce = useRef(0);
  const playerPos = useMemo(() => new THREE.Vector3(), []);

  // Reactive to the selected difficulty so switching Low↔Medium↔Max during
  // the pre-countdown 'ready' screen mounts/unmounts the right drone count
  // immediately — not just on the next restart. beginCountdown()/restart()
  // both bump restartNonce right as combat starts, which re-seeds every
  // currently-mounted drone (including ones added by a late switch) with
  // the locked-in difficulty's stats before any damage can be dealt.
  const selectedDifficulty = useV2MatchStore((state) => state.selectedDifficulty);
  const spawns = useMemo(() => resolveDroneSpawns(selectedDifficulty), [selectedDifficulty]);

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

    const dt = Math.min(rawDelta, 1 / 30);
    const now = performance.now();
    playerPos.copy(camera.position);
    const bolts = boltRef.current;
    if (!bolts) return;

    // Resolved once per frame (cheap, pure arithmetic) — same function every
    // consumer uses, so drone AI, bolts and the HUD can never disagree.
    const droneConfig = resolveDroneConfig(match.selectedDifficulty);
    for (const drone of droneRefs.current) {
      drone?.update(playerPos, dt, now, bolts, droneConfig);
    }
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
