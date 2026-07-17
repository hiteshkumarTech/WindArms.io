'use client';

import { ChevronDown, Compass, Globe, Play, Zap } from 'lucide-react';
import { HERO } from '@/lib/v2/content/hero';
import { useSimulatedLiveStats } from '@/hooks/useSimulatedLiveStats';
import { useHeroAnimation } from '../hooks/useHeroAnimation';
import V2Button from '../shared/V2Button';
import type { SectionRenderProps } from '../types';

function StatusChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] font-medium text-storm-marble/90 backdrop-blur-md">
      {children}
    </span>
  );
}

/**
 * Full-viewport opening shot over the storm sky. The entrance timeline
 * lives in useHeroAnimation and is gated on the boot preloader handoff.
 */
export default function HeroSection({ bootDone }: SectionRenderProps) {
  const rootRef = useHeroAnimation<HTMLDivElement>(bootDone);
  const { players, servers, ping } = useSimulatedLiveStats();

  return (
    <div ref={rootRef} id="hero" className="relative flex min-h-[100dvh] items-center">
      {/*
        Legibility scrim, added in the 2026-07-16 cinematic composition pass:
        local to the hero's text column only, not a page-wide overlay (see
        LandingV2View.tsx's separate full-page "readability veil", which
        stays untouched). The Wind Temple citadel sits close enough to the
        headline at some viewport widths that text-only contrast wasn't
        reliable — this is the "local backdrop separation" approach the brief
        asked for instead of a heavier full-scene darkening.
      */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 z-0 w-full max-w-2xl bg-gradient-to-r from-storm-abyss/55 via-storm-abyss/25 to-transparent sm:max-w-3xl"
      />
      <div className="relative z-10 mx-auto w-full max-w-6xl px-5 pt-16 sm:px-8">
        <div className="max-w-3xl">
          <p
            data-hero="eyebrow"
            className="text-[11px] font-bold uppercase tracking-[0.4em] text-storm-gold"
          >
            {HERO.eyebrow}
          </p>

          <h1 className="mt-5 text-[clamp(2.6rem,7.5vw,5.6rem)] font-black leading-[0.98] tracking-tight">
            {HERO.titleLines.map((line, lineIndex) => (
              <span key={line} className="block">
                {line.split(' ').map((word, wordIndex) => (
                  <span
                    key={`${word}-${wordIndex}`}
                    data-hero="word"
                    className={
                      lineIndex === 1
                        ? 'mr-[0.26em] inline-block bg-gradient-to-r from-storm-gold via-storm-marble to-storm-sky bg-clip-text text-transparent last:mr-0'
                        : 'mr-[0.26em] inline-block text-storm-marble last:mr-0'
                    }
                  >
                    {word}
                  </span>
                ))}
              </span>
            ))}
          </h1>

          <p
            data-hero="lore"
            className="mt-6 max-w-xl text-sm leading-relaxed text-storm-mist/85 sm:text-base"
          >
            {HERO.lore}
          </p>

          <div data-hero="cta" className="mt-8 flex flex-wrap items-center gap-3">
            <V2Button href={HERO.primaryCta.href} variant="gold" size="lg" icon={Play}>
              {HERO.primaryCta.label}
            </V2Button>
            <V2Button href={HERO.secondaryCta.href} variant="glass" size="lg" icon={Compass}>
              {HERO.secondaryCta.label}
            </V2Button>
          </div>

          <div data-hero="status" className="mt-8 flex flex-wrap items-center gap-2">
            <StatusChip>
              <span className="relative flex h-2 w-2" aria-hidden>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              <span className="tabular-nums">{players.toLocaleString('en-US')}</span> Pilots Aloft
            </StatusChip>
            <StatusChip>
              <Globe className="h-3 w-3 text-storm-sky" aria-hidden />
              {servers} Sky Servers
            </StatusChip>
            <StatusChip>
              <Zap className="h-3 w-3 text-storm-gold" aria-hidden />
              <span className="tabular-nums">{ping}</span> ms
            </StatusChip>
            <StatusChip>V1 live · V2 rising</StatusChip>
          </div>
        </div>
      </div>

      <a
        data-hero="cue"
        href="#arsenal"
        aria-label="Scroll to the arsenal"
        className="absolute bottom-7 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1 text-storm-mist/70 transition-colors hover:text-storm-marble"
      >
        <span className="text-[10px] uppercase tracking-[0.35em]">{HERO.scrollCue}</span>
        <ChevronDown className="h-5 w-5 animate-bounce" aria-hidden />
      </a>
    </div>
  );
}
