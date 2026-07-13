'use client';

import { useEffect, useRef, useState } from 'react';
import { BOOT_LINES } from '@/lib/v2/content/hero';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { cn } from '@/lib/utils';

const LINE_INTERVAL_MS = 520;
const MIN_BOOT_MS = 2600;
const FADE_MS = 500;
const SESSION_KEY = 'wa2-booted';

type Phase = 'boot' | 'fade' | 'done';

interface PreloaderProps {
  onComplete: () => void;
}

/**
 * AAA boot sequence: wind-core initialization lines + gold progress bar,
 * then a fade handoff into the hero timeline. Shown once per session,
 * skippable by click, and bypassed entirely for reduced-motion users.
 */
export default function Preloader({ onComplete }: PreloaderProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [phase, setPhase] = useState<Phase>('boot');
  const [lineIndex, setLineIndex] = useState(0);
  const completedRef = useRef(false);
  const [skipped, setSkipped] = useState(false);

  const finish = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    try {
      sessionStorage.setItem(SESSION_KEY, '1');
    } catch {
      // Storage unavailable: boot will simply replay next visit.
    }
    setPhase('fade');
    window.setTimeout(() => {
      setPhase('done');
      onComplete();
    }, FADE_MS);
  };

  // Instant bypass: repeat visits this session, or reduced motion.
  useEffect(() => {
    let alreadyBooted = false;
    try {
      alreadyBooted = sessionStorage.getItem(SESSION_KEY) === '1';
    } catch {
      alreadyBooted = false;
    }
    if (alreadyBooted || reducedMotion) {
      completedRef.current = true;
      setPhase('done');
      onComplete();
    }
    // Runs once on mount; reducedMotion settles before paint via layout pass.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion]);

  // Boot line cycling + minimum duration.
  useEffect(() => {
    if (phase !== 'boot' || completedRef.current) return;
    const lineTimer = window.setInterval(() => {
      setLineIndex((current) => Math.min(current + 1, BOOT_LINES.length - 1));
    }, LINE_INTERVAL_MS);
    const doneTimer = window.setTimeout(finish, MIN_BOOT_MS);
    return () => {
      window.clearInterval(lineTimer);
      window.clearTimeout(doneTimer);
    };
    // finish is stable for the component's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  if (phase === 'done') return null;

  return (
    <div
      role="status"
      aria-label="Loading WindArms"
      onClick={() => {
        setSkipped(true);
        finish();
      }}
      className={cn(
        'fixed inset-0 z-50 grid cursor-pointer place-items-center bg-storm-abyss transition-opacity',
        phase === 'fade' ? 'pointer-events-none opacity-0 duration-500' : 'opacity-100',
      )}
    >
      <div className="flex w-full max-w-sm flex-col items-center px-8 text-center">
        <p className="text-2xl font-black tracking-[0.3em] text-storm-marble">
          WINDARMS
        </p>
        <p className="mt-1 text-[10px] uppercase tracking-[0.4em] text-storm-gold">
          The War Above the Storm
        </p>

        <div className="mt-8 h-px w-full bg-gradient-to-r from-transparent via-storm-gold/60 to-transparent" />

        <p className="mt-6 h-5 text-xs tracking-widest text-storm-mist/80" aria-live="polite">
          {BOOT_LINES[lineIndex]}
        </p>

        <div className="mt-4 h-[3px] w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="v2-boot-fill h-full rounded-full bg-gradient-to-r from-storm-gold to-storm-sky"
            style={{ animationDuration: `${MIN_BOOT_MS}ms` }}
          />
        </div>

        <p className="mt-6 text-[10px] uppercase tracking-widest text-white/25">
          {skipped ? 'Entering…' : 'Click to skip'}
        </p>
      </div>
    </div>
  );
}
