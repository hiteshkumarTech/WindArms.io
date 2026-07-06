'use client';

import { useEffect, useReducer } from 'react';
import { Crosshair, Skull } from 'lucide-react';
import { WEAPONS } from '@shared/weapons';
import { cn } from '@/lib/utils';
import { useCombatStore } from '@/stores/combatStore';

const ENTRY_LIFETIME_MS = 6000;

/** Recent eliminations, top-right, fading out after a few seconds. */
export default function KillFeed() {
  const feed = useCombatStore((state) => state.feed);
  const [, forceRender] = useReducer((tick: number) => tick + 1, 0);

  // Re-render once a second so expired entries disappear without new events.
  useEffect(() => {
    const interval = window.setInterval(forceRender, 1000);
    return () => window.clearInterval(interval);
  }, []);

  const now = Date.now();
  const visible = feed.filter((entry) => now - entry.at < ENTRY_LIFETIME_MS);
  if (visible.length === 0) return null;

  return (
    <div className="pointer-events-none absolute right-5 top-16 z-20 flex flex-col items-end gap-1.5">
      {visible.map((entry) => (
        <div
          key={entry.id}
          className={cn(
            'glass flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium',
            entry.self === 'killer' && 'border-neon-cyan/40',
            entry.self === 'victim' && 'border-red-500/40',
          )}
        >
          <span className={cn(entry.self === 'killer' ? 'text-neon-cyan' : 'text-white/85')}>
            {entry.killerName}
          </span>
          <span className="flex items-center gap-1 text-white/40">
            {entry.headshot ? (
              <Skull className="h-3 w-3 text-red-400" aria-hidden />
            ) : (
              <Crosshair className="h-3 w-3" aria-hidden />
            )}
            <span className="text-[10px] uppercase tracking-wider">
              {WEAPONS[entry.weapon].name}
            </span>
          </span>
          <span className={cn(entry.self === 'victim' ? 'text-red-400' : 'text-white/85')}>
            {entry.victimName}
          </span>
        </div>
      ))}
    </div>
  );
}
