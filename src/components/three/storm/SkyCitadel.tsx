'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { STORM } from '@/lib/v2/tokens';

export interface CitadelMaterials {
  rock: THREE.MeshStandardMaterial;
  marble: THREE.MeshStandardMaterial;
  marbleDim: THREE.MeshStandardMaterial;
  gold: THREE.MeshStandardMaterial;
  energy: THREE.MeshStandardMaterial;
}

export function createCitadelMaterials(): CitadelMaterials {
  return {
    rock: new THREE.MeshStandardMaterial({ color: STORM.slate, roughness: 0.95, metalness: 0.05 }),
    marble: new THREE.MeshStandardMaterial({ color: STORM.marble, roughness: 0.5, metalness: 0.08 }),
    marbleDim: new THREE.MeshStandardMaterial({ color: STORM.mist, roughness: 0.65, metalness: 0.06 }),
    gold: new THREE.MeshStandardMaterial({ color: STORM.gold, roughness: 0.25, metalness: 0.92 }),
    energy: new THREE.MeshStandardMaterial({
      color: '#0a2a3c',
      emissive: new THREE.Color(STORM.energy),
      emissiveIntensity: 2.4,
      toneMapped: false,
    }),
  };
}

/** Ring of columns + entablature — the temple's repeating motif. */
function Colonnade({
  radius,
  count,
  height,
  y,
  materials,
}: {
  radius: number;
  count: number;
  height: number;
  y: number;
  materials: CitadelMaterials;
}) {
  const columns = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2;
        return [Math.cos(angle) * radius, y + height / 2, Math.sin(angle) * radius] as const;
      }),
    [radius, count, height, y],
  );

  return (
    <group>
      {columns.map((position, i) => (
        <group key={i} position={[position[0], position[1], position[2]]}>
          <mesh material={materials.marble}>
            <cylinderGeometry args={[0.16, 0.19, height, 8]} />
          </mesh>
          {/* Capital + base */}
          <mesh material={materials.marbleDim} position={[0, height / 2 + 0.06, 0]}>
            <cylinderGeometry args={[0.24, 0.18, 0.12, 8]} />
          </mesh>
          <mesh material={materials.marbleDim} position={[0, -height / 2 - 0.05, 0]}>
            <cylinderGeometry args={[0.22, 0.24, 0.1, 8]} />
          </mesh>
        </group>
      ))}
      {/* Entablature ring the columns carry */}
      <mesh material={materials.marble} position={[0, y + height + 0.2, 0]}>
        <cylinderGeometry args={[radius + 0.35, radius + 0.35, 0.28, 24, 1, true]} />
      </mesh>
      <mesh material={materials.gold} position={[0, y + height + 0.38, 0]}>
        <torusGeometry args={[radius + 0.35, 0.05, 8, 40]} />
      </mesh>
    </group>
  );
}

/**
 * THE focal point: the Wind Temple — a tiered marble cathedral on a
 * floating mountain, crowned by the Aeon Ring: a colossal gold ring with
 * a live-spinning six-blade rotor around a storm core. This silhouette
 * IS the WindArms identity; everything else in frame supports it.
 */
