import * as THREE from 'three';
import type { SocketEntry, SocketMap, SocketName } from './types';

/**
 * A GLB signals an attachment point by including an empty (any Object3D —
 * typically an Empty exported from Blender, no mesh/geometry of its own)
 * named exactly one of the SocketName strings in ./types.ts. This walks the
 * loaded scene graph once after load and builds a lookup map from it.
 *
 * Sockets are *live references*, not baked transforms — read
 * `object3D.matrixWorld` (or `getWorldPosition`/`getWorldQuaternion`) every
 * frame you need them, since the model's own animation (§ animationClips.ts)
 * may move a socket node between frames (e.g. a muzzle socket riding a
 * recoiling barrel).
 */
export function extractSockets(scene: THREE.Object3D): SocketMap {
  const entries: SocketEntry[] = [];
  scene.traverse((node) => {
    if (node.name.startsWith('socket_')) {
      entries.push({ name: node.name, object3D: node });
    }
  });

  const byName = new Map(entries.map((entry) => [entry.name, entry.object3D]));

  return {
    all: entries,
    get(name: SocketName | string) {
      return byName.get(name);
    },
  };
}

const worldPos = new THREE.Vector3();
const worldQuat = new THREE.Quaternion();

/** Convenience: a socket's current world-space position as a plain tuple, matching effectsBus's `[number, number, number]` request shape. */
export function socketWorldPosition(object3D: THREE.Object3D): [number, number, number] {
  object3D.getWorldPosition(worldPos);
  return [worldPos.x, worldPos.y, worldPos.z];
}

/** A socket's current world-space forward direction (-Z, matching this project's rig/weapon convention — see heroAnimator.ts), as a plain tuple. */
export function socketWorldDirection(object3D: THREE.Object3D): [number, number, number] {
  object3D.getWorldQuaternion(worldQuat);
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(worldQuat);
  return [dir.x, dir.y, dir.z];
}
