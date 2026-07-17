'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { AnimationClipMap } from '@/lib/v2/pipeline';
import type { OperatorAnimationConfig, OperatorAnimationState } from '@/lib/v2/operators';

/**
 * Animation playback for one operator instance (Phase 5, 2026-07-17).
 * Owns an AnimationMixer over the instance root, crossfades between the
 * sixteen OperatorAnimationState states per the policies in the operator's
 * OperatorAnimationConfig, and chains one-shots (jump → fall, reload →
 * idle) via the mixer's 'finished' event.
 *
 * Follows the repo's animation-logic-lives-in-hooks rule (see
 * landing/v2/hooks/) and the "never camera/animation → React state →
 * rerender" rule: everything here is refs + the mixer; `play()` causes
 * zero React renders.
 *
 * Missing clips are a supported condition, not an error: `play()` returns
 * false and warns once per state in dev (the same fail-soft contract as
 * the rest of the pipeline) — so the system runs against a clip-less
 * blockout model today and upgrades to real animation the moment clips
 * exist, with no component changes.
 */
export interface OperatorAnimator {
  /** Crossfades to a state. Returns false (and no-ops) if the loaded model has no clip bound for it. */
  play(state: OperatorAnimationState): boolean;
  /** Stops all actions (rare — mode switches should `play()` something else instead). */
  stopAll(): void;
  hasState(state: OperatorAnimationState): boolean;
  getCurrentState(): OperatorAnimationState | null;
}

const isDev = process.env.NODE_ENV !== 'production';

export function useOperatorAnimations(
  root: THREE.Object3D | null,
  clips: AnimationClipMap | null,
  config: OperatorAnimationConfig,
  /** State to enter as soon as the mixer exists (and again if the root instance is swapped, e.g. LOD/skin change). */
  initialState: OperatorAnimationState = 'idle',
): OperatorAnimator {
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef = useRef<Map<OperatorAnimationState, THREE.AnimationAction>>(new Map());
  const currentRef = useRef<OperatorAnimationState | null>(null);
  const currentActionRef = useRef<THREE.AnimationAction | null>(null);
  const warnedRef = useRef<Set<OperatorAnimationState>>(new Set());
  // The animator object below closes over refs only, so it can stay
  // referentially stable across renders; config lives in a ref so a config
  // identity change doesn't rebuild the world.
  const configRef = useRef(config);
  configRef.current = config;

  const animator = useMemo<OperatorAnimator>(() => {
    const resolveAction = (state: OperatorAnimationState): THREE.AnimationAction | null => {
      const mixer = mixerRef.current;
      if (!mixer) return null;
      const existing = actionsRef.current.get(state);
      if (existing) return existing;

      const binding = configRef.current.clips[state];
      const clip = clips?.get(binding.clip);
      if (!clip) return null;

      const action = mixer.clipAction(clip);
      if (binding.loop === 'repeat') {
        action.setLoop(THREE.LoopRepeat, Infinity);
      } else {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = binding.loop === 'clamp';
      }
      if (binding.timeScale !== undefined) action.timeScale = binding.timeScale;
      actionsRef.current.set(state, action);
      return action;
    };

    return {
      play(state) {
        const next = resolveAction(state);
        if (!next) {
          if (isDev && !warnedRef.current.has(state)) {
            warnedRef.current.add(state);
            console.warn(
              `[operators] no clip for state "${state}" (wants "${configRef.current.clips[state].clip}") on this model — state is a no-op until the clip is authored. Expected: this model predates its animation pass.`,
            );
          }
          return false;
        }
        if (currentActionRef.current === next && currentRef.current === state) return true;

        const fade = configRef.current.clips[state].fadeInS;
        const previous = currentActionRef.current;
        next.reset();
        if (previous && previous !== next) {
          previous.fadeOut(fade);
          next.fadeIn(fade);
        } else {
          next.fadeIn(fade);
        }
        next.play();
        currentActionRef.current = next;
        currentRef.current = state;
        return true;
      },
      stopAll() {
        mixerRef.current?.stopAllAction();
        currentActionRef.current = null;
        currentRef.current = null;
      },
      hasState(state) {
        return Boolean(clips?.get(configRef.current.clips[state].clip));
      },
      getCurrentState() {
        return currentRef.current;
      },
    };
  }, [clips]);

  // (Re)build the mixer whenever the instance root changes.
  useEffect(() => {
    if (!root) return;
    const mixer = new THREE.AnimationMixer(root);
    mixerRef.current = mixer;
    actionsRef.current = new Map();
    currentActionRef.current = null;
    currentRef.current = null;

    const onFinished = (event: { action: THREE.AnimationAction }) => {
      if (event.action !== currentActionRef.current || currentRef.current === null) return;
      const binding = configRef.current.clips[currentRef.current];
      if (binding.returnTo) animator.play(binding.returnTo);
    };
    mixer.addEventListener('finished', onFinished);

    animator.play(initialState);

    return () => {
      mixer.removeEventListener('finished', onFinished);
      mixer.stopAllAction();
      mixer.uncacheRoot(root);
      if (mixerRef.current === mixer) mixerRef.current = null;
    };
    // initialState is an entry condition, not a live control — state changes
    // after mount go through animator.play() (see OperatorModel's effect).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, animator]);

  useFrame((_, delta) => {
    mixerRef.current?.update(delta);
  });

  return animator;
}
