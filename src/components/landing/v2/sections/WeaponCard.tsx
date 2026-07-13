'use client';

import { useCallback } from 'react';
import { motion } from 'framer-motion';
import { Crosshair, Sword, Wind, Zap, type LucideIcon } from 'lucide-react';
import type { WindWeaponClass } from '@shared/windWeapons';
import { STAT_LABELS, type WeaponCardContent } from '@/lib/v2/content/weapons';
import { useTilt } from '@/hooks/useTilt';
import SmartImage from '../shared/SmartImage';

/** Class glyph used by the procedural art fallback. */
const CLASS_GLYPHS: Record<WindWeaponClass, LucideIcon> = {
  rifle: Crosshair,
  carbine: Wind,
  cannon: Zap,
  blade: Sword,
};

interface WeaponCardProps {
  card: WeaponCardContent;
}

/**
 * One arsenal entry, driven entirely by `shared/windWeapons.ts` — the
 * same config the game itself will adopt. Art arrives via the slot;
 * until then the fallback renders the weapon's class glyph and accent.
 */
export default function WeaponCard({ card }: WeaponCardProps) {
  const { weapon, artSlot } = card;
  const Glyph = CLASS_GLYPHS[weapon.weaponClass];
  const { ref, rotateX, rotateY, glare, onMouseMove, onMouseLeave } = useTilt(6);

  const setNode = useCallback(
    (node: HTMLElement | null) => {
      ref.current = node;
    },
    [ref],
  );

  return (
    <div data-reveal style={{ perspective: 900 }} className="h-full">
      <motion.article
        ref={setNode}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
        whileHover={{ y: -6 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
        className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-storm-deep/70 backdrop-blur-xl transition-shadow duration-300 hover:shadow-[0_24px_48px_-20px_rgba(0,0,0,0.6)]"
      >
        <motion.span aria-hidden className="pointer-events-none absolute inset-0 z-0" style={{ background: glare }} />

        <SmartImage
          slot={artSlot}
          alt={weapon.name}
          className="aspect-[16/10] w-full"
          fallback={
            <div
              className="relative grid h-full w-full place-items-center"
              style={{
                background: `radial-gradient(120% 120% at 50% 0%, ${weapon.accent}26 0%, transparent 60%), linear-gradient(180deg, rgba(255,255,255,0.04), transparent)`,
              }}
            >
              <Glyph
                className="h-16 w-16 opacity-70 transition-transform duration-500 group-hover:scale-110"
                style={{ color: weapon.accent }}
                strokeWidth={1.4}
                aria-hidden
              />
              <span
                className="absolute inset-x-0 bottom-2 text-center text-[10px] uppercase tracking-[0.3em] text-white/25"
                aria-hidden
              >
                Concept slot
              </span>
            </div>
          }
        />

        <div className="relative z-10 flex flex-1 flex-col p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-bold tracking-wide text-storm-marble">{weapon.name}</h3>
            <span
              className="rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest"
              style={{ borderColor: `${weapon.accent}55`, color: weapon.accent }}
            >
              {weapon.weaponClass}
            </span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-storm-mist/70">{weapon.description}</p>
          <p className="mt-1.5 text-[11px] font-medium text-storm-gold/90">{weapon.mechanic}</p>

          <div className="mt-auto space-y-1.5 pt-4">
            {STAT_LABELS.map(({ key, label }) => (
              <div key={key} className="flex items-center gap-2">
                <span className="w-14 text-[9px] uppercase tracking-widest text-white/40">{label}</span>
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${weapon.stats[key] * 100}%`, backgroundColor: weapon.accent }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.article>
    </div>
  );
}
