'use client';

import { useEffect, useState } from 'react';
import { useCombatStore, type Banner } from '@/stores/combatStore';

const SHOW_MS = 1800;

/** Center-screen streak/multikill announcement, auto-hiding. */
export default function StreakBanner() {
  const banner = useCombatStore((state) => state.banner);
  const [visible, setVisible] = useState<Banner | null>(null);

  useEffect(() => {
    if (!banner) return;
    setVisible(banner);
    const timer = window.setTimeout(() => {
      setVisible((current) => (current?.id === banner.id ? null : current));
    }, SHOW_MS);
    return () => window.clearTimeout(timer);
  }, [banner]);

  if (!visible) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-[22%] z-20 flex justify-center">
      <div key={visible.id} className="banner-pop text-center">
        <p className="text-3xl font-extrabold tracking-[0.2em] text-neon-orange [text-shadow:0_0_24px_rgba(255,122,0,0.6)]">
          {visible.title}
        </p>
        {visible.subtitle ? (
          <p className="mt-1 text-xs uppercase tracking-widest text-white/60">{visible.subtitle}</p>
        ) : null}
      </div>
    </div>
  );
}
