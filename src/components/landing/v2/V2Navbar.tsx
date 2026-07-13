'use client';

import { forwardRef } from 'react';
import Link from 'next/link';
import { Play, Wind } from 'lucide-react';
import V2Button from './shared/V2Button';

const NAV_ANCHORS = [
  { label: 'Arsenal', href: '#arsenal' },
  { label: 'Operators', href: '#operators' },
  { label: 'Skyfront', href: '#skyfront' },
  { label: 'Gameplay', href: '#pillars' },
  { label: 'Leaderboard', href: '/leaderboard' },
];

/**
 * V2 navigation: transparent over the hero sky, frosts once scrolled
 * (`.v2-nav-frosted` toggled via classList by the choreography hook —
 * no React state on the scroll path).
 */
const V2Navbar = forwardRef<HTMLElement>(function V2Navbar(_props, ref) {
  return (
    <header
      ref={ref}
      className="fixed inset-x-0 top-0 z-40 transition-[background-color,border-color,backdrop-filter] duration-300"
    >
      <nav className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-5 sm:px-8" aria-label="Primary">
        <Link href="/" className="group flex items-center gap-2.5" aria-label="WindArms home">
          <span className="grid h-9 w-9 place-items-center rounded-xl border border-storm-gold/40 bg-storm-gold/10">
            <Wind className="h-5 w-5 text-storm-gold" strokeWidth={2.2} aria-hidden />
          </span>
          <span className="text-lg font-black tracking-[0.18em] text-storm-marble">
            WINDARMS
          </span>
        </Link>

        <ul className="hidden items-center gap-1 md:flex">
          {NAV_ANCHORS.map((item) => (
            <li key={item.label}>
              {item.href.startsWith('/') ? (
                <Link
                  href={item.href}
                  className="rounded-md px-3 py-2 text-[13px] font-medium text-storm-mist/80 transition-colors hover:text-storm-marble focus-visible:outline-none focus-visible:text-storm-marble"
                >
                  {item.label}
                </Link>
              ) : (
                <a
                  href={item.href}
                  className="rounded-md px-3 py-2 text-[13px] font-medium text-storm-mist/80 transition-colors hover:text-storm-marble focus-visible:outline-none focus-visible:text-storm-marble"
                >
                  {item.label}
                </a>
              )}
            </li>
          ))}
        </ul>

        <V2Button href="/play" variant="gold" icon={Play}>
          Play Now
        </V2Button>
      </nav>
    </header>
  );
});

export default V2Navbar;
