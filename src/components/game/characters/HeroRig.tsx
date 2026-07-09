'use client';

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { weaponTintById, type HeroAppearance } from '@shared/heroes';

/**
 * Imperative handle onto the rig's bone groups. The driver (RemoteAvatar)
 * writes joint rotations straight onto these THREE.Group instances every
 * frame — no React state, no re-renders. `setOpacity` fades the whole rig
 * for the death dissolve.
 */
export interface RigHandle {
  /** Body root — carries the vertical bob / crouch / death sink (rootY). */
  body: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  forearmL: THREE.Group;
  armR: THREE.Group;
  forearmR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  weapon: THREE.Group;
  setOpacity: (opacity: number) => void;
}

interface HeroRigProps {
  appearance: HeroAppearance;
  tint: string;
}

/**
 * A low-poly articulated character built entirely from primitives — zero
 * external assets, matching the project's procedural philosophy. Nine
 * animated nodes (hips/body, torso, head, upper+lower arms ×2, legs ×2)
 * plus a held weapon, driven by heroAnimator. Four materials are shared
 * across the whole rig and disposed on unmount, keeping the draw-call and
 * memory budget flat at eight players (design §7).
 *
 * Proportions and colors come from the shared hero catalog, so the same rig
 * renders any silhouette/skin. The head sits at the server's head-hitbox
 * height, so headshots line up with the visible head.
 */
