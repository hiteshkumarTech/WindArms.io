'use client';

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { createRng } from '@/lib/utils';
import { useIsomorphicLayoutEffect } from '@/hooks/useIsomorphicLayoutEffect';

const BUILDING_COUNT = 54;
const LIGHT_COUNT = 40;
const ACCENTS = ['#00F5FF', '#FF7A00', '#7C5CFF'];

/**
 * Distant instanced cyber-city silhouette with scattered neon window
 * strips. Sits deep in the fog so it reads as atmosphere, not geometry.
 */
export default function CitySkyline() {
  const buildingsRef = useRef<THREE.InstancedMesh>(null);
  const lightsRef = useRef<THREE.InstancedMesh>(null);

  const buildingGeometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const buildingMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#0a0e14', roughness: 0.92, metalness: 0.15 }),
    [],
  );
  const lightGeometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const lightMaterial = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false }), []);

  useEffect(
    () => () => {
      buildingGeometry.dispose();
      buildingMaterial.dispose();
      lightGeometry.dispose();
      lightMaterial.dispose();
    },
    [buildingGeometry, buildingMaterial, lightGeometry, lightMaterial],
  );

  useIsomorphicLayoutEffect(() => {
    const buildings = buildingsRef.current;
    const lights = lightsRef.current;
    if (!buildings || !lights) return;

    const rng = createRng(2077);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const color = new THREE.Color();

    for (let i = 0; i < BUILDING_COUNT; i++) {
      const width = 0.8 + rng() * 2.4;
      const height = 1.5 + rng() * 7.5;
      const depth = 0.8 + rng() * 1.6;
      const x = -30 + (i / BUILDING_COUNT) * 60 + (rng() - 0.5) * 2;
      const z = -14 - rng() * 10;
      matrix.compose(
        new THREE.Vector3(x, -1.35 + height / 2, z),
        quaternion,
        new THREE.Vector3(width, height, depth),
      );
      buildings.setMatrixAt(i, matrix);
    }
    buildings.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < LIGHT_COUNT; i++) {
      const x = -28 + rng() * 56;
      const y = -1 + rng() * 5.5;
      const z = -13.5 - rng() * 9;
      const vertical = rng() > 0.5;
      matrix.compose(
        new THREE.Vector3(x, y, z),
        quaternion,
        new THREE.Vector3(
          vertical ? 0.06 : 0.5 + rng() * 1.2,
          vertical ? 0.8 + rng() * 2.4 : 0.06,
          0.06,
        ),
      );
      lights.setMatrixAt(i, matrix);
      color.set(ACCENTS[Math.floor(rng() * ACCENTS.length)]).multiplyScalar(1.5);
      lights.setColorAt(i, color);
    }
    lights.instanceMatrix.needsUpdate = true;
    if (lights.instanceColor) {
      lights.instanceColor.needsUpdate = true;
    }
  }, []);

  return (
    <group>
      <instancedMesh
        ref={buildingsRef}
        args={[buildingGeometry, buildingMaterial, BUILDING_COUNT]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={lightsRef}
        args={[lightGeometry, lightMaterial, LIGHT_COUNT]}
        frustumCulled={false}
      />
    </group>
  );
}
