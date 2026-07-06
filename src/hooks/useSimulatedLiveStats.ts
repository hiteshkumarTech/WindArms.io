'use client';

import { useEffect, useState } from 'react';
import { clamp } from '@/lib/utils';

interface LiveStats {
  players: number;
  servers: number;
  ping: number;
}

/**
 * Presentational live-telemetry ticker for the landing page status row.
 * Values drift within realistic bounds so the page feels alive.
 * Swapped for real Socket.IO server telemetry in Phase 3.
 */
export function useSimulatedLiveStats(): LiveStats {
  const [players, setPlayers] = useState(18427);
  const [ping, setPing] = useState(14);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setPlayers((current) => clamp(current + Math.round((Math.random() - 0.47) * 40), 17800, 19400));
      setPing(12 + Math.round(Math.random() * 4));
    }, 3200);
    return () => window.clearInterval(interval);
  }, []);

  return { players, servers: 64, ping };
}
