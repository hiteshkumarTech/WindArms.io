'use client';

import { useEffect, useRef } from 'react';

/**
 * Keys currently held, sampled by the frame loop via a ref — same
 * convention as v1's src/hooks/useKeyboardInput.ts, trimmed to what the
 * range scene uses (no slide/dash: out of scope, see the Phase 4 report)
 * and with no v1 chat-store dependency, since this scene has no chat.
 * `jump`/`slide` stay permanently false — they exist only so this object is
 * structurally assignable to v1's `HeldInput` (required by the reused, pure
 * `wishDirection()`) without allocating an adapter object every frame; jump
 * itself is edge-triggered via `jumpPressedAt` below, and there's no slide.
 */
export interface RangeHeldInput {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  sprint: boolean;
  jump: false;
  slide: false;
}

export interface RangeInputSnapshot {
  held: RangeHeldInput;
  /** performance.now() of the last Space press (repeat-suppressed) — jump buffering, same idiom as v1. */
  jumpPressedAt: number;
  /** performance.now() of the last F press — inspect trigger. */
  inspectPressedAt: number;
  /** performance.now() of the last R press — manual reload trigger. */
  reloadPressedAt: number;
}

function createSnapshot(): RangeInputSnapshot {
  return {
    held: { forward: false, back: false, left: false, right: false, sprint: false, jump: false, slide: false },
    jumpPressedAt: -Infinity,
    inspectPressedAt: -Infinity,
    reloadPressedAt: -Infinity,
  };
}

export function useRangeKeyboardInput(): React.MutableRefObject<RangeInputSnapshot> {
  const inputRef = useRef<RangeInputSnapshot>(createSnapshot());

  useEffect(() => {
    const apply = (code: string, down: boolean, repeat: boolean) => {
      const input = inputRef.current;
      const now = performance.now();
      switch (code) {
        case 'KeyW':
        case 'ArrowUp':
          input.held.forward = down;
          break;
        case 'KeyS':
        case 'ArrowDown':
          input.held.back = down;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          input.held.left = down;
          break;
        case 'KeyD':
        case 'ArrowRight':
          input.held.right = down;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          input.held.sprint = down;
          break;
        case 'Space':
          if (down && !repeat) input.jumpPressedAt = now;
          break;
        case 'KeyF':
          if (down && !repeat) input.inspectPressedAt = now;
          break;
        case 'KeyR':
          if (down && !repeat) input.reloadPressedAt = now;
          break;
        default:
          break;
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (document.pointerLockElement) event.preventDefault();
      apply(event.code, true, event.repeat);
    };
    const onKeyUp = (event: KeyboardEvent) => apply(event.code, false, false);
    const onBlur = () => {
      inputRef.current = createSnapshot();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  return inputRef;
}
