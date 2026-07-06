'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { localPose } from '@/lib/game/localPose';
import { getSocket } from '@/lib/network/socket';
import { useMultiplayerStore } from '@/stores/multiplayerStore';
import { useWeaponStore } from '@/stores/weaponStore';

const SEND_INTERVAL_S = 1 / 30;

/**
 * Publishes the local player's pose to the server at 30 Hz while online.
 * Uses volatile emits: a dropped pose packet is worthless a frame later,
 * so it should never queue behind a congested socket.
 */
export default function NetworkSync() {
  const online = useMultiplayerStore(
    (state) => state.mode === 'online' && state.status === 'connected',
  );
  const accumulator = useRef(0);
  const sequence = useRef(0);

  useFrame((_, delta) => {
    if (!online) return;
    accumulator.current += delta;
    if (accumulator.current < SEND_INTERVAL_S) return;
    accumulator.current = 0;

    const socket = getSocket();
    if (!socket.connected) return;

    socket.volatile.emit('player:input', {
      seq: sequence.current++,
      position: [localPose.position[0], localPose.position[1], localPose.position[2]],
      yaw: localPose.yaw,
      pitch: localPose.pitch,
      state: localPose.state,
      weapon: useWeaponStore.getState().current,
    });
  });

  return null;
}
