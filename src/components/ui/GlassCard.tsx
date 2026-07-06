'use client';

import { useCallback } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useTilt } from '@/hooks/useTilt';

interface GlassCardProps {
  children: React.ReactNode;
  href: string;
  className?: string;
  ariaLabel?: string;
}

/**
 * Interactive glass card: tilts toward the cursor, shows a tracked glare
 * highlight, lifts on hover and casts a deep shadow.
 */
export default function GlassCard({ children, href, className, ariaLabel }: GlassCardProps) {
  const { ref, rotateX, rotateY, glare, onMouseMove, onMouseLeave } = useTilt(7);

  const setNode = useCallback(
    (node: HTMLElement | null) => {
      ref.current = node;
    },
    [ref],
  );

  return (
    <div style={{ perspective: 900 }} className="h-full">
      <motion.a
        ref={setNode}
        href={href}
        aria-label={ariaLabel}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
        whileHover={{ y: -6 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
        className={cn(
          'group relative block h-full overflow-hidden rounded-2xl glass',
          'shadow-[0_18px_40px_-18px_rgba(0,0,0,0.85)] transition-shadow duration-300',
          'hover:shadow-[0_26px_52px_-20px_rgba(0,0,0,0.95)]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-cyan/70',
          className,
        )}
      >
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0"
          style={{ background: glare }}
        />
        <div className="relative z-10 h-full">{children}</div>
      </motion.a>
    </div>
  );
}
