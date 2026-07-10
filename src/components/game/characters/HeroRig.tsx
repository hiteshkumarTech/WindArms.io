'use client';

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { weaponTintById, type HeroAppearance } from '@shared/heroes';
import type { WeaponId } from '@shared/protocol';
import { WEAPONS } from '@shared/weapons';
import { createRimMaterial } from '@/lib/three/rimLight';
import { useGraphicsStore } from '@/stores/graphicsStore';
import { ChassisGeometry, type WeaponSurfaceMaterials } from '../weapons/weaponGeometry';

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
  /** Currently-equipped weapon, already replicated in every PlayerSnapshot — drives the held weapon's silhouette. */
  weapon: WeaponId;
}

/**
 * A low-poly articulated character built entirely from primitives — zero
 * external assets, matching the project's procedural philosophy. Nine
 * animated nodes (hips/body, torso, head, upper+lower arms ×2, legs ×2)
 * plus a held weapon, driven by heroAnimator. Five materials (plus a
 * 'high'-quality-only fresnel rim shell) are shared across the whole rig
 * and disposed on unmount, keeping the draw-call and memory budget flat
 * at eight players (design §7).
 *
 * Proportions and colors come from the shared hero catalog, so the same rig
 * renders any silhouette/skin. The head sits at the server's head-hitbox
 * height, so headshots line up with the visible head.
 */
const HeroRig = forwardRef<RigHandle, HeroRigProps>(function HeroRig({ appearance, tint, weapon: weaponId }, ref) {
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
  const highQuality = useGraphicsStore((state) => state.quality === 'high');
  const weaponDef = WEAPONS[weaponId];

  // Shared materials for the entire rig (design §7: "share 3 materials").
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
      rimMat: createRimMaterial(skin.accent, 0.6),
    };
  }, [skin.primary, skin.secondary, skin.accent, tint]);

  // Remaps HeroRig's own shared materials onto the weapon-geometry role
  // names — no new material instances, so the rig's flat material budget
  // (design §7) holds even though the held weapon is now per-weapon-class
  // instead of one hardcoded silhouette.
  const weaponSurfaceMaterials = useMemo<WeaponSurfaceMaterials>(
    () => ({
      body: materials.weaponMat,
      metal: materials.weaponMat,
      polymer: materials.panelMat,
      carbon: materials.panelMat,
      ceramic: materials.weaponMat,
      accent: materials.tintMat,
    }),
    [materials],
  );

  useEffect(
    () => () => {
      materials.bodyMat.dispose();
      materials.panelMat.dispose();
      materials.accentMat.dispose();
      materials.weaponMat.dispose();
      materials.tintMat.dispose();
      materials.rimMat.dispose();
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
        {/* Fresnel rim shell — 'high' quality only, gated for the ×8-player budget */}
        {highQuality ? (
          <mesh position={[0, 0.26 * h, 0]} material={materials.rimMat} scale={[1.06, 1.04, 1.08]}>
            <boxGeometry args={[0.34 * b, 0.46 * h, 0.2 * b]} />
          </mesh>
        ) : null}
        {/* Emissive chest strip — team/skin read at distance */}
        <mesh position={[0, 0.3 * h, -0.1 * b - 0.01]} material={materials.accentMat}>
          <boxGeometry args={[0.16 * b, 0.1 * h, 0.04]} />
        </mesh>

        {/* Head pivot (aims via headPitch/Yaw) */}
        <group ref={head} position={[0, 0.56 * h, 0]}>
          <mesh position={[0, 0.1 * h, 0]} material={materials.bodyMat} castShadow>
            <boxGeometry args={[0.2 * b, 0.22 * h, 0.2 * b]} />
          </mesh>
          {highQuality ? (
            <mesh position={[0, 0.1 * h, 0]} material={materials.rimMat} scale={[1.08, 1.06, 1.08]}>
              <boxGeometry args={[0.2 * b, 0.22 * h, 0.2 * b]} />
            </mesh>
          ) : null}
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
            {/* Held weapon — reduced-fidelity chassis matching the equipped weapon's
                class (shared with the first-person viewmodel's geometry system),
                elevates via weaponPitch. No trim jitter, no attached modules, no
                mechanism-ref animation — see weaponGeometry.tsx's ChassisGeometry
                'reduced' path for the x8-player draw-call budget this respects. */}
            <group ref={weapon} position={[0.02, -0.24 * h, -0.02]} scale={0.92}>
              <ChassisGeometry
                chassis={weaponDef.visual.chassis}
                bulk={weaponDef.visual.bulk}
                length={weaponDef.visual.length}
                barrelLength={weaponDef.visual.barrelLength}
                barrelRadius={weaponDef.visual.barrelRadius}
                gripRake={weaponDef.visual.gripRake}
                materials={weaponSurfaceMaterials}
                fidelity="reduced"
                seed={0}
              />
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
