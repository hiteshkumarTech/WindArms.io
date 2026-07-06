'use client';

import { useCallback, useEffect } from 'react';
import {
  SERVER_TICK_RATE,
  type ChatMessage,
  type DeathEvent,
  type HitEvent,
  type JoinResult,
  type PublicPlayer,
  type RemoteFireEvent,
  type RespawnEvent,
  type RoomSnapshot,
  type Vec3,
} from '@shared/protocol';
import { WEAPONS } from '@shared/weapons';
import { effectsBus } from '@/lib/game/effectsBus';
import { pendingCorrection } from '@/lib/game/localPose';
import { remoteSnapshots } from '@/lib/network/interpolation';
import { getSocket, type GameSocket } from '@/lib/network/socket';
import { useChatStore } from '@/stores/chatStore';
import { useCombatStore } from '@/stores/combatStore';
import { useMultiplayerStore, type PlayerScore } from '@/stores/multiplayerStore';
import { useWeaponStore } from '@/stores/weaponStore';

const JOIN_TIMEOUT_MS = 8000;

function resetSessionState(): void {
  remoteSnapshots.clear();
  useCombatStore.getState().reset();
  useWeaponStore.getState().resetAll();
  useChatStore.getState().reset();
}

/**
 * Multiplayer session orchestration: owns the socket lifecycle, event
 * subscriptions (poses + combat) and RTT sampling. Mount exactly once
 * (GameView) — overlays receive the returned actions as props.
 */
