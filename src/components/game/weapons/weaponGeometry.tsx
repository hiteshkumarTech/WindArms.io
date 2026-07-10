'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { ChassisKind, WeaponModuleKind } from '@shared/weapons';
import { useVariedBoxGeometries } from '@/lib/three/variedGeometry';

export const noRaycast = () => null;

/** 'reduced' is the third-person budget (HeroRig, ×8 players) — fewer meshes, no self-driven animation. */
export type GeometryFidelity = 'full' | 'reduced';

/**
 * The PBR material vocabulary every weapon draws from. Built once per
 * weapon-viewmodel instance (or once per HeroRig, shared across all remote
 * players) and passed down — `ModuleGeometry`/`ChassisGeometry` never
 * construct their own materials, so instance/dispose bookkeeping stays with
 * the caller.
 */
export interface WeaponSurfaceMaterials {
  /** Receiver shell — the "painted steel" base coat. */
  body: THREE.MeshStandardMaterial;
  /** Machined barrel/attachment steel — cooler tint, sharper specular. */
  metal: THREE.MeshStandardMaterial;
  /** Matte polymer — magazines/grips/stocks. */
  polymer: THREE.MeshStandardMaterial;
  /** Woven carbon-fiber composite — modern handguards/modern stocks. */
  carbon: THREE.MeshStandardMaterial;
  /** Coated ceramic/ceramic-look ring — scope mounts, chokes, energy housings. Typed as the
   * common base (not MeshPhysicalMaterial) so a plain MeshStandardMaterial also satisfies it —
   * HeroRig's reduced-fidelity third-person weapon reuses its own shared materials here. */
  ceramic: THREE.MeshStandardMaterial;
  /** Emissive accent — energy/tech trim, always self-lit. Same relaxed typing as `ceramic`. */
  accent: THREE.MeshStandardMaterial;
}

/** Barrel profile: base collar -> shoulder -> run -> relief -> crowned muzzle lip. Revolved around Y, then laid onto Z by the caller's rotation. */
function buildBarrelProfile(radius: number, length: number): THREE.Vector2[] {
  const r = radius;
  return [
    new THREE.Vector2(r * 1.28, 0),
    new THREE.Vector2(r * 1.05, length * 0.07),
    new THREE.Vector2(r, length * 0.07),
    new THREE.Vector2(r, length * 0.8),
    new THREE.Vector2(r * 0.88, length * 0.8),
    new THREE.Vector2(r * 0.88, length * 0.93),
    new THREE.Vector2(r * 1.15, length * 0.93),
    new THREE.Vector2(r * 1.15, length * 0.98),
    new THREE.Vector2(r * 0.82, length),
  ];
}

/**
 * Builds the primitive geometry for one attachment kind. Position/rotation/
 * scale are applied by the caller's wrapping `<group>` — this only returns
 * the kind's own local-space meshes, so the same builder serves the static
 * module loop, the ammo-feed ref, and the mechanism ref alike.
 */
