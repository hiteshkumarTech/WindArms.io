import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@shared/protocol';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let instance: GameSocket | null = null;

/**
 * Lazily-created singleton socket. `autoConnect: false` keeps the landing
 * page network-silent — the connection opens only when the player actually
 * joins a room from the lobby.
 */
export function getSocket(): GameSocket {
  if (!instance) {
    instance = io(process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:4000', {
      autoConnect: false,
      transports: ['websocket'],
      reconnectionAttempts: 5,
      timeout: 8000,
    });
  }
  return instance;
}
