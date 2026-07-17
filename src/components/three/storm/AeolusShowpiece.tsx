'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';
import WeaponShowpiece from '@/components/three/weapons/WeaponShowpiece';
import { STORM } from '@/lib/v2/tokens';
import { scrollState } from '@/lib/v2/scrollProgress';

interface RifleMaterials {
  ivory: THREE.MeshStandardMaterial;
  steel: THREE.MeshStandardMaterial;
  gunmetal: THREE.MeshStandardMaterial;
  gold: THREE.MeshStandardMaterial;
  energy: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
}

function createMaterials(): RifleMaterials {
  return {
    ivory: new THREE.MeshStandardMaterial({ color: '#E9E5DB', metalness: 0.35, roughness: 0.38 }),
    steel: new THREE.MeshStandardMaterial({ color: STORM.slate, metalness: 0.85, roughness: 0.35 }),
    gunmetal: new THREE.MeshStandardMaterial({ color: '#20293a', metalness: 0.8, roughness: 0.5 }),
    gold: new THREE.MeshStandardMaterial({ color: STORM.gold, metalness: 0.95, roughness: 0.22 }),
    energy: new THREE.MeshStandardMaterial({
      color: '#04202f',
      emissive: new THREE.Color(STORM.energy),
      emissiveIntensity: 2.8,
      toneMapped: false,
    }),
    glass: new THREE.MeshStandardMaterial({
      color: '#9fdcff',
      metalness: 0.1,
      roughness: 0.05,
      emissive: new THREE.Color('#1c5f80'),
      emissiveIntensity: 0.6,
    }),
  };
}

/**
 * Kitbashed Aeolus Rifle — the marksman rifle of the sky civilization.
 * ~60 parts: beveled receiver and stock (RoundedBox), octagonal marble
 * handguard with vent cuts, notched top rail, ribbed barrel with a vented
 * muzzle brake, full scope assembly, curved magazine, trigger group —
 * and the signature side-mounted wind turbine, spinning live, feeding
 * energy conduits toward the muzzle. No naked rectangles anywhere.
 *
 * Serves as the procedural fallback for the `vortex` weapon slot (see the
 * NAMING NOTE below) — kept exactly as it was, not replaced, per every
 * instruction so far to preserve it. Exported so the first-person viewmodel
 * (src/components/three/weapons/VortexViewmodel.tsx) can render the exact
 * same fallback geometry instead of duplicating it.
 */
