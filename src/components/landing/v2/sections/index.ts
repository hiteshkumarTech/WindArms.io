import type { ComponentType } from 'react';
import type { SectionRenderProps } from '../types';
import ArsenalSection from './ArsenalSection';
import CtaSection from './CtaSection';
import HeroSection from './HeroSection';
import OperatorsSection from './OperatorsSection';
import PillarsSection from './PillarsSection';
import SkyfrontSection from './SkyfrontSection';

export interface SectionDef {
  id: string;
  label: string;
  /** Figma frame node for 1:1 reconciliation once the design file exists. */
  figmaNode: string | null;
  Component: ComponentType<SectionRenderProps>;
}

/**
 * The landing page IS this array. Reordering, removing or swapping a
 * section is a one-line change here — components never know about
 * their siblings.
 */
export const SECTIONS: SectionDef[] = [
  { id: 'hero', label: 'Home', figmaNode: null, Component: HeroSection },
  { id: 'arsenal', label: 'Arsenal', figmaNode: null, Component: ArsenalSection },
  { id: 'operators', label: 'Operators', figmaNode: null, Component: OperatorsSection },
  { id: 'skyfront', label: 'Skyfront', figmaNode: null, Component: SkyfrontSection },
  { id: 'pillars', label: 'Gameplay', figmaNode: null, Component: PillarsSection },
  { id: 'deploy', label: 'Deploy', figmaNode: null, Component: CtaSection },
];
