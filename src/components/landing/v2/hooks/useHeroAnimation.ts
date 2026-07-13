'use client';

import { useRef } from 'react';
import gsap from 'gsap';
import { useIsomorphicLayoutEffect } from '@/hooks/useIsomorphicLayoutEffect';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

/**
 * Hero entrance timeline, gated on the boot preloader finishing so the
 * title never plays behind the loading screen. Targets by data attribute:
 * [data-hero="eyebrow" | "word" | "lore" | "cta" | "status" | "cue"].
 */
export function useHeroAnimation<T extends HTMLElement>(active: boolean): React.RefObject<T> {
  const rootRef = useRef<T>(null);
  const reducedMotion = usePrefersReducedMotion();

  useIsomorphicLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const ctx = gsap.context(() => {
      const all = [
        '[data-hero="eyebrow"]',
        '[data-hero="word"]',
        '[data-hero="lore"]',
        '[data-hero="cta"] > *',
        '[data-hero="status"]',
        '[data-hero="cue"]',
      ];

      if (reducedMotion) {
        gsap.set(all, { opacity: 1, y: 0, filter: 'blur(0px)' });
        return;
      }

      // Hidden until the boot sequence hands off.
      gsap.set(all, { opacity: 0 });
      if (!active) return;

      gsap
        .timeline({ defaults: { ease: 'power3.out' } })
        .fromTo(
          '[data-hero="eyebrow"]',
          { opacity: 0, y: 14, filter: 'blur(6px)' },
          { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.6 },
          0.1,
        )
        .fromTo(
          '[data-hero="word"]',
          { opacity: 0, y: 54, filter: 'blur(14px)' },
          { opacity: 1, y: 0, filter: 'blur(0px)', duration: 1, stagger: 0.09 },
          0.25,
        )
        .fromTo(
          '[data-hero="lore"]',
          { opacity: 0, y: 24, filter: 'blur(8px)' },
          { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.8 },
          0.95,
        )
        .fromTo(
          '[data-hero="cta"] > *',
          { opacity: 0, y: 20 },
          { opacity: 1, y: 0, duration: 0.55, stagger: 0.09 },
          1.15,
        )
        .fromTo('[data-hero="status"]', { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.6 }, 1.35)
        .fromTo('[data-hero="cue"]', { opacity: 0 }, { opacity: 1, duration: 0.8 }, 1.7);
    }, root);

    return () => ctx.revert();
  }, [active, reducedMotion]);

  return rootRef;
}
