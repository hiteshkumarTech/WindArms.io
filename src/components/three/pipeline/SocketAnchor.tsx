'use client';

import { useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Attaches a React-rendered subtree to a live socket's world transform every
 * frame — the generic version of what AeolusShowpiece's `rotorRef` does by
 * hand for one specific part. This is what a future weapon class uses to
 * parent muzzle-flash VFX, a held-item, or a scope-mounted UI element to a
 * named socket without reparenting the actual THREE scene graph (matches
 * this project's existing convention of per-frame imperative sync via refs
 * — see PlayerController.tsx, CameraRig.tsx — rather than mutating another
 * object's children directly).
 *
 * Renders nothing if `socket` is undefined (safe to use before a model has
 * finished loading, or against an optional socket the model doesn't have).
 */
export default function SocketAnchor({ socket, children }: { socket: THREE.Object3D | undefined; children: ReactNode }) {
  const anchorRef = useRef<THREE.Group>(null);

  useFrame(() => {
    const anchor = anchorRef.current;
    if (!anchor || !socket) return;
    socket.updateWorldMatrix(true, false);
    anchor.matrix.copy(socket.matrixWorld);
    anchor.matrix.decompose(anchor.position, anchor.quaternion, anchor.scale);
  });

  if (!socket) return null;
  return <group ref={anchorRef}>{children}</group>;
}
