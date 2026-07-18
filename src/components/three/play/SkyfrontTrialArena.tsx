'use client';

import { useEffect, useMemo } from 'react';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import { STORM } from '@/lib/v2/tokens';
import { BOUNDARY_WALLS, COVERS, MAIN_DECK, SIDE_PLATFORMS, STAIRS } from '@/lib/v2/play/spawnConfig';
import type { ArenaBox } from '@/lib/v2/play/types';

/**
 * Skyfront Trial arena — a PROCEDURAL GAMEPLAY BLOCKOUT in the WindArms
 * visual identity (marble decks, titanium under-structure, gold trim, cyan
 * energy channels, open sky), explicitly NOT final map art. Every walkable/
 * blocking box comes from spawnConfig.ts (the same data drones use for LOS
 * and bolts use for collision), so visuals, physics, sight and projectiles
 * can never disagree. Built as modular pieces (Deck / Platform / Cover /
 * Rail / backdrop) so a future professional Skyfront map GLB replaces this
 * component without touching the match loop.
 */
interface ArenaMaterials {
  marble: THREE.MeshStandardMaterial;
  titanium: THREE.MeshStandardMaterial;
  gold: THREE.MeshStandardMaterial;
  energy: THREE.MeshStandardMaterial;
  cloud: THREE.MeshStandardMaterial;
}

function createMaterials(): ArenaMaterials {
  return {
    marble: new THREE.MeshStandardMaterial({ color: '#E9E5DB', metalness: 0.18, roughness: 0.55 }),
    titanium: new THREE.MeshStandardMaterial({ color: '#232c3c', metalness: 0.85, roughness: 0.42 }),
    gold: new THREE.MeshStandardMaterial({ color: STORM.gold, metalness: 0.95, roughness: 0.24 }),
    energy: new THREE.MeshStandardMaterial({
      color: '#06222f',
      emissive: new THREE.Color(STORM.energy),
      emissiveIntensity: 1.7,
      toneMapped: false,
    }),
    cloud: new THREE.MeshStandardMaterial({ color: '#dfe9f2', roughness: 1, metalness: 0, transparent: true, opacity: 0.85 }),
  };
}

/** One box from spawnConfig rendered as beveled marble with a titanium underside — visual matches collider exactly. */
function BlockVisual({ box, material, radius = 0.06 }: { box: ArenaBox; material: THREE.Material; radius?: number }) {
  return (
    <RoundedBox args={box.size} radius={Math.min(radius, Math.min(...box.size) / 4)} smoothness={2} material={material} position={box.center} castShadow receiveShadow />
  );
}

