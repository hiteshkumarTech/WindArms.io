import type { Metadata } from 'next';
import GameView from '@/components/game/GameView';

export const metadata: Metadata = {
  title: 'Play — WindArms.io',
  description:
    'WindArms.io movement test arena: first-person controller with sprint, jump, slide and dash on Rapier physics.',
};

export default function PlayPage() {
  return <GameView />;
}
