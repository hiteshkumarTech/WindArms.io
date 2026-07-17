'use client';

import type { ReactNode } from 'react';
import SocketAnchor from '@/components/three/pipeline/SocketAnchor';
import type { OperatorSocketId } from '@/lib/v2/operators';
import type { OperatorModelHandle } from './OperatorModel';

/**
 * Typed operator flavor of the pipeline's SocketAnchor (reused, not
 * duplicated — same per-frame world-transform sync underneath). Parents
 * React-rendered content to a live operator socket:
 *
 *   <OperatorSocketAnchor handle={handle} socket="weapon_primary">
 *     <WeaponShowpiece weaponId="aeolus" fallback={<ProceduralAeolus />} />
 *   </OperatorSocketAnchor>
 *
 * Renders nothing while `handle` is null (model not loaded yet) or the
 * socket didn't resolve — safe to mount unconditionally.
 */
export default function OperatorSocketAnchor({
  handle,
  socket,
  children,
}: {
  handle: OperatorModelHandle | null;
  socket: OperatorSocketId;
  children: ReactNode;
}) {
  return <SocketAnchor socket={handle?.sockets.get(socket)}>{children}</SocketAnchor>;
}
