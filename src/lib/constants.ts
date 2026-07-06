import {
  Boxes,
  Crosshair,
  Gauge,
  Map as MapIcon,
  MonitorSmartphone,
  Radio,
  Swords,
  Trophy,
  Users,
} from 'lucide-react';
import type { Accent, FloatingStat, NavLink, PreviewCardData } from '@/types/landing';

export const SITE = {
  name: 'WindArms.io',
  version: 'v1.0',
} as const;

export const NAV_LINKS: NavLink[] = [
  { label: 'Home', href: '#home' },
  { label: 'Game', href: '#game' },
  { label: 'Heroes', href: '#heroes' },
  { label: 'Weapons', href: '#weapons' },
  { label: 'Maps', href: '#maps' },
  { label: 'Ranked', href: '#ranked' },
  { label: 'Leaderboard', href: '#leaderboard' },
  { label: 'Community', href: '#community' },
  { label: 'News', href: '#news' },
];

export const FLOATING_STATS: FloatingStat[] = [
  { icon: Gauge, label: '120 FPS Optimized', position: 'right-[6%] top-[16%]' },
  { icon: Radio, label: 'Real-Time Multiplayer', position: 'right-[26%] top-[28%]' },
  { icon: Trophy, label: 'Ranked Competitive', position: 'right-[4%] top-[39%]' },
  { icon: MonitorSmartphone, label: 'Cross Platform Ready', position: 'right-[22%] top-[51%]' },
  { icon: Boxes, label: 'Powered by Three.js', position: 'right-[8%] top-[62%]' },
];

export const PREVIEW_CARDS: PreviewCardData[] = [
  {
    icon: Users,
    title: 'Heroes',
    description: 'Original anime-inspired operatives with unique kits and voices.',
    accent: 'cyan',
    href: '#heroes',
  },
  {
    icon: Crosshair,
    title: 'Weapons',
    description: 'Seven weapon classes tuned for precise, high-skill gunplay.',
    accent: 'orange',
    href: '#weapons',
  },
  {
    icon: MapIcon,
    title: 'Maps',
    description: 'Six arenas — from Cyber City streets to Floating Islands.',
    accent: 'purple',
    href: '#maps',
  },
  {
    icon: Swords,
    title: 'Competitive',
    description: 'Ranked ladders, seasonal resets and global leaderboards.',
    accent: 'cyan',
    href: '#ranked',
  },
];

export const ACCENT_HEX: Record<Accent, string> = {
  cyan: '#00F5FF',
  orange: '#FF7A00',
  purple: '#7C5CFF',
};
