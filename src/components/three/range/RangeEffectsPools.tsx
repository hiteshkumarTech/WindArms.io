'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { WIND_WEAPONS } from '@shared/windWeapons';
import { effectsBus } from '@/lib/v2/range/effectsBus';

const TRACER_COUNT = 16;
const IMPACT_COUNT = 12;
const CASING_COUNT = 10;
const TRACER_LIFE_MS = 90;
const IMPACT_LIFE_MS = 220;
const CASING_LIFE_MS = 900;

const noRaycast = () => null;

/**
 * Pooled, zero-allocation VFX meshes draining `src/lib/v2/range/effectsBus.ts`
 * — same round-robin-recycle architecture as v1's TracerPool/ShellCasingPool
 * (`src/components/game/weapons/TracerPool.tsx` et al.): fixed-size arrays
 * of refs, visible toggled per-slot, aged out by elapsed time, never
 * grown/GC'd regardless of fire rate. Deliberately simpler geometry than
 * v1's custom-shader tracers (a stretched box instead of a shaded cylinder
 * with a head-to-tail gradient) — real VFX, not a placeholder, just not
 * yet the shader pass v1 has; a reasonable v0 scope cut for a single test
 * weapon, not a limitation of the pooling architecture itself.
 */
export default function RangeEffectsPools() {
  const tracerRefs = useRef<Array<THREE.Mesh | null>>([]);
  const impactRefs = useRef<Array<THREE.Mesh | null>>([]);
  const casingRefs = useRef<Array<THREE.Mesh | null>>([]);
  const tracerBornAt = useRef<number[]>(new Array(TRACER_COUNT).fill(0));
  const impactBornAt = useRef<number[]>(new Array(IMPACT_COUNT).fill(0));
  const casingBornAt = useRef<{ born: number; vel: THREE.Vector3 }[]>(
    Array.from({ length: CASING_COUNT }, () => ({ born: 0, vel: new THREE.Vector3() })),
  );
  const tracerCursor = useRef(0);
  const impactCursor = useRef(0);
  const casingCursor = useRef(0);

  const tracerMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ color: WIND_WEAPONS.vortex.accent, transparent: true, toneMapped: false }),
    [],
  );
  const impactMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ color: WIND_WEAPONS.vortex.accent, transparent: true, toneMapped: false }),
    [],
  );
  const casingMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#d9b563', metalness: 0.8, roughness: 0.4 }), []);

  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame((_, delta) => {
    const now = performance.now();

    effectsBus.takeTracers().forEach((request) => {
      const index = tracerCursor.current;
      tracerCursor.current = (tracerCursor.current + 1) % TRACER_COUNT;
      tracerBornAt.current[index] = now;
      const mesh = tracerRefs.current[index];
      if (!mesh) return;
      const from = new THREE.Vector3(...request.from);
      const to = new THREE.Vector3(...request.to);
      const length = from.distanceTo(to);
      dummy.position.copy(from).lerp(to, 0.5);
      dummy.lookAt(to);
      dummy.updateMatrix();
      mesh.position.copy(dummy.position);
      mesh.quaternion.copy(dummy.quaternion);
      mesh.scale.set(0.01, 0.01, length);
      mesh.visible = true;
    });

    effectsBus.takeImpacts().forEach((request) => {
      const index = impactCursor.current;
      impactCursor.current = (impactCursor.current + 1) % IMPACT_COUNT;
      impactBornAt.current[index] = now;
      const mesh = impactRefs.current[index];
      if (!mesh) return;
      mesh.position.set(...request.at);
      mesh.scale.setScalar(0.001);
      mesh.visible = true;
    });

    effectsBus.takeCasings().forEach((request) => {
      const index = casingCursor.current;
      casingCursor.current = (casingCursor.current + 1) % CASING_COUNT;
      const slot = casingBornAt.current[index];
      slot.born = now;
      slot.vel.set(...request.dir).multiplyScalar(1.6);
      const mesh = casingRefs.current[index];
      if (!mesh) return;
      mesh.position.set(...request.at);
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      mesh.visible = true;
    });

    for (let i = 0; i < TRACER_COUNT; i++) {
      const mesh = tracerRefs.current[i];
      if (!mesh || !mesh.visible) continue;
      const age = now - tracerBornAt.current[i];
      if (age >= TRACER_LIFE_MS) {
        mesh.visible = false;
        continue;
      }
      (mesh.material as THREE.MeshBasicMaterial).opacity = 1 - age / TRACER_LIFE_MS;
    }

    for (let i = 0; i < IMPACT_COUNT; i++) {
      const mesh = impactRefs.current[i];
      if (!mesh || !mesh.visible) continue;
      const age = now - impactBornAt.current[i];
      if (age >= IMPACT_LIFE_MS) {
        mesh.visible = false;
        continue;
      }
      const t = age / IMPACT_LIFE_MS;
      mesh.scale.setScalar(THREE.MathUtils.lerp(0.05, 0.28, Math.min(t * 3, 1)));
      (mesh.material as THREE.MeshBasicMaterial).opacity = 1 - t;
    }

    for (let i = 0; i < CASING_COUNT; i++) {
      const mesh = casingRefs.current[i];
      const slot = casingBornAt.current[i];
      if (!mesh || !mesh.visible) continue;
      const age = now - slot.born;
      if (age >= CASING_LIFE_MS) {
        mesh.visible = false;
        continue;
      }
      slot.vel.y -= 9.8 * delta;
      mesh.position.addScaledVector(slot.vel, delta);
      mesh.rotation.x += delta * 6;
      mesh.rotation.z += delta * 4;
    }
  });

  return (
    <group>
      {Array.from({ length: TRACER_COUNT }).map((_, i) => (
        <mesh
          key={`tracer-${i}`}
          ref={(mesh) => {
            tracerRefs.current[i] = mesh;
          }}
          visible={false}
          frustumCulled={false}
          raycast={noRaycast}
          material={tracerMaterial}
        >
          <boxGeometry args={[1, 1, 1]} />
        </mesh>
      ))}
      {Array.from({ length: IMPACT_COUNT }).map((_, i) => (
        <mesh
          key={`impact-${i}`}
          ref={(mesh) => {
            impactRefs.current[i] = mesh;
          }}
          visible={false}
          frustumCulled={false}
          raycast={noRaycast}
          material={impactMaterial}
        >
          <sphereGeometry args={[1, 6, 6]} />
        </mesh>
      ))}
      {Array.from({ length: CASING_COUNT }).map((_, i) => (
        <mesh
          key={`casing-${i}`}
          ref={(mesh) => {
            casingRefs.current[i] = mesh;
          }}
          visible={false}
          frustumCulled={false}
          raycast={noRaycast}
          material={casingMaterial}
        >
          <boxGeometry args={[0.015, 0.03, 0.008]} />
        </mesh>
      ))}
    </group>
  );
}
