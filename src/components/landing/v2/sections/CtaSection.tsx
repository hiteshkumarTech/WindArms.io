'use client';

import Link from 'next/link';
import { Play, Trophy } from 'lucide-react';
import { CTA, FOOTER } from '@/lib/v2/content/cta';
import SectionShell from '../shared/SectionShell';
import V2Button from '../shared/V2Button';
import type { SectionRenderProps } from '../types';

/** Closing deployment call + site footer. */
export default function CtaSection(_props: SectionRenderProps) {
  return (
    <SectionShell id="deploy" className="pb-14">
      <div className="mx-auto max-w-2xl text-center">
        <p data-reveal className="text-[11px] font-bold uppercase tracking-[0.4em] text-storm-gold">
          {CTA.eyebrow}
        </p>
        <h2
          data-reveal
          className="mt-4 text-4xl font-black tracking-tight text-storm-marble sm:text-5xl md:text-6xl"
        >
          {CTA.title}
        </h2>
        <p data-reveal className="mt-5 text-sm leading-relaxed text-storm-mist/75 sm:text-base">
          {CTA.subtitle}
        </p>
        <div data-reveal className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <V2Button href={CTA.primaryCta.href} variant="gold" size="lg" icon={Play}>
            {CTA.primaryCta.label}
          </V2Button>
          <V2Button href={CTA.secondaryCta.href} variant="glass" size="lg" icon={Trophy}>
            {CTA.secondaryCta.label}
          </V2Button>
        </div>
      </div>

      <footer
        data-reveal
        className="mt-24 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 text-center sm:flex-row sm:text-left"
      >
        <div>
          <p className="text-xs font-semibold tracking-wide text-storm-marble/90">{FOOTER.tagline}</p>
          <p className="mt-1 text-[11px] text-storm-mist/50">{FOOTER.build}</p>
        </div>
        <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          {FOOTER.links.map((link) => (
            <li key={link.label}>
              {link.href.startsWith('/') ? (
                <Link
                  href={link.href}
                  className="text-[11px] uppercase tracking-widest text-storm-mist/60 transition-colors hover:text-storm-marble"
                >
                  {link.label}
                </Link>
              ) : (
                <a
                  href={link.href}
                  className="text-[11px] uppercase tracking-widest text-storm-mist/60 transition-colors hover:text-storm-marble"
                >
                  {link.label}
                </a>
              )}
            </li>
          ))}
        </ul>
      </footer>
    </SectionShell>
  );
}
