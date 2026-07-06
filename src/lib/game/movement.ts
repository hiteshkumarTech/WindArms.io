import * as THREE from 'three';
import type { HeldInput } from '@/types/game';

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Source-style ground friction: exponential horizontal speed decay,
 * clamped to zero below a small epsilon. Mutates `velocity` in place
 * (the frame loop is allocation-free by design).
 */
export function applyFriction(velocity: THREE.Vector3, friction: number, dt: number): void {
  const speed = Math.hypot(velocity.x, velocity.z);
  if (speed < 1e-4) {
    velocity.x = 0;
    velocity.z = 0;
    return;
  }
  const drop = speed * friction * dt;
  const scale = Math.max(speed - drop, 0) / speed;
  velocity.x *= scale;
  velocity.z *= scale;
}

/**
 * Source-style acceleration: only adds speed up to `wishSpeed` along
 * `wishDir`, which preserves momentum from slides/dashes instead of
 * hard-clamping velocity. Mutates `velocity` in place.
 */
export function accelerate(
  velocity: THREE.Vector3,
  wishDir: THREE.Vector3,
  wishSpeed: number,
  accel: number,
  dt: number,
): void {
  const currentSpeed = velocity.x * wishDir.x + velocity.z * wishDir.z;
  const addSpeed = wishSpeed - currentSpeed;
  if (addSpeed <= 0) return;
  const accelSpeed = Math.min(accel * wishSpeed * dt, addSpeed);
  velocity.x += wishDir.x * accelSpeed;
  velocity.z += wishDir.z * accelSpeed;
}

/**
 * Camera-relative, normalized horizontal movement intent.
 * Writes into `out` and returns it (zero vector when no keys are held).
 */
export function wishDirection(held: HeldInput, yaw: number, out: THREE.Vector3): THREE.Vector3 {
  const forward = (held.forward ? 1 : 0) - (held.back ? 1 : 0);
  const strafe = (held.right ? 1 : 0) - (held.left ? 1 : 0);
  out.set(strafe, 0, -forward);
  if (out.lengthSq() === 0) return out;
  out.normalize();
  out.applyAxisAngle(UP, yaw);
  return out;
}
