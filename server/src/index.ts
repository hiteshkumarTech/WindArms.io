import http from 'node:http';
import cors from 'cors';
import express from 'express';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '../../shared/protocol';
import { CONFIG } from './config';
import {
  isWellFormedFire,
  isWellFormedInput,
  sanitizeChatText,
  sanitizeName,
} from './game/validation';
import { RoomManager } from './rooms/RoomManager';

const app = express();
app.use(cors({ origin: CONFIG.CLIENT_ORIGIN }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

const httpServer = http.createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  serveClient: false,
  cors: { origin: CONFIG.CLIENT_ORIGIN, methods: ['GET', 'POST'] },
});

const roomManager = new RoomManager(io);

io.on('connection', (socket) => {
  console.log(`[net] connected ${socket.id}`);

  socket.on('room:quickplay', (payload, ack) => {
    if (typeof ack !== 'function') return;
    ack(roomManager.quickplay(socket, sanitizeName(payload?.name)));
  });

  socket.on('room:create', (payload, ack) => {
    if (typeof ack !== 'function') return;
    ack(roomManager.createPrivate(socket, sanitizeName(payload?.name)));
  });

  socket.on('room:join', (payload, ack) => {
    if (typeof ack !== 'function') return;
    if (typeof payload?.code !== 'string') {
      ack({ ok: false, error: 'Invalid join code.' });
      return;
    }
    ack(roomManager.joinByCode(socket, sanitizeName(payload.name), payload.code));
  });

  socket.on('room:leave', () => {
    roomManager.leave(socket);
  });

  socket.on('player:input', (packet) => {
    if (!isWellFormedInput(packet)) return;
    roomManager.handleInput(socket, packet);
  });

  socket.on('combat:fire', (packet) => {
    if (!isWellFormedFire(packet)) return;
    roomManager.handleFire(socket, packet);
  });

  socket.on('combat:respawn', () => {
    roomManager.handleRespawn(socket);
  });

  socket.on('chat:send', (text) => {
    const cleaned = sanitizeChatText(text);
    if (cleaned.length === 0) return;
    roomManager.handleChat(socket, cleaned);
  });

  socket.on('chat:send', (text) => {
    const cleaned = sanitizeChatText(text);
    if (cleaned.length === 0) return;
    roomManager.handleChat(socket, cleaned);
  });

  socket.on('net:ping', (_clientTime, ack) => {
    if (typeof ack === 'function') ack(Date.now());
  });

  socket.on('disconnect', (reason) => {
    roomManager.handleDisconnect(socket.id);
    console.log(`[net] disconnected ${socket.id} (${reason})`);
  });
});

httpServer.listen(CONFIG.PORT, () => {
  console.log(`[server] WindArms.io server listening on :${CONFIG.PORT}`);
  console.log(`[server] accepting connections from ${CONFIG.CLIENT_ORIGIN}`);
});

function shutdown(signal: string): void {
  console.log(`[server] ${signal} received, shutting down`);
  io.close(() => {
    httpServer.close(() => process.exit(0));
  });
  // Failsafe if sockets refuse to drain.
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
