'use client';

import { forwardRef, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Menu, Play, Wind, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import PlayCta from './shared/PlayCta';
import V2Button from './shared/V2Button';

const NAV_ANCHORS = [
  { label: 'Arsenal', href: '#arsenal' },
  { label: 'Operators', href: '#operators' },
  { label: 'Skyfront', href: '#skyfront' },
  { label: 'Gameplay', href: '#pillars' },
  { label: 'Leaderboard', href: '/leaderboard' },
];

const DESKTOP_LINK_CLASS =
  'rounded-md px-3 py-2 text-[13px] font-medium text-storm-mist/80 transition-colors hover:text-storm-marble focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-storm-sky/70';

const MOBILE_LINK_CLASS =
  'rounded-lg px-4 py-3 text-sm font-medium text-storm-mist/80 transition-colors hover:bg-white/5 hover:text-storm-marble focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-storm-sky/70';

/**
 * V2 navigation: transparent over the hero sky, frosts once scrolled
 * (`.v2-nav-frosted` toggled via classList by the choreography hook —
 * no React state on the scroll path). Below `md`, the anchor list and
 * primary CTA move into a floating glass panel behind a hamburger toggle
 * (there is no other way to reach Arsenal/Operators/Skyfront/Gameplay/
 * Leaderboard on a phone without scrolling the whole page to the footer).
 */
const V2Navbar = forwardRef<HTMLElement>(function V2Navbar(_props, ref) {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!open) return;
    firstLinkRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    const onResize = () => {
      if (window.innerWidth >= 768) setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

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
                <Link href={item.href} className={DESKTOP_LINK_CLASS}>
                  {item.label}
                </Link>
              ) : (
                <a href={item.href} className={DESKTOP_LINK_CLASS}>
                  {item.label}
                </a>
              )}
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          {/* Milestone 6: V2 navbar Play → the V2 vertical slice (/v2/play). Hidden below md — the mobile panel carries its own full-width Play CTA instead of crowding the bar next to the hamburger. */}
          <V2Button href="/v2/play" variant="gold" icon={Play} className="hidden md:inline-flex">
            Play Now
          </V2Button>

          <button
            type="button"
            ref={toggleRef}
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="v2-mobile-nav"
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="grid h-11 w-11 place-items-center rounded-xl border border-white/20 bg-white/10 text-storm-marble backdrop-blur-md transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-storm-sky/70 md:hidden"
          >
            {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
          </button>
        </div>
      </nav>

      {/* Click-outside scrim — sits below the bar only, so the logo/hamburger stay reachable while open. */}
      <div
        aria-hidden
        onClick={() => setOpen(false)}
        className={cn(
          'fixed inset-x-0 top-16 bottom-0 z-20 bg-storm-abyss/40 transition-opacity duration-200 md:hidden',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />

      {/* Floating glass panel */}
      <div
        aria-hidden={!open}
        className={cn(
          'absolute inset-x-4 top-full z-30 mt-3 origin-top rounded-2xl border border-white/15 bg-storm-deep/95 shadow-[0_24px_48px_-20px_rgba(0,0,0,0.6)] backdrop-blur-2xl transition-all duration-200 md:hidden',
          open ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-2 opacity-0',
        )}
      >
        <nav id="v2-mobile-nav" aria-label="Mobile" className="flex flex-col gap-1 p-3">
          {NAV_ANCHORS.map((item, index) =>
            item.href.startsWith('/') ? (
              <Link
                key={item.label}
                ref={index === 0 ? firstLinkRef : undefined}
                href={item.href}
                tabIndex={open ? 0 : -1}
                onClick={() => setOpen(false)}
                className={MOBILE_LINK_CLASS}
              >
                {item.label}
              </Link>
            ) : (
              <a
                key={item.label}
                ref={index === 0 ? firstLinkRef : undefined}
                href={item.href}
                tabIndex={open ? 0 : -1}
                onClick={() => setOpen(false)}
                className={MOBILE_LINK_CLASS}
              >
                {item.label}
              </a>
            ),
          )}
          <PlayCta href="/v2/play" label="Play Now" className="mt-2 w-full" tabIndex={open ? 0 : -1} />
        </nav>
      </div>
    </header>
  );
});

export default V2Navbar;
