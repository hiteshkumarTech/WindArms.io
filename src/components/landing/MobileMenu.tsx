'use client';

import { AnimatePresence, motion, type Variants } from 'framer-motion';
import { X } from 'lucide-react';
import GlassButton from '@/components/ui/GlassButton';
import Logo from '@/components/ui/Logo';
import { NAV_LINKS } from '@/lib/constants';
import { useUiStore } from '@/stores/uiStore';

interface MobileMenuProps {
  open: boolean;
  onClose: () => void;
}

const panelVariants: Variants = {
  hidden: { opacity: 0, y: -16, scale: 0.99 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1], staggerChildren: 0.045, delayChildren: 0.05 },
  },
  exit: { opacity: 0, y: -12, transition: { duration: 0.22 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, x: -14 },
  visible: { opacity: 1, x: 0 },
};

export default function MobileMenu({ open, onClose }: MobileMenuProps) {
  const openDownload = useUiStore((state) => state.openDownload);
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-40 flex flex-col bg-void/70 p-4 backdrop-blur-2xl xl:hidden"
          variants={panelVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
        >
          <div className="flex items-center justify-between">
            <Logo />
            <button
              type="button"
              aria-label="Close menu"
              onClick={onClose}
              className="grid h-10 w-10 place-items-center rounded-xl glass text-white/80 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-cyan/70"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>

          <motion.ul className="mt-8 flex flex-1 flex-col gap-1 overflow-y-auto">
            {NAV_LINKS.map((link) => (
              <motion.li key={link.label} variants={itemVariants}>
                <a
                  href={link.href}
                  onClick={onClose}
                  className="block rounded-xl px-4 py-3 text-lg font-semibold text-white/80 transition-colors hover:bg-white/5 hover:text-neon-cyan"
                >
                  {link.label}
                </a>
              </motion.li>
            ))}
          </motion.ul>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <GlassButton variant="primary" href="/play" className="w-full" onClick={onClose}>
              Play Now
            </GlassButton>
            <GlassButton
              variant="glass"
              className="w-full"
              onClick={() => {
                onClose();
                openDownload();
              }}
            >
              Download
            </GlassButton>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
