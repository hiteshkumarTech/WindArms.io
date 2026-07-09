'use client';

import { useState } from 'react';
import { Check, Lock } from 'lucide-react';
import { DEFAULT_HERO_SKIN_ID, DEFAULT_TINT_ID, HERO_SKINS, WEAPON_TINTS } from '@shared/heroes';
import { api } from '@/lib/network/api';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';

interface LoadoutPanelProps {
  onClose: () => void;
}

/**
 * Lobby cosmetic picker: equip a hero skin + weapon tint, level-gated. Equips
 * persist through the account (PATCH /account/loadout) and replicate to other
 * players at your next match join. Signed-in players only.
 */
export default function LoadoutPanel({ onClose }: LoadoutPanelProps) {
  const token = useAuthStore((state) => state.token);
  const profile = useAuthStore((state) => state.profile);
  const setProfile = useAuthStore((state) => state.setProfile);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const level = profile?.level ?? 0;
  // Fall back to catalog defaults so a stale persisted profile still equips valid ids.
  const equippedSkin = profile?.equippedHeroSkin ?? DEFAULT_HERO_SKIN_ID;
  const equippedTint = profile?.equippedTint ?? DEFAULT_TINT_ID;

  async function equip(heroSkin: string, weaponTint: string): Promise<void> {
    if (!token || busy) return;
    setBusy(true);
    setError(null);
    const result = await api.loadout(token, { heroSkin, weaponTint });
    setBusy(false);
    if (result.ok) setProfile(result.data.profile);
    else setError(result.error);
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold tracking-tight text-white">Loadout</h2>
          <p className="mt-0.5 text-[10px] uppercase tracking-widest text-white/45">
            Level {level} · play to unlock more
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-cyan/70"
        >
          Done
        </button>
      </div>

      <h3 className="mt-5 text-[10px] uppercase tracking-widest text-white/45">Hero</h3>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {HERO_SKINS.map((skin) => {
          const locked = level < skin.unlockLevel;
          const equipped = skin.id === equippedSkin;
          const [family, variant] = skin.name.split(' · ');
          return (
            <button
              key={skin.id}
              type="button"
              disabled={locked || busy}
              onClick={() => equip(skin.id, equippedTint)}
              className={cn(
                'relative flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 transition-colors',
                equipped
                  ? 'border-neon-cyan/70 bg-neon-cyan/10'
                  : 'border-white/10 hover:border-white/25',
                locked && 'cursor-not-allowed opacity-45',
              )}
            >
              <span
                className="h-8 w-8 rounded-full border border-white/20"
                style={{ background: `linear-gradient(135deg, ${skin.primary}, ${skin.accent})` }}
              />
              <span className="text-[11px] font-medium text-white/85">{family}</span>
              <span className="text-[9px] uppercase tracking-wider text-white/40">{variant ?? ''}</span>
              {equipped ? (
                <Check className="absolute right-1.5 top-1.5 h-3.5 w-3.5 text-neon-cyan" aria-hidden />
              ) : locked ? (
                <span className="absolute right-1.5 top-1.5 flex items-center gap-0.5 text-[9px] text-white/50">
                  <Lock className="h-2.5 w-2.5" aria-hidden />
                  {skin.unlockLevel}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <h3 className="mt-5 text-[10px] uppercase tracking-widest text-white/45">Weapon Tint</h3>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {WEAPON_TINTS.map((wt) => {
          const locked = level < wt.unlockLevel;
          const equipped = wt.id === equippedTint;
          return (
            <button
              key={wt.id}
              type="button"
              disabled={locked || busy}
              onClick={() => equip(equippedSkin, wt.id)}
              className={cn(
                'relative flex items-center gap-2 rounded-xl border px-3 py-2 transition-colors',
                equipped
                  ? 'border-neon-cyan/70 bg-neon-cyan/10'
                  : 'border-white/10 hover:border-white/25',
                locked && 'cursor-not-allowed opacity-45',
              )}
            >
              <span
                className="h-4 w-4 shrink-0 rounded-full border border-white/20"
                style={{ background: wt.color }}
              />
              <span className="truncate text-[11px] font-medium text-white/85">{wt.name}</span>
              {equipped ? (
                <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-neon-cyan" aria-hidden />
              ) : locked ? (
                <span className="ml-auto flex shrink-0 items-center gap-0.5 text-[9px] text-white/50">
                  <Lock className="h-2.5 w-2.5" aria-hidden />
                  {wt.unlockLevel}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {error ? <p className="mt-3 text-xs text-red-400">{error}</p> : null}
      <p className="mt-4 text-[10px] uppercase tracking-widest text-white/30">
        Others see your look at your next match join
      </p>
    </div>
  );
}
