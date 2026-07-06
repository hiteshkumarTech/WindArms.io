import type { LucideIcon } from 'lucide-react';

export interface NavLink {
  label: string;
  href: string;
}

export type Accent = 'cyan' | 'orange' | 'purple';

export interface FloatingStat {
  icon: LucideIcon;
  label: string;
  /** Tailwind positioning classes inside the floating-stats layer. */
  position: string;
}

export interface PreviewCardData {
  icon: LucideIcon;
  title: string;
  description: string;
  accent: Accent;
  href: string;
}
