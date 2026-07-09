'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Gamepad2, MonitorSmartphone, Play, X, Zap } from 'lucide-react';
import GlassButton from '@/components/ui/GlassButton';
import { useUiStore } from '@/stores/uiStore';

const POINTS = [
  { icon: Zap, text: 'Instant play — click and you are in a match in seconds.' },
  { icon: Gamepad2, text: 'Keyboard + mouse, 120 FPS optimized, no launcher.' },
  {
    icon: MonitorSmartphone,
    text: 'Want an app icon? Use your browser’s "Install app" / "Add to Home Screen".',
  },
];

/** "Download" really means: play instantly in the browser — nothing to install. */
export default function DownloadModal() {
  const open = useUiStore((state) => state.downloadOpen);
  const close = useUiStore((state) => state.closeDownload);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-void/75 p-4 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-label="Play WindArms.io"
          onClick={close}
        >
          <motion.div
            className="glass-deep w-full max-w-md rounded-2xl p-6"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <span className="grid h-11 w-11 place-items-center rounded-xl border border-neon-cyan/30 bg-neon-cyan/10 text-neon-cyan">
                <Zap className="h-5 w-5" aria-hidden />
              </span>
              <button
                type="button"
                aria-label="Close"
                onClick={close}
                className="grid h-9 w-9 place-items-center rounded-xl glass text-white/70 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-cyan/70"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <h2 className="mt-4 text-2xl font-extrabold tracking-tight text-white">No download needed</h2>
            <p className="mt-2 text-sm leading-relaxed text-white/60">
              WindArms.io runs entirely in your browser — no installs, no launchers, no waiting.
            </p>

            <ul className="mt-5 space-y-3">
              {POINTS.map((point) => (
                <li key={point.text} className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/5 text-neon-cyan">
                    <point.icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="text-sm leading-relaxed text-white/70">{point.text}</span>
                </li>
              ))}
            </ul>

            <div className="mt-6 flex gap-3">
              <GlassButton variant="primary" icon={Play} href="/play" onClick={close}>
                Play Now
              </GlassButton>
              <GlassButton variant="glass" onClick={close}>
                Maybe later
              </GlassButton>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
