'use client';

import { useEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { scrollState } from '@/lib/v2/scrollProgress';

/**
 * Master scroll bridge: one ScrollTrigger spanning the whole page writes
 * raw progress into the module ref that the storm backdrop consumes.
 *
 * INVARIANT: no React state anywhere in this path — scroll drives refs,
 * refs drive the frame loop. Also toggles the navbar's frosted class via
 * direct classList for the same reason.
 */
export function useScrollChoreography(navbarRef: React.RefObject<HTMLElement>): void {
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    const trigger = ScrollTrigger.create({
      start: 0,
      end: () => `+=${Math.max(document.documentElement.scrollHeight - window.innerHeight, 1)}`,
      onUpdate: (self) => {
        scrollState.progress = self.progress;
      },
    });

    const navbar = navbarRef.current;
    const onScroll = () => {
      if (!navbar) return;
      navbar.classList.toggle('v2-nav-frosted', window.scrollY > 64);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      trigger.kill();
      window.removeEventListener('scroll', onScroll);
      scrollState.progress = 0;
    };
  }, [navbarRef]);
}