export function useMultiplayer() {
  // Persistent event subscriptions.
  useEffect(() => {
    const socket = getSocket();

    const onState = (snapshot: RoomSnapshot) => {
      remoteSnapshots.push(snapshot);
      const store = useMultiplayerStore.getState();

      // Self-healing roster: snapshots are authoritative about membership.
      if (snapshot.players.length !== store.players.length) {
        store.syncRoster(snapshot.players.map(({ id, name }) => ({ id, name })));
      }

      // Match clock derived from server ticks (updates once per second).
      const seconds = Math.floor(snapshot.tick / SERVER_TICK_RATE);
      if (seconds !== store.matchSeconds) store.setMatchSeconds(seconds);

      // Scoreboard sync — only writes when a K/D value actually changed.
      let scoresDirty = Object.keys(store.scores).length !== snapshot.players.length;
      const nextScores: Record<string, PlayerScore> = {};
      for (const player of snapshot.players) {
        nextScores[player.id] = { kills: player.kills, deaths: player.deaths };
        const previous = store.scores[player.id];
        if (!previous || previous.kills !== player.kills || previous.deaths !== player.deaths) {
          scoresDirty = true;
        }
      }
      if (scoresDirty) store.setScores(nextScores);
    };
    const onPlayerJoined = (player: PublicPlayer) => {
      useMultiplayerStore.getState().addPlayer(player);
    };
    const onPlayerLeft = (playerId: string) => {
      useMultiplayerStore.getState().removePlayer(playerId);
    };
    const onCorrection = (position: Vec3) => {
      pendingCorrection.position = [position[0], position[1], position[2]];
    };
    const onFired = (event: RemoteFireEvent) => {
      if (event.shooterId === useMultiplayerStore.getState().selfId) return;
      const color = WEAPONS[event.weapon].tracerColor;
      for (const end of event.ends) {
        effectsBus.spawnTracer({
          from: [event.origin[0], event.origin[1] - 0.12, event.origin[2]],
          to: [end[0], end[1], end[2]],
          color,
        });
        effectsBus.spawnImpact({ at: [end[0], end[1], end[2]], color });
      }
    };
    const onHit = (event: HitEvent) => {
      const selfId = useMultiplayerStore.getState().selfId;
      if (event.shooterId === selfId) useCombatStore.getState().confirmedHit();
      if (event.victimId === selfId) useCombatStore.getState().selfDamaged(event.victimHealth);
    };
    const onDeath = (event: DeathEvent) => {
      useCombatStore.getState().recordDeath(event, useMultiplayerStore.getState().selfId);
    };
    const onRespawned = (event: RespawnEvent) => {
      if (event.playerId !== useMultiplayerStore.getState().selfId) return;
      pendingCorrection.position = [event.position[0], event.position[1], event.position[2]];
      useCombatStore.getState().respawned();
      useWeaponStore.getState().resetAll();
    };
    const onChat = (message: ChatMessage) => {
      useChatStore.getState().add(message, useMultiplayerStore.getState().selfId);
    };
    const onDisconnect = () => {
      const state = useMultiplayerStore.getState();
      if (state.mode === 'online') {
        resetSessionState();
        state.connectionLost();
      }
    };

    socket.on('room:state', onState);
    socket.on('room:playerJoined', onPlayerJoined);
    socket.on('room:playerLeft', onPlayerLeft);
    socket.on('player:correction', onCorrection);
    socket.on('combat:fired', onFired);
    socket.on('combat:hit', onHit);
    socket.on('combat:death', onDeath);
    socket.on('combat:respawned', onRespawned);
    socket.on('chat:message', onChat);
    socket.on('disconnect', onDisconnect);
    return () => {
      socket.off('room:state', onState);
      socket.off('room:playerJoined', onPlayerJoined);
      socket.off('room:playerLeft', onPlayerLeft);
      socket.off('player:correction', onCorrection);
      socket.off('combat:fired', onFired);
      socket.off('combat:hit', onHit);
      socket.off('combat:death', onDeath);
      socket.off('combat:respawned', onRespawned);
      socket.off('chat:message', onChat);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  // RTT sampling while online.
  const online = useMultiplayerStore((state) => state.mode === 'online');
  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    const interval = window.setInterval(async () => {
      try {
        const sentAt = Date.now();
        await getSocket().timeout(3000).emitWithAck('net:ping', sentAt);
        if (!cancelled) useMultiplayerStore.getState().setRtt(Date.now() - sentAt);
      } catch {
        // Timed-out ping: keep the last reading.
      }
    }, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [online]);

  const connect = useCallback(
    () =>
      new Promise<GameSocket>((resolve, reject) => {
        const socket = getSocket();
        if (socket.connected) {
          resolve(socket);
          return;
        }
        const timer = window.setTimeout(() => {
          cleanup();
          reject(new Error('connect timeout'));
        }, JOIN_TIMEOUT_MS);
        const onConnect = () => {
          cleanup();
          resolve(socket);
        };
        const onError = (error: Error) => {
          cleanup();
          reject(error);
        };
        const cleanup = () => {
          window.clearTimeout(timer);
          socket.off('connect', onConnect);
          socket.off('connect_error', onError);
        };
        socket.once('connect', onConnect);
        socket.once('connect_error', onError);
        socket.connect();
      }),
    [],
  );

  const runJoin = useCallback(
    async (perform: (socket: GameSocket) => Promise<JoinResult>): Promise<boolean> => {
      useMultiplayerStore.getState().setConnecting();
      try {
        const socket = await connect();
        const result = await perform(socket);
        if (!result.ok) {
          useMultiplayerStore.getState().setError(result.error);
          return false;
        }
        resetSessionState();
        useMultiplayerStore.getState().joinedRoom(result.room);
        return true;
      } catch {
        useMultiplayerStore.getState().setError('Could not reach the game server.');
        return false;
      }
    },
    [connect],
  );

  const quickplay = useCallback(
    (name: string) =>
      runJoin((socket) => socket.timeout(JOIN_TIMEOUT_MS).emitWithAck('room:quickplay', { name })),
    [runJoin],
  );

  const createRoom = useCallback(
    (name: string) =>
      runJoin((socket) => socket.timeout(JOIN_TIMEOUT_MS).emitWithAck('room:create', { name })),
    [runJoin],
  );

  const joinByCode = useCallback(
    (name: string, code: string) =>
      runJoin((socket) => socket.timeout(JOIN_TIMEOUT_MS).emitWithAck('room:join', { name, code })),
    [runJoin],
  );

  const playOffline = useCallback(() => {
    resetSessionState();
    useMultiplayerStore.getState().startOffline();
  }, []);

  const leave = useCallback(() => {
    const socket = getSocket();
    if (socket.connected) socket.emit('room:leave');
    socket.disconnect();
    resetSessionState();
    useMultiplayerStore.getState().resetToMenu();
  }, []);

  return { quickplay, createRoom, joinByCode, playOffline, leave };
}
