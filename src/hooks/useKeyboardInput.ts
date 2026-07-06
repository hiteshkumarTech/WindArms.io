'use client';

import { useEffect, useRef } from 'react';
import type { InputSnapshot } from '@/types/game';
import { useChatStore } from '@/stores/chatStore';

function createInitialSnapshot(): InputSnapshot {
  return {
    held: {
      forward: false,
      back: false,
      left: false,
      right: false,
      jump: false,
      sprint: false,
      slide: false,
    },
    pressedAt: {
      jump: -Infinity,
      dash: -Infinity,
      slide: -Infinity,
      reset: -Infinity,
    },
  };
}

/**
 * Keyboard state as a mutable ref so the physics frame loop can sample it
 * without triggering React re-renders. Held keys are level-triggered;
 * `pressedAt` timestamps are edge-triggered for buffered actions.
 */
export function useKeyboardInput(): React.MutableRefObject<InputSnapshot> {
  const inputRef = useRef<InputSnapshot>(createInitialSnapshot());

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
        case 'Space':
          input.held.jump = down;
          if (down && !repeat) input.pressedAt.jump = now;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          input.held.sprint = down;
          break;
        case 'KeyC':
        case 'ControlLeft':
          input.held.slide = down;
          if (down && !repeat) input.pressedAt.slide = now;
          break;
        case 'KeyQ':
          if (down && !repeat) input.pressedAt.dash = now;
          break;
        case 'KeyK':
          if (down && !repeat) input.pressedAt.reset = now;
          break;
        default:
          break;
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      // While chat owns the keyboard, don't consume or suppress anything.
      if (useChatStore.getState().open) return;
      // Stop Space scrolling / browser shortcuts while the cursor is captured.
      if (document.pointerLockElement) event.preventDefault();
      apply(event.code, true, event.repeat);
    };
    const onKeyUp = (event: KeyboardEvent) => apply(event.code, false, false);
    const onBlur = () => {
      // Losing focus never fires keyup: release everything to avoid stuck keys.
      inputRef.current = createInitialSnapshot();
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
