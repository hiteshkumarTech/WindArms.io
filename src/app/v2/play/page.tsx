import type { Metadata } from 'next';
import V2PlayView from '@/components/v2/play/V2PlayView';

export const metadata: Metadata = {
  title: 'Skyfront Trial — WindArms V2',
  description:
    'The first playable WindArms V2 vertical slice: destroy eight hostile wind drones with the real Vortex Rifle across a floating Skyfront arena. Move, fight, die, respawn, win, replay.',
};

export default function V2PlayPage() {
  return <V2PlayView />;
}
