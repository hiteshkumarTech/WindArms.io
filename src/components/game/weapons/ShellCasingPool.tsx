'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { effectsBus } from '@/lib/game/effectsBus';

const noRaycast = () => null;

const CASING_COUNT = 14;
const CASING_LIFE_MS = 900;
/** Exaggerated for a snappy, readable arc rather than a realistic fall. */
const GRAVITY = 14;
const EJECT_SPEED = 1.6;
const FADE_MS = 250;

interface CasingState {
  bornAt: number;
  velocity: THREE.Vector3;
  spin: THREE.Vector3;
}

/**
 * Pooled brass (or shotgun-hull) casings ejected on every trigger pull —
 * one per shot regardless of pellet count, skipped entirely for the energy
 * weapon. Motion is a simple simulated arc (gravity + tumble), not physics:
 * cosmetic only, so it never touches Rapier or the collision world.
 */
export default function ShellCasingPool() {
  const meshRefs = useRef<Array<THREE.Mesh | null>>(Array(CASING_COUNT).fill(null));
  const states = useRef<CasingState[]>(
    Array.from({ length: CASING_COUNT }, () => ({
      bornAt: -Infinity,
      velocity: new THREE.Vector3(),
      spin: new THREE.Vector3(),
    })),
  );
  const cursor = useRef(0);

  const geometry = useMemo(() => new THREE.CylinderGeometry(0.011, 0.011, 0.05, 6), []);
  const materials = useMemo(
    () =>
      Array.from(
        { length: CASING_COUNT },
        () =>
          new THREE.MeshStandardMaterial({
            color: '#d9b563',
            metalness: 0.75,
            roughness: 0.35,
            transparent: true,
          }),
      ),
    [],
  );

  useEffect(
    () => () => {
      geometry.dispose();
      materials.forEach((material) => material.dispose());
    },
    [geometry, materials],
  );

  useFrame((_, delta) => {
    const now = performance.now();

    for (const request of effectsBus.takeCasings()) {
      const slot = cursor.current % CASING_COUNT;
      cursor.current += 1;
      const mesh = meshRefs.current[slot];
      if (!mesh) continue;

      mesh.position.set(request.at[0], request.at[1], request.at[2]);
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);

      const state = states.current[slot];
      state.velocity
        .set(request.dir[0], request.dir[1], request.dir[2])
        .multiplyScalar(EJECT_SPEED * (0.8 + Math.random() * 0.4));
      state.spin.set(
        (Math.random() - 0.5) * 18,
        (Math.random() - 0.5) * 18,
        (Math.random() - 0.5) * 18,
      );
      state.bornAt = now;

      materials[slot].color.set(request.color);
      materials[slot].opacity = 1;
      mesh.visible = true;
    }

    for (let slot = 0; slot < CASING_COUNT; slot++) {
      const mesh = meshRefs.current[slot];
      if (!mesh || !mesh.visible) continue;
      const state = states.current[slot];
      const age = now - state.bornAt;
      if (age >= CASING_LIFE_MS) {
        mesh.visible = false;
        continue;
      }

      state.velocity.y -= GRAVITY * delta;
      mesh.position.addScaledVector(state.velocity, delta);
      mesh.rotation.x += state.spin.x * delta;
      mesh.rotation.y += state.spin.y * delta;
      mesh.rotation.z += state.spin.z * delta;

      const remaining = CASING_LIFE_MS - age;
      materials[slot].opacity = remaining < FADE_MS ? remaining / FADE_MS : 1;
    }
  });

  return (
    <group>
      {Array.from({ length: CASING_COUNT }, (_, slot) => (
        <mesh
          key={slot}
          ref={(node) => {
            meshRefs.current[slot] = node;
          }}
          geometry={geometry}
          material={materials[slot]}
          raycast={noRaycast}
          visible={false}
        />
      ))}
    </group>
  );
}