export function ModuleGeometry({
  kind,
  materials,
  fidelity = 'full',
}: {
  kind: WeaponModuleKind;
  materials: WeaponSurfaceMaterials;
  fidelity?: GeometryFidelity;
}) {
  switch (kind) {
    case 'ironSight':
      return (
        <>
          <mesh material={materials.metal} position={[0, -0.006, 0]} raycast={noRaycast} renderOrder={1000}>
            <boxGeometry args={[0.02, 0.008, 0.018]} />
          </mesh>
          <mesh material={materials.metal} position={[0, 0.014, 0]} raycast={noRaycast} renderOrder={1000}>
            <boxGeometry args={[0.014, 0.035, 0.014]} />
          </mesh>
        </>
      );
    case 'redDot':
      return (
        <>
          <mesh material={materials.metal} position={[0, -0.015, 0]} raycast={noRaycast} renderOrder={1000}>
            <boxGeometry args={[0.02, 0.012, 0.03]} />
          </mesh>
          <mesh material={materials.body} raycast={noRaycast} renderOrder={1000}>
            <boxGeometry args={[0.032, 0.024, 0.05]} />
          </mesh>
          <mesh material={materials.accent} position={[0, 0.014, 0]} raycast={noRaycast} renderOrder={1001}>
            <circleGeometry args={[0.011, 12]} />
          </mesh>
        </>
      );
    case 'scope':
      return (
        <>
          <mesh material={materials.metal} rotation={[Math.PI / 2, 0, 0]} raycast={noRaycast} renderOrder={1000}>
            <cylinderGeometry args={[0.017, 0.017, 0.16, 12]} />
          </mesh>
          <mesh
            material={materials.metal}
            position={[0, 0, -0.083]}
            rotation={[Math.PI / 2, 0, 0]}
            raycast={noRaycast}
            renderOrder={1000}
          >
            <cylinderGeometry args={[0.022, 0.017, 0.024, 12]} />
          </mesh>
          <mesh
            material={materials.accent}
            position={[0, 0, -0.097]}
            rotation={[Math.PI / 2, 0, 0]}
            raycast={noRaycast}
            renderOrder={1001}
          >
            <cylinderGeometry args={[0.0175, 0.0175, 0.006, 12]} />
          </mesh>
          <mesh
            material={materials.accent}
            position={[0, 0, 0.081]}
            rotation={[Math.PI / 2, 0, 0]}
            raycast={noRaycast}
            renderOrder={1001}
          >
            <cylinderGeometry args={[0.0175, 0.0175, 0.006, 12]} />
          </mesh>
          <mesh material={materials.metal} position={[0, 0.021, 0]} raycast={noRaycast} renderOrder={1000}>
            <cylinderGeometry args={[0.009, 0.009, 0.016, 8]} />
          </mesh>
          <mesh
            material={materials.ceramic}
            position={[0, -0.017, -0.045]}
            rotation={[Math.PI / 2, 0, 0]}
            raycast={noRaycast}
            renderOrder={1000}
          >
            <torusGeometry args={[0.018, 0.004, 6, 10]} />
          </mesh>
          <mesh
            material={materials.ceramic}
            position={[0, -0.017, 0.045]}
            rotation={[Math.PI / 2, 0, 0]}
            raycast={noRaycast}
            renderOrder={1000}
          >
            <torusGeometry args={[0.018, 0.004, 6, 10]} />
          </mesh>
        </>
      );
    case 'stickMag':
      return (
        <>
          <mesh material={materials.polymer} raycast={noRaycast} renderOrder={1000}>
            <boxGeometry args={[0.05, 0.16, 0.06]} />
          </mesh>
          {/* Witness-window trim */}
          <mesh material={materials.metal} position={[0, 0.02, 0.031]} raycast={noRaycast} renderOrder={1000}>
            <boxGeometry args={[0.03, 0.05, 0.002]} />
          </mesh>
          {/* Tapered floor plate */}
          <mesh material={materials.metal} position={[0, -0.085, 0]} raycast={noRaycast} renderOrder={1000}>
            <boxGeometry args={[0.058, 0.014, 0.068]} />
          </mesh>
        </>
      );
    case 'drumMag':
      return (
        <>
          <mesh material={materials.polymer} rotation={[Math.PI / 2, 0, 0]} raycast={noRaycast} renderOrder={1000}>
            <cylinderGeometry args={[0.07, 0.07, 0.08, 16]} />
          </mesh>
          <mesh material={materials.metal} position={[0, 0, 0.043]} rotation={[Math.PI / 2, 0, 0]} raycast={noRaycast} renderOrder={1000}>
            <torusGeometry args={[0.07, 0.006, 6, 16]} />
          </mesh>
          <mesh material={materials.metal} position={[0, -0.048, 0]} rotation={[Math.PI / 2, 0, 0]} raycast={noRaycast} renderOrder={1000}>
            <cylinderGeometry args={[0.024, 0.024, 0.012, 12]} />
          </mesh>
        </>
      );
    case 'tube':
      return (
        <>
          <mesh material={materials.metal} rotation={[Math.PI / 2, 0, 0]} raycast={noRaycast} renderOrder={1000}>
            <cylinderGeometry args={[0.014, 0.014, 0.28, 10]} />
          </mesh>
          <mesh
            material={materials.carbon}
            position={[0, 0, -0.148]}
            rotation={[Math.PI / 2, 0, 0]}
            raycast={noRaycast}
            renderOrder={1000}
          >
            <cylinderGeometry args={[0.016, 0.016, 0.03, 10]} />
          </mesh>
        </>
      );
    case 'cell':
      return (
        <>
          <mesh material={materials.accent} raycast={noRaycast} renderOrder={1001}>
            <boxGeometry args={[0.045, 0.05, 0.07]} />
          </mesh>
          <mesh material={materials.ceramic} position={[0, 0, 0.037]} raycast={noRaycast} renderOrder={1000}>
            <boxGeometry args={[0.05, 0.055, 0.006]} />
          </mesh>
        </>
      );
    case 'foldingStock':
      return (
        <>
          <mesh
            material={materials.metal}
            position={[0.015, 0, 0]}
            rotation={[Math.PI / 2, 0, 0]}
            raycast={noRaycast}
            renderOrder={1000}
          >
            <cylinderGeometry args={[0.006, 0.006, 0.16, 6]} />
          </mesh>
          <mesh
            material={materials.metal}
            position={[-0.015, 0, 0]}
            rotation={[Math.PI / 2, 0, 0]}
            raycast={noRaycast}
            renderOrder={1000}
          >
            <cylinderGeometry args={[0.006, 0.006, 0.16, 6]} />
          </mesh>
          <mesh material={materials.polymer} position={[0, 0, 0.08]} raycast={noRaycast} renderOrder={1000}>
            <boxGeometry args={[0.05, 0.06, 0.015]} />
          </mesh>
          <mesh material={materials.carbon} position={[0, -0.032, 0.08]} raycast={noRaycast} renderOrder={1000}>
            <boxGeometry args={[0.05, 0.012, 0.017]} />
          </mesh>
        </>
      );
    case 'soloStock':
      return (
        <>
          <mesh material={materials.carbon} raycast={noRaycast} renderOrder={1000}>
            <boxGeometry args={[0.05, 0.08, 0.18]} />
          </mesh>
          <mesh material={materials.polymer} position={[0, -0.01, 0.078]} raycast={noRaycast} renderOrder={1000}>
            <boxGeometry args={[0.054, 0.058, 0.03]} />
          </mesh>
        </>
      );
    case 'cheekRest':
      return (
        <>
          <mesh material={materials.carbon} raycast={noRaycast} renderOrder={1000}>
            <boxGeometry args={[0.045, 0.07, 0.26]} />
          </mesh>
          <mesh material={materials.ceramic} position={[0, 0.045, -0.05]} raycast={noRaycast} renderOrder={1000}>
            <boxGeometry args={[0.04, 0.03, 0.1]} />
          </mesh>
          <mesh material={materials.metal} position={[0, -0.008, 0.115]} raycast={noRaycast} renderOrder={1000}>
            <boxGeometry args={[0.048, 0.05, 0.02]} />
          </mesh>
        </>
      );
    case 'bipod':
      return (
        <>
          <mesh
            material={materials.metal}
            position={[0.05, -0.08, 0]}
            rotation={[0, 0, 0.5]}
            raycast={noRaycast}
            renderOrder={1000}
          >
            <cylinderGeometry args={[0.006, 0.006, 0.16, 6]} />
          </mesh>
          <mesh
            material={materials.metal}
            position={[-0.05, -0.08, 0]}
            rotation={[0, 0, -0.5]}
            raycast={noRaycast}
            renderOrder={1000}
          >
            <cylinderGeometry args={[0.006, 0.006, 0.16, 6]} />
          </mesh>
          <mesh material={materials.metal} position={[0, 0.01, 0]} raycast={noRaycast} renderOrder={1000}>
            <boxGeometry args={[0.024, 0.02, 0.03]} />
          </mesh>
        </>
      );
    case 'railHandguard':
      return (
        <>
          <mesh material={materials.carbon} raycast={noRaycast} renderOrder={1000}>
            <boxGeometry args={[0.05, 0.05, 0.24]} />
          </mesh>
          {[0, 1, 2].map((i) => (
            <mesh
              key={`top-${i}`}
              material={materials.metal}
              position={[0, 0.028, -0.08 + i * 0.08]}
              raycast={noRaycast}
              renderOrder={1000}
            >
              <boxGeometry args={[0.052, 0.006, 0.02]} />
            </mesh>
          ))}
          {[0, 1].map((i) => (
            <mesh
              key={`side-${i}`}
              material={materials.metal}
              position={[0.027, 0, -0.05 + i * 0.1]}
              raycast={noRaycast}
              renderOrder={1000}
            >
              <boxGeometry args={[0.006, 0.036, 0.016]} />
            </mesh>
          ))}
          <mesh material={materials.metal} position={[0, 0, -0.121]} raycast={noRaycast} renderOrder={1000}>
            <boxGeometry args={[0.054, 0.054, 0.006]} />
          </mesh>
        </>
      );
    case 'barrelShroud':
      return (
        <>
          {[0, 1, 2, 3, 4].map((i) => (
            <mesh
              key={i}
              material={materials.metal}
              position={[0, 0, -i * 0.055]}
              rotation={[Math.PI / 2, 0, 0]}
              raycast={noRaycast}
              renderOrder={1000}
            >
              <torusGeometry args={[0.024, 0.004, 6, 10]} />
            </mesh>
          ))}
          <mesh material={materials.carbon} position={[0, 0, -0.11]} rotation={[Math.PI / 2, 0, 0]} raycast={noRaycast} renderOrder={1000}>
            <cylinderGeometry args={[0.02, 0.02, 0.22, 12]} />
          </mesh>
        </>
      );
    case 'compensator':
      return (
        <>
          <mesh material={materials.metal} rotation={[Math.PI / 2, 0, 0]} raycast={noRaycast} renderOrder={1000}>
            <cylinderGeometry args={[0.02, 0.019, 0.02, 8]} />
          </mesh>
          <mesh material={materials.metal} position={[0, 0, -0.017]} rotation={[Math.PI / 2, 0, 0]} raycast={noRaycast} renderOrder={1000}>
            <cylinderGeometry args={[0.019, 0.017, 0.018, 8]} />
          </mesh>
          <mesh material={materials.ceramic} position={[0, 0, -0.028]} rotation={[Math.PI / 2, 0, 0]} raycast={noRaycast} renderOrder={1000}>
            <cylinderGeometry args={[0.017, 0.015, 0.016, 8]} />
          </mesh>
        </>
      );
    case 'choke':
      return (
        <>
          <mesh material={materials.metal} rotation={[Math.PI / 2, 0, 0]} raycast={noRaycast} renderOrder={1000}>
            <coneGeometry args={[0.032, 0.05, 10]} />
          </mesh>
          <mesh material={materials.ceramic} position={[0, 0, 0.022]} rotation={[Math.PI / 2, 0, 0]} raycast={noRaycast} renderOrder={1000}>
            <torusGeometry args={[0.031, 0.005, 6, 10]} />
          </mesh>
        </>
      );
    case 'crystalCore':
      return (
        <>
          <mesh material={materials.accent} raycast={noRaycast} renderOrder={1001}>
            <icosahedronGeometry args={[0.035, 0]} />
          </mesh>
          {fidelity === 'full' ? <CrystalShell materials={materials} /> : null}
        </>
      );
    case 'coil':
      return (
        <>
          <mesh material={materials.accent} rotation={[Math.PI / 2, 0, 0]} raycast={noRaycast} renderOrder={1001}>
            <torusGeometry args={[0.022, 0.005, 8, 12]} />
          </mesh>
          {fidelity === 'full' ? <CoilInner materials={materials} /> : null}
        </>
      );
    case 'ventFin':
      return (
        <>
          <mesh material={materials.body} raycast={noRaycast} renderOrder={1000}>
            <boxGeometry args={[0.008, 0.02, 0.06]} />
          </mesh>
          <mesh material={materials.accent} position={[0, 0, 0.026]} raycast={noRaycast} renderOrder={1001}>
            <boxGeometry args={[0.009, 0.006, 0.006]} />
          </mesh>
        </>
      );
    case 'boltHandle':
      return (
        <>
          <mesh material={materials.metal} raycast={noRaycast} renderOrder={1000}>
            <boxGeometry args={[0.045, 0.012, 0.016]} />
          </mesh>
          <mesh material={materials.metal} position={[0.026, 0, 0]} raycast={noRaycast} renderOrder={1000}>
            <cylinderGeometry args={[0.011, 0.011, 0.014, 8]} />
          </mesh>
        </>
      );
  }
}

