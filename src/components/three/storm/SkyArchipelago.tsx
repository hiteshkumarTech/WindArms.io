'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createRng } from '@/lib/utils';
import { createCitadelMaterials, type CitadelMaterials } from './SkyCitadel';

interface SatelliteSpec {
  position: [number, number, number];
  scale: number;
  rotationY: number;
  towers: number;
}

const SATELLITES: SatelliteSpec[] = [
  { position: [-7, 1.2, -20], scale: 0.95, rotationY: 0.6, towers: 2 },
  { position: [12, -1.8, -24], scale: 1.15, rotationY: 2.1, towers: 3 },
  { position: [-12, -3, -27], scale: 0.85, rotationY: 4, towers: 2 },
  { position: [9.5, 4, -30], scale: 0.7, rotationY: 1.2, towers: 1 },
  { position: [-3.5, 5.2, -33], scale: 0.6, rotationY: 3.3, towers: 2 },
];

const DISTANT: Array<{ position: [number, number, number]; scale: number }> = [
  { position: [-24, 2, -46], scale: 2.2 },
  { position: [18, -1, -50], scale: 2.8 },
  { position: [-10, 6, -54], scale: 1.8 },
  { position: [28, 5, -56], scale: 2.4 },
  { position: [2, -4, -58], scale: 3 },
  { position: [-30, -2, -52], scale: 2 },
  { position: [10, 9, -60], scale: 1.6 },
];

/** Marble walkway spanning two points (orientation via quaternion). */
function Bridge({
  from,
  to,
  materials,
}: {
  from: [number, number, number];
  to: [number, number, number];
  materials: CitadelMaterials;
}) {
  const { position, quaternion, length } = useMemo(() => {
    const start = new THREE.Vector3(...from);
    const end = new THREE.Vector3(...to);
    const direction = end.clone().sub(start);
    const len = direction.length();
    const quat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.clone().normalize(),
    );
    return {
      position: start.clone().add(end).multiplyScalar(0.5),
      quaternion: quat,
      length: len,
    };
  }, [from, to]);

  return (
    <group position={position} quaternion={quaternion}>
      <mesh material={materials.marble}>
        <cylinderGeometry args={[0.12, 0.12, length, 6]} />
      </mesh>
      <mesh material={materials.gold} position={[0.16, 0, 0]}>
        <cylinderGeometry args={[0.03, 0.03, length, 5]} />
      </mesh>
      <mesh material={materials.gold} position={[-0.16, 0, 0]}>
        <cylinderGeometry args={[0.03, 0.03, length, 5]} />
      </mesh>
    </group>
  );
}

/** One inhabited satellite island. */
function Satellite({ spec, materials }: { spec: SatelliteSpec; materials: CitadelMaterials }) {
  const towers = useMemo(() => {
    const rng = createRng(Math.round(spec.position[0] * 31 + spec.position[2] * 7));
    return Array.from({ length: spec.towers }, () => ({
      x: (rng() - 0.5) * 2.2,
      z: (rng() - 0.5) * 2.2,
      height: 1 + rng() * 1.6,
      radius: 0.28 + rng() * 0.2,
    }));
  }, [spec]);

  return (
    <group position={spec.position} scale={spec.scale} rotation={[0, spec.rotationY, 0]}>
      <mesh material={materials.rock} position={[0, -1.7, 0]}>
        <cylinderGeometry args={[2.1, 0.25, 2.8, 8]} />
      </mesh>
      <mesh material={materials.marble} position={[0, -0.1, 0]}>
        <cylinderGeometry args={[2.3, 2.1, 0.5, 12]} />
      </mesh>
      <mesh material={materials.gold} position={[0, 0.16, 0]}>
        <torusGeometry args={[2.3, 0.045, 6, 32]} />
      </mesh>
      {towers.map((tower, i) => (
        <group key={i} position={[tower.x, 0.15, tower.z]}>
          <mesh material={materials.marbleDim} position={[0, tower.height / 2, 0]}>
            <cylinderGeometry args={[tower.radius, tower.radius * 1.25, tower.height, 8]} />
          </mesh>
          <mesh material={materials.gold} position={[0, tower.height + 0.18, 0]}>
            <coneGeometry args={[tower.radius * 1.1, 0.4, 8]} />
          </mesh>
        </group>
      ))}
      <mesh material={materials.energy} position={[1.1, 0.45, 0.9]}>
        <sphereGeometry args={[0.14, 12, 12]} />
      </mesh>
    </group>
  );
}

