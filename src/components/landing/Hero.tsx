'use client';

import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { Crosshair, Download, Play } from 'lucide-react';
import DiscordIcon from '@/components/ui/DiscordIcon';
import GlassButton from '@/components/ui/GlassButton';
import { cn } from '@/lib/utils';
import { useIsomorphicLayoutEffect } from '@/hooks/useIsomorphicLayoutEffect';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import PreviewCards from './PreviewCards';
import StatCards from './StatCards';
import StatusRow from './StatusRow';

const ANIMATED_SELECTORS = [
  '[data-animate="status"]',
  '.hero-word',
  '[data-animate="description"]',
  '[data-animate="cta"] > *',
  '[data-animate="preview"] > *',
];

interface TitleLine {
  text: string;
  accentClass: string;
}

const TITLE_LINES: TitleLine[] = [
  {
    text: 'MASTER THE STORM.',
    accentClass: 'bg-gradient-to-r from-neon-cyan to-neon-purple bg-clip-text text-transparent',
  },
  {
    text: 'DOMINATE EVERY MATCH.',
    accentClass: 'bg-gradient-to-r from-neon-orange to-neon-cyan bg-clip-text text-transparent',
  },
];

/**
 * Splits a line into word spans so GSAP can stagger a blur-fade per word.
 * Word gaps are rendered as margins: whitespace text nodes trailing
 * inline-block elements are collapsed by the browser.
 */
function SplitWords({ text, accentClass }: TitleLine) {
  const words = text.split(' ');
  return (
    <span className="block">
      {words.map((word, index) => (
        <span
          key={`${word}-${index}`}
          className={cn(
            'hero-word inline-block will-change-transform',
            index < words.length - 1 && 'mr-[0.26em]',
            index === words.length - 1 && accentClass,
          )}
        >
          {word}
        </span>
      ))}
    </span>
  );
}

export default function Hero() {
  const rootRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  // Entrance timeline: blur-fade word stagger, then description, CTAs, cards.
  useIsomorphicLayoutEffect(() => {
    if (!rootRef.current) return;

    const ctx = gsap.context(() => {
      if (reducedMotion) {
        gsap.set(ANIMATED_SELECTORS, { opacity: 1, y: 0, filter: 'blur(0px)' });
        return;
      }
      const timeline = gsap.timeline({ defaults: { ease: 'power3.out' } });
      timeline
        .fromTo(
          '[data-animate="status"]',
          { opacity: 0, y: 18, filter: 'blur(8px)' },
          { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.7 },
          0.2,
        )
        .fromTo(
          '.hero-word',
          { opacity: 0, y: 46, filter: 'blur(12px)' },
          { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.85, stagger: 0.07 },
          0.35,
        )
        .fromTo(
          '[data-animate="description"]',
          { opacity: 0, y: 22, filter: 'blur(6px)' },
          { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.7 },
          0.95,
        )
        .fromTo(
          '[data-animate="cta"] > *',
          { opacity: 0, y: 18 },
          { opacity: 1, y: 0, duration: 0.55, stagger: 0.08 },
          1.1,
        )
        .fromTo(
          '[data-animate="preview"] > *',
          { opacity: 0, y: 26 },
          { opacity: 1, y: 0, duration: 0.6, stagger: 0.09 },
          1.25,
        );
    }, rootRef);

    return () => ctx.revert();
  }, [reducedMotion]);

  // Pointer parallax on the hero copy, scroll-independent.
  useEffect(() => {
    if (reducedMotion) return;
    const content = contentRef.current;
    if (!content) return;

    const xTo = gsap.quickTo(content, 'x', { duration: 0.8, ease: 'power3.out' });
    const yTo = gsap.quickTo(content, 'y', { duration: 0.8, ease: 'power3.out' });

    const onPointerMove = (event: MouseEvent) => {
      const nx = event.clientX / window.innerWidth - 0.5;
      const ny = event.clientY / window.innerHeight - 0.5;
      xTo(nx * -10);
      yTo(ny * -6);
    };

    window.addEventListener('mousemove', onPointerMove);
    return () => window.removeEventListener('mousemove', onPointerMove);
  }, [reducedMotion]);

  return (
    <div ref={rootRef} className="absolute inset-0 z-10 flex flex-col justify-end">
      <StatCards />

      <div className="px-5 pb-5 sm:px-8 lg:px-12 lg:pb-8">
        <div ref={contentRef} className="max-w-3xl">
          <StatusRow />

          <h1 className="mt-4 text-[clamp(2rem,5.2vw,4.3rem)] font-extrabold leading-[1.04] tracking-tight text-white [@media(max-height:800px)]:text-[clamp(1.7rem,4.4vw,3.1rem)]">
            {TITLE_LINES.map((line) => (
              <SplitWords key={line.text} {...line} />
            ))}
          </h1>

          <p
            data-animate="description"
            className="mt-4 max-w-xl text-sm leading-relaxed text-white/60 sm:text-[15px]"
          >
            Enter WindArms.io — a fast-paced multiplayer FPS where futuristic anime heroes,
            precision gunplay, and strategic teamwork collide inside breathtaking competitive
            arenas.
          </p>

          <div data-animate="cta" className="mt-6 flex flex-wrap items-center gap-3">
            <GlassButton variant="primary" icon={Play} href="/play">
              Play Free Now
            </GlassButton>
            <GlassButton variant="outline" icon={Crosshair} href="#weapons">
              View Arsenal
            </GlassButton>
            <GlassButton variant="glass" icon={DiscordIcon} href="#community">
              Join Discord
            </GlassButton>
            <GlassButton variant="glass" icon={Download} href="#download">
              Download Client
            </GlassButton>
          </div>
        </div>

        <div className="mt-6 [@media(max-height:760px)]:hidden">
          <PreviewCards />
        </div>
      </div>
    </div>
  );
}
