'use client';

import { useCallback, useEffect } from 'react';
import {
  SERVER_TICK_RATE,
  type ChatMessage,
  type DeathEvent,
  type HitEvent,
  type JoinResult,
  type MapId,
  type PublicPlayer,
  type RemoteFireEvent,
  type RespawnEvent,
  type RoomSnapshot,
  type Vec3,
} from '@shared/protocol';
import {
  MULTIKILL_NAMES,
  SHUTDOWN_THRESHOLD,
  STREAK_NAMES,
  type MatchPhase,
  type PodiumEntry,
  type StreakTier,
} from '@shared/match';
import { WEAPONS } from '@shared/weapons';
import { audio } from '@/lib/audio/audioEngine';
import { cameraShake, effectsBus } from '@/lib/game/effectsBus';
import { localPose, pendingCorrection } from '@/lib/game/localPose';
import { remoteSnapshots, type RemotePose } from '@/lib/network/interpolation';
import { getSocket, type GameSocket } from '@/lib/network/socket';
import { useAuthStore } from '@/stores/authStore';
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

/** Scratch pose for locating remote players at death time (no allocs). */
const deathPoseScratch: RemotePose = {
  position: [0, 0, 0],
  yaw: 0,
  pitch: 0,
  state: 'idle',
  alive: true,
  weapon: 'ar',
  health: 100,
};

/** Scratch pose for locating the shooter when we take damage (no allocs). */
const hitFromScratch: RemotePose = {
  position: [0, 0, 0],
  yaw: 0,
  pitch: 0,
  state: 'idle',
  alive: true,
  weapon: 'ar',
  health: 100,
};

/** Unit direction from one point to another; falls back to "straight up" for a zero-length span. */
function directionBetween(
  from: [number, number, number],
  to: [number, number, number],
): [number, number, number] {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  const len = Math.hypot(dx, dy, dz);
  return len > 1e-6 ? [dx / len, dy / len, dz / len] : [0, 1, 0];
}

