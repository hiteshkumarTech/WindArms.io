'use client';

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { CapsuleCollider, RigidBody, useRapier, type RapierCollider, type RapierRigidBody } from '@react-three/rapier';
import type { KinematicCharacterController } from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { PLAYER } from '@/lib/game/constants';
import { accelerate, applyFriction, wishDirection } from '@/lib/game/movement';
import { clamp } from '@/lib/utils';
import { rangeLocalPose } from '@/lib/v2/range/localPose';
import type { RangeInputSnapshot } from '@/lib/v2/range/useRangeKeyboardInput';
import { viewKick } from '@/lib/v2/range/viewKick';
import { TRIAL, WIND_LIFT } from '@/lib/v2/play/constants';
import { useV2MatchStore } from '@/lib/v2/play/matchStore';
import { PLAYER_SPAWN } from '@/lib/v2/play/spawnConfig';
import { useVortexWeaponStore } from '@/lib/v2/weapons/vortexWeaponStore';

/**
 * Skyfront Trial first-person controller (Milestone 6). Same movement core
 * as /v2/range's RangeController — identical Rapier character-controller
 * setup, the same reused lib/game pure movement functions and PLAYER
 * tuning, writing the same rangeLocalPose bus so the shared viewmodel/fire
 * system read one pose source. What's DIFFERENT is match-awareness, which
 * is why this is its own component instead of new props leaking match
 * concepts into the range: movement/jump only while phase === 'active';
 * look allowed during countdown/death (locked pointer, standard FPS feel);
 * respawnNonce teleports to the deterministic spawn; falling below KILL_Y
 * counts as a death through the match store (the "recovery volume"); the
 * Wind Lift's updraft is applied here from WIND_LIFT config (visuals live
 * in WindLift.tsx — both read the same constant, so effect and force can't
 * drift apart).
 */
