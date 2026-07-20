'use client';

import { useId, useState } from 'react';
import { WIND_WEAPONS, WIND_WEAPON_ORDER, type WindWeaponId } from '@shared/windWeapons';
import { ARSENAL_HEADING, STAT_LABELS } from '@/lib/v2/content/weapons';
import SectionHeading from '../shared/SectionHeading';
import SectionShell from '../shared/SectionShell';
import type { SectionRenderProps } from '../types';

const FLAGSHIP_ID: WindWeaponId = 'vortex';
const SECONDARY_IDS = WIND_WEAPON_ORDER.filter((id) => id !== FLAGSHIP_ID);

/**
 * The Vortex Rifle itself renders inside StormBackdrop's persistent world
 * (see src/components/three/storm/ArsenalShowpiece.tsx) — this section only
 * supplies the DOM layer over it: a minimal holographic annotation (class,
 * name, one mechanic line, a leader line into the object) plus progressive
 * stat disclosure. No card, no bordered panel, no pedestal — the stage div
 * below stays transparent on purpose so the storm canvas shows through.
 *
 * Aeolus/Tempest/Gust stay text-only this milestone (Phase A) rather than
 * getting an unverified 3D silhouette treatment — see docs/decisions.md.
 * `WeaponCard`/`WEAPON_CARDS` are untouched and still importable for
 * rollback, just no longer wired in here.
 */
export default function ArsenalSection(_props: SectionRenderProps) {
  const [statsOpen, setStatsOpen] = useState(false);
  const statsId = useId();
  const flagship = WIND_WEAPONS[FLAGSHIP_ID];

  return (
    <SectionShell id="arsenal">
      <SectionHeading {...ARSENAL_HEADING} />

      {/*
        Transparent stage — leaves the persistent storm canvas fully visible
        so the rifle reads as part of the world, not a UI surface. Taller on
        the narrowest widths (Phase A.1, screenshot-checked at 390/430px):
        headline/subtitle/annotation text all wrap to more lines there, so
        the same 70vh left the bottom-anchored annotation's top edge tucked
        under the fixed navbar during the hold beat. More height pushes the
        anchor point later without touching the 3D camera timing at all.
      */}
      <div className="relative mt-8 min-h-[92vh] sm:min-h-[80vh]">
        <div data-reveal className="absolute bottom-4 left-0 max-w-xs sm:bottom-14">
          <span aria-hidden className="mb-3 block h-px w-16 bg-gradient-to-r from-storm-gold/80 to-transparent" />
          <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-storm-gold">
            {flagship.weaponClass}
          </p>
          <h3 className="mt-1.5 text-2xl font-extrabold tracking-tight text-storm-marble sm:text-3xl">
            {flagship.name}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-storm-mist/80">{flagship.mechanic}</p>

          <button
            type="button"
            onClick={() => setStatsOpen((open) => !open)}
            aria-expanded={statsOpen}
            aria-controls={statsId}
            className="mt-4 inline-flex items-center text-[11px] font-medium uppercase tracking-[0.2em] text-storm-mist/70 underline-offset-4 transition-colors hover:text-storm-marble focus-visible:outline-none focus-visible:underline"
          >
            {statsOpen ? 'Hide specs' : 'View specs'}
          </button>

          <div id={statsId} hidden={!statsOpen} className="mt-3 space-y-1.5">
            {STAT_LABELS.map(({ key, label }) => (
              <div key={key} className="flex items-center gap-2">
                <span className="w-14 text-[9px] uppercase tracking-widest text-white/40">{label}</span>
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${flagship.stats[key] * 100}%`, backgroundColor: flagship.accent }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Rest of the arsenal — named, not boxed. Minimal by design (see docs/decisions.md), not a placeholder for a card that didn't ship. */}
      <div data-reveal className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-2 border-t border-white/10 pt-6">
        <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/35">Also in the arsenal</span>
        {SECONDARY_IDS.map((id) => (
          <span key={id} className="text-xs font-medium uppercase tracking-[0.15em] text-storm-mist/60">
            {WIND_WEAPONS[id].name}
          </span>
        ))}
      </div>
    </SectionShell>
  );
}