/** Ring of hit sparks plus an expanding shockwave ring and light flash at an elimination site. */
function spawnDeathBurst(position: [number, number, number], accent: string): void {
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2;
    effectsBus.spawnImpact({
      at: [
        position[0] + Math.cos(angle) * 0.55,
        position[1] - 0.3 + (i % 3) * 0.45,
        position[2] + Math.sin(angle) * 0.55,
      ],
      color: i % 2 === 0 ? accent : '#ffd27f',
    });
  }
  effectsBus.spawnExplosion({ at: position, color: accent });
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
      const isEnergy = event.weapon === 'energy';
      const from: [number, number, number] = [event.origin[0], event.origin[1] - 0.12, event.origin[2]];
      for (const end of event.ends) {
        const to: [number, number, number] = [end[0], end[1], end[2]];
        effectsBus.spawnTracer({ from, to, color, energy: isEnergy });
        effectsBus.spawnImpact({ at: to, color, dir: directionBetween(from, to), energy: isEnergy });
      }
      // Once per shot event, not per pellet end — matches the local shooter's cadence.
      effectsBus.spawnMuzzleSmoke({ at: from, energy: isEnergy });
      audio.remoteShot(event.weapon, event.origin);
    };
    const onHit = (event: HitEvent) => {
      const selfId = useMultiplayerStore.getState().selfId;
      if (event.shooterId === selfId) {
        useCombatStore.getState().confirmedHit(event.headshot, event.victimHealth <= 0);
        audio.hitConfirm(event.headshot);
        effectsBus.spawnDamageNumber({
          at: [event.hitPos[0], event.hitPos[1], event.hitPos[2]],
          amount: event.damage,
          headshot: event.headshot,
        });
      }
      if (event.victimId === selfId) {
        useCombatStore.getState().selfDamaged(event.victimHealth);
        audio.damaged();
        cameraShake.trauma = Math.min(cameraShake.trauma + 0.2 + event.damage / 160, 0.6);
        // Directional indicator: bearing from us to the shooter, relative to view.
        if (remoteSnapshots.samplePlayer(event.shooterId, hitFromScratch)) {
          const dx = hitFromScratch.position[0] - localPose.position[0];
          const dz = hitFromScratch.position[2] - localPose.position[2];
          const yawNow = localPose.yaw;
          const forward = -dx * Math.sin(yawNow) - dz * Math.cos(yawNow);
          const right = dx * Math.cos(yawNow) - dz * Math.sin(yawNow);
          useCombatStore.getState().addDamageDirection(Math.atan2(right, forward));
        }
      }
    };
    const onDeath = (event: DeathEvent) => {
      const selfId = useMultiplayerStore.getState().selfId;
      useCombatStore.getState().recordDeath(event, selfId);

      // Ending a big streak gets its own callout for the killer.
      if (event.victimStreakEnded >= SHUTDOWN_THRESHOLD && event.killerId === selfId) {
        useCombatStore.getState().showBanner('SHUTDOWN', `ended ${event.victimName}'s streak`);
      }

      // Elimination VFX + spatial audio at the victim's last known position.
      const accent = WEAPONS[event.weapon].tracerColor;
      if (event.victimId === selfId) {
        const at: [number, number, number] = [
          localPose.position[0],
          localPose.position[1],
          localPose.position[2],
        ];
        spawnDeathBurst(at, accent);
        audio.death(null);
        cameraShake.trauma = Math.min(cameraShake.trauma + 0.5, 0.8);
      } else if (remoteSnapshots.samplePlayer(event.victimId, deathPoseScratch)) {
        spawnDeathBurst(
          [deathPoseScratch.position[0], deathPoseScratch.position[1], deathPoseScratch.position[2]],
          accent,
        );
        audio.death(deathPoseScratch.position);
      }
    };
    const onRespawned = (event: RespawnEvent) => {
      if (event.playerId !== useMultiplayerStore.getState().selfId) return;
      pendingCorrection.position = [event.position[0], event.position[1], event.position[2]];
      useCombatStore.getState().respawned();
      useWeaponStore.getState().resetAll();
      audio.respawn();
    };
    const onChat = (message: ChatMessage) => {
      useChatStore.getState().add(message, useMultiplayerStore.getState().selfId);
    };
    const onAccountXp = (payload: { xp: number; level: number }) => {
      useAuthStore.getState().updateXp(payload.xp, payload.level);
    };
    const onPhase = (payload: { phase: MatchPhase; endsAt: number; mapId: MapId }) => {
      const store = useMultiplayerStore.getState();
      const mapChanged = payload.mapId !== store.mapId;
      store.setPhase(payload.phase, payload.endsAt, payload.mapId);
      if (mapChanged) remoteSnapshots.clear();
      if (payload.phase === 'playing') useCombatStore.getState().resetScores();
    };
    const onMatchEnded = (payload: { podium: PodiumEntry[]; winnerId: string | null }) => {
      useMultiplayerStore.getState().setPodium(payload.podium, payload.winnerId);
      audio.roundEnd();
    };
    const onStreak = (payload: { playerId: string; name: string; tier: StreakTier }) => {
      const self = payload.playerId === useMultiplayerStore.getState().selfId;
      useCombatStore
        .getState()
        .showBanner(STREAK_NAMES[payload.tier], self ? undefined : payload.name);
      audio.streakStinger(payload.tier);
    };
    const onMultikill = (payload: { playerId: string; name: string; count: number }) => {
      const self = payload.playerId === useMultiplayerStore.getState().selfId;
      const title = MULTIKILL_NAMES[payload.count] ?? 'MULTI KILL';
      useCombatStore.getState().showBanner(title, self ? undefined : payload.name);
      audio.multikillStinger(payload.count);
    };
    const onKicked = (reason: string) => {
      resetSessionState();
      const store = useMultiplayerStore.getState();
      store.resetToMenu();
      store.setError(reason);
      getSocket().disconnect();
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
    socket.on('account:xp', onAccountXp);
    socket.on('match:phase', onPhase);
    socket.on('match:ended', onMatchEnded);
    socket.on('combat:streak', onStreak);
    socket.on('combat:multikill', onMultikill);
    socket.on('system:kicked', onKicked);
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
      socket.off('account:xp', onAccountXp);
      socket.off('match:phase', onPhase);
      socket.off('match:ended', onMatchEnded);
      socket.off('combat:streak', onStreak);
      socket.off('combat:multikill', onMultikill);
      socket.off('system:kicked', onKicked);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  // RTT sampling while online. The measured round-trip is reported back on the
  // next ping so the server can lag-compensate hits (F4).
  const online = useMultiplayerStore((state) => state.mode === 'online');
  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    let lastRtt = -1; // unset until the first round-trip completes; server ignores it
    const interval = window.setInterval(async () => {
      try {
        const sentAt = Date.now();
        await getSocket().timeout(3000).emitWithAck('net:ping', { clientTime: sentAt, rtt: lastRtt });
        if (!cancelled) {
          lastRtt = Date.now() - sentAt;
          useMultiplayerStore.getState().setRtt(lastRtt);
        }
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
        // Attach the account token (if any) to the handshake so in-match
        // kills persist. Must be set before connect().
        const token = useAuthStore.getState().token;
        socket.auth = token ? { token } : {};
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
