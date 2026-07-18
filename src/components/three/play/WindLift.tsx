'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { STORM } from '@/lib/v2/tokens';
import { WIND_LIFT } from '@/lib/v2/play/constants';
import { useV2MatchStore } from '@/lib/v2/play/matchStore';

/**
 * Wind Lift — the visible cyan updraft (Milestone 6). VISUALS ONLY; the
 * force that launches the player lives in PlayerController, and BOTH read
 * the same WIND_LIFT constant so the readable column and the physics can
 * never drift apart. Animation freezes while the match is paused (the
 * brief's "disabled while paused"), which also matches the fact that the
 * lift's force is active-phase-gated in the controller.
 *
 * Built from scrolling additive rings + a soft core + drifting motes: a
 * clear "step in here and rise" affordance, no player damage, reusable.
 *
 * Purely cosmetic per-frame delta (`simulationDeltaS`) — clamped like the
 * rest of this milestone's movement/visual code (Skyfront Trial timing
 * cleanup), NOT real elapsed time. There is no gameplay timer here; a
 * capped step just keeps the scroll/wrap math numerically sane under an
 * extreme frame hitch instead of jumping the modulo wrap by more than one
 * cycle in a single step.
 */
export default function WindLift() {
  const ringsRef = useRef<THREE.Group>(null);
  const motesRef = useRef<THREE.Points>(null);

  const ringMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ color: STORM.energy, transparent: true, opacity: 0.5, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    [],
  );
  const coreMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ color: STORM.energy, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    [],
  );

  const RING_COUNT = 6;
  const MOTE_COUNT = 40;

  const moteGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(MOTE_COUNT * 3);
    for (let i = 0; i < MOTE_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * WIND_LIFT.radius * 0.8;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = Math.random() * WIND_LIFT.height;
      positions[i * 3 + 2] = Math.sin(angle) * radius;
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geometry;
  }, []);

  const moteMaterial = useMemo(
    () => new THREE.PointsMaterial({ color: STORM.sky, size: 0.14, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    [],
  );

  useEffect(
    () => () => {
      ringMaterial.dispose();
      coreMaterial.dispose();
      moteGeometry.dispose();
      moteMaterial.dispose();
    },
    [ringMaterial, coreMaterial, moteGeometry, moteMaterial],
  );

  useFrame((_, rawDelta) => {
    if (useV2MatchStore.getState().phase === 'paused') return; // frozen with the sim
    const simulationDeltaS = Math.min(rawDelta, 1 / 30);

    if (ringsRef.current) {
      for (const ring of ringsRef.current.children) {
        ring.position.y += simulationDeltaS * 2.6;
        if (ring.position.y > WIND_LIFT.height) ring.position.y -= WIND_LIFT.height;
        const t = ring.position.y / WIND_LIFT.height;
        (ring as THREE.Mesh).scale.setScalar(0.7 + t * 0.5);
        ((ring as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - t);
      }
    }

    if (motesRef.current) {
      const positions = motesRef.current.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < positions.count; i++) {
        let y = positions.getY(i) + simulationDeltaS * 3.2;
        if (y > WIND_LIFT.height) y -= WIND_LIFT.height;
        positions.setY(i, y);
      }
      positions.needsUpdate = true;
    }
  });

  return (
    <group position={WIND_LIFT.position} name="wind_lift">
      {/* Base ring on the deck — the "stand here" footprint */}
      <mesh material={ringMaterial} position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[WIND_LIFT.radius * 0.85, WIND_LIFT.radius, 40]} />
      </mesh>

      {/* Soft rising core column */}
      <mesh material={coreMaterial} position={[0, WIND_LIFT.height / 2, 0]}>
        <cylinderGeometry args={[WIND_LIFT.radius * 0.8, WIND_LIFT.radius, WIND_LIFT.height, 20, 1, true]} />
      </mesh>

      {/* Scrolling updraft rings */}
      <group ref={ringsRef}>
        {Array.from({ length: RING_COUNT }, (_, i) => (
          <mesh key={i} material={ringMaterial} position={[0, (i / RING_COUNT) * WIND_LIFT.height, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[WIND_LIFT.radius * 0.55, WIND_LIFT.radius * 0.72, 32]} />
          </mesh>
        ))}
      </group>

      <points ref={motesRef} geometry={moteGeometry} material={moteMaterial} />
    </group>
  );
}
