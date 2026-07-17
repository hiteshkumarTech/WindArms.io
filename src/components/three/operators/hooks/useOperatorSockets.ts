'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import {
  DEFAULT_BONE_FALLBACKS,
  OPERATOR_SOCKETS,
  operatorSocketNodeName,
  type OperatorAttachmentConfig,
  type OperatorSocketId,
} from '@/lib/v2/operators';

/**
 * Resolves an operator instance's typed sockets (Phase 5, 2026-07-17).
 * Resolution order per socket:
 *
 *   1. explicit node name from the operator's OperatorAttachmentConfig
 *   2. the `socket_<id>` authored-empty convention (pipeline standard)
 *   3. humanoid bone-name fallbacks (config override, else the shared
 *      DEFAULT_BONE_FALLBACKS table) — so Mixamo/AccuRig autorigs work
 *      before the Blender socket pass exists
 *
 * When a binding declares an `offset`, a named child Group is created
 * under the resolved node carrying that local offset, and THAT is returned
 * — consumers always get "the socket," never "the socket plus math to do."
 *
 * IMPORTANT: runs against the per-instance CLONE (see OperatorModel), not
 * useGLTF's cached scene — socket Object3Ds must belong to the skeleton
 * that's actually animating on screen.
 */
export interface OperatorSocketLookup {
  get(id: OperatorSocketId): THREE.Object3D | undefined;
  /** Sockets that resolved nothing — surfaced to onReady consumers and dev logs; renderers fall back to their own defaults. */
  missing: readonly OperatorSocketId[];
}

const isDev = process.env.NODE_ENV !== 'production';
const OFFSET_ANCHOR_PREFIX = 'socketoffset_';

function buildLookup(root: THREE.Object3D, attachments: OperatorAttachmentConfig): OperatorSocketLookup {
  // One traversal, one lowercase index — every socket then resolves O(1).
  const byLowerName = new Map<string, THREE.Object3D>();
  root.traverse((node) => {
    const key = node.name.toLowerCase();
    // First occurrence wins; duplicate node names in a rig are an authoring
    // smell reported by tools/inspect-operator.mjs, not silently juggled here.
    if (key && !byLowerName.has(key)) byLowerName.set(key, node);
  });

  const resolved = new Map<OperatorSocketId, THREE.Object3D>();
  const missing: OperatorSocketId[] = [];

  for (const id of OPERATOR_SOCKETS) {
    const binding = attachments[id];
    const candidates: string[] = [
      ...(binding?.node ? [binding.node] : []),
      operatorSocketNodeName(id),
      ...(binding?.fallbackBones ?? DEFAULT_BONE_FALLBACKS[id]),
    ];

    let found: THREE.Object3D | undefined;
    for (const candidate of candidates) {
      found = byLowerName.get(candidate.toLowerCase());
      if (found) break;
    }

    if (!found) {
      missing.push(id);
      continue;
    }

    if (binding?.offset) {
      const anchorName = `${OFFSET_ANCHOR_PREFIX}${id}`;
      let anchor = found.children.find((child) => child.name === anchorName);
      if (!anchor) {
        anchor = new THREE.Group();
        anchor.name = anchorName;
        found.add(anchor);
      }
      const { position, rotationEuler } = binding.offset;
      if (position) anchor.position.set(...position);
      if (rotationEuler) anchor.rotation.set(...rotationEuler);
      resolved.set(id, anchor);
    } else {
      resolved.set(id, found);
    }
  }

  if (isDev && missing.length > 0) {
    console.info(
      `[operators] unresolved sockets on this instance: ${missing.join(', ')} — no authored socket_* empty and no matching fallback bone. Renderers use their own defaults; author the empties per the operator Blender checklist (docs/forge/operator-pipeline.md).`,
    );
  }

  return {
    get: (id) => resolved.get(id),
    missing,
  };
}

const EMPTY_LOOKUP: OperatorSocketLookup = { get: () => undefined, missing: OPERATOR_SOCKETS };

export function useOperatorSockets(root: THREE.Object3D | null, attachments: OperatorAttachmentConfig): OperatorSocketLookup {
  return useMemo(() => (root ? buildLookup(root, attachments) : EMPTY_LOOKUP), [root, attachments]);
}
