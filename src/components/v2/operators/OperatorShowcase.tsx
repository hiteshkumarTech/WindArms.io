'use client';

import { Component, useRef, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getOperatorDefinition, type OperatorAnimationState, type OperatorId } from '@/lib/v2/operators';
import OperatorModel, { type OperatorModelHandle } from '@/components/three/operators/OperatorModel';
import { STORM } from '@/lib/v2/tokens';

/**
 * The reusable operator hero/showcase component (Phase 5, 2026-07-17) —
 * hero page, operator select, lobby loadout panel, and future skin store
 * all render THIS. It owns a self-contained Canvas: hero three-point
 * lighting, a bounded turntable, a shadow-catcher ground with a gold
 * identity ring, and the operator itself via OperatorModel (which brings
 * the LOD pipeline, animation states, skins, and the silhouette fallback
 * with it — nothing character-related is reimplemented here).
 *
 * Extension points (typed, functional today, per the "replace any system
 * independently" architecture rule):
 *   `background`     — ReactNode rendered inside the scene, behind the
 *                      operator (a future Sky Temple diorama drops in here)
 *   `cameraDirector` — per-frame camera control; when set it overrides the
 *                      static hero framing entirely (a future scripted
 *                      camera path is this one prop)
 *   `pose` / `skinId`— any OperatorAnimationState / any registered skin
 */
export interface OperatorShowcaseProps {
  operatorId: OperatorId;
  skinId?: string;
  /** Animation state to present in. Default: the lobby idle. */
  pose?: OperatorAnimationState;
  turntable?: boolean;
  /** Radians/second. Slow by default — a display pedestal, not a spinning rig. */
  turntableSpeed?: number;
  reducedMotion?: boolean;
  /** Tailwind classes for the DOM wrapper (sizing/rounding). The Canvas fills it. */
  className?: string;
  background?: ReactNode;
  /** Per-frame camera hook — receives elapsed seconds and the camera. Overrides the built-in static framing while set. */
  cameraDirector?: (elapsedSeconds: number, camera: THREE.Camera) => void;
  onReady?: (handle: OperatorModelHandle) => void;
}

/** WebGL-failure fallback: the operator's monogram on a glass card — same degradation language as the landing's operator cards. */
class ShowcaseErrorBoundary extends Component<{ monogram: string; accent: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="flex h-full w-full items-center justify-center rounded-2xl border border-white/10 bg-storm-deep/40">
          <span className="text-6xl font-black" style={{ color: this.props.accent }}>
            {this.props.monogram}
          </span>
        </div>
      );
    }
    return this.props.children;
  }
}

function HeroFraming({
  targetHeightM,
  cameraDirector,
}: {
  targetHeightM: number;
  cameraDirector?: (elapsedSeconds: number, camera: THREE.Camera) => void;
}) {
  const camera = useThree((state) => state.camera);
  const framedRef = useRef(false);

  useFrame(({ clock }) => {
    if (cameraDirector) {
      cameraDirector(clock.elapsedTime, camera);
      framedRef.current = false; // re-frame statically if the director is later removed
      return;
    }
    if (!framedRef.current) {
      // Static hero framing: slightly off-axis three-quarter, eye-line just
      // above the model's vertical center — proportional to the operator's
      // height so tall/short rigs frame identically.
      camera.position.set(0.55, targetHeightM * 0.82, targetHeightM * 1.78);
      camera.lookAt(0, targetHeightM * 0.55, 0);
      framedRef.current = true;
    }
  });

  return null;
}

function Turntable({
  enabled,
  speed,
  baseRotationY,
  children,
}: {
  enabled: boolean;
  speed: number;
  baseRotationY: number;
  children: ReactNode;
}) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (enabled && groupRef.current) groupRef.current.rotation.y += delta * speed;
  });

  return (
    <group ref={groupRef} rotation={[0, baseRotationY, 0]}>
      {children}
    </group>
  );
}

function RimLightPulse({ color, base, pulseAmplitude, offset, reducedMotion }: { color: string; base: number; pulseAmplitude: number; offset: [number, number, number]; reducedMotion: boolean }) {
  const lightRef = useRef<THREE.PointLight>(null);

  useFrame(({ clock }) => {
    if (!lightRef.current) return;
    lightRef.current.intensity = reducedMotion
      ? base + pulseAmplitude * 0.5
      : base + (0.5 + Math.sin(clock.elapsedTime * 1.1) * 0.5) * pulseAmplitude;
  });

  return <pointLight ref={lightRef} color={color} position={offset} intensity={base} distance={7} decay={2} />;
}

export default function OperatorShowcase({
  operatorId,
  skinId,
  pose = 'lobby_idle',
  turntable = true,
  turntableSpeed = 0.22,
  reducedMotion = false,
  className = 'relative h-full w-full',
  background,
  cameraDirector,
  onReady,
}: OperatorShowcaseProps) {
  const def = getOperatorDefinition(operatorId);
  const { visual, meta } = def;

  return (
    <div className={className}>
      <ShowcaseErrorBoundary monogram={meta.content.monogram} accent={meta.content.accent}>
        <Canvas
          shadows
          dpr={[1, 1.75]}
          gl={{ antialias: true, alpha: true }}
          camera={{ fov: 30, near: 0.1, far: 60 }}
        >
          <HeroFraming targetHeightM={visual.targetHeightM} cameraDirector={cameraDirector} />

          {background}

          {/* Hero lighting — warm marble key, cool sky fill, identity-color rim. */}
          <ambientLight color={STORM.mist} intensity={0.38} />
          <directionalLight
            color="#fff2dc"
            intensity={2.3}
            position={[2.6, 3.6, 2.4]}
            castShadow
            shadow-mapSize-width={1024}
            shadow-mapSize-height={1024}
            shadow-camera-near={0.5}
            shadow-camera-far={12}
            shadow-camera-left={-2.5}
            shadow-camera-right={2.5}
            shadow-camera-top={3.5}
            shadow-camera-bottom={-1}
          />
          <directionalLight color={STORM.sky} intensity={0.55} position={[-3, 1.8, 1.5]} />
          <RimLightPulse
            color={visual.rimLightColor}
            base={visual.rimLightIntensity.base}
            pulseAmplitude={visual.rimLightIntensity.pulseAmplitude}
            offset={visual.rimLightOffset}
            reducedMotion={reducedMotion}
          />

          <Turntable enabled={turntable && !reducedMotion} speed={turntableSpeed} baseRotationY={visual.rotationBaseY}>
            <OperatorModel operatorId={operatorId} skinId={skinId} animationState={pose} reducedMotion={reducedMotion} onReady={onReady} />
          </Turntable>

          {/* Pedestal: shadow catcher + gold identity ring (rounded geometry only). */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} receiveShadow>
            <circleGeometry args={[1.6, 48]} />
            <shadowMaterial opacity={0.32} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
            <torusGeometry args={[0.92, 0.012, 8, 64]} />
            <meshStandardMaterial color={STORM.gold} metalness={0.95} roughness={0.25} />
          </mesh>
        </Canvas>
      </ShowcaseErrorBoundary>
    </div>
  );
}
