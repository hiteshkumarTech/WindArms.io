'use client';

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, type MotionStyle, type Transition } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useMagnetic } from '@/hooks/useMagnetic';

/** Client-side routed variant for internal hrefs (no full page reload). */
const MotionLink = motion(Link);

type Variant = 'primary' | 'glass' | 'outline';
type Size = 'sm' | 'md';

interface RippleState {
  id: number;
  x: number;
  y: number;
  size: number;
}

interface GlassButtonProps {
  children: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  variant?: Variant;
  size?: Size;
  href?: string;
  className?: string;
  onClick?: () => void;
}

const VARIANT_STYLES: Record<Variant, string> = {
  primary:
    'border border-neon-cyan/40 bg-neon-cyan/90 font-semibold text-black shadow-glow-cyan hover:bg-neon-cyan',
  glass: 'glass text-white/90 hover:border-white/20 hover:bg-white/10 hover:text-white',
  outline:
    'border border-neon-orange/50 bg-neon-orange/5 text-neon-orange hover:bg-neon-orange/15 hover:shadow-glow-orange',
};

const SIZE_STYLES: Record<Size, string> = {
  sm: 'h-9 gap-1.5 px-4 text-xs',
  md: 'h-11 gap-2 px-6 text-sm',
};

const springTransition: Transition = { type: 'spring', stiffness: 320, damping: 22 };

/**
 * Premium CTA button: liquid glass, magnetic hover, click ripple,
 * scale feedback. Renders an anchor when `href` is provided.
 */
export default function GlassButton({
  children,
  icon: Icon,
  variant = 'glass',
  size = 'md',
  href,
  className,
  onClick,
}: GlassButtonProps) {
  const { ref, x, y, onMouseMove, onMouseLeave } = useMagnetic(0.32);
  const [ripples, setRipples] = useState<RippleState[]>([]);
  const rippleId = useRef(0);

  const removeRipple = useCallback((id: number) => {
    setRipples((current) => current.filter((ripple) => ripple.id !== id));
  }, []);

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const rippleSize = Math.max(rect.width, rect.height) * 2.2;
      setRipples((current) => [
        ...current,
        {
          id: rippleId.current++,
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
          size: rippleSize,
        },
      ]);
      onClick?.();
    },
    [onClick],
  );

  const setNode = useCallback(
    (node: HTMLElement | null) => {
      ref.current = node;
    },
    [ref],
  );

  const content = (
    <>
      {Icon ? <Icon className="h-4 w-4 shrink-0" /> : null}
      <span className="relative z-10 whitespace-nowrap">{children}</span>
      {ripples.map((ripple) => (
        <span
          key={ripple.id}
          className="glass-ripple"
          style={{
            left: ripple.x - ripple.size / 2,
            top: ripple.y - ripple.size / 2,
            width: ripple.size,
            height: ripple.size,
          }}
          onAnimationEnd={() => removeRipple(ripple.id)}
        />
      ))}
    </>
  );

  const shared = {
    className: cn(
      'relative inline-flex items-center justify-center overflow-hidden rounded-xl transition-colors duration-300',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-cyan/70',
      VARIANT_STYLES[variant],
      SIZE_STYLES[size],
      className,
    ),
    style: { x, y } as MotionStyle,
    whileHover: { scale: 1.04 },
    whileTap: { scale: 0.97 },
    transition: springTransition,
    onMouseMove,
    onMouseLeave,
    onClick: handleClick,
  };

  if (href) {
    if (href.startsWith('/')) {
      return (
        <MotionLink ref={setNode} href={href} {...shared}>
          {content}
        </MotionLink>
      );
    }
    const external = href.startsWith('http');
    return (
      <motion.a
        ref={setNode}
        href={href}
        target={external ? '_blank' : undefined}
        rel={external ? 'noopener noreferrer' : undefined}
        {...shared}
      >
        {content}
      </motion.a>
    );
  }

  return (
    <motion.button ref={setNode} type="button" {...shared}>
      {content}
    </motion.button>
  );
}