export function ProceduralAeolus() {
  const materials = useMemo(createMaterials, []);
  const rotorRef = useRef<THREE.Group>(null);

  useEffect(
    () => () => {
      Object.values(materials).forEach((material) => material.dispose());
    },
    [materials],
  );

  useFrame((_, delta) => {
    if (rotorRef.current) rotorRef.current.rotation.z += delta * 5;
  });

  const railNotches = useMemo(() => Array.from({ length: 11 }, (_, i) => -0.9 + i * 0.19), []);
  const ventSlits = useMemo(() => [-0.16, 0, 0.16], []);
  const barrelRibs = useMemo(() => [1.28, 1.5, 1.72, 1.94], []);

  return (
    <group scale={0.78}>
      {/* ── Stock ─────────────────────────────────────────────── */}
      <RoundedBox args={[0.2, 0.64, 0.22]} radius={0.04} smoothness={3} material={materials.ivory} position={[-1.88, -0.06, 0]} />
      <RoundedBox args={[0.06, 0.66, 0.24]} radius={0.02} smoothness={2} material={materials.gold} position={[-1.99, -0.06, 0]} />
      <RoundedBox args={[0.62, 0.15, 0.13]} radius={0.03} smoothness={2} material={materials.steel} position={[-1.5, 0.09, 0]} />
      <RoundedBox args={[0.6, 0.12, 0.12]} radius={0.03} smoothness={2} material={materials.steel} position={[-1.52, -0.24, 0]} rotation={[0, 0, 0.12]} />
      <RoundedBox args={[0.42, 0.1, 0.19]} radius={0.03} smoothness={2} material={materials.ivory} position={[-1.42, 0.24, 0]} />

      {/* ── Receiver ──────────────────────────────────────────── */}
      <RoundedBox args={[1.34, 0.34, 0.24]} radius={0.045} smoothness={3} material={materials.ivory} position={[-0.45, 0, 0]} />
      <RoundedBox args={[1.3, 0.14, 0.2]} radius={0.03} smoothness={2} material={materials.steel} position={[-0.43, 0.24, 0]} />
      {/* Ejection port + bolt */}
      <RoundedBox args={[0.3, 0.12, 0.03]} radius={0.01} smoothness={2} material={materials.gunmetal} position={[-0.28, 0.05, 0.115]} />
      <mesh material={materials.steel} position={[-0.12, 0.1, 0.14]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.025, 0.025, 0.1, 10]} />
      </mesh>
      <mesh material={materials.gold} position={[-0.12, 0.1, 0.2]}>
        <sphereGeometry args={[0.035, 10, 10]} />
      </mesh>
      {/* Gold engraving lines */}
      <RoundedBox args={[1.1, 0.02, 0.25]} radius={0.008} smoothness={2} material={materials.gold} position={[-0.45, -0.12, 0]} />
      <RoundedBox args={[0.02, 0.28, 0.25]} radius={0.008} smoothness={2} material={materials.gold} position={[-1.05, 0, 0]} />

      {/* ── Trigger group + grip ──────────────────────────────── */}
      <mesh material={materials.steel} position={[-0.62, -0.26, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.1, 0.02, 8, 18, Math.PI]} />
      </mesh>
      <RoundedBox args={[0.035, 0.11, 0.03]} radius={0.01} smoothness={2} material={materials.gunmetal} position={[-0.62, -0.24, 0]} rotation={[0, 0, 0.2]} />
      <RoundedBox args={[0.15, 0.42, 0.17]} radius={0.04} smoothness={3} material={materials.ivory} position={[-0.82, -0.42, 0]} rotation={[0, 0, 0.34]} />
      {[-0.5, -0.56, -0.62].map((y, i) => (
        <RoundedBox key={`grip-${i}`} args={[0.155, 0.02, 0.175]} radius={0.008} smoothness={2} material={materials.gunmetal} position={[-0.82 - (y + 0.42) * 0.34, y, 0]} rotation={[0, 0, 0.34]} />
      ))}

      {/* ── Magazine (curved via stacked segments) ────────────── */}
      <RoundedBox args={[0.2, 0.3, 0.17]} radius={0.03} smoothness={2} material={materials.steel} position={[-0.2, -0.32, 0]} rotation={[0, 0, -0.1]} />
      <RoundedBox args={[0.2, 0.28, 0.165]} radius={0.03} smoothness={2} material={materials.steel} position={[-0.15, -0.55, 0]} rotation={[0, 0, -0.28]} />
      <RoundedBox args={[0.21, 0.05, 0.175]} radius={0.015} smoothness={2} material={materials.gold} position={[-0.1, -0.69, 0]} rotation={[0, 0, -0.28]} />

      {/* ── Handguard: octagonal marble with vents ────────────── */}
      <mesh material={materials.ivory} position={[0.78, 0.02, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.15, 0.15, 1.15, 8]} />
      </mesh>
      {[0.28, 1.3].map((x, i) => (
        <mesh key={`joint-${i}`} material={materials.gold} position={[x, 0.02, 0]} rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[0.155, 0.02, 8, 24]} />
        </mesh>
      ))}
      {ventSlits.map((offset) => (
        <group key={`vent-${offset}`}>
          <RoundedBox args={[0.22, 0.03, 0.02]} radius={0.008} smoothness={2} material={materials.gunmetal} position={[0.62 + offset + 0.16, 0.02, 0.15]} />
          <RoundedBox args={[0.22, 0.03, 0.02]} radius={0.008} smoothness={2} material={materials.gunmetal} position={[0.62 + offset + 0.16, 0.02, -0.15]} />
        </group>
      ))}
      {/* Underbarrel foregrip + sling loop */}
      <mesh material={materials.steel} position={[0.95, -0.19, 0]} rotation={[0, 0, 0.5]}>
        <cylinderGeometry args={[0.045, 0.055, 0.24, 10]} />
      </mesh>
      <mesh material={materials.gold} position={[0.4, -0.16, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.04, 0.012, 6, 14]} />
      </mesh>

      {/* ── Top rail with notches ─────────────────────────────── */}
      <RoundedBox args={[2.3, 0.05, 0.15]} radius={0.015} smoothness={2} material={materials.steel} position={[0.15, 0.34, 0]} />
      {railNotches.map((x) => (
        <RoundedBox key={`notch-${x}`} args={[0.05, 0.035, 0.16]} radius={0.008} smoothness={2} material={materials.gunmetal} position={[x, 0.36, 0]} />
      ))}
      {/* Front + rear iron sights */}
      <RoundedBox args={[0.05, 0.14, 0.035]} radius={0.012} smoothness={2} material={materials.steel} position={[1.32, 0.44, 0]} />
      <RoundedBox args={[0.06, 0.1, 0.05]} radius={0.012} smoothness={2} material={materials.steel} position={[-0.98, 0.42, 0]} />

      {/* ── Barrel assembly ───────────────────────────────────── */}
      <mesh material={materials.gunmetal} position={[1.75, 0.06, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.05, 0.05, 1.5, 14]} />
      </mesh>
      {barrelRibs.map((x) => (
        <mesh key={`rib-${x}`} material={materials.steel} position={[x, 0.06, 0]} rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[0.06, 0.014, 8, 18]} />
        </mesh>
      ))}
      {/* Muzzle brake: octagonal, vented, gold crown, glowing bore */}
      <mesh material={materials.steel} position={[2.52, 0.06, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.08, 0.08, 0.34, 8]} />
      </mesh>
      {[-0.06, 0.04].map((x, i) => (
        <group key={`brake-${i}`}>
          <RoundedBox args={[0.06, 0.05, 0.02]} radius={0.006} smoothness={2} material={materials.gunmetal} position={[2.52 + x, 0.11, 0.07]} />
          <RoundedBox args={[0.06, 0.05, 0.02]} radius={0.006} smoothness={2} material={materials.gunmetal} position={[2.52 + x, 0.11, -0.07]} />
        </group>
      ))}
      <mesh material={materials.gold} position={[2.7, 0.06, 0]} rotation={[0, 0, Math.PI / 2]}>
        <torusGeometry args={[0.075, 0.018, 8, 20]} />
      </mesh>
      <mesh material={materials.energy} position={[2.71, 0.06, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.045, 0.045, 0.02, 12]} />
      </mesh>

      {/* ── Scope assembly ────────────────────────────────────── */}
      {[-0.35, 0.18].map((x, i) => (
        <RoundedBox key={`mount-${i}`} args={[0.08, 0.1, 0.1]} radius={0.02} smoothness={2} material={materials.steel} position={[x, 0.43, 0]} />
      ))}
      <mesh material={materials.ivory} position={[-0.08, 0.52, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.075, 0.075, 0.72, 16]} />
      </mesh>
      <mesh material={materials.steel} position={[0.34, 0.52, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.1, 0.08, 0.16, 16]} />
      </mesh>
      <mesh material={materials.steel} position={[-0.5, 0.52, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.085, 0.075, 0.12, 16]} />
      </mesh>
      <mesh material={materials.glass} position={[0.425, 0.52, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.088, 0.088, 0.012, 16]} />
      </mesh>
      {/* Turret knobs */}
      <mesh material={materials.gold} position={[-0.08, 0.63, 0]}>
        <cylinderGeometry args={[0.035, 0.035, 0.05, 10]} />
      </mesh>
      <mesh material={materials.gold} position={[-0.08, 0.52, 0.1]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.035, 0.035, 0.05, 10]} />
      </mesh>

      {/* ── Signature wind turbine (side-mounted, spinning) ───── */}
      <mesh material={materials.ivory} position={[0.02, -0.04, -0.14]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.2, 0.2, 0.05, 20]} />
      </mesh>
      <mesh material={materials.gold} position={[0.02, -0.04, -0.17]}>
        <torusGeometry args={[0.2, 0.028, 10, 32]} />
      </mesh>
      <group ref={rotorRef} position={[0.02, -0.04, -0.18]}>
        {[0, 1, 2, 3].map((blade) => (
          <RoundedBox
            key={`blade-${blade}`}
            args={[0.035, 0.3, 0.02]}
            radius={0.01}
            smoothness={2}
            material={materials.steel}
            rotation={[0, 0, (blade * Math.PI) / 2 + 0.5]}
          />
        ))}
        <mesh material={materials.energy}>
          <sphereGeometry args={[0.06, 14, 14]} />
        </mesh>
      </group>
      {/* Energy conduits: turbine → muzzle */}
      <mesh material={materials.energy} position={[1.3, -0.1, 0.115]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.012, 0.012, 2.5, 6]} />
      </mesh>
      <mesh material={materials.energy} position={[1.3, -0.1, -0.115]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.012, 0.012, 2.5, 6]} />
      </mesh>
    </group>
  );
}

