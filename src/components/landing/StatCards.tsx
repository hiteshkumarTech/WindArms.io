'use client';

import { motion } from 'framer-motion';
import { FLOATING_STATS } from '@/lib/constants';
import { cn } from '@/lib/utils';

/**
 * Floating glass stat cards hovering around the 3D rifle on the right of
 * frame. Decorative layer: pointer events pass through, hidden below xl.
 */
export default function StatCards() {
  return (
    <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[46%] xl:block" aria-hidden>
      {FLOATING_STATS.map((stat, index) => (
        <motion.div
          key={stat.label}
          className={cn(
            'absolute rounded-xl glass px-4 py-2.5 shadow-[0_16px_32px_-16px_rgba(0,0,0,0.9)]',
            stat.position,
          )}
          initial={{ opacity: 0, x: 32, filter: 'blur(6px)' }}
          animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
          transition={{ delay: 1.15 + index * 0.12, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <motion.div
            className="flex items-center gap-2.5"
            animate={{ y: [-5, 5] }}
            transition={{
              duration: 3 + index * 0.45,
              repeat: Infinity,
              repeatType: 'mirror',
              ease: 'easeInOut',
            }}
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-neon-cyan/25 bg-neon-cyan/10">
              <stat.icon className="h-4 w-4 text-neon-cyan" />
            </span>
            <span className="whitespace-nowrap text-xs font-medium text-white/85">{stat.label}</span>
          </motion.div>
        </motion.div>
      ))}
    </div>
  );
}
