'use client';

import { useCallback, useRef, useState } from 'react';
import { Play } from 'lucide-react';
import { useRequiresDesktopControls } from '@/hooks/useRequiresDesktopControls';
import DesktopRequiredModal from './DesktopRequiredModal';
import V2Button from './V2Button';

interface PlayCtaProps {
  href: string;
  label: string;
  size?: 'md' | 'lg';
  className?: string;
  tabIndex?: number;
}

/**
 * The site's primary "go play" action. WindArms' FPS controls need a mouse
 * + keyboard, so on a coarse-pointer/narrow device this swaps the real
 * `/v2/play` link for a "Play on Desktop" trigger that explains the
 * requirement in a glass sheet, instead of routing there and letting
 * MobileNotice re-block the same visitor a click later. On desktop this
 * renders exactly the original navigating V2Button, unchanged.
 */
export default function PlayCta({ href, label, size = 'md', className, tabIndex }: PlayCtaProps) {
  const requiresDesktop = useRequiresDesktopControls();
  const [noticeOpen, setNoticeOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // Stable identity: DesktopRequiredModal's effect keys off [open, onClose]. An
  // inline arrow here would get a fresh identity on every unrelated re-render
  // (e.g. HeroSection's live-stats ticker), re-running that effect while
  // `open` is still true and re-stealing focus back onto "Got it" — a real,
  // if intermittent, race against the trigger-refocus below.
  const closeNotice = useCallback(() => {
    setNoticeOpen(false);
    triggerRef.current?.focus();
  }, []);

  if (!requiresDesktop) {
    return (
      <V2Button href={href} variant="gold" icon={Play} size={size} className={className} tabIndex={tabIndex}>
        {label}
      </V2Button>
    );
  }

  return (
    <>
      <V2Button
        variant="gold"
        icon={Play}
        size={size}
        className={className}
        tabIndex={tabIndex}
        onClick={(event) => {
          triggerRef.current = event.currentTarget;
          setNoticeOpen(true);
        }}
      >
        Play on Desktop
      </V2Button>
      <DesktopRequiredModal open={noticeOpen} onClose={closeNotice} />
    </>
  );
}
