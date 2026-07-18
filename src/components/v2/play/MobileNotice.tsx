'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

/**
 * Desktop-controls notice (Milestone 6). The brief explicitly scopes OUT a
 * touch-control system for this milestone — so on coarse-pointer / narrow
 * viewports we present a clean "desktop recommended" screen instead of a
 * broken half-working mouse-look experience. Detected client-side (pointer:
 * coarse OR width < 900) after mount to avoid any SSR mismatch.
 */
export default function MobileNotice() {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const check = () => {
      const coarse = window.matchMedia('(pointer: coarse)').matches;
      setBlocked(coarse || window.innerWidth < 900);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  if (!blocked) return null;

  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-storm-abyss px-6 text-center text-white">
      <span className="text-xs uppercase tracking-[0.5em] text-storm-energy">Skyfront Trial</span>
      <span className="text-3xl font-black tracking-tight">Desktop controls recommended</span>
      <span className="max-w-sm text-sm leading-6 text-white/65">
        The Skyfront Trial is a mouse-and-keyboard first-person experience. Open it on a desktop browser to deploy. Touch controls are coming in a later build.
      </span>
      <Link
        href="/"
        className="mt-2 rounded-xl border border-white/20 px-6 py-3 text-sm font-semibold uppercase tracking-widest text-white/85 transition-colors hover:bg-white/5"
      >
        Return to Landing
      </Link>
    </div>
  );
}
