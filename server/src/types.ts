import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '../../shared/protocol';

/** Attached during the handshake when a valid account token is presented. */
export interface SocketData {
  user?: {
    id: string;
    username: string;
    xp: number;
    equippedHeroSkin: string;
    equippedTint: string;
  };
}

interface InterServerEvents {
  [event: string]: (...args: never[]) => void;
}

export type TypedServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;
export type TypedSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;
