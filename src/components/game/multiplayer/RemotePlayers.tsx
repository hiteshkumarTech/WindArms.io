'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { appearanceForSkin } from '@shared/heroes';
import { remoteSnapshots, type RemotePose } from '@/lib/network/interpolation';
import { useMultiplayerStore } from '@/stores/multiplayerStore';
import HeroRig, { type RigHandle } from '../characters/HeroRig';
import {
  createHeroPose,
  poseFor,
  resolveLocomotion,
  strideCadence,
  type Locomotion,
} from '../characters/heroAnimator';

/** Death collapse + fade duration before the corpse is hidden (ms). */
const DEATH_MS = 1400;
/** Exponential smoothing rate for joint angles (higher = snappier). */
const SMOOTH = 16;
/** Exponential smoothing rate for the measured speed estimate. */
const SPEED_SMOOTH = 8;
/** Clamp per-frame dt so a tab stall can't fling the smoothing. */
const MAX_DT = 0.05;
const TWO_PI = Math.PI * 2;

interface AnimState {
  prevLoco: Locomotion;
  phase: number;
  speed: number;
  lastPos: [number, number, number] | null;
  /** performance.now() of death, or 0 while alive. */
  deathAt: number;
}

interface RemoteAvatarProps {
  id: string;
  name: string;
  heroSkin: string;
  tint: string;
}

/**
 * One interpolated remote player rendered as an articulated hero rig.
 * The outer group owns world position/yaw/visibility; the rig owns its own
 * bones, posed every frame by the animator from the sampled MovementState,
 * a locally measured speed and the look pitch. No React state on the frame
 * path — poses are written straight onto the rig's groups.
 */
function RemoteAvatar({ id, name, heroSkin, tint }: RemoteAvatarProps) {
  const groupRef = useRef<THREE.Group>(null);
  const rigRef = useRef<RigHandle>(null);
  const appearance = useMemo(() => appearanceForSkin(heroSkin), [heroSkin]);

  const poseRef = useRef<RemotePose>({
    position: [0, -100, 0],
    yaw: 0,
    pitch: 0,
    state: 'idle',
    alive: true,
    weapon: 'ar',
    health: 100,
  });
  const outPose = useRef(createHeroPose());
  const anim = useRef<AnimState>({
    prevLoco: 'idle',
    phase: 0,
    speed: 0,
    lastPos: null,
    deathAt: 0,
  });

  useFrame((_, delta) => {
    const group = groupRef.current;
    const rig = rigRef.current;
    if (!group || !rig) return;

    const pose = poseRef.current;
    if (!remoteSnapshots.samplePlayer(id, pose)) {
      group.visible = false;
      return;
    }

    const dt = Math.min(delta, MAX_DT);
    const state = anim.current;

    // Measure horizontal speed from the interpolated position delta.
    if (state.lastPos) {
      const dx = pose.position[0] - state.lastPos[0];
      const dz = pose.position[2] - state.lastPos[2];
      const instant = Math.hypot(dx, dz) / Math.max(dt, 1e-3);
      state.speed = THREE.MathUtils.lerp(state.speed, instant, 1 - Math.exp(-SPEED_SMOOTH * dt));
      state.lastPos[0] = pose.position[0];
      state.lastPos[1] = pose.position[1];
      state.lastPos[2] = pose.position[2];
    } else {
      state.lastPos = [pose.position[0], pose.position[1], pose.position[2]];
      state.speed = 0;
    }

    // Death latch: start the collapse timer on the alive→dead edge; clear it
    // (and restore opacity) when the player respawns.
    const now = performance.now();
    if (pose.alive) {
      if (state.deathAt !== 0) {
        state.deathAt = 0;
        rig.setOpacity(1);
      }
    } else if (state.deathAt === 0) {
      state.deathAt = now;
    }

    const loco = resolveLocomotion(state.prevLoco, {
      state: pose.state,
      speed: state.speed,
      alive: pose.alive,
    });
    state.prevLoco = loco;

    state.phase = (state.phase + strideCadence(loco, state.speed) * dt) % TWO_PI;
    const target = poseFor(loco, state.phase, state.speed, pose.pitch, outPose.current);

    // World transform (already smoothed by snapshot interpolation).
    group.visible = true;
    group.position.set(pose.position[0], pose.position[1], pose.position[2]);
    group.rotation.y = pose.yaw;

    // Death sink + dissolve.
    let sink = 0;
    if (state.deathAt !== 0) {
      const t = Math.min((now - state.deathAt) / DEATH_MS, 1);
      sink = -0.35 * t;
      rig.setOpacity(1 - t);
      if (t >= 1) {
        group.visible = false;
        return;
      }
    }

    // Apply the pose to the bones with exponential smoothing so locomotion
    // changes (land → run, run → slide, death) blend instead of popping.
    const k = 1 - Math.exp(-SMOOTH * dt);
    const lerp = THREE.MathUtils.lerp;
    rig.body.position.y = lerp(rig.body.position.y, target.rootY + sink, k);
    rig.torso.rotation.x = lerp(rig.torso.rotation.x, target.torsoPitch, k);
    rig.torso.rotation.z = lerp(rig.torso.rotation.z, target.torsoRoll, k);
    rig.head.rotation.x = lerp(rig.head.rotation.x, target.headPitch, k);
    rig.head.rotation.y = lerp(rig.head.rotation.y, target.headYaw, k);
    rig.armL.rotation.x = lerp(rig.armL.rotation.x, target.armLPitch, k);
    rig.armL.rotation.z = lerp(rig.armL.rotation.z, target.armLRoll, k);
    rig.forearmL.rotation.x = lerp(rig.forearmL.rotation.x, target.elbowL, k);
    rig.armR.rotation.x = lerp(rig.armR.rotation.x, target.armRPitch, k);
    rig.armR.rotation.z = lerp(rig.armR.rotation.z, target.armRRoll, k);
    rig.forearmR.rotation.x = lerp(rig.forearmR.rotation.x, target.elbowR, k);
    rig.legL.rotation.x = lerp(rig.legL.rotation.x, target.legLPitch, k);
    rig.legR.rotation.x = lerp(rig.legR.rotation.x, target.legRPitch, k);
    rig.weapon.rotation.x = lerp(rig.weapon.rotation.x, target.weaponPitch, k);
  });

  return (
    <group ref={groupRef} visible={false}>
      <HeroRig ref={rigRef} appearance={appearance} tint={tint} />
      <Html position={[0, 1.0, 0]} center distanceFactor={14} style={{ pointerEvents: 'none' }}>
        <div className="whitespace-nowrap rounded-md border border-white/10 bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white/85">
          {name}
        </div>
      </Html>
    </group>
  );
}

/** Mounts an interpolated hero avatar for every other player in the room. */
export default function RemotePlayers() {
  const players = useMultiplayerStore((state) => state.players);
  const selfId = useMultiplayerStore((state) => state.selfId);
  const remotes = players.filter((player) => player.id !== selfId);

  return (
    <>
      {remotes.map((player) => (
        <RemoteAvatar key={player.id} id={player.id} name={player.name} heroSkin={player.heroSkin} tint={player.tint} />
      ))}
    </>
  );
}
