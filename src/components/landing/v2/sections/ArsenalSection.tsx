'use client';

import { ARSENAL_HEADING, WEAPON_CARDS } from '@/lib/v2/content/weapons';
import SectionHeading from '../shared/SectionHeading';
import SectionShell from '../shared/SectionShell';
import type { SectionRenderProps } from '../types';
import WeaponCard from './WeaponCard';

/** Wind-powered weaponry — four cards off the shared arsenal config. */
export default function ArsenalSection(_props: SectionRenderProps) {
  return (
    <SectionShell id="arsenal">
      <SectionHeading {...ARSENAL_HEADING} />
      <div className="mt-12 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {WEAPON_CARDS.map((card) => (
          <WeaponCard key={card.weapon.id} card={card} />
        ))}
      </div>
    </SectionShell>
  );
}
