'use client';

import { ArrowUpRight } from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';
import { ACCENT_HEX, PREVIEW_CARDS } from '@/lib/constants';

/** Clickable section-preview cards along the bottom of the hero. */
export default function PreviewCards() {
  return (
    <div data-animate="preview" className="hidden gap-3 md:grid md:grid-cols-4">
      {PREVIEW_CARDS.map((card) => {
        const accent = ACCENT_HEX[card.accent];
        return (
          <GlassCard key={card.title} href={card.href} ariaLabel={`Explore ${card.title}`}>
            <span
              className="animated-border"
              style={{ '--accent': accent } as React.CSSProperties}
              aria-hidden
            />
            <div className="p-4">
              <div className="flex items-start justify-between">
                <span
                  className="grid h-9 w-9 place-items-center rounded-lg border"
                  style={{ borderColor: `${accent}40`, backgroundColor: `${accent}14`, color: accent }}
                >
                  <card.icon className="h-[18px] w-[18px]" aria-hidden />
                </span>
                <ArrowUpRight
                  className="h-4 w-4 text-white/30 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-white/80"
                  aria-hidden
                />
              </div>
              <h3 className="mt-3 text-sm font-semibold tracking-wide text-white">{card.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-white/50">{card.description}</p>
            </div>
          </GlassCard>
        );
      })}
    </div>
  );
}
