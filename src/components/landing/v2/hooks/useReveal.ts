'use client';

import { useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useIsomorphicLayoutEffect } from '@/hooks/useIsomorphicLayoutEffect';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

/**
 * Section entrance: children tagged `[data-reveal]` blur-fade upward,
 * staggered, when the section scrolls into view (once). Reduced motion
 * renders everything visible immediately. Owned here so sections stay
 * markup-only — swapping a section never rewrites animation plumbing.
 */
export function useReveal<T extends HTMLElement>(): React.RefObject<T> {
  const rootRef = useRef<T>(null);
  const reducedMotion = usePrefersReducedMotion();

  useIsomorphicLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    gsap.registerPlugin(ScrollTrigger);

    const targets = root.querySelectorAll('[data-reveal]');
    if (targets.length === 0) return;

    const ctx = gsap.context(() => {
      if (reducedMotion) {
        gsap.set(targets, { opacity: 1, y: 0, filter: 'blur(0px)' });
        return;
      }
      gsap.fromTo(
        targets,
        { opacity: 0, y: 36, filter: 'blur(10px)' },
        {
          opacity: 1,
          y: 0,
          filter: 'blur(0px)',
          duration: 0.9,
          stagger: 0.1,
          ease: 'power3.out',
          scrollTrigger: { trigger: root, start: 'top 72%', once: true },
        },
      );
    }, root);

    return () => ctx.revert();
  }, [reducedMotion]);

  return rootRef;
}
