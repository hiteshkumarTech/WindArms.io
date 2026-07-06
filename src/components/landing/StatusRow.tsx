'use client';

import { Globe, Trophy, Zap } from 'lucide-react';
import { SITE } from '@/lib/constants';
import { useSimulatedLiveStats } from '@/hooks/useSimulatedLiveStats';

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full glass px-3 py-1.5 text-[11px] font-medium text-white/75">
      {children}
    </span>
  );
}

/** Live server-status strip above the hero heading. */
export default function StatusRow() {
  const { players, servers, ping } = useSimulatedLiveStats();

  return (
    <div data-animate="status" className="flex flex-wrap items-center gap-2">
      <Chip>
        <span className="relative flex h-2 w-2" aria-hidden>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
        </span>
        <span className="tabular-nums">{players.toLocaleString('en-US')}</span>
        Players Online
      </Chip>
      <Chip>
        <Globe className="h-3 w-3 text-neon-cyan" aria-hidden />
        {servers} Active Servers
      </Chip>
      <Chip>
        <Zap className="h-3 w-3 text-neon-orange" aria-hidden />
        <span className="tabular-nums">{ping}</span> ms Ping
      </Chip>
      <Chip>
        <Trophy className="h-3 w-3 text-neon-purple" aria-hidden />
        Season One Live
      </Chip>
      <Chip>{SITE.version}</Chip>
    </div>
  );
}