/**
 * Hero showpiece: floats beside the title, drifts off-frame on descent.
 *
 * NAMING NOTE: this component/file is still named for the Aeolus Rifle for
 * historical reasons (see git history) — it now renders the Vortex Rifle
 * (`WIND_WEAPONS.vortex`, resolved to `WindWeaponId` name only inside
 * WeaponShowpiece), the project's declared flagship weapon (see
 * docs/decisions.md, 2026-07-16). `ProceduralAeolus` above stays as the
 * fallback exactly as it always has — kept, not replaced.
 *
 * 2026-07-16 (Phase 3 production pass): rim light, glow, rotation
 * oscillation, and model loading all moved out of this file into
 * `WeaponShowpiece` — the reusable production weapon component — so every
 * future weapon showpiece (not just this hero scene) gets the same
 * treatment without duplicating this logic. What's left here is genuinely
 * specific to being staged in the scroll-choreographed hero scene: the
 * scroll-driven exit drift, the aspect-responsive base X position (mirrors
 * StormBackdrop's ResponsiveFov), and the vertical hover bob timing.
 */
export default function AeolusShowpiece({ reducedMotion }: { reducedMotion: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const size = useThree((state) => state.size);

  useFrame(() => {
    const group = groupRef.current;
    if (!group) return;
    const exit = Math.min(scrollState.smoothed * 5, 1);
    // Pull the rifle toward center on narrow viewports — mirrors
    // StormBackdrop's ResponsiveFov: FOV alone still pushed the rifle to the
    // very edge of frame on mobile aspect ratios (confirmed via screenshot),
    // so this compensates on the position side too rather than widening FOV
    // further into fisheye distortion.
    const aspect = size.width / size.height;
    const baseAspect = 16 / 9;
    const baseX = aspect < baseAspect ? Math.max(2.2, 5 * (aspect / baseAspect)) : 5;
    group.position.x = baseX + exit * 7;
  });

  return (
    <group ref={groupRef} position={[5, 1.8, 3.4]}>
      <WeaponShowpiece weaponId="vortex" fallback={<ProceduralAeolus />} reducedMotion={reducedMotion} />
    </group>
  );
}
