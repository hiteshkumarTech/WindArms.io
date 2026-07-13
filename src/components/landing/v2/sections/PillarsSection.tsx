'use client';

import { PILLARS, PILLARS_HEADING } from '@/lib/v2/content/pillars';
import SectionHeading from '../shared/SectionHeading';
import SectionShell from '../shared/SectionShell';
import type { SectionRenderProps } from '../types';

/** Gameplay feel pillars — momentum, verticality, living storms. */
export default function PillarsSection(_props: SectionRenderProps) {
  return (
    <SectionShell id="pillars">
      <SectionHeading {...PILLARS_HEADING} />
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PILLARS.map((pillar) => (
          <div
            key={pillar.id}
            data-reveal
            className="group rounded-2xl border border-white/10 bg-storm-deep/70 p-5 backdrop-blur-xl transition-colors duration-300 hover:border-storm-gold/40"
          >
            <span className="grid h-10 w-10 place-items-center rounded-xl border border-storm-gold/35 bg-storm-gold/10 transition-transform duration-300 group-hover:scale-110">
              <pillar.icon className="h-5 w-5 text-storm-gold" aria-hidden />
            </span>
            <h3 className="mt-4 text-sm font-bold tracking-wide text-storm-marble">{pillar.title}</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-storm-mist/70">{pillar.description}</p>
          </div>
        ))}
      </div>
    </SectionShell>
  );
}
