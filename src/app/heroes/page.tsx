import type { Metadata } from 'next';
import PageShell from '@/components/PageShell';
import { HERO_SKINS, SILHOUETTES, type SilhouetteId } from '@shared/heroes';

export const metadata: Metadata = {
  title: 'Heroes — WindArms.io',
  description:
    'WindArms.io heroes: the agile Gale and the heavy Bastion silhouettes, with six unlockable accent skins.',
};

const SILHOUETTE_COPY: Record<SilhouetteId, string> = {
  gale: 'Slim and fast-reading — a lean silhouette that slips through sightlines.',
  bastion: 'Broad and heavy — a commanding presence that fills the frame.',
};

export default function HeroesPage() {
  return (
    <PageShell>
      <header className="max-w-2xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-neon-cyan/80">Heroes</p>
        <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
          Pick your silhouette
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-white/55 sm:text-base">
          Two body types, six accent skins. Heroes are purely cosmetic — everyone plays the same kit,
          so choose the look that&apos;s you and let your aim do the talking. Skins unlock as you level.
        </p>
      </header>

      <div className="mt-12 space-y-12">
        {(['gale', 'bastion'] as SilhouetteId[]).map((id) => {
          const silhouette = SILHOUETTES[id];
          const skins = HERO_SKINS.filter((skin) => skin.silhouette === id);
          return (
            <section key={id}>
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-2xl font-bold text-white">{silhouette.name}</h2>
                <span className="text-xs uppercase tracking-widest text-white/40">
                  {skins.length} skins
                </span>
              </div>
              <p className="mt-1 max-w-xl text-sm text-white/50">{SILHOUETTE_COPY[id]}</p>

              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {skins.map((skin) => (
                  <div key={skin.id} className="glass overflow-hidden rounded-2xl">
                    <div
                      className="h-28 w-full"
                      style={{ background: `linear-gradient(135deg, ${skin.primary}, ${skin.accent})` }}
                    />
                    <div className="flex items-center justify-between gap-2 p-4">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold text-white">{skin.name}</h3>
                        <p className="text-[11px] uppercase tracking-wider text-white/40">
                          {skin.unlockLevel === 0 ? 'Starter' : `Unlocks at level ${skin.unlockLevel}`}
                        </p>
                      </div>
                      <span
                        className="h-6 w-6 shrink-0 rounded-full border border-white/20"
                        style={{ background: skin.accent }}
                        aria-hidden
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </PageShell>
  );
}