const HeroRig = forwardRef<RigHandle, HeroRigProps>(function HeroRig({ appearance, tint }, ref) {
  const { silhouette, skin } = appearance;
  const b = silhouette.build; // thickness
  const h = silhouette.heightScale; // height
  const sx = silhouette.shoulderWidth + 0.02;
  const hx = silhouette.hipWidth;

  // Bone-group refs — written to imperatively by the animation driver.
  const body = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const forearmL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const forearmR = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const weapon = useRef<THREE.Group>(null);

  // Four shared materials for the entire rig (design §7: "share 3 materials").
  const materials = useMemo(() => {
    const std = (color: string, roughness: number, metalness: number) =>
      new THREE.MeshStandardMaterial({ color, roughness, metalness, transparent: true, depthWrite: true });
    return {
      bodyMat: std(skin.primary, 0.62, 0.34),
      panelMat: std(skin.secondary, 0.7, 0.28),
      accentMat: new THREE.MeshStandardMaterial({
        color: '#04090c',
        emissive: skin.accent,
        emissiveIntensity: 2.2,
        toneMapped: false,
        transparent: true,
        depthWrite: true,
      }),
      weaponMat: new THREE.MeshStandardMaterial({
        color: '#0e131b',
        roughness: 0.4,
        metalness: 0.8,
        transparent: true,
        depthWrite: true,
      }),
      tintMat: new THREE.MeshStandardMaterial({
        color: '#04090c',
        emissive: weaponTintById(tint).color,
        emissiveIntensity: 2.4,
        toneMapped: false,
        transparent: true,
        depthWrite: true,
      }),
    };
  }, [skin.primary, skin.secondary, skin.accent, tint]);

  useEffect(
    () => () => {
      materials.bodyMat.dispose();
      materials.panelMat.dispose();
      materials.accentMat.dispose();
      materials.weaponMat.dispose();
      materials.tintMat.dispose();
    },
    [materials],
  );

  useImperativeHandle(
    ref,
    (): RigHandle => ({
      body: body.current!,
      torso: torso.current!,
      head: head.current!,
      armL: armL.current!,
      forearmL: forearmL.current!,
      armR: armR.current!,
      forearmR: forearmR.current!,
      legL: legL.current!,
      legR: legR.current!,
      weapon: weapon.current!,
      setOpacity: (opacity: number) => {
        materials.bodyMat.opacity = opacity;
        materials.panelMat.opacity = opacity;
        materials.accentMat.opacity = opacity;
        materials.weaponMat.opacity = opacity;
        materials.tintMat.opacity = opacity;
        materials.accentMat.emissiveIntensity = 2.2 * opacity;
        materials.tintMat.emissiveIntensity = 2.4 * opacity;
      },
    }),
    [materials],
  );

  const hipY = -0.12 * h;

  return (
    <group ref={body} userData={{ isPlayer: true }}>
      {/* Pelvis */}
      <mesh position={[0, hipY, 0]} material={materials.panelMat} castShadow>
        <boxGeometry args={[0.3 * b, 0.2 * h, 0.18 * b]} />
      </mesh>

      {/* Torso pivot (leans via torsoPitch/Roll) */}
      <group ref={torso} position={[0, hipY, 0]}>
        <mesh position={[0, 0.26 * h, 0]} material={materials.bodyMat} castShadow>
          <boxGeometry args={[0.34 * b, 0.46 * h, 0.2 * b]} />
        </mesh>
        {/* Emissive chest strip — team/skin read at distance */}
        <mesh position={[0, 0.3 * h, -0.1 * b - 0.01]} material={materials.accentMat}>
          <boxGeometry args={[0.16 * b, 0.1 * h, 0.04]} />
        </mesh>

        {/* Head pivot (aims via headPitch/Yaw) */}
        <group ref={head} position={[0, 0.56 * h, 0]}>
          <mesh position={[0, 0.1 * h, 0]} material={materials.bodyMat} castShadow>
            <boxGeometry args={[0.2 * b, 0.22 * h, 0.2 * b]} />
          </mesh>
          {/* Visor faces -Z (forward) */}
          <mesh position={[0, 0.1 * h, -0.1 * b - 0.01]} material={materials.accentMat}>
            <boxGeometry args={[0.16 * b, 0.07 * h, 0.04]} />
          </mesh>
        </group>

        {/* Right arm — holds the weapon (weapon-side +X) */}
        <group ref={armR} position={[sx, 0.4 * h, 0]}>
          <mesh position={[0, -0.14 * h, 0]} material={materials.bodyMat} castShadow>
            <boxGeometry args={[0.1 * b, 0.3 * h, 0.1 * b]} />
          </mesh>
          <group ref={forearmR} position={[0, -0.3 * h, 0]}>
            <mesh position={[0, -0.13 * h, 0]} material={materials.panelMat} castShadow>
              <boxGeometry args={[0.09 * b, 0.28 * h, 0.09 * b]} />
            </mesh>
            {/* Held weapon — generic rifle silhouette, elevates via weaponPitch */}
            <group ref={weapon} position={[0.02, -0.24 * h, -0.02]}>
              <mesh position={[0, 0, -0.2]} material={materials.weaponMat}>
                <boxGeometry args={[0.07 * b, 0.09 * b, 0.42]} />
              </mesh>
              <mesh position={[0, 0.02, -0.44]} material={materials.weaponMat}>
                <boxGeometry args={[0.035, 0.035, 0.22]} />
              </mesh>
              <mesh position={[0, 0.02, -0.57]} material={materials.tintMat}>
                <boxGeometry args={[0.05, 0.05, 0.05]} />
              </mesh>
            </group>
          </group>
        </group>

        {/* Left arm — swings with the run cycle */}
        <group ref={armL} position={[-sx, 0.4 * h, 0]}>
          <mesh position={[0, -0.14 * h, 0]} material={materials.bodyMat} castShadow>
            <boxGeometry args={[0.1 * b, 0.3 * h, 0.1 * b]} />
          </mesh>
          <group ref={forearmL} position={[0, -0.3 * h, 0]}>
            <mesh position={[0, -0.13 * h, 0]} material={materials.panelMat} castShadow>
              <boxGeometry args={[0.09 * b, 0.28 * h, 0.09 * b]} />
            </mesh>
          </group>
        </group>
      </group>

      {/* Right leg */}
      <group ref={legR} position={[hx, hipY, 0]}>
        <mesh position={[0, -0.34 * h, 0]} material={materials.bodyMat} castShadow>
          <boxGeometry args={[0.12 * b, 0.72 * h, 0.12 * b]} />
        </mesh>
        <mesh position={[0, -0.72 * h, -0.04]} material={materials.panelMat} castShadow>
          <boxGeometry args={[0.13 * b, 0.1 * h, 0.26 * b]} />
        </mesh>
      </group>

      {/* Left leg */}
      <group ref={legL} position={[-hx, hipY, 0]}>
        <mesh position={[0, -0.34 * h, 0]} material={materials.bodyMat} castShadow>
          <boxGeometry args={[0.12 * b, 0.72 * h, 0.12 * b]} />
        </mesh>
        <mesh position={[0, -0.72 * h, -0.04]} material={materials.panelMat} castShadow>
          <boxGeometry args={[0.13 * b, 0.1 * h, 0.26 * b]} />
        </mesh>
      </group>
    </group>
  );
});

export default HeroRig;
