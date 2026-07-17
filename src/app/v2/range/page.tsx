import type { Metadata } from 'next';
import RangeView from '@/components/v2/range/RangeView';

export const metadata: Metadata = {
  title: 'Vortex Rifle Range — WindArms V2',
  description:
    'WindArms V2 first-playable-weapon vertical slice: the Vortex Rifle with real fire timing, turbine spin-up, procedural first-person animation, and raycast hit detection.',
};

export default function RangePage() {
  return <RangeView />;
}
