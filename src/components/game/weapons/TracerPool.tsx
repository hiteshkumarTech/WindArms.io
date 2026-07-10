'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { effectsBus } from '@/lib/game/effectsBus';
import { ENERGY_IMPACT, SURFACE_IMPACT, surfaceOf } from '@/lib/game/surfaces';

const noRaycast = () => null;

const TRACER_COUNT = 24;
const TRACER_LIFE_MS = 90;
/** Stylized energy bolt: thicker, brighter and slightly longer-lived than a kinetic tracer. */
const ENERGY_TRACER_THICKNESS = 2.4;
const ENERGY_TRACER_LIFE_MS = 120;
const ENERGY_TRACER_PEAK_OPACITY = 1;
const KINETIC_TRACER_PEAK_OPACITY = 0.9;
const IMPACT_COUNT = 16;
const IMPACT_LIFE_MS = 160;
/** Default (unstyled) spark — matches an untagged surface or a player hit. */
const DEFAULT_IMPACT_STYLE = { scale: 1, life: IMPACT_LIFE_MS };
/** How far ahead of the impact point to start the surface-probe ray. */
const PROBE_BACKOFF = 0.08;
const PROBE_RANGE = 0.3;

function createGlowTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.35, 'rgba(255, 255, 255, 0.4)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }
  return new THREE.CanvasTexture(canvas);
}

/**
 * Fixed-size pools for bullet tracers (stretched additive boxes) and hit
 * sparks (glow sprites). Slots are recycled round-robin; requests arrive
 * through the effects bus and everything updates imperatively in the frame
 * loop — no allocation, no re-renders, regardless of fire rate.
 */
