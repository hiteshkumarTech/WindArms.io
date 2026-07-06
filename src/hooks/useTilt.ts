'use client';

import { useCallback, useRef } from 'react';
import {
  useMotionTemplate,
  useMotionValue,
  useSpring,
  type MotionValue,
} from 'framer-motion';

interface TiltControls {
  ref: React.MutableRefObject<HTMLElement | null>;
  rotateX: MotionValue<number>;
  rotateY: MotionValue<number>;
  /** CSS background that follows the cursor as a soft glare highlight. */
  glare: MotionValue<string>;
  onMouseMove: (event: React.MouseEvent<HTMLElement>) => void;
  onMouseLeave: () => void;
}

/** 3D tilt-toward-cursor behaviour with a cursor-tracked glare highlight. */
export function useTilt(maxTilt = 8): TiltControls {
  const ref = useRef<HTMLElement | null>(null);
  const rawRotateX = useMotionValue(0);
  const rawRotateY = useMotionValue(0);
  const glareX = useMotionValue(50);
  const glareY = useMotionValue(50);

  const rotateX = useSpring(rawRotateX, { stiffness: 220, damping: 18 });
  const rotateY = useSpring(rawRotateY, { stiffness: 220, damping: 18 });
  const glare = useMotionTemplate`radial-gradient(220px circle at ${glareX}% ${glareY}%, rgba(255, 255, 255, 0.1), transparent 65%)`;

  const onMouseMove = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      const element = ref.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width;
      const py = (event.clientY - rect.top) / rect.height;
      rawRotateX.set((0.5 - py) * maxTilt * 2);
      rawRotateY.set((px - 0.5) * maxTilt * 2);
      glareX.set(px * 100);
      glareY.set(py * 100);
    },
    [glareX, glareY, maxTilt, rawRotateX, rawRotateY],
  );

  const onMouseLeave = useCallback(() => {
    rawRotateX.set(0);
    rawRotateY.set(0);
    glareX.set(50);
    glareY.set(50);
  }, [glareX, glareY, rawRotateX, rawRotateY]);

  return { ref, rotateX, rotateY, glare, onMouseMove, onMouseLeave };
}
