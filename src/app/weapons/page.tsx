import type { Metadata } from 'next';
import PageShell from '@/components/PageShell';
import { WEAPONS, WEAPON_ORDER } from '@shared/weapons';

export const metadata: Metadata = {
  title: 'Weapons — WindArms.io',
  description:
    'The WindArms.io arsenal: seven weapons from the Vortex SMG to the Longshot DMR, each tuned by range.',
};

function role(range: number): string {
  if (range <= 45) return 'Close range';
  if (range <= 90) return 'Mid range';
  return 'Long range';
}

export default function WeaponsPage() {
  return (
    <PageShell>
      <header className="max-w-2xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-neon-cyan/80">Arsenal</p>
        <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
          Seven ways to win a fight
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-white/55 sm:text-base">
          Every weapon has a damage-falloff curve that rewards fighting at its intended range. These
          numbers are the live balance values the server uses.
        </p>
      </header>

      <div className="mt-12 grid gap-4 md:grid-cols-2">
        {WEAPON_ORDER.map((id) => {
          const weapon = WEAPONS[id];
          const stats: Array<[string, string]> = [
            ['Damage', weapon.pellets > 1 ? `${weapon.damage} ×${weapon.pellets}` : `${weapon.damage}`],
            ['Fire rate', `${weapon.fireRateRpm} rpm`],
            ['Magazine', `${weapon.magSize}`],
            ['Range', `${weapon.range} m`],
            ['Reload', `${weapon.reloadTimeS}s`],
            ['Trigger', weapon.auto ? 'Auto' : 'Semi'],
          ];
          return (
            <div key={id} className="glass rounded-2xl p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span
                    className="grid h-9 w-9 place-items-center rounded-lg border text-sm font-bold"
                    style={{
                      color: weapon.tracerColor,
                      borderColor: `${weapon.tracerColor}55`,
                      backgroundColor: `${weapon.tracerColor}18`,
                    }}
                  >
                    {weapon.slot}
                  </span>
                  <div>
                    <h3 className="text-base font-semibold text-white">{weapon.name}</h3>
                    <p className="text-[11px] uppercase tracking-wider text-white/40">
                      {role(weapon.range)}
                    </p>
                  </div>
                </div>
                <span
                  className="h-2 w-14 rounded-full"
                  style={{ background: weapon.tracerColor }}
                  aria-hidden
                />
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                {stats.map(([label, value]) => (
                  <div key={label} className="rounded-lg bg-white/5 px-2 py-2 text-center">
                    <p className="text-sm font-bold tabular-nums text-white">{value}</p>
                    <p className="text-[9px] uppercase tracking-widest text-white/40">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </PageShell>
  );
}