export default function SkyfrontTrialArena() {
  const materials = useMemo(createMaterials, []);
  useEffect(
    () => () => {
      Object.values(materials).forEach((material) => material.dispose());
    },
    [materials],
  );

  return (
    <group name="skyfront_trial_arena">
      {/* ── Physics: one fixed body, colliders straight from spawnConfig ── */}
      <RigidBody type="fixed" colliders={false}>
        {[MAIN_DECK, ...SIDE_PLATFORMS, ...STAIRS, ...COVERS, ...BOUNDARY_WALLS].map((box, index) => (
          <CuboidCollider key={`col-${index}`} args={[box.size[0] / 2, box.size[1] / 2, box.size[2] / 2]} position={box.center} />
        ))}
      </RigidBody>

      {/* ── Main deck: marble top, titanium hull, gold rim, energy channels ── */}
      <BlockVisual box={MAIN_DECK} material={materials.marble} radius={0.12} />
      <mesh material={materials.titanium} position={[0, -2.6, 0]} castShadow>
        <cylinderGeometry args={[10.5, 5.5, 2.4, 10]} />
      </mesh>
      <mesh material={materials.gold} position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[15.4, 15.9, 64]} />
      </mesh>
      {/* Cyan energy channels crossing the deck (flush strips) */}
      {[-4, 4].map((x) => (
        <mesh key={`chan-${x}`} material={materials.energy} position={[x, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.22, 30]} />
        </mesh>
      ))}
      <mesh material={materials.energy} position={[0, 0.015, -12]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[26, 0.22]} />
      </mesh>

      {/* ── Side platforms + stairs (marble, gold edge fascia) ── */}
      {SIDE_PLATFORMS.map((box, index) => (
        <group key={`plat-${index}`}>
          <BlockVisual box={box} material={materials.marble} radius={0.1} />
          <mesh material={materials.gold} position={[box.center[0], box.center[1] + box.size[1] / 2 + 0.015, box.center[2]]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[Math.min(box.size[0], box.size[2]) / 2 - 0.7, Math.min(box.size[0], box.size[2]) / 2 - 0.45, 40]} />
          </mesh>
          {/* Titanium support pylon down into the clouds */}
          <mesh material={materials.titanium} position={[box.center[0], box.center[1] - 4.2, box.center[2]]} castShadow>
            <cylinderGeometry args={[0.9, 1.4, 7, 8]} />
          </mesh>
        </group>
      ))}
      {STAIRS.map((box, index) => (
        <BlockVisual key={`stair-${index}`} box={box} material={materials.marble} radius={0.05} />
      ))}

      {/* ── Cover blocks: marble bodies, titanium caps ── */}
      {COVERS.map((box, index) => (
        <group key={`cover-${index}`}>
          <BlockVisual box={box} material={materials.marble} />
          <RoundedBox
            args={[box.size[0] * 0.9, 0.12, box.size[2] * 0.9]}
            radius={0.03}
            smoothness={2}
            material={materials.titanium}
            position={[box.center[0], box.center[1] + box.size[1] / 2 + 0.06, box.center[2]]}
            castShadow
          />
        </group>
      ))}

      {/* ── Perimeter rails (visual edge language for the invisible walls) ── */}
      {[-16.9, 16.9].map((z) => (
        <RoundedBox key={`rail-z-${z}`} args={[34, 0.18, 0.18]} radius={0.05} smoothness={2} material={materials.gold} position={[0, 1.05, z]} />
      ))}
      {[-16.9, 16.9].map((x) => (
        <RoundedBox key={`rail-x-${x}`} args={[0.18, 0.18, 34]} radius={0.05} smoothness={2} material={materials.gold} position={[x, 1.05, 0]} />
      ))}
      {Array.from({ length: 12 }, (_, i) => {
        const angle = (i / 12) * Math.PI * 2;
        const x = Math.cos(angle) * 16.9;
        const z = Math.sin(angle) * 16.9;
        return Math.abs(x) < 16 && Math.abs(z) < 16 ? null : (
          <mesh key={`post-${i}`} material={materials.titanium} position={[Math.max(-16.9, Math.min(16.9, x)), 0.5, Math.max(-16.9, Math.min(16.9, z))]} castShadow>
            <cylinderGeometry args={[0.09, 0.11, 1.1, 8]} />
          </mesh>
        );
      })}

      {/* ── Distant Skyfront dressing: floating slabs + cloud decks (non-colliding, far outside play space) ── */}
      {[
        { pos: [-42, -3, -38] as const, size: [10, 2.5, 8] as const },
        { pos: [40, 2, -46] as const, size: [12, 3, 9] as const },
        { pos: [8, 8, -60] as const, size: [16, 4, 12] as const },
        { pos: [-30, 6, -55] as const, size: [8, 2, 7] as const },
      ].map((slab, index) => (
        <group key={`isle-${index}`} position={slab.pos as unknown as [number, number, number]}>
          <RoundedBox args={slab.size as unknown as [number, number, number]} radius={0.4} smoothness={2} material={materials.marble} />
          <mesh material={materials.titanium} position={[0, -slab.size[1], 0]}>
            <coneGeometry args={[slab.size[0] * 0.35, slab.size[1] * 2, 7]} />
          </mesh>
        </group>
      ))}
      {[
        [-25, -6, 20, 14],
        [30, -8, 5, 18],
        [0, -10, -35, 26],
        [45, -5, -15, 12],
      ].map(([x, y, z, s], index) => (
        <mesh key={`cloud-${index}`} material={materials.cloud} position={[x, y, z]} scale={[s, s * 0.28, s * 0.8]}>
          <sphereGeometry args={[1, 12, 10]} />
        </mesh>
      ))}
    </group>
  );
}