/** Slow patrol dirigible with a spinning prop — the scale cue that sells the world. */
function Airship({
  seed,
  altitude,
  depth,
  speed,
  materials,
}: {
  seed: number;
  altitude: number;
  depth: number;
  speed: number;
  materials: CitadelMaterials;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const propRef = useRef<THREE.Group>(null);
  const startX = useMemo(() => createRng(seed)() * 60 - 30, [seed]);

  useFrame(({ clock }, delta) => {
    const group = groupRef.current;
    if (!group) return;
    group.position.x += speed * delta;
    if (group.position.x > 34) group.position.x = -34;
    group.position.y = altitude + Math.sin(clock.elapsedTime * 0.4 + seed) * 0.2;
    if (propRef.current) propRef.current.rotation.x += delta * 9;
  });

  return (
    <group ref={groupRef} position={[startX, altitude, depth]}>
      {/* Hull */}
      <mesh material={materials.marble} rotation={[0, 0, Math.PI / 2]}>
        <capsuleGeometry args={[0.34, 1.3, 6, 12]} />
      </mesh>
      {[-0.35, 0.35].map((x) => (
        <mesh key={x} material={materials.gold} position={[x, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[0.345, 0.025, 6, 20]} />
        </mesh>
      ))}
      {/* Gondola */}
      <mesh material={materials.marbleDim} position={[0, -0.42, 0]}>
        <boxGeometry args={[0.7, 0.18, 0.2]} />
      </mesh>
      <mesh material={materials.energy} position={[0.2, -0.42, 0.11]}>
        <boxGeometry args={[0.24, 0.06, 0.02]} />
      </mesh>
      {/* Tail fins */}
      <mesh material={materials.marbleDim} position={[-0.95, 0.12, 0]} rotation={[0, 0, 0.5]}>
        <boxGeometry args={[0.34, 0.05, 0.02]} />
      </mesh>
      <mesh material={materials.marbleDim} position={[-0.95, 0, 0]} rotation={[0.5, 0, 0]}>
        <boxGeometry args={[0.34, 0.02, 0.05]} />
      </mesh>
      {/* Prop */}
      <group ref={propRef} position={[-1.12, 0, 0]}>
        <mesh material={materials.gold}>
          <boxGeometry args={[0.03, 0.3, 0.02]} />
        </mesh>
        <mesh material={materials.gold} rotation={[Math.PI / 2, 0, 0]}>
          <boxGeometry args={[0.03, 0.3, 0.02]} />
        </mesh>
      </group>
    </group>
  );
}

/**
 * Everything around the citadel: inhabited satellite islands, marble sky
 * bridges, a distant fog-washed skyline of floating monoliths, patrol
 * airships and drifting rock debris. Kills the empty air — the hero frame
 * reads as a civilization, not a diorama.
 */
export default function SkyArchipelago({ reducedMotion }: { reducedMotion: boolean }) {
  const debrisRef = useRef<THREE.Group>(null);
  const materials = useMemo(createCitadelMaterials, []);

  useEffect(
    () => () => {
      Object.values(materials).forEach((material) => material.dispose());
    },
    [materials],
  );

  const debris = useMemo(() => {
    const rng = createRng(4242);
    return Array.from({ length: 22 }, () => ({
      position: [
        4.5 + (rng() - 0.5) * 16,
        -1 + rng() * 9,
        -18 + (rng() - 0.5) * 10,
      ] as [number, number, number],
      scale: 0.06 + rng() * 0.16,
      phase: rng() * Math.PI * 2,
      spin: 0.2 + rng() * 0.5,
    }));
  }, []);

  useFrame(({ clock }, delta) => {
    if (reducedMotion || !debrisRef.current) return;
    const time = clock.elapsedTime;
    debrisRef.current.children.forEach((chunk, index) => {
      const spec = debris[index];
      chunk.rotation.x += spec.spin * delta;
      chunk.rotation.y += spec.spin * 0.7 * delta;
      chunk.position.y = spec.position[1] + Math.sin(time * 0.4 + spec.phase) * 0.3;
    });
  });

  return (
    <group>
      {SATELLITES.map((spec, i) => (
        <Satellite key={`satellite-${i}`} spec={spec} materials={materials} />
      ))}

      {/* Sky bridges: citadel plaza → nearest satellites */}
      <Bridge from={[0.4, 0.4, -18.6]} to={[-5.3, 1.4, -19.8]} materials={materials} />
      <Bridge from={[8.7, 0.1, -19.4]} to={[10.2, -1.4, -22.8]} materials={materials} />

      {/* Distant skyline — fog does the painting */}
      {DISTANT.map((island, i) => (
        <group key={`distant-${i}`} position={island.position} scale={island.scale}>
          <mesh material={materials.rock} position={[0, -1.2, 0]}>
            <cylinderGeometry args={[1.6, 0.2, 2.2, 7]} />
          </mesh>
          <mesh material={materials.marbleDim} position={[0, 0, 0]}>
            <cylinderGeometry args={[1.7, 1.55, 0.4, 10]} />
          </mesh>
          <mesh material={materials.marbleDim} position={[0.3, 0.9, -0.2]}>
            <cylinderGeometry args={[0.35, 0.5, 1.6, 7]} />
          </mesh>
        </group>
      ))}

      <Airship seed={7} altitude={4.5} depth={-26} speed={0.7} materials={materials} />
      <Airship seed={19} altitude={7} depth={-34} speed={-0.5} materials={materials} />
      <Airship seed={31} altitude={2.2} depth={-22} speed={0.4} materials={materials} />

      {/* Floating rock debris near the citadel */}
      <group ref={debrisRef}>
        {debris.map((chunk, i) => (
          <mesh
            key={`debris-${i}`}
            material={materials.rock}
            position={chunk.position}
            scale={chunk.scale}
          >
            <dodecahedronGeometry args={[1, 0]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
