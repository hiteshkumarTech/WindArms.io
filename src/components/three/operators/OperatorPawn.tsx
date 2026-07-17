'use client';

import { type ReactNode } from 'react';
import { type OperatorAnimationState, type OperatorId } from '@/lib/v2/operators';
import OperatorModel, { type OperatorModelHandle } from './OperatorModel';

/**
 * Third-person presentation pawn (Phase 5, 2026-07-17): OperatorModel plus
 * a typed preset table mapping every third-person CONTEXT to its default
 * animation state. Adding a context (e.g. a future emote wheel preview) is
 * one row here — no component rewrites, same contract as the animation
 * state system itself.
 *
 * `animationState` overrides the preset when a caller needs a specific
 * state inside a context (e.g. a killcam replaying a death → 'death').
 * Future emotes slot in exactly there: emote states extend
 * OperatorAnimationState, then any pawn can play them via this prop.
 */
export type OperatorPawnContext = 'lobby' | 'killcam' | 'spectator' | 'victory' | 'mvp';

export const PAWN_CONTEXT_PRESETS: Record<OperatorPawnContext, OperatorAnimationState> = {
  lobby: 'lobby_idle',
  killcam: 'idle',
  spectator: 'idle',
  victory: 'victory',
  mvp: 'selection_pose',
};

export interface OperatorPawnProps {
  operatorId: OperatorId;
  context: OperatorPawnContext;
  skinId?: string;
  /** Overrides the context's preset state. */
  animationState?: OperatorAnimationState;
  reducedMotion?: boolean;
  /** Content anchored to the pawn's group (nameplates, selection ring VFX) — NOT socket-attached; use OperatorSocketAnchor with the onReady handle for that. */
  children?: ReactNode;
  onReady?: (handle: OperatorModelHandle) => void;
}

export default function OperatorPawn({
  operatorId,
  context,
  skinId,
  animationState,
  reducedMotion = false,
  children,
  onReady,
}: OperatorPawnProps) {
  return (
    <group name={`operator_pawn_${context}`}>
      <OperatorModel
        operatorId={operatorId}
        skinId={skinId}
        renderMode="full"
        animationState={animationState ?? PAWN_CONTEXT_PRESETS[context]}
        reducedMotion={reducedMotion}
        onReady={onReady}
      />
      {children}
    </group>
  );
}
