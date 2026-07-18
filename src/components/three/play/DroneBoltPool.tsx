'use client';

import { useEffect, useImperativeHandle, useMemo, useRef, forwardRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { STORM } from '@/lib/v2/tokens';
import { DRONE } from '@/lib/v2/play/enemyConfig';
import { useV2MatchStore } from '@/lib/v2/play/matchStore';
import { pointInBox, SOLIDS } from '@/lib/v2/play/spawnConfig';

/**
 * Pooled drone energy bolts (Milestone 6). Fixed-size instanced pool (no
 * per-shot allocation, no per-bolt React state): drones call `spawn()` on
 * the handle, this steps every live bolt in one useFrame, tests each
 * against the arena SOLIDS (despawn) and the player capsule (damage via the
 * match store), and expires them after their lifetime. Frozen while paused
 * and inert outside the active phase — bolts must not keep travelling after
 * pause or match end (brief requirement). Emissive cyan spheres: visible,
 * dodgeable, no graphic impact effects.
 */
export interface DroneBoltHandle {
  /** `speed` and `damage` are the CALLER's difficulty-resolved values (see `resolveDroneConfig`) — captured once at spawn so a bolt's behavior can't change mid-flight even if the difficulty selection changes between shots. */
  spawn: (origin: THREE.Vector3, direction: THREE.Vector3, speed: number, damage: number) => void;
  /** Deactivate every bolt — called on restart. */
  clear: () => void;
}

interface Bolt {
  active: boolean;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  expiresAt: number;
  damage: number;
}

const PLAYER_HALF_HEIGHT = 0.9;
const PLAYER_RADIUS = 0.4;

const DroneBoltPool = forwardRef<DroneBoltHandle>(function DroneBoltPool(_props, ref) {
  const camera = useThree((state) => state.camera);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const bolts = useMemo<Bolt[]>(
    () => Array.from({ length: DRONE.BOLT_POOL }, () => ({ active: false, position: new THREE.Vector3(), velocity: new THREE.Vector3(), expiresAt: 0, damage: 0 })),
    [],
  );

  const material = useMemo(
    () => new THREE.MeshBasicMaterial({ color: STORM.energy, toneMapped: false }),
    [],
  );
  const geometry = useMemo(() => new THREE.SphereGeometry(DRONE.BOLT_RADIUS, 10, 8), []);

  useEffect(
    () => () => {
      material.dispose();
      geometry.dispose();
    },
    [material, geometry],
  );

  // Park all instances offscreen initially.
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    dummy.position.set(0, -9999, 0);
    dummy.updateMatrix();
    for (let i = 0; i < DRONE.BOLT_POOL; i++) mesh.setMatrixAt(i, dummy.matrix);
    mesh.instanceMatrix.needsUpdate = true;
  }, [dummy]);

  useImperativeHandle(
    ref,
    () => ({
      spawn(origin, direction, speed, damage) {
        const bolt = bolts.find((b) => !b.active);
        if (!bolt) return; // pool exhausted — drop the shot rather than allocate
        bolt.active = true;
        bolt.position.copy(origin);
        bolt.velocity.copy(direction).normalize().multiplyScalar(speed);
        bolt.expiresAt = performance.now() + DRONE.BOLT_LIFETIME_MS;
        bolt.damage = damage;
      },
      clear() {
        for (const bolt of bolts) bolt.active = false;
      },
    }),
    [bolts],
  );

  useFrame((_, rawDelta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const match = useV2MatchStore.getState();
    // Freeze in place while paused; go inert (and clear) outside active play.
    if (match.phase === 'paused') return;
    const combatLive = match.phase === 'active';

    const dt = Math.min(rawDelta, 1 / 30);
    const now = performance.now();

    for (let i = 0; i < bolts.length; i++) {
      const bolt = bolts[i];
      if (!bolt.active) continue;

      if (!combatLive || now >= bolt.expiresAt) {
        bolt.active = false;
        dummy.position.set(0, -9999, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        continue;
      }

      bolt.position.addScaledVector(bolt.velocity, dt);

      // Player hit (capsule approximated as a vertical segment + radius).
      const feetY = camera.position.y - 1.5;
      const dx = bolt.position.x - camera.position.x;
      const dz = bolt.position.z - camera.position.z;
      const withinY = bolt.position.y >= feetY - PLAYER_HALF_HEIGHT && bolt.position.y <= camera.position.y + 0.2;
      if (withinY && dx * dx + dz * dz <= (PLAYER_RADIUS + DRONE.BOLT_RADIUS) ** 2) {
        match.damagePlayer(bolt.damage, [bolt.position.x, bolt.position.y, bolt.position.z]);
        bolt.active = false;
        dummy.position.set(0, -9999, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        continue;
      }

      // Arena collision — despawn, no impact VFX (brief: no graphic impacts).
      let blocked = false;
      for (const box of SOLIDS) {
        if (pointInBox([bolt.position.x, bolt.position.y, bolt.position.z], box, DRONE.BOLT_RADIUS)) {
          blocked = true;
          break;
        }
      }
      if (blocked) {
        bolt.active = false;
        dummy.position.set(0, -9999, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        continue;
      }

      dummy.position.copy(bolt.position);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={meshRef} args={[geometry, material, DRONE.BOLT_POOL]} frustumCulled={false} />;
});

export default DroneBoltPool;
