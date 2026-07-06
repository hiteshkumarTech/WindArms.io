'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { remoteSnapshots, type RemotePose } from '@/lib/network/interpolation';
import { useMultiplayerStore } from '@/stores/multiplayerStore';

const AVATAR_ACCENTS = ['#00F5FF', '#FF7A00', '#7C5CFF', '#34d399', '#f472b6'];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

interface RemoteAvatarProps {
  id: string;
  name: string;
}

/**
 * One interpolated remote player: capsule body, emissive visor facing the
 * player's look direction, accent ring and a floating nametag. Pose is
 * sampled from the snapshot buffer every frame — no React state involved.
 */
function RemoteAvatar({ id, name }: RemoteAvatarProps) {
  const groupRef = useRef<THREE.Group>(null);
  const poseRef = useRef<RemotePose>({
    position: [0, -100, 0],
    yaw: 0,
    pitch: 0,
    state: 'idle',
    alive: true,
    weapon: 'ar',
    health: 100,
  });
  const accent = useMemo(() => AVATAR_ACCENTS[hashString(id) % AVATAR_ACCENTS.length], [id]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;

    const pose = poseRef.current;
    const hasData = remoteSnapshots.samplePlayer(id, pose);
    group.visible = hasData && pose.alive;
    if (!group.visible) return;

    group.position.set(pose.position[0], pose.position[1], pose.position[2]);
    group.rotation.y = pose.yaw;

    // Squash the capsule while sliding — reads clearly at a distance.
    const targetScaleY = pose.state === 'slide' ? 0.55 : 1;
    group.scale.y = THREE.MathUtils.lerp(group.scale.y, targetScaleY, 1 - Math.exp(-10 * delta));
  });

  return (
    <group ref={groupRef} visible={false}>
      <mesh>
        <capsuleGeometry args={[0.4, 1.2, 6, 14]} />
        <meshStandardMaterial color="#141a23" roughness={0.5} metalness={0.5} />
      </mesh>
      {/* Visor (faces -Z, the yaw-forward direction) */}
      <mesh position={[0, 0.45, -0.28]}>
        <boxGeometry args={[0.34, 0.12, 0.16]} />
        <meshStandardMaterial
          color="#02090a"
          emissive={accent}
          emissiveIntensity={2.4}
          toneMapped={false}
        />
      </mesh>
      {/* Accent ring */}
      <mesh position={[0, -0.1, 0]}>
        <cylinderGeometry args={[0.415, 0.415, 0.06, 16]} />
        <meshStandardMaterial
          color="#02090a"
          emissive={accent}
          emissiveIntensity={1.6}
          toneMapped={false}
        />
      </mesh>
      {/* Held weapon (generic silhouette, points along look direction) */}
      <mesh position={[0.28, 0.3, -0.35]}>
        <boxGeometry args={[0.07, 0.09, 0.5]} />
        <meshStandardMaterial color="#10151d" metalness={0.8} roughness={0.4} />
      </mesh>
      <Html position={[0, 1.35, 0]} center distanceFactor={14} style={{ pointerEvents: 'none' }}>
        <div className="whitespace-nowrap rounded-md border border-white/10 bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white/85">
          {name}
        </div>
      </Html>
    </group>
  );
}

/** Mounts an interpolated avatar for every other player in the room. */
export default function RemotePlayers() {
  const players = useMultiplayerStore((state) => state.players);
  const selfId = useMultiplayerStore((state) => state.selfId);
  const remotes = players.filter((player) => player.id !== selfId);

  return (
    <>
      {remotes.map((player) => (
        <RemoteAvatar key={player.id} id={player.id} name={player.name} />
      ))}
    </>
  );
}
