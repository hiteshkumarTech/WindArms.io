'use client';

import { useReveal } from '../hooks/useReveal';
import { cn } from '@/lib/utils';

interface SectionShellProps {
  /** Anchor id (navbar links, in-page CTAs). */
  id: string;
  children: React.ReactNode;
  className?: string;
  /**
   * Figma frame node for this section — populated when the design file
   * lands, giving every section a 1:1 reconciliation target.
   */
  figmaNode?: string;
}

/**
 * The swap unit of the V2 landing page: consistent rhythm, scroll-reveal
 * wiring and a Figma anchor. Sections own only their markup and content;
 * replacing one never touches its siblings.
 */
export default function SectionShell({ id, children, className, figmaNode }: SectionShellProps) {
  const revealRef = useReveal<HTMLElement>();

  return (
    <section
      ref={revealRef}
      id={id}
      data-figma-node={figmaNode ?? ''}
      className={cn('relative mx-auto w-full max-w-6xl scroll-mt-24 px-5 py-24 sm:px-8 md:py-32', className)}
    >
      {children}
    </section>
  );
}
