import { randomUUID } from 'node:crypto';
import type { FirePacket, JoinResult, PlayerInputPacket } from '../../../shared/protocol';
import { MAP_ORDER } from '../../../shared/maps';
import { CONFIG } from '../config';
import type { TypedServer, TypedSocket } from '../types';
import { GameRoom } from './GameRoom';

/** Unambiguous alphabet for join codes (no 0/O, 1/I). */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

/**
 * Owns every room plus the matchmaking policy. Quickplay fills the
 * most-populated public room with space (players meet each other fast);
 * private rooms are reachable only through their join code.
 */
export class RoomManager {
  private readonly rooms = new Map<string, GameRoom>();
  private readonly codes = new Map<string, string>();
  private readonly membership = new Map<string, string>();
  /** Rotates the map assigned to each newly created room. */
  private mapCursor = 0;

  constructor(private readonly io: TypedServer) {}

  quickplay(socket: TypedSocket, name: string): JoinResult {
    let best: GameRoom | null = null;
    for (const room of this.rooms.values()) {
      if (room.isPrivate || room.isFull) continue;
      if (!best || room.size > best.size) best = room;
    }
    const room = best ?? this.createRoom(false);
    return this.join(room, socket, name);
  }

  createPrivate(socket: TypedSocket, name: string): JoinResult {
    const room = this.createRoom(true);
    return this.join(room, socket, name);
  }

  joinByCode(socket: TypedSocket, name: string, rawCode: string): JoinResult {
    const code = rawCode.trim().toUpperCase();
    const roomId = this.codes.get(code);
    const room = roomId ? this.rooms.get(roomId) : undefined;
    if (!room) return { ok: false, error: 'No room found for that code.' };
    if (room.isFull) return { ok: false, error: 'That room is full.' };
    return this.join(room, socket, name);
  }

  handleInput(socket: TypedSocket, packet: PlayerInputPacket): void {
    const roomId = this.membership.get(socket.id);
    if (!roomId) return;
    this.rooms.get(roomId)?.handleInput(socket, packet);
  }

  handleFire(socket: TypedSocket, packet: FirePacket): void {
    const roomId = this.membership.get(socket.id);
    if (!roomId) return;
    this.rooms.get(roomId)?.handleFire(socket, packet);
  }

  handleRespawn(socket: TypedSocket): void {
    const roomId = this.membership.get(socket.id);
    if (!roomId) return;
    this.rooms.get(roomId)?.handleRespawn(socket);
  }

 

  handleChat(socket: TypedSocket, text: string): void {
    const roomId = this.membership.get(socket.id);
    if (!roomId) return;
    this.rooms.get(roomId)?.handleChat(socket, text);
  }

  leave(socket: TypedSocket): void {
    const roomId = this.membership.get(socket.id);
    this.detach(socket.id);
    if (roomId) socket.leave(roomId);
  }

  handleDisconnect(socketId: string): void {
    this.detach(socketId);
  }

  private detach(socketId: string): void {
    const roomId = this.membership.get(socketId);
    if (!roomId) return;
    this.membership.delete(socketId);

    const room = this.rooms.get(roomId);
    if (!room) return;
    room.removePlayer(socketId);

    if (room.size === 0) {
      room.dispose();
      this.rooms.delete(roomId);
      if (room.code) this.codes.delete(room.code);
      console.log(`[rooms] disposed empty room ${roomId}`);
    }
  }

  private join(room: GameRoom, socket: TypedSocket, name: string): JoinResult {
    if (room.isFull) return { ok: false, error: 'That room is full.' };
    this.detach(socket.id); // leaving any previous room first
    const info = room.addPlayer(socket, name);
    this.membership.set(socket.id, room.id);
    console.log(`[rooms] ${name} (${socket.id}) joined ${room.id} (${room.size} players)`);
    return { ok: true, room: info };
  }

  private createRoom(isPrivate: boolean): GameRoom {
    const id = `room_${randomUUID().slice(0, 8)}`;
    const code = isPrivate ? this.generateCode() : null;
    const mapId = MAP_ORDER[this.mapCursor % MAP_ORDER.length];
    this.mapCursor += 1;
    const room = new GameRoom(this.io, id, code, mapId);
    this.rooms.set(id, room);
    if (code) this.codes.set(code, id);
    console.log(
      `[rooms] created ${isPrivate ? `private room ${id} (code ${code})` : `public room ${id}`} on ${mapId}`,
    );
    return room;
  }

  private generateCode(): string {
    for (;;) {
      let code = '';
      for (let i = 0; i < CODE_LENGTH; i++) {
        code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      }
      if (!this.codes.has(code)) return code;
    }
  }
}
