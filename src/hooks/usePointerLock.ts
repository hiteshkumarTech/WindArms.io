'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface PointerLockControls {
  locked: boolean;
  request: () => void;
  setTarget: (element: HTMLElement | null) => void;
}

/** Pointer-lock lifecycle: capture on request, react to Esc/losses. */
export function usePointerLock(): PointerLockControls {
  const [locked, setLocked] = useState(false);
  const targetRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const onChange = () => setLocked(document.pointerLockElement !== null);
    const onError = () => setLocked(false);
    document.addEventListener('pointerlockchange', onChange);
    document.addEventListener('pointerlockerror', onError);
    return () => {
      document.removeEventListener('pointerlockchange', onChange);
      document.removeEventListener('pointerlockerror', onError);
    };
  }, []);

  const setTarget = useCallback((element: HTMLElement | null) => {
    targetRef.current = element;
  }, []);

  const request = useCallback(() => {
    targetRef.current?.requestPointerLock();
  }, []);

  return { locked, request, setTarget };
}
