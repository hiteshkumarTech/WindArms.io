'use client';

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  CapsuleCollider,
  RigidBody,
  useRapier,
  type RapierCollider,
  type RapierRigidBody,
} from '@react-three/rapier';
import type { KinematicCharacterController } from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { audio } from '@/lib/audio/audioEngine';
import { PLAYER } from '@/lib/game/constants';
import { cameraShake, viewKick } from '@/lib/game/effectsBus';
import { localPose, pendingCorrection } from '@/lib/game/localPose';
import { useCombatStore } from '@/stores/combatStore';
import { accelerate, applyFriction, wishDirection } from '@/lib/game/movement';
import { clamp } from '@/lib/utils';
import { useKeyboardInput } from '@/hooks/useKeyboardInput';
import { useChatStore } from '@/stores/chatStore';
import { usePlayerStore } from '@/stores/playerStore';
import { useSettingsStore } from '@/stores/settingsStore';
import type { MovementState } from '@/types/game';

/**
 * First-person character controller.
 *
 * Architecture: a kinematic capsule driven by Rapier's built-in
 * KinematicCharacterController (autostep, ground snap, slope limits,
 * push-impulses on dynamic bodies). Velocity is integrated manually with
 * source-style accelerate/friction so slides and dashes preserve momentum.
 * All per-frame state lives in refs — the component never re-renders.
 *
 * Networking: publishes its pose to `localPose` every frame (client
 * prediction — the local player never waits on the server) and applies
 * authoritative `pendingCorrection` teleports when validation fails.
 * Input is gated on pointer lock so menu typing never moves the player.
 */
