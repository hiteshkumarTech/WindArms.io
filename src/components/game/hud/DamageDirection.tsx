'use client';

import { useEffect, useReducer } from 'react';
import { useCombatStore } from '@/stores/combatStore';

const LIFETIME_MS = 1300;

/**
 * Directional damage indicators: a red arc flashes around the crosshair
 * pointing toward whoever just shot you, then fades. Bearings are computed
 * view-relative in the hit handler, so an arc sits where the threat is
 * relative to your facing at the moment of the hit.
 */
export default function DamageDirection() {
  const markers = useCombatStore((state) => state.damageDirections);
  const [, tick] = useReducer((n: number) => n + 1, 0);

  // Re-render on a timer so arcs fade out even without new hits.
  useEffect(() => {
    const interval = window.setInterval(tick, 80);
    return () => window.clearInterval(interval);
  }, []);

  const now = Date.now();
  const visible = markers.filter((marker) => now - marker.at < LIFETIME_MS);
  if (visible.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center" aria-hidden>
      {visible.map((marker) => {
        const t = (now - marker.at) / LIFETIME_MS;
        return (
          <svg
            key={marker.id}
            viewBox="0 0 200 200"
            className="absolute h-56 w-56"
            style={{ transform: `rotate(${marker.angle}rad)`, opacity: (1 - t) * 0.9 }}
          >
            <path
              d="M 70 34 Q 100 18 130 34"
              fill="none"
              stroke="#ef4444"
              strokeWidth={6}
              strokeLinecap="round"
            />
          </svg>
        );
      })}
    </div>
  );
}
