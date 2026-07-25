'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { motion, type MotionStyle, type Transition } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { useMagnetic } from '@/hooks/useMagnetic';
import { cn } from '@/lib/utils';

const MotionLink = motion(Link);

type Variant = 'gold' | 'glass' | 'outline';

const VARIANT_STYLES: Record<Variant, string> = {
  gold: 'border border-storm-gold/60 bg-gradient-to-b from-storm-gold to-storm-golddeep font-bold text-storm-abyss shadow-glow-gold hover:brightness-110',
  glass:
    'border border-white/25 bg-white/10 text-storm-marble backdrop-blur-xl hover:border-white/40 hover:bg-white/15',
  outline:
    'border border-storm-sky/50 bg-storm-sky/10 text-storm-sky hover:bg-storm-sky/20 hover:shadow-glow-sky',
};

const spring: Transition = { type: 'spring', stiffness: 320, damping: 22 };

interface V2ButtonProps {
  children: React.ReactNode;
  /** Omit and pass `onClick` instead to render an action button rather than a navigating link. */
  href?: string;
  /** Renders as a `<button>` (e.g. to open a modal) instead of navigating via `href`. */
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  icon?: LucideIcon;
  variant?: Variant;
  size?: 'md' | 'lg';
  className?: string;
  /** Passthrough for keyboard-focus management (e.g. -1 while inside a closed panel). */
  tabIndex?: number;
}

/** Marble-era CTA: magnetic hover, gold/glass variants, Link-aware. */
export default function V2Button({
  children,
  href,
  onClick,
  icon: Icon,
  variant = 'glass',
  size = 'md',
  className,
  tabIndex,
}: V2ButtonProps) {
  const { ref, x, y, onMouseMove, onMouseLeave } = useMagnetic(0.3);

  const setNode = useCallback(
    (node: HTMLElement | null) => {
      ref.current = node;
    },
    [ref],
  );

  const shared = {
    className: cn(
      'inline-flex items-center justify-center gap-2 rounded-xl transition-all duration-300',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-storm-sky/70',
      size === 'lg' ? 'h-[3.25rem] px-8 text-base' : 'h-11 px-6 text-sm',
      VARIANT_STYLES[variant],
      className,
    ),
    style: { x, y } as MotionStyle,
    whileHover: { scale: 1.04 },
    whileTap: { scale: 0.97 },
    transition: spring,
    onMouseMove,
    onMouseLeave,
    tabIndex,
  };

  const content = (
    <>
      {Icon ? <Icon className="h-4 w-4 shrink-0" aria-hidden /> : null}
      <span className="whitespace-nowrap font-semibold">{children}</span>
    </>
  );

  if (onClick) {
    return (
      <motion.button ref={setNode} type="button" onClick={onClick} {...shared}>
        {content}
      </motion.button>
    );
  }

  if (href?.startsWith('/')) {
    return (
      <MotionLink ref={setNode} href={href} {...shared}>
        {content}
      </MotionLink>
    );
  }
  return (
    <motion.a ref={setNode} href={href} {...shared}>
      {content}
    </motion.a>
  );
}
