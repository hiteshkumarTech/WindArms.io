'use client';

import { motion } from 'framer-motion';
import { Wind } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LogoProps {
  className?: string;
}

export default function Logo({ className }: LogoProps) {
  return (
    <a
      href="/"
      aria-label="WindArms.io home"
      className={cn('group flex shrink-0 items-center gap-2.5', className)}
    >
      <motion.span
        className="relative grid h-9 w-9 place-items-center rounded-xl border border-neon-cyan/30 bg-neon-cyan/10"
        animate={{
          boxShadow: [
            '0 0 10px rgba(0, 245, 255, 0.3)',
            '0 0 24px rgba(0, 245, 255, 0.6)',
            '0 0 10px rgba(0, 245, 255, 0.3)',
          ],
        }}
        transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Wind className="h-5 w-5 text-neon-cyan" strokeWidth={2.2} aria-hidden />
        <span className="absolute inset-0 rounded-xl bg-neon-cyan/10 blur-md" aria-hidden />
      </motion.span>
      <span className="text-lg font-bold tracking-tight text-white">
        WindArms<span className="text-neon-cyan">.io</span>
      </span>
    </a>
  );
}
