'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface IconButtonProps {
  children: React.ReactNode;
  label: string;
  href?: string;
  onClick?: () => void;
  className?: string;
}

/** Square glass icon button with hover glow, used in the navbar. */
export default function IconButton({ children, label, href, onClick, className }: IconButtonProps) {
  const classes = cn(
    'grid h-9 w-9 place-items-center rounded-xl glass text-white/70 transition-colors duration-300',
    'hover:border-neon-cyan/40 hover:text-neon-cyan hover:shadow-glow-cyan',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-cyan/70',
    className,
  );

  if (href) {
    const external = href.startsWith('http');
    return (
      <motion.a
        aria-label={label}
        title={label}
        href={href}
        target={external ? '_blank' : undefined}
        rel={external ? 'noopener noreferrer' : undefined}
        className={classes}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
      >
        {children}
      </motion.a>
    );
  }

  return (
    <motion.button
      aria-label={label}
      title={label}
      type="button"
      onClick={onClick}
      className={classes}
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.94 }}
    >
      {children}
    </motion.button>
  );
}