export default function TracerPool() {
  const tracerRefs = useRef<Array<THREE.Mesh | null>>(Array(TRACER_COUNT).fill(null));
  const impactRefs = useRef<Array<THREE.Sprite | null>>(Array(IMPACT_COUNT).fill(null));
  const tracerData = useRef(
    Array.from({ length: TRACER_COUNT }, () => ({
      bornAt: -Infinity,
      life: TRACER_LIFE_MS,
      peakOpacity: KINETIC_TRACER_PEAK_OPACITY,
    })),
  );
  const impactData = useRef(
    Array.from({ length: IMPACT_COUNT }, () => ({ bornAt: -Infinity, life: IMPACT_LIFE_MS, scale: 1 })),
  );
  const tracerCursor = useRef(0);
  const impactCursor = useRef(0);

  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const probeRaycaster = useMemo(() => new THREE.Raycaster(), []);
  const probeOrigin = useMemo(() => new THREE.Vector3(), []);
  const probeDir = useMemo(() => new THREE.Vector3(), []);

  // Base cross-section (0.025 x 0.025) and unit length — the tracer shader
  // below hardcodes these same half-extents to derive local-space radial
  // distance and head/tail position, so keep them in sync if this changes.
  const tracerGeometry = useMemo(() => new THREE.BoxGeometry(0.025, 0.025, 1), []);
  const tracerMaterials = useMemo(
    () =>
      Array.from(
        { length: TRACER_COUNT },
        () =>
          new THREE.ShaderMaterial({
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            uniforms: {
              uColor: { value: new THREE.Color('#ffffff') },
              uOpacity: { value: 0 },
            },
            vertexShader: /* glsl */ `
              varying vec2 vLocalXY;
              varying float vHeadFactor;
              void main() {
                // Cross-section half-width is 0.0125 (half of the 0.025 base box).
                vLocalXY = position.xy / 0.0125;
                // mesh.lookAt(to) points local -Z at the head, so -position.z
                // increases toward it; remap the box's -0.5..0.5 span to 0..1.
                vHeadFactor = 0.5 - position.z;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
              }
            `,
            fragmentShader: /* glsl */ `
              varying vec2 vLocalXY;
              varying float vHeadFactor;
              uniform vec3 uColor;
              uniform float uOpacity;
              void main() {
                float radial = length(vLocalXY);
                float core = smoothstep(1.0, 0.15, radial);
                float headGlow = mix(0.35, 1.0, clamp(vHeadFactor, 0.0, 1.0));
                float alpha = core * headGlow * uOpacity;
                if (alpha < 0.02) discard;
                gl_FragColor = vec4(uColor, alpha);
              }
            `,
          }),
      ),
    [],
  );
  const glowTexture = useMemo(createGlowTexture, []);
  const impactMaterials = useMemo(
    () =>
      Array.from(
        { length: IMPACT_COUNT },
        () =>
          new THREE.SpriteMaterial({
            map: glowTexture,
            color: '#ffffff',
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
          }),
      ),
    [glowTexture],
  );

  useEffect(
    () => () => {
      tracerGeometry.dispose();
      tracerMaterials.forEach((material) => material.dispose());
      impactMaterials.forEach((material) => material.dispose());
      glowTexture.dispose();
    },
    [glowTexture, impactMaterials, tracerGeometry, tracerMaterials],
  );

  useFrame(() => {
    const now = performance.now();

    // Assign new tracers.
    for (const request of effectsBus.takeTracers()) {
      const slot = tracerCursor.current % TRACER_COUNT;
      tracerCursor.current += 1;
      const mesh = tracerRefs.current[slot];
      if (!mesh) continue;

      const from = new THREE.Vector3(...request.from);
      const to = new THREE.Vector3(...request.to);
      const length = Math.max(from.distanceTo(to), 0.1);
      const thickness = request.energy ? ENERGY_TRACER_THICKNESS : 1;
      mesh.position.copy(from).add(to).multiplyScalar(0.5);
      mesh.lookAt(to);
      mesh.scale.set(thickness, thickness, length);
      tracerMaterials[slot].uniforms.uColor.value.set(request.color);
      tracerData.current[slot] = {
        bornAt: now,
        life: request.energy ? ENERGY_TRACER_LIFE_MS : TRACER_LIFE_MS,
        peakOpacity: request.energy ? ENERGY_TRACER_PEAK_OPACITY : KINETIC_TRACER_PEAK_OPACITY,
      };
      mesh.visible = true;
    }

    // Assign new impacts. Surface (or a pre-resolved player hit) restyles the
    // spark; when the shot came from another player we only have a travel
    // direction, so probe a short ray back from the impact point to find it.
    for (const request of effectsBus.takeImpacts()) {
      const slot = impactCursor.current % IMPACT_COUNT;
      impactCursor.current += 1;
      const sprite = impactRefs.current[slot];
      if (!sprite) continue;

      let color = request.color;
      let { scale, life } = DEFAULT_IMPACT_STYLE;
      if (request.energy) {
        // Stylized energy hit — the weapon's own signature, regardless of
        // what (or who) it struck. Skips the surface probe entirely.
        ({ color, scale, life } = ENERGY_IMPACT);
      } else {
        let surface = request.surface;
        if (!surface && request.dir) {
          probeDir.set(request.dir[0], request.dir[1], request.dir[2]);
          probeOrigin.set(request.at[0], request.at[1], request.at[2]).addScaledVector(probeDir, -PROBE_BACKOFF);
          probeRaycaster.set(probeOrigin, probeDir);
          // Same requirement as WeaponSystem's raycaster — THREE.Sprite.raycast()
          // needs raycaster.camera set or it throws on any visible sprite.
          probeRaycaster.camera = camera;
          probeRaycaster.far = PROBE_RANGE;
          const probeHits = probeRaycaster.intersectObjects(scene.children, true);
          surface = probeHits[0] ? (surfaceOf(probeHits[0].object) ?? undefined) : undefined;
        }
        if (surface && surface !== 'player') {
          const surfaceStyle = SURFACE_IMPACT[surface];
          color = surfaceStyle.color;
          scale = surfaceStyle.scale;
          life = surfaceStyle.life;
        }
      }

      sprite.position.set(request.at[0], request.at[1], request.at[2]);
      impactMaterials[slot].color.set(color);
      impactData.current[slot] = { bornAt: now, life, scale };
      sprite.visible = true;
    }

    // Age out active slots.
    for (let slot = 0; slot < TRACER_COUNT; slot++) {
      const data = tracerData.current[slot];
      const age = now - data.bornAt;
      const mesh = tracerRefs.current[slot];
      if (!mesh || !mesh.visible) continue;
      if (age >= data.life) {
        mesh.visible = false;
        tracerMaterials[slot].uniforms.uOpacity.value = 0;
      } else {
        tracerMaterials[slot].uniforms.uOpacity.value = data.peakOpacity * (1 - age / data.life);
      }
    }
    for (let slot = 0; slot < IMPACT_COUNT; slot++) {
      const data = impactData.current[slot];
      const age = now - data.bornAt;
      const sprite = impactRefs.current[slot];
      if (!sprite || !sprite.visible) continue;
      if (age >= data.life) {
        sprite.visible = false;
        impactMaterials[slot].opacity = 0;
      } else {
        const t = age / data.life;
        const scale = (0.12 + t * 0.45) * data.scale;
        sprite.scale.set(scale, scale, 1);
        impactMaterials[slot].opacity = 0.9 * (1 - t);
      }
    }
  });

  return (
    <group>
      {Array.from({ length: TRACER_COUNT }, (_, slot) => (
        <mesh
          key={`tracer-${slot}`}
          ref={(node) => {
            tracerRefs.current[slot] = node;
          }}
          geometry={tracerGeometry}
          material={tracerMaterials[slot]}
          raycast={noRaycast}
          visible={false}
          frustumCulled={false}
        />
      ))}
      {Array.from({ length: IMPACT_COUNT }, (_, slot) => (
        <sprite
          key={`impact-${slot}`}
          ref={(node) => {
            impactRefs.current[slot] = node;
          }}
          material={impactMaterials[slot]}
          raycast={noRaycast}
          visible={false}
          frustumCulled={false}
        />
      ))}
    </group>
  );
}
