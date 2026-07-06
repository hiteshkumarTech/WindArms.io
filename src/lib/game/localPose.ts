import type { MovementState } from '@/types/game';

export interface LocalPose {
  position: [number, number, number];
  yaw: number;
  pitch: number;
  state: MovementState;
}

/**
 * The local player's latest pose, written by PlayerController every frame
 * and read by NetworkSync at the send rate. A plain mutable module object
 * keeps the controller decoupled from networking (it doesn't know whether
 * a session is online) with zero per-frame allocation.
 */
export const localPose: LocalPose = {
  position: [0, 3, 10],
  yaw: 0,
  pitch: 0,
  state: 'idle',
};

/**
 * Server-authority correction awaiting consumption. The network layer
 * writes it; PlayerController teleports and clears it on the next frame.
 */
export const pendingCorrection: { position: [number, number, number] | null } = {
  position: null,
};