/**
 * Self-contained slow rotation for the crystal core's outer housing —
 * mounted at full fidelity only, so this frame subscription never runs for
 * the ×8-multiplied third-person view. "Moving energy components" from the
 * brief, without needing a bus signal or WeaponViewmodel plumbing.
 */
function CrystalShell({ materials }: { materials: WeaponSurfaceMaterials }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.6;
  });
  return (
    <mesh ref={ref} material={materials.ceramic} raycast={noRaycast} renderOrder={1000} scale={1.35}>
      <icosahedronGeometry args={[0.035, 0]} />
    </mesh>
  );
}

/** Second, smaller counter-wound torus, slowly spinning for visual depth inside the coil housing — full fidelity only. */
function CoilInner({ materials }: { materials: WeaponSurfaceMaterials }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.z += delta * 1.1;
  });
  return (
    <mesh
      ref={ref}
      material={materials.accent}
      rotation={[Math.PI / 2, 0, Math.PI / 4]}
      raycast={noRaycast}
      renderOrder={1001}
      scale={0.6}
    >
      <torusGeometry args={[0.022, 0.004, 8, 12]} />
    </mesh>
  );
}

interface ChassisTrimProps {
  chassis: ChassisKind;
  bulk: number;
  length: number;
  materials: WeaponSurfaceMaterials;
}