export default function PlayerController() {
  const bodyRef = useRef<RapierRigidBody>(null);
  const colliderRef = useRef<RapierCollider>(null);
  const controllerRef = useRef<KinematicCharacterController | null>(null);

  const { world } = useRapier();
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;
  const inputRef = useKeyboardInput();
  const setSnapshot = usePlayerStore((store) => store.setSnapshot);

  // Simulation state — refs keep the frame loop allocation- and render-free.
  const velocity = useRef(new THREE.Vector3());
  const wishDir = useRef(new THREE.Vector3());
  const yaw = useRef(0);
  const pitch = useRef(0);
  const grounded = useRef(false);
  const lastGroundedAt = useRef(-Infinity);
  const dashUntil = useRef(-Infinity);
  const dashReadyAt = useRef(-Infinity);
  const dashDirection = useRef(new THREE.Vector3());
  const slideUntil = useRef(-Infinity);
  const slideReadyAt = useRef(-Infinity);
  const slideDirection = useRef(new THREE.Vector3());
  const eyeHeight = useRef(PLAYER.EYE_STAND);
  const smoothedFps = useRef(60);
  const hudAccumulator = useRef(0);
  const stepAccumulator = useRef(0);

  // Rapier character controller lifecycle.
  useEffect(() => {
    const controller = world.createCharacterController(0.01);
    controller.enableAutostep(0.45, 0.2, true);
    controller.enableSnapToGround(0.35);
    controller.setMaxSlopeClimbAngle((55 * Math.PI) / 180);
    controller.setMinSlopeSlideAngle((60 * Math.PI) / 180);
    controller.setApplyImpulsesToDynamicBodies(true);
    controller.setCharacterMass(75);
    controllerRef.current = controller;
    return () => {
      world.removeCharacterController(controller);
      controllerRef.current = null;
    };
  }, [world]);

  // Mouse look (only while the pointer is captured).
  useEffect(() => {
    camera.rotation.order = 'YXZ';
    const onMouseMove = (event: MouseEvent) => {
      if (!document.pointerLockElement) return;
      const sensitivity = PLAYER.MOUSE_SENSITIVITY * useSettingsStore.getState().sensitivity;
      yaw.current -= event.movementX * sensitivity;
      pitch.current = clamp(
        pitch.current - event.movementY * sensitivity,
        -PLAYER.PITCH_LIMIT,
        PLAYER.PITCH_LIMIT,
      );
    };
    document.addEventListener('mousemove', onMouseMove);
    return () => document.removeEventListener('mousemove', onMouseMove);
  }, [camera]);

  useFrame((_, rawDelta) => {
    const body = bodyRef.current;
    const collider = colliderRef.current;
    const controller = controllerRef.current;
    if (!body || !collider || !controller) return;

    // Clamp dt so tab-switch spikes never launch the player.
    const dt = Math.min(rawDelta, 1 / 30);
    const now = performance.now();
    const input = inputRef.current;
    const vel = velocity.current;

    // --- Server-authority correction (highest priority) --------------------
    if (pendingCorrection.position) {
      const [cx, cy, cz] = pendingCorrection.position;
      pendingCorrection.position = null;
      vel.set(0, 0, 0);
      body.setTranslation({ x: cx, y: cy, z: cz }, true);
      camera.position.set(cx, cy + eyeHeight.current, cz);
      localPose.position[0] = cx;
      localPose.position[1] = cy;
      localPose.position[2] = cz;
      return;
    }

    // Consume weapon recoil into the view angles.
    if (viewKick.pitch !== 0 || viewKick.yaw !== 0) {
      pitch.current = clamp(
        pitch.current + viewKick.pitch,
        -PLAYER.PITCH_LIMIT,
        PLAYER.PITCH_LIMIT,
      );
      yaw.current += viewKick.yaw;
      viewKick.pitch = 0;
      viewKick.yaw = 0;
    }

    // Input is only live while the cursor is captured, the player lives,
    // and the chat input isn't capturing the keyboard.
    const hasControl =
      document.pointerLockElement !== null &&
      useCombatStore.getState().alive &&
      !useChatStore.getState().open;
    if (hasControl) {
      wishDirection(input.held, yaw.current, wishDir.current);
    } else {
      wishDir.current.set(0, 0, 0);
    }

    // --- Edge-triggered actions -----------------------------------------
    if (
      hasControl &&
      now - input.pressedAt.dash < 150 &&
      now >= dashReadyAt.current &&
      now >= dashUntil.current
    ) {
      input.pressedAt.dash = -Infinity;
      dashUntil.current = now + PLAYER.DASH_DURATION * 1000;
      dashReadyAt.current = now + PLAYER.DASH_COOLDOWN * 1000;
      slideUntil.current = -Infinity;
      if (wishDir.current.lengthSq() > 0) {
        dashDirection.current.copy(wishDir.current);
      } else {
        dashDirection.current.set(-Math.sin(yaw.current), 0, -Math.cos(yaw.current));
      }
    }

    const dashing = now < dashUntil.current;

    if (
      hasControl &&
      !dashing &&
      grounded.current &&
      input.held.sprint &&
      now - input.pressedAt.slide < 150 &&
      now >= slideReadyAt.current
    ) {
      input.pressedAt.slide = -Infinity;
      slideUntil.current = now + PLAYER.SLIDE_DURATION * 1000;
      slideReadyAt.current = now + (PLAYER.SLIDE_DURATION + PLAYER.SLIDE_COOLDOWN) * 1000;
      // Slide along current momentum; fall back to intent, then facing.
      slideDirection.current.set(vel.x, 0, vel.z);
      if (slideDirection.current.lengthSq() < 0.25) slideDirection.current.copy(wishDir.current);
      if (slideDirection.current.lengthSq() < 1e-4) {
        slideDirection.current.set(-Math.sin(yaw.current), 0, -Math.cos(yaw.current));
      }
      slideDirection.current.normalize();
    }

    const sliding = !dashing && now < slideUntil.current && grounded.current;

    // --- Horizontal velocity --------------------------------------------
    if (dashing) {
      vel.x = dashDirection.current.x * PLAYER.DASH_SPEED;
      vel.z = dashDirection.current.z * PLAYER.DASH_SPEED;
      vel.y = 0; // dash is a flat burst: gravity suspended for its duration
    } else if (sliding) {
      const remaining = (slideUntil.current - now) / (PLAYER.SLIDE_DURATION * 1000);
      const slideSpeed =
        PLAYER.SLIDE_END_SPEED + (PLAYER.SLIDE_BOOST - PLAYER.SLIDE_END_SPEED) * remaining;
      vel.x = slideDirection.current.x * slideSpeed + wishDir.current.x * PLAYER.SLIDE_STEER;
      vel.z = slideDirection.current.z * slideSpeed + wishDir.current.z * PLAYER.SLIDE_STEER;
    } else if (grounded.current) {
      applyFriction(vel, PLAYER.FRICTION_GROUND, dt);
      const targetSpeed =
        hasControl && input.held.sprint && input.held.forward
          ? PLAYER.SPRINT_SPEED
          : PLAYER.WALK_SPEED;
      accelerate(vel, wishDir.current, targetSpeed, PLAYER.ACCEL_GROUND, dt);
    } else {
      accelerate(vel, wishDir.current, PLAYER.WALK_SPEED, PLAYER.ACCEL_AIR, dt);
    }

    // --- Gravity and jump -------------------------------------------------
    if (!dashing) {
      vel.y = Math.max(vel.y + PLAYER.GRAVITY * dt, PLAYER.MAX_FALL);
    }

    const withinCoyote = now - lastGroundedAt.current < PLAYER.COYOTE_TIME * 1000;
    const jumpBuffered = hasControl && now - input.pressedAt.jump < PLAYER.JUMP_BUFFER * 1000;
    if (jumpBuffered && !dashing && (grounded.current || withinCoyote)) {
      input.pressedAt.jump = -Infinity;
      vel.y = PLAYER.JUMP_VELOCITY;
      slideUntil.current = -Infinity;
      grounded.current = false;
      lastGroundedAt.current = -Infinity;
      audio.jump();
    }

    // --- Collide-and-slide through the character controller ---------------
    const desiredX = vel.x * dt;
    const desiredY = vel.y * dt;
    const desiredZ = vel.z * dt;
    controller.computeColliderMovement(collider, { x: desiredX, y: desiredY, z: desiredZ });
    const corrected = controller.computedMovement();
    const wasRising = vel.y > 0;

    const wasGrounded = grounded.current;
    grounded.current = controller.computedGrounded();
    if (grounded.current) {
      lastGroundedAt.current = now;
      // Landing thump scaled by impact speed (only meaningful falls).
      if (!wasGrounded && vel.y < -8) audio.land(Math.min(-vel.y - 8, 12));
      if (vel.y < 0) vel.y = -0.6; // small downward bias keeps ground snap engaged
    } else if (wasRising && corrected.y < desiredY - 1e-6) {
      vel.y = 0; // bumped a ceiling
    }

    const position = body.translation();
    let nextX = position.x + corrected.x;
    let nextY = position.y + corrected.y;
    let nextZ = position.z + corrected.z;

    // --- Respawn (fell off the map, or manual reset) ----------------------
    const wantsReset = hasControl && now - input.pressedAt.reset < 200;
    if (nextY < PLAYER.KILL_Y || wantsReset) {
      input.pressedAt.reset = -Infinity;
      vel.set(0, 0, 0);
      [nextX, nextY, nextZ] = PLAYER.SPAWN;
      body.setTranslation({ x: nextX, y: nextY, z: nextZ }, true);
    } else {
      body.setNextKinematicTranslation({ x: nextX, y: nextY, z: nextZ });
    }

    // --- Camera ------------------------------------------------------------
    const targetEye = sliding ? PLAYER.EYE_SLIDE : PLAYER.EYE_STAND;
    eyeHeight.current = THREE.MathUtils.lerp(eyeHeight.current, targetEye, 1 - Math.exp(-12 * dt));
    camera.position.set(nextX, nextY + eyeHeight.current, nextZ);
    camera.rotation.y = yaw.current;
    camera.rotation.x = pitch.current;

    const horizontalSpeed = Math.hypot(vel.x, vel.z);

    // Footsteps: cadence follows actual ground speed.
    if (grounded.current && !sliding && horizontalSpeed > 2) {
      stepAccumulator.current += horizontalSpeed * dt;
      if (stepAccumulator.current >= 2.7) {
        stepAccumulator.current = 0;
        audio.footstep();
      }
    } else {
      stepAccumulator.current = 0;
    }

    // Damage screen shake: squared-trauma rotational noise, decaying fast.
    camera.rotation.z = 0;
    if (cameraShake.trauma > 0) {
      const magnitude = cameraShake.trauma * cameraShake.trauma;
      camera.rotation.z = Math.sin(now * 0.055) * 0.045 * magnitude;
      camera.rotation.x += Math.sin(now * 0.047 + 2.1) * 0.03 * magnitude;
      cameraShake.trauma = Math.max(0, cameraShake.trauma - dt * 1.7);
    }

    const sprinting = hasControl && input.held.sprint && horizontalSpeed > PLAYER.WALK_SPEED + 0.5;
    const baseFov = useSettingsStore.getState().fov;
    const targetFov = dashing ? baseFov + 15 : sprinting || sliding ? baseFov + 7 : baseFov;
    camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 1 - Math.exp(-PLAYER.FOV_LERP * dt));
    camera.updateProjectionMatrix();

    // --- Publish pose for the network layer (client prediction) -----------
    const movementState: MovementState = dashing
      ? 'dash'
      : sliding
        ? 'slide'
        : !grounded.current
          ? 'air'
          : horizontalSpeed < 0.5
            ? 'idle'
            : sprinting
              ? 'sprint'
              : 'run';
    localPose.position[0] = nextX;
    localPose.position[1] = nextY;
    localPose.position[2] = nextZ;
    localPose.yaw = yaw.current;
    localPose.pitch = pitch.current;
    localPose.state = movementState;

    // --- Throttled HUD snapshot (~10 Hz) -----------------------------------
    smoothedFps.current = THREE.MathUtils.lerp(smoothedFps.current, 1 / Math.max(rawDelta, 1e-4), 0.08);
    hudAccumulator.current += dt;
    if (hudAccumulator.current >= 0.1) {
      hudAccumulator.current = 0;
      setSnapshot({
        state: movementState,
        speed: horizontalSpeed,
        fps: Math.round(smoothedFps.current),
        grounded: grounded.current,
        dashCooldown: clamp(1 - (dashReadyAt.current - now) / (PLAYER.DASH_COOLDOWN * 1000), 0, 1),
      });
    }
  });

  return (
    <RigidBody ref={bodyRef} type="kinematicPosition" colliders={false} position={PLAYER.SPAWN}>
      <CapsuleCollider ref={colliderRef} args={[PLAYER.HALF_HEIGHT, PLAYER.RADIUS]} />
    </RigidBody>
  );
}
