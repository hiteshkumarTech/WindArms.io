import type { Metadata } from 'next';
import PageShell from '@/components/PageShell';
import { MAPS, MAP_ORDER } from '@shared/maps';

export const metadata: Metadata = {
  title: 'Maps — WindArms.io',
  description:
    'The four WindArms.io arenas: Cyber City, Snow Base, Forest Temple and the floating Sky Sanctum.',
};

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-white/55">
      {children}
    </span>
  );
}

export default function MapsPage() {
  return (
    <PageShell>
      <header className="max-w-2xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-neon-cyan/80">Maps</p>
        <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
          Four arenas, one rotation
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-white/55 sm:text-base">
          Online matches rotate through every map. Each is pure data — the same geometry the server
          raycasts for cover and the client renders — so cover behaves identically on both sides.
        </p>
      </header>

      <div className="mt-12 grid gap-5 sm:grid-cols-2">
        {MAP_ORDER.map((id) => {
          const map = MAPS[id];
          const floating = map.killPlaneY !== undefined;
          return (
            <div key={id} className="glass overflow-hidden rounded-2xl">
              <div
                className="relative h-32"
                style={{
                  background: `linear-gradient(135deg, ${map.theme.structureColor}, ${map.theme.gridSectionColor})`,
                }}
              >
                <div
                  className="absolute inset-0"
                  style={{
                    background: `radial-gradient(circle at 28% 24%, ${map.theme.accents[0]}55, transparent 62%)`,
                  }}
                  aria-hidden
                />
              </div>
              <div className="p-5">
                <h3 className="text-lg font-bold text-white">{map.name}</h3>
                <p className="mt-1 text-sm leading-relaxed text-white/55">{map.description}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Tag>{map.spawnPoints.length} spawns</Tag>
                  <Tag>{map.theme.particles} atmosphere</Tag>
                  <Tag>{floating ? 'floating · kill plane' : 'enclosed arena'}</Tag>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </PageShell>
  );
}
