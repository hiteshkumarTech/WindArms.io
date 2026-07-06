'use client';

import { useCallback, useRef } from 'react';
import { useMotionValue, useSpring, type MotionValue } from 'framer-motion';

interface MagneticControls {
  ref: React.MutableRefObject<HTMLElement | null>;
  x: MotionValue<number>;
  y: MotionValue<number>;
  onMouseMove: (event: React.MouseEvent<HTMLElement>) => void;
  onMouseLeave: () => void;
}

/**
 * Magnetic-hover behaviour: the element is attracted toward the cursor
 * while hovered and springs back to rest on leave.
 */
export function useMagnetic(strength = 0.3): MagneticControls {
  const ref = useRef<HTMLElement | null>(null);
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const x = useSpring(rawX, { stiffness: 280, damping: 20, mass: 0.55 });
  const y = useSpring(rawY, { stiffness: 280, damping: 20, mass: 0.55 });

  const onMouseMove = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      const element = ref.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      rawX.set((event.clientX - (rect.left + rect.width / 2)) * strength);
      rawY.set((event.clientY - (rect.top + rect.height / 2)) * strength);
    },
    [rawX, rawY, strength],
  );

  const onMouseLeave = useCallback(() => {
    rawX.set(0);
    rawY.set(0);
  }, [rawX, rawY]);

  return { ref, x, y, onMouseMove, onMouseLeave };
}
