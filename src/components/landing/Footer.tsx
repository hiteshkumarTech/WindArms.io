'use client';

import Link from 'next/link';
import DiscordIcon from '@/components/ui/DiscordIcon';
import Logo from '@/components/ui/Logo';
import { DISCORD_URL, NAV_LINKS, SITE } from '@/lib/constants';

/** Site footer — shared by the landing page and content routes. */
export default function Footer() {
  return (
    <footer className="relative z-10 border-t border-white/10 bg-void/80 px-5 py-10 sm:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 md:flex-row md:items-start md:justify-between">
        <div className="max-w-xs">
          <Logo />
          <p className="mt-3 text-sm leading-relaxed text-white/50">
            A fast-paced browser multiplayer FPS. Master the storm, dominate every match.
          </p>
          <a
            href={DISCORD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-2 rounded-lg glass px-3 py-2 text-xs font-medium text-white/80 transition-colors hover:text-neon-cyan"
          >
            <DiscordIcon className="h-4 w-4" /> Join our Discord
          </a>
        </div>

        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-10 gap-y-2 sm:grid-cols-3">
          {NAV_LINKS.map((link) =>
            link.href.includes('#') ? (
              <a
                key={link.label}
                href={link.href}
                className="text-sm text-white/55 transition-colors hover:text-white"
              >
                {link.label}
              </a>
            ) : (
              <Link
                key={link.label}
                href={link.href}
                className="text-sm text-white/55 transition-colors hover:text-white"
              >
                {link.label}
              </Link>
            ),
          )}
          <Link href="/play" className="text-sm text-white/55 transition-colors hover:text-white">
            Play
          </Link>
        </nav>
      </div>

      <div className="mx-auto mt-8 flex max-w-6xl flex-col items-center justify-between gap-2 border-t border-white/5 pt-6 text-xs text-white/35 sm:flex-row">
        <p>
          © {new Date().getFullYear()} {SITE.name}. Built for the browser.
        </p>
        <p>Play free — no download required.</p>
      </div>
    </footer>
  );
}
