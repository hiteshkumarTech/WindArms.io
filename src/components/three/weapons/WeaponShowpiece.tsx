'use client';

import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import PipelineModel from '@/components/three/pipeline/PipelineModel';
import type { PipelineAssetResult } from '@/lib/v2/pipeline';
import { getWeaponVisualConfig } from '@/lib/v2/weapons/visualConfigs';
import { WIND_WEAPONS, type WindWeaponDef, type WindWeaponId } from '@shared/windWeapons';

/**
 * The reusable production weapon component. Every future weapon showpiece
 * (loadout screens, operator detail pages, a future in-game inspect view —
 * not just this one hero scene) renders through this, not through a
 * one-off wrapper around PipelineModel. Adding a weapon here is adding a
 * WeaponVisualConfig entry (src/lib/v2/weapons/visualConfigs.ts), not
 * writing a new component.
 *
 * What this owns (real, working today): model loading + scale (via
 * PipelineModel), bounded three-quarter rotation with a slow hover bob, a
 * rim/key light, a wind-core glow sprite, accent tinting (via the existing
 * pipeline materials system), and — if the loaded GLB actually has one — an
 * auto-playing idle animation clip.
 *
 * What this exposes as real, typed extension points that do nothing yet
 * because no current weapon has the underlying data (not stubs — genuinely
 * functional code paths that activate automatically once a weapon's GLB
 * gains clips/sockets, no component rewrite required): `idleClip` playback
 * via AnimationMixer, and `sockets`/`clips` forwarded through `onReady` for
 * a consumer to wire muzzle flash, shell ejection, recoil, or reload
 * animations via SocketAnchor (src/components/three/pipeline/SocketAnchor.tsx)
 * — none of that lives inside this component, since none of it is
 * gameplay-specific to *this* showpiece context.
 */
export interface WeaponShowpieceProps {
  weaponId: WindWeaponId;
  fallback: ReactNode;
  /** Overrides the weapon's own accent color (see shared/windWeapons.ts) — the future skin-tint entry point. */
  accentTint?: string;
  /** Disables the hover bob and rotation oscillation — reduced-motion passthrough, the caller decides the policy (matches every other storm/* component's convention). */
  reducedMotion?: boolean;
  onReady?: (result: PipelineAssetResult, def: WindWeaponDef) => void;
}

function createGlowTexture(color: string): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (context) {
    const rgb = new THREE.Color(color);
    const [r, g, b] = [Math.round(rgb.r * 255), Math.round(rgb.g * 255), Math.round(rgb.b * 255)];
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, `rgba(${Math.min(255, r + 60)}, ${Math.min(255, g + 60)}, ${Math.min(255, b + 60)}, 0.9)`);
    gradient.addColorStop(0.35, `rgba(${r}, ${g}, ${b}, 0.4)`);
    gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }
  return new THREE.CanvasTexture(canvas);
}

export default function WeaponShowpiece({ weaponId, fallback, accentTint, reducedMotion = false, onReady }: WeaponShowpieceProps) {
  const def = WIND_WEAPONS[weaponId];
  const visual = getWeaponVisualConfig(weaponId, `weapon-${weaponId}`);

  const innerRef = useRef<THREE.Group>(null);
  const glowRef = useRef<THREE.Sprite>(null);
  const rimLightRef = useRef<THREE.PointLight>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const glowTexture = useMemo(() => createGlowTexture(visual.glowColor), [visual.glowColor]);
  const glowMaterial = useMemo(
    () =>
      new THREE.SpriteMaterial({
        map: glowTexture,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    [glowTexture],
  );

  useEffect(
    () => () => {
      glowTexture.dispose();
      glowMaterial.dispose();
      mixerRef.current = null;
    },
    [glowTexture, glowMaterial],
  );

  const handleReady = (result: PipelineAssetResult) => {
    // Real, working idle-clip playback — a no-op today (visual.idleClip is
    // unset for every current weapon) but activates automatically the
    // moment a WeaponVisualConfig entry sets one, no code change needed
    // here.
    if (visual.idleClip && result.scene) {
      const clip = result.clips.get(visual.idleClip);
      if (clip) {
        const mixer = new THREE.AnimationMixer(result.scene);
        mixer.clipAction(clip).play();
        mixerRef.current = mixer;
      }
    }
    onReady?.(result, def);
  };

  useFrame(({ clock }, delta) => {
    mixerRef.current?.update(delta);

    const inner = innerRef.current;
    if (!inner) return;
    const time = clock.elapsedTime;
    inner.rotation.y = reducedMotion ? visual.rotationBaseY : visual.rotationBaseY + Math.sin(time * 0.12) * visual.rotationOscillation;
    inner.position.y = reducedMotion ? 0 : Math.sin(time * 0.7) * 0.12;

    if (!reducedMotion) {
      const pulse = 0.55 + Math.sin(time * 1.1) * 0.25;
      if (glowRef.current) glowRef.current.material.opacity = pulse * 0.7;
      if (rimLightRef.current) rimLightRef.current.intensity = visual.rimLightIntensity.base + pulse * visual.rimLightIntensity.pulseAmplitude;
    } else {
      if (glowRef.current) glowRef.current.material.opacity = 0.5;
      if (rimLightRef.current) rimLightRef.current.intensity = visual.rimLightIntensity.base + visual.rimLightIntensity.pulseAmplitude;
    }
  });

  return (
    <group ref={innerRef} rotation={[0.05, visual.rotationBaseY, 0.03]}>
      <PipelineModel slot={visual.slot} fallback={fallback} scale={visual.scale} accentTint={accentTint ?? def.accent} onReady={handleReady} />

      {/* Rim/key light — separates the weapon from whatever's behind it. One extra point light, matches SkyCitadel's existing per-object supplementary-light pattern. */}
      <pointLight ref={rimLightRef} color={visual.rimLightColor} position={visual.rimLightOffset} intensity={visual.rimLightIntensity.base} distance={4} decay={2} />

      {/* Wind-core glow — a free-floating supplementary sprite, not tied to a real socket/material region (none exist on the current GLB — see visualConfigs.ts). */}
      <sprite ref={glowRef} material={glowMaterial} position={visual.glowOffset} scale={[visual.glowScale, visual.glowScale, 1]} />
    </group>
  );
}
