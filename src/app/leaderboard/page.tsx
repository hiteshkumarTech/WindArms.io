import type { Metadata } from 'next';
import LeaderboardView from '@/components/leaderboard/LeaderboardView';

export const metadata: Metadata = {
  title: 'Leaderboard — WindArms.io',
  description: 'Top WindArms.io players ranked by XP: levels, kills and K/D.',
};

export default function LeaderboardPage() {
  return <LeaderboardView />;
}
