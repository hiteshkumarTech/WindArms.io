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
import { useVortexWeaponStore } from '@/lib/v2/weapons/vortexWeaponStore';

const RANGE_SPAWN: [number, number, number] = [0, 3, 10];
const RANGE_KILL_Y = -20;

/** Movement-speed multiplier while aiming down sights — standard FPS convention, not v1-sourced (v1 has no ADS). */
const ADS_SPEED_MULTIPLIER = 0.55;
/** FOV narrows while ADS — separate from FOV_SPRINT, the two never apply together (ADS suppresses sprint speed above). */
const ADS_FOV_OFFSET = -14;

/**
 * First-person controller for the V2 weapon range. Deliberately mirrors
 * v1's `src/components/game/player/PlayerController.tsx` (same Rapier
 * KinematicCharacterController pattern, same reused `accelerate`/
 * `applyFriction`/`wishDirection` pure functions, same `PLAYER` tuning
 * constants) but trimmed to what this task actually needs — walk, sprint,
 * jump, mouse look, camera recoil consumption, ADS speed/FOV — with no
 * slide/dash/wall-run/lag-comp/networking, none of which this brief asked
 * for. A separate component, not a v1 import, so `/play` is never touched.
 */
export default function RangeController({ inputRef }: { inputRef: React.MutableRefObject<RangeInputSnapshot> }) {
  const bodyRef = useRef<RapierRigidBody>(null);
  const colliderRef = useRef<RapierCollider>(null);
  const controllerRef = useRef<KinematicCharacterController | null>(null);

  const { world } = useRapier();
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;

  const velocity = useRef(new THREE.Vector3());
  const wishDir = useRef(new THREE.Vector3());
  const yaw = useRef(0);
  const pitch = useRef(0);
  const grounded = useRef(false);
  const lastGroundedAt = useRef(-Infinity);

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

    const dt = Math.min(rawDelta, 1 / 30);
    const now = performance.now();
    const input = inputRef.current;
    const vel = velocity.current;

    // Consume weapon recoil into the view angles — same pattern as v1's PlayerController.
    if (viewKick.pitch !== 0 || viewKick.yaw !== 0) {
      pitch.current = clamp(pitch.current + viewKick.pitch, -PLAYER.PITCH_LIMIT, PLAYER.PITCH_LIMIT);
      yaw.current += viewKick.yaw;
      viewKick.pitch = 0;
      viewKick.yaw = 0;
    }

    const hasControl = document.pointerLockElement !== null;
    if (hasControl) {
      wishDirection(input.held, yaw.current, wishDir.current);
    } else {
      wishDir.current.set(0, 0, 0);
    }

    const ads = useVortexWeaponStore.getState().ads;
    const sprintHeld = hasControl && input.held.sprint && !ads;

    if (grounded.current) {
      applyFriction(vel, PLAYER.FRICTION_GROUND, dt);
      const targetSpeed = (sprintHeld ? PLAYER.SPRINT_SPEED : PLAYER.WALK_SPEED) * (ads ? ADS_SPEED_MULTIPLIER : 1);
      accelerate(vel, wishDir.current, targetSpeed, PLAYER.ACCEL_GROUND, dt);
    } else {
      accelerate(vel, wishDir.current, PLAYER.WALK_SPEED * (ads ? ADS_SPEED_MULTIPLIER : 1), PLAYER.ACCEL_AIR, dt);
    }

    vel.y = Math.max(vel.y + PLAYER.GRAVITY * dt, PLAYER.MAX_FALL);

    const withinCoyote = now - lastGroundedAt.current < PLAYER.COYOTE_TIME * 1000;
    const jumpBuffered = hasControl && now - input.jumpPressedAt < PLAYER.JUMP_BUFFER * 1000;
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

    const position = body.translation();
    let nextX = position.x + corrected.x;
    let nextY = position.y + corrected.y;
    let nextZ = position.z + corrected.z;

    if (nextY < RANGE_KILL_Y) {
      vel.set(0, 0, 0);
      [nextX, nextY, nextZ] = RANGE_SPAWN;
      body.setTranslation({ x: nextX, y: nextY, z: nextZ }, true);
    } else {
      body.setNextKinematicTranslation({ x: nextX, y: nextY, z: nextZ });
    }

    camera.position.set(nextX, nextY + PLAYER.EYE_STAND, nextZ);
    camera.rotation.y = yaw.current;
    camera.rotation.x = pitch.current;

    const horizontalSpeed = Math.hypot(vel.x, vel.z);
    const sprinting = sprintHeld && horizontalSpeed > PLAYER.WALK_SPEED + 0.5;

    const baseFov = PLAYER.FOV_BASE;
    const targetFov = ads ? baseFov + ADS_FOV_OFFSET : sprinting ? PLAYER.FOV_SPRINT : baseFov;
    camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 1 - Math.exp(-PLAYER.FOV_LERP * dt));
    camera.updateProjectionMatrix();

    rangeLocalPose.yaw = yaw.current;
    rangeLocalPose.pitch = pitch.current;
    rangeLocalPose.horizontalSpeed = horizontalSpeed;
    rangeLocalPose.grounded = grounded.current;
    rangeLocalPose.state = !grounded.current ? 'air' : horizontalSpeed < 0.5 ? 'idle' : sprinting ? 'sprint' : 'walk';
  });

  return (
    <RigidBody ref={bodyRef} type="kinematicPosition" colliders={false} position={RANGE_SPAWN}>
      <CapsuleCollider ref={colliderRef} args={[PLAYER.HALF_HEIGHT, PLAYER.RADIUS]} />
    </RigidBody>
  );
}