/** Per-weapon-class flourishes layered onto the generic chassis so silhouettes stop reading as "same box, different attachments." Full fidelity only. */
function ChassisTrim({ chassis, bulk, length, materials }: ChassisTrimProps) {
  const w = 0.075 * bulk;
  const h = 0.095 * bulk;
  switch (chassis) {
    case 'sidearm':
      return (
        <mesh material={materials.polymer} position={[w * 0.42, h * 0.42, -length * 0.28]} raycast={noRaycast} renderOrder={1000}>
          <boxGeometry args={[0.006, h * 0.22, length * 0.34]} />
        </mesh>
      );
    case 'compact':
      return (
        <>
          {[0, 1].map((i) => (
            <mesh
              key={i}
              material={materials.metal}
              position={[w * 0.47, -h * 0.05, -length * (0.3 + i * 0.16)]}
              raycast={noRaycast}
              renderOrder={1000}
            >
              <boxGeometry args={[0.006, h * 0.28, length * 0.06]} />
            </mesh>
          ))}
        </>
      );
    case 'balanced':
      return (
        <>
          <mesh material={materials.metal} position={[0, h * 0.62, -length * 0.4]} raycast={noRaycast} renderOrder={1000}>
            <boxGeometry args={[w * 0.4, h * 0.05, length * 0.85]} />
          </mesh>
          <mesh material={materials.carbon} position={[0, h * 0.32, -length * 0.05]} raycast={noRaycast} renderOrder={1000}>
            <boxGeometry args={[w * 0.7, h * 0.05, length * 0.12]} />
          </mesh>
        </>
      );
    case 'heavy':
      return (
        <>
          <mesh material={materials.metal} position={[0, 0, -length * 1.01]} rotation={[Math.PI / 2, 0, 0]} raycast={noRaycast} renderOrder={1000}>
            <torusGeometry args={[w * 0.46, 0.006, 6, 14]} />
          </mesh>
          <mesh material={materials.ceramic} position={[0, -h * 0.25, -length * 0.62]} raycast={noRaycast} renderOrder={1000}>
            <boxGeometry args={[w * 0.5, h * 0.16, length * 0.5]} />
          </mesh>
        </>
      );
    case 'precision':
      return (
        <>
          <mesh material={materials.metal} position={[0, h * 0.6, -length * 0.42]} raycast={noRaycast} renderOrder={1000}>
            <boxGeometry args={[w * 0.32, h * 0.08, length * 0.7]} />
          </mesh>
          {[0.55, -0.55].map((s, i) => (
            <mesh
              key={i}
              material={materials.metal}
              position={[w * 0.5 * s, 0, -length * 1.15]}
              raycast={noRaycast}
              renderOrder={1000}
            >
              <boxGeometry args={[0.005, h * 0.18, length * 0.3]} />
            </mesh>
          ))}
        </>
      );
    case 'support':
      return (
        <>
          <mesh material={materials.metal} position={[0, h * 0.85, -length * 0.35]} rotation={[Math.PI / 2, 0, 0]} raycast={noRaycast} renderOrder={1000}>
            <torusGeometry args={[h * 0.5, 0.008, 6, 12, Math.PI]} />
          </mesh>
          <mesh material={materials.carbon} position={[w * 0.48, -h * 0.1, -length * 0.15]} raycast={noRaycast} renderOrder={1000}>
            <boxGeometry args={[0.014, h * 0.2, length * 0.4]} />
          </mesh>
        </>
      );
    case 'sci-fi':
      return (
        <>
          <mesh material={materials.accent} position={[0, 0, -length * 0.5]} rotation={[Math.PI / 2, 0, 0]} raycast={noRaycast} renderOrder={1001}>
            <torusGeometry args={[w * 0.5, 0.004, 6, 16]} />
          </mesh>
          <mesh material={materials.ceramic} position={[0, 0, -length * 1.0]} raycast={noRaycast} renderOrder={1000}>
            <cylinderGeometry args={[w * 0.42, w * 0.3, h * 0.5, 10]} />
          </mesh>
        </>
      );
  }
}

