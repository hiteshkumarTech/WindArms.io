'use client';

import { OPERATORS, OPERATORS_HEADING } from '@/lib/v2/content/operators';
import SectionHeading from '../shared/SectionHeading';
import SectionShell from '../shared/SectionShell';
import SmartImage from '../shared/SmartImage';
import type { SectionRenderProps } from '../types';

/** Elite operators — two wardens of the skyfront. */
export default function OperatorsSection(_props: SectionRenderProps) {
  return (
    <SectionShell id="operators">
      <SectionHeading {...OPERATORS_HEADING} />
      <div className="mt-12 grid gap-6 md:grid-cols-2">
        {OPERATORS.map((operator) => (
          <article
            key={operator.id}
            data-reveal
            className="group overflow-hidden rounded-3xl border border-white/10 bg-storm-deep/70 backdrop-blur-xl"
          >
            <SmartImage
              slot={operator.artSlot}
              alt={operator.name}
              className="aspect-[16/11] w-full"
              imgClassName="transition-transform duration-700 group-hover:scale-[1.04]"
              fallback={
                <div
                  className="relative grid h-full w-full place-items-center overflow-hidden"
                  style={{
                    background: `radial-gradient(90% 120% at 50% 100%, ${operator.accent}2e 0%, transparent 65%)`,
                  }}
                >
                  <span
                    className="select-none text-[9rem] font-black leading-none text-white/[0.07]"
                    aria-hidden
                  >
                    {operator.monogram}
                  </span>
                  <span
                    className="absolute bottom-3 text-[10px] uppercase tracking-[0.3em] text-white/25"
                    aria-hidden
                  >
                    Operator concept slot
                  </span>
                </div>
              }
            />
            <div className="p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-xl font-extrabold tracking-tight text-storm-marble">
                  {operator.name}
                </h3>
                <p
                  className="text-[11px] font-bold uppercase tracking-[0.25em]"
                  style={{ color: operator.accent }}
                >
                  {operator.role}
                </p>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-storm-mist/75">{operator.bio}</p>
              <a
                href="#arsenal"
                className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-storm-mist/85 transition-colors hover:border-white/30 hover:text-storm-marble"
              >
                Signature: {operator.signatureWeapon}
              </a>
            </div>
          </article>
        ))}
      </div>
    </SectionShell>
  );
}
