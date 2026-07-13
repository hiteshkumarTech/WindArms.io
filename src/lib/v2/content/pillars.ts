import {
  ArrowUp,
  Footprints,
  MoveVertical,
  Tornado,
  Wind,
  Zap,
  type LucideIcon,
} from 'lucide-react';

/** Gameplay-feel pillars — the board's "Gameplay Feel" panel. */

export const PILLARS_HEADING = {
  eyebrow: 'GAMEPLAY FEEL',
  title: 'THE SKY IS YOUR PLAYGROUND',
  subtitle: 'Momentum is a resource. Height is a weapon. Storms shape every fight.',
} as const;

export interface PillarContent {
  id: string;
  icon: LucideIcon;
  title: string;
  description: string;
}

export const PILLARS: PillarContent[] = [
  {
    id: 'momentum',
    icon: Wind,
    title: 'Momentum-Based Movement',
    description: 'Speed carries — chain slides, dashes and drops without losing it.',
  },
  {
    id: 'wallrun',
    icon: Footprints,
    title: 'Wall Running',
    description: 'Marble spires are highways. Run them, then leave them explosively.',
  },
  {
    id: 'airdash',
    icon: Zap,
    title: 'Air Dashes',
    description: 'Rewrite your arc mid-flight. Escapes, closes, and style.',
  },
  {
    id: 'jumppads',
    icon: ArrowUp,
    title: 'Jump Pads',
    description: 'Wind vents launch you between islands — commit and fly.',
  },
  {
    id: 'currents',
    icon: Tornado,
    title: 'Wind Currents',
    description: 'Living air lanes that carry, lift, and ambush.',
  },
  {
    id: 'vertical',
    icon: MoveVertical,
    title: 'Vertical Combat',
    description: 'Fights happen above and below you. Aim in three dimensions.',
  },
];