export interface ChassisGeometryProps {
  chassis: ChassisKind;
  bulk: number;
  length: number;
  barrelLength: number;
  barrelRadius: number;
  gripRake: number;
  materials: WeaponSurfaceMaterials;
  fidelity?: GeometryFidelity;
  /** Stable per-weapon seed so vertex-jitter wear doesn't flicker across remounts. */
  seed: number;
}

/**
 * The shared receiver/barrel/grip chassis every weapon builds on — layered
 * (lower + upper receiver, front collar, lathed barrel, grip) instead of one
 * flat slab, then dressed with a `ChassisKind`-specific trim pass at full
 * fidelity. `'reduced'` fidelity (HeroRig, third person, ×8 players) renders
 * only the core volumes with no trim and no vertex-jitter wear.
 */
export function ChassisGeometry({
  chassis,
  bulk,
  length,
  barrelLength,
  barrelRadius,
  gripRake,
  materials,
  fidelity = 'full',
  seed,
}: ChassisGeometryProps) {
  const full = fidelity === 'full';
  const w = 0.075 * bulk;
  const h = 0.095 * bulk;

  const barrelPoints = useMemo(() => buildBarrelProfile(barrelRadius, barrelLength), [barrelRadius, barrelLength]);

  const jittered = useVariedBoxGeometries(
    full
      ? [
          { size: [w * 0.92, h * 0.78, length] },
          { size: [w * 0.78, h * 0.34, length * 0.92] },
          { size: [w * 0.6, 0.11, 0.05] },
        ]
      : [],
    seed,
  );

  // The jittered geometries above bake a per-vertex `color` attribute that
  // only does anything when the material's `vertexColors` flag is on — but
  // `materials.body`/`metal`/`polymer` are shared with many other meshes
  // (modules, trim) that have no such attribute, so flipping the flag on
  // those shared instances would leave the *other* meshes reading an unbound
  // attribute (typically rendering black). Clone just for the 3 jittered
  // surfaces instead of touching the caller's shared materials.
  const wornMaterials = useMemo(() => {
    if (!full) return null;
    const body = materials.body.clone();
    body.vertexColors = true;
    const metal = materials.metal.clone();
    metal.vertexColors = true;
    const polymer = materials.polymer.clone();
    polymer.vertexColors = true;
    return { body, metal, polymer };
  }, [full, materials.body, materials.metal, materials.polymer]);

  useEffect(() => {
    if (!wornMaterials) return;
    return () => {
      wornMaterials.body.dispose();
      wornMaterials.metal.dispose();
      wornMaterials.polymer.dispose();
    };
  }, [wornMaterials]);

  return (
    <>
      {/* Lower receiver */}
      <mesh
        material={full && wornMaterials ? wornMaterials.body : materials.body}
        raycast={noRaycast}
        renderOrder={1000}
        position={[0, 0, -length / 2]}
        {...(full ? { geometry: jittered[0] } : {})}
      >
        {full ? null : <boxGeometry args={[w * 0.92, h * 0.78, length]} />}
      </mesh>
      {/* Upper receiver / slide-top */}
      <mesh
        material={full && wornMaterials ? wornMaterials.metal : materials.metal}
        raycast={noRaycast}
        renderOrder={1000}
        position={[0, h * 0.5, -length * 0.5]}
        {...(full ? { geometry: jittered[1] } : {})}
      >
        {full ? null : <boxGeometry args={[w * 0.78, h * 0.34, length * 0.92]} />}
      </mesh>
      {/* Front collar bridging receiver to barrel */}
      <mesh material={materials.metal} raycast={noRaycast} renderOrder={1000} position={[0, 0.012, -length - length * 0.02]}>
        <boxGeometry args={[w * 0.5, h * 0.55, length * 0.06]} />
      </mesh>
      {/* Barrel — lathed profile instead of a flat cylinder. Local +Y (base -> muzzle
          in the profile) must map to world -Z (muzzle is further from the receiver),
          which needs a -90 deg (not +90 deg) X rotation. */}
      <mesh
        material={materials.metal}
        raycast={noRaycast}
        renderOrder={1000}
        position={[0, 0.012, -length]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <latheGeometry args={[barrelPoints, 12]} />
      </mesh>
      {/* Grip */}
      <mesh
        material={full && wornMaterials ? wornMaterials.polymer : materials.polymer}
        raycast={noRaycast}
        renderOrder={1000}
        position={[0, -0.08, -0.06]}
        rotation={[gripRake, 0, 0]}
        {...(full ? { geometry: jittered[2] } : {})}
      >
        {full ? null : <boxGeometry args={[w * 0.6, 0.11, 0.05]} />}
      </mesh>
      {/* Per-class trim renders at both fidelities — it's 1-3 cheap meshes that carry most of
          the "which weapon is this" read, so it stays in the reduced (third-person, x8-player)
          budget; only the vertex-jitter wear (a per-player memory cost, not a draw-call one)
          and the attached-module/mechanism-ref animation are full-fidelity-only. */}
      <ChassisTrim chassis={chassis} bulk={bulk} length={length} materials={materials} />
    </>
  );
}