export default function SkyCitadel({ reducedMotion }: { reducedMotion: boolean }) {
  const rootRef = useRef<THREE.Group>(null);
  const rotorRef = useRef<THREE.Group>(null);
  const ringGroupRef = useRef<THREE.Group>(null);
  const materials = useMemo(createCitadelMaterials, []);

  useEffect(
    () => () => {
      Object.values(materials).forEach((material) => material.dispose());
    },
    [materials],
  );

  const hangingShards = useMemo(
    () =>
      [
        { position: [2.6, -5.6, 1.2], scale: 0.7 },
        { position: [-2.9, -6.2, -0.8], scale: 0.9 },
        { position: [0.8, -7, -2], scale: 0.55 },
        { position: [-1.2, -6.6, 2.2], scale: 0.6 },
      ] as const,
    [],
  );

  const windowSlits = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => ({
        y: 3.4 + i * 0.75,
        angle: i * 1.1,
      })),
    [],
  );

  useFrame(({ clock }, delta) => {
    if (reducedMotion) return;
    const time = clock.elapsedTime;
    if (rootRef.current) rootRef.current.position.y = Math.sin(time * 0.16) * 0.25;
    if (rotorRef.current) rotorRef.current.rotation.z += delta * 0.22;
    if (ringGroupRef.current) ringGroupRef.current.rotation.y = Math.sin(time * 0.1) * 0.05;
  });

  return (
    <group position={[4.5, 0, -18]}>
      <group ref={rootRef}>
        {/* ── Floating mountain base ─────────────────────────── */}
        <mesh material={materials.rock} position={[0, -3.4, 0]}>
          <cylinderGeometry args={[4.6, 0.5, 5.6, 9]} />
        </mesh>
        <mesh material={materials.rock} position={[1.6, -2.8, 1.1]} rotation={[0.1, 0.7, 0.05]}>
          <cylinderGeometry args={[2.4, 0.3, 4, 7]} />
        </mesh>
        <mesh material={materials.rock} position={[-1.8, -3, -1]} rotation={[-0.08, 1.9, 0.06]}>
          <cylinderGeometry args={[2.1, 0.25, 4.4, 7]} />
        </mesh>
        {hangingShards.map((shard, i) => (
          <mesh
            key={`shard-${i}`}
            material={materials.rock}
            position={[shard.position[0], shard.position[1], shard.position[2]]}
            scale={shard.scale}
            rotation={[0.2, i * 1.3, 0.15]}
          >
            <cylinderGeometry args={[0.7, 0.08, 1.8, 6]} />
          </mesh>
        ))}

        {/* ── Grand plaza tiers ──────────────────────────────── */}
        <mesh material={materials.marble} position={[0, -0.35, 0]}>
          <cylinderGeometry args={[5, 4.7, 0.7, 24]} />
        </mesh>
        <mesh material={materials.gold} position={[0, 0.02, 0]}>
          <torusGeometry args={[5, 0.07, 8, 48]} />
        </mesh>
        <mesh material={materials.marbleDim} position={[0, 0.3, 0]}>
          <cylinderGeometry args={[3.9, 4.1, 0.6, 24]} />
        </mesh>
        {/* Rune glow beneath the plaza rim */}
        <mesh material={materials.energy} position={[0, -0.75, 0]}>
          <torusGeometry args={[4.75, 0.035, 6, 48]} />
        </mesh>

        {/* ── Colonnades ─────────────────────────────────────── */}
        <Colonnade radius={4.25} count={12} height={1.7} y={0.6} materials={materials} />
        <mesh material={materials.marble} position={[0, 2.9, 0]}>
          <cylinderGeometry args={[3, 3.3, 0.5, 20]} />
        </mesh>
        <Colonnade radius={2.55} count={8} height={1.4} y={3.15} materials={materials} />

        {/* ── Corner watch-spires ────────────────────────────── */}
        {[0, 1, 2, 3].map((corner) => {
          const angle = (corner / 4) * Math.PI * 2 + Math.PI / 4;
          const x = Math.cos(angle) * 4.4;
          const z = Math.sin(angle) * 4.4;
          return (
            <group key={`spire-${corner}`} position={[x, 0.6, z]}>
              <mesh material={materials.marble} position={[0, 1.1, 0]}>
                <cylinderGeometry args={[0.28, 0.42, 2.2, 8]} />
              </mesh>
              <mesh material={materials.gold} position={[0, 2.45, 0]}>
                <coneGeometry args={[0.34, 0.7, 8]} />
              </mesh>
              <mesh material={materials.energy} position={[0, 2.95, 0]}>
                <sphereGeometry args={[0.09, 10, 10]} />
              </mesh>
            </group>
          );
        })}

        {/* ── Grand arch facing the camera ───────────────────── */}
        <mesh material={materials.marble} position={[0, 1.3, 4.35]} rotation={[0, 0, 0]}>
          <torusGeometry args={[1.15, 0.2, 8, 20, Math.PI]} />
        </mesh>
        <mesh material={materials.gold} position={[0, 1.3, 4.42]}>
          <torusGeometry args={[1.15, 0.06, 6, 20, Math.PI]} />
        </mesh>

        {/* ── Central spire stack ────────────────────────────── */}
        <mesh material={materials.marble} position={[0, 4.6, 0]}>
          <cylinderGeometry args={[0.95, 1.35, 2.4, 12]} />
        </mesh>
        <mesh material={materials.marbleDim} position={[0, 6.5, 0]}>
          <cylinderGeometry args={[0.6, 0.9, 1.9, 10]} />
        </mesh>
        <mesh material={materials.marble} position={[0, 8.1, 0]}>
          <cylinderGeometry args={[0.34, 0.55, 1.6, 10]} />
        </mesh>
        <mesh material={materials.gold} position={[0, 9.15, 0]}>
          <coneGeometry args={[0.4, 0.9, 10]} />
        </mesh>
        {windowSlits.map((slit, i) => (
          <mesh
            key={`window-${i}`}
            material={materials.energy}
            position={[Math.cos(slit.angle) * 1.05, slit.y, Math.sin(slit.angle) * 1.05]}
            rotation={[0, -slit.angle + Math.PI / 2, 0]}
          >
            <boxGeometry args={[0.06, 0.42, 0.05]} />
          </mesh>
        ))}

        {/* ── Flying buttresses to the spire ─────────────────── */}
        {[0, 1, 2, 3].map((arc) => {
          const angle = (arc / 4) * Math.PI * 2;
          return (
            <mesh
              key={`buttress-${arc}`}
              material={materials.marbleDim}
              position={[Math.cos(angle) * 2.1, 4.1, Math.sin(angle) * 2.1]}
              rotation={[Math.PI / 2, 0, angle + Math.PI / 2]}
            >
              <torusGeometry args={[1.35, 0.11, 6, 12, Math.PI / 2]} />
            </mesh>
          );
        })}

        {/* ── THE AEON RING ──────────────────────────────────── */}
        <group ref={ringGroupRef} position={[0, 8.6, 0]} rotation={[0.14, 0, 0]}>
          <mesh material={materials.gold}>
            <torusGeometry args={[3.3, 0.17, 12, 72]} />
          </mesh>
          <mesh material={materials.marble}>
            <torusGeometry args={[2.72, 0.1, 10, 64]} />
          </mesh>
          {/* Ring pylons anchoring inner to outer */}
          {[0, 1, 2, 3].map((pylon) => {
            const angle = (pylon / 4) * Math.PI * 2;
            return (
              <mesh
                key={`pylon-${pylon}`}
                material={materials.gold}
                position={[Math.cos(angle) * 3, Math.sin(angle) * 3, 0]}
                rotation={[0, 0, angle]}
              >
                <boxGeometry args={[0.62, 0.14, 0.14]} />
              </mesh>
            );
          })}
          {/* Live rotor */}
          <group ref={rotorRef}>
            {[0, 1, 2, 3, 4, 5].map((blade) => (
              <mesh
                key={`rotor-${blade}`}
                material={materials.marbleDim}
                position={[
                  Math.cos((blade / 6) * Math.PI * 2) * 1.32,
                  Math.sin((blade / 6) * Math.PI * 2) * 1.32,
                  0,
                ]}
                rotation={[0, 0, (blade / 6) * Math.PI * 2 + Math.PI / 2]}
              >
                <boxGeometry args={[0.16, 2.3, 0.07]} />
              </mesh>
            ))}
            <mesh material={materials.gold}>
              <torusGeometry args={[1.32, 0.06, 8, 40]} />
            </mesh>
            <mesh material={materials.energy}>
              <sphereGeometry args={[0.42, 18, 18]} />
            </mesh>
          </group>
          {/* Storm-core light — warm heart of the frame */}
          <pointLight color={STORM.energy} intensity={16} distance={16} decay={2} />
        </group>
      </group>
    </group>
  );
}