export default function PlayerController({ inputRef }: { inputRef: React.MutableRefObject<RangeInputSnapshot> }) {
  const bodyRef = useRef<RapierRigidBody>(null);
  const colliderRef = useRef<RapierCollider>(null);
  const controllerRef = useRef<KinematicCharacterController | null>(null);

  const { world } = useRapier();
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;

  const velocity = useRef(new THREE.Vector3());
  const wishDir = useRef(new THREE.Vector3());
  // Yaw convention (three.js YXZ): yaw 0 looks down -Z. The spawn sits on
  // the +Z edge facing into the arena (-Z), so 0 is the deterministic start.
  const yaw = useRef(0);
  const pitch = useRef(0);
  const grounded = useRef(false);
  const lastGroundedAt = useRef(-Infinity);
  const lastRespawnNonce = useRef(0);

  useEffect(() => {
    const controller = world.createCharacterController(0.01);
    controller.enableAutostep(0.3, 0.2, true);
    controller.enableSnapToGround(0.35);
    controller.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
    controller.setMinSlopeSlideAngle((55 * Math.PI) / 180);
    controllerRef.current = controller;
    return () => {
      world.removeCharacterController(controller);
      controllerRef.current = null;
    };
  }, [world]);

  useEffect(() => {
    camera.rotation.order = 'YXZ';
    const onMouseMove = (event: MouseEvent) => {
      if (!document.pointerLockElement) return;
      // Look stays live while locked (active/countdown/death); pause unlocks the pointer, which gates this naturally.
      const sensitivity = PLAYER.MOUSE_SENSITIVITY;
      yaw.current -= event.movementX * sensitivity;
      pitch.current = clamp(pitch.current - event.movementY * sensitivity, -PLAYER.PITCH_LIMIT, PLAYER.PITCH_LIMIT);
    };
    document.addEventListener('mousemove', onMouseMove);
    return () => document.removeEventListener('mousemove', onMouseMove);
  }, [camera]);

  useFrame((_, rawDelta) => {
    const body = bodyRef.current;
    const collider = colliderRef.current;
    const controller = controllerRef.current;
    if (!body || !collider || !controller) return;

    const match = useV2MatchStore.getState();

    // Respawn/restart teleport — nonce-driven, no scene reload.
    if (match.respawnNonce !== lastRespawnNonce.current) {
      lastRespawnNonce.current = match.respawnNonce;
      velocity.current.set(0, 0, 0);
      body.setTranslation({ x: PLAYER_SPAWN[0], y: PLAYER_SPAWN[1], z: PLAYER_SPAWN[2] }, true);
      camera.position.set(PLAYER_SPAWN[0], PLAYER_SPAWN[1] + PLAYER.EYE_STAND, PLAYER_SPAWN[2]);
      return;
    }

    if (match.phase === 'paused') return; // frozen (Physics is also paused at the scene level)

    const dt = Math.min(rawDelta, 1 / 30);
    const now = performance.now();
    const input = inputRef.current;
    const vel = velocity.current;

    if (viewKick.pitch !== 0 || viewKick.yaw !== 0) {
      pitch.current = clamp(pitch.current + viewKick.pitch, -PLAYER.PITCH_LIMIT, PLAYER.PITCH_LIMIT);
      yaw.current += viewKick.yaw;
      viewKick.pitch = 0;
      viewKick.yaw = 0;
    }

    // Movement input only while the match is live and the pointer is captured.
    const canMove = document.pointerLockElement !== null && match.phase === 'active';
    if (canMove) {
      wishDirection(input.held, yaw.current, wishDir.current);
    } else {
      wishDir.current.set(0, 0, 0);
    }

    const ads = useVortexWeaponStore.getState().ads;
    const sprintHeld = canMove && input.held.sprint && !ads;
    const ADS_SPEED_MULTIPLIER = 0.55;

    if (grounded.current) {
      applyFriction(vel, PLAYER.FRICTION_GROUND, dt);
      const targetSpeed = (sprintHeld ? PLAYER.SPRINT_SPEED : PLAYER.WALK_SPEED) * (ads ? ADS_SPEED_MULTIPLIER : 1);
      accelerate(vel, wishDir.current, targetSpeed, PLAYER.ACCEL_GROUND, dt);
    } else {
      accelerate(vel, wishDir.current, PLAYER.WALK_SPEED * (ads ? ADS_SPEED_MULTIPLIER : 1), PLAYER.ACCEL_AIR, dt);
    }

    vel.y = Math.max(vel.y + PLAYER.GRAVITY * dt, PLAYER.MAX_FALL);

    // Wind Lift updraft — smooth acceleration inside the column, active-phase only.
    const position = body.translation();
    if (match.phase === 'active') {
      const dx = position.x - WIND_LIFT.position[0];
      const dz = position.z - WIND_LIFT.position[2];
      const insideColumn = dx * dx + dz * dz <= WIND_LIFT.radius * WIND_LIFT.radius && position.y >= WIND_LIFT.position[1] - 0.5 && position.y <= WIND_LIFT.position[1] + WIND_LIFT.height;
      if (insideColumn) {
        vel.y = Math.min(vel.y + WIND_LIFT.accel * dt, WIND_LIFT.maxRiseSpeed);
        grounded.current = false;
      }
    }

    const withinCoyote = now - lastGroundedAt.current < PLAYER.COYOTE_TIME * 1000;
    const jumpBuffered = canMove && now - input.jumpPressedAt < PLAYER.JUMP_BUFFER * 1000;
    if (jumpBuffered && (grounded.current || withinCoyote)) {
      input.jumpPressedAt = -Infinity;
      vel.y = PLAYER.JUMP_VELOCITY;
      grounded.current = false;
      lastGroundedAt.current = -Infinity;
    }

    const desired = { x: vel.x * dt, y: vel.y * dt, z: vel.z * dt };
    controller.computeColliderMovement(collider, desired);
    const corrected = controller.computedMovement();
    const wasRising = vel.y > 0;

    grounded.current = controller.computedGrounded();
    if (grounded.current) {
      lastGroundedAt.current = now;
      if (vel.y < 0) vel.y = -0.6;
    } else if (wasRising && corrected.y < desired.y - 1e-6) {
      vel.y = 0;
    }

    let nextX = position.x + corrected.x;
    let nextY = position.y + corrected.y;
    let nextZ = position.z + corrected.z;

    // Recovery volume: falling off the arena is a death (respawn via the
    // match flow — deaths increment, timer keeps running), not a silent snap-back.
    if (nextY < TRIAL.KILL_Y) {
      if (match.phase === 'active') {
        match.damagePlayer(TRIAL.PLAYER_MAX_HP, [position.x, TRIAL.KILL_Y, position.z]);
      }
      vel.set(0, 0, 0);
      [nextX, nextY, nextZ] = PLAYER_SPAWN;
      body.setTranslation({ x: nextX, y: nextY, z: nextZ }, true);
    } else {
      body.setNextKinematicTranslation({ x: nextX, y: nextY, z: nextZ });
    }

    camera.position.set(nextX, nextY + PLAYER.EYE_STAND, nextZ);
    camera.rotation.y = yaw.current;
    camera.rotation.x = pitch.current;

    const horizontalSpeed = Math.hypot(vel.x, vel.z);
    const sprinting = sprintHeld && horizontalSpeed > PLAYER.WALK_SPEED + 0.5;

    const targetFov = ads ? PLAYER.FOV_BASE - 14 : sprinting ? PLAYER.FOV_SPRINT : PLAYER.FOV_BASE;
    camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 1 - Math.exp(-PLAYER.FOV_LERP * dt));
    camera.updateProjectionMatrix();

    rangeLocalPose.yaw = yaw.current;
    rangeLocalPose.pitch = pitch.current;
    rangeLocalPose.horizontalSpeed = horizontalSpeed;
    rangeLocalPose.grounded = grounded.current;
    rangeLocalPose.state = !grounded.current ? 'air' : horizontalSpeed < 0.5 ? 'idle' : sprinting ? 'sprint' : 'walk';
  });

  return (
    <RigidBody ref={bodyRef} type="kinematicPosition" colliders={false} position={PLAYER_SPAWN}>
      <CapsuleCollider ref={colliderRef} args={[PLAYER.HALF_HEIGHT, PLAYER.RADIUS]} />
    </RigidBody>
  );
}
