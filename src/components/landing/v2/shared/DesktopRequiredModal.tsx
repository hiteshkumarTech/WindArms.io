'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface DesktopRequiredModalProps {
  open: boolean;
  onClose: () => void;
}

const TITLE_ID = 'desktop-required-title';
const DESC_ID = 'desktop-required-desc';

/**
 * Premium floating glass sheet shown when a mobile/tablet visitor taps a
 * Play CTA — WindArms' FPS controls need a mouse + keyboard, so this
 * explains that instead of routing to /v2/play, where MobileNotice would
 * just re-block the same visitor a click later. Same glass language as
 * V2Navbar's mobile panel (bg-storm-deep/95, border-white/15, blur-2xl).
 * Single-control dialog, so Tab is trapped on the "Got it" button rather
 * than implementing a full multi-element focus loop.
 */
export default function DesktopRequiredModal({ open, onClose }: DesktopRequiredModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        closeButtonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  return (
    <div
      aria-hidden={!open}
      className={cn(
        'fixed inset-0 z-50 flex items-end justify-center px-4 pb-4 transition-opacity duration-200 sm:items-center',
        open ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
    >
      <div aria-hidden onClick={onClose} className="absolute inset-0 bg-storm-abyss/60" />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        aria-describedby={DESC_ID}
        className={cn(
          'relative w-full max-w-sm origin-bottom rounded-3xl border border-white/15 bg-storm-deep/95 p-6 text-center shadow-[0_24px_48px_-20px_rgba(0,0,0,0.6)] backdrop-blur-2xl transition-all duration-200 sm:origin-center',
          open ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0',
        )}
      >
        <p id={TITLE_ID} className="text-lg font-extrabold tracking-tight text-storm-marble">
          Play on Desktop
        </p>
        <p id={DESC_ID} className="mt-3 text-sm leading-relaxed text-storm-mist/85">
          WindArms currently requires a keyboard and mouse. Open WindArms on a desktop or laptop to play.
        </p>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          tabIndex={open ? 0 : -1}
          className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-xl border border-storm-gold/60 bg-gradient-to-b from-storm-gold to-storm-golddeep text-sm font-bold text-storm-abyss shadow-glow-gold transition-all duration-300 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-storm-sky/70"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
