'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { LogOut, Play, X } from 'lucide-react';
import type { Profile } from '@shared/accounts';
import AuthPanel from '@/components/game/hud/AuthPanel';
import GlassButton from '@/components/ui/GlassButton';
import { useAuthStore } from '@/stores/authStore';
import { useUiStore } from '@/stores/uiStore';

function ProfileSummary({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const kd = profile.deaths === 0 ? profile.kills.toFixed(1) : (profile.kills / profile.deaths).toFixed(2);
  const stats: Array<[string, string]> = [
    ['Level', String(profile.level)],
    ['XP', profile.xp.toLocaleString('en-US')],
    ['Kills', String(profile.kills)],
    ['K/D', kd],
    ['Matches', String(profile.matchesPlayed)],
    ['Deaths', String(profile.deaths)],
  ];
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-white/45">Signed in as</p>
      <h2 className="mt-0.5 text-2xl font-extrabold tracking-tight text-white">{profile.username}</h2>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-center">
            <p className="text-lg font-bold tabular-nums text-white">{value}</p>
            <p className="text-[9px] uppercase tracking-widest text-white/40">{label}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 flex items-center gap-3">
        <GlassButton variant="primary" icon={Play} href="/play" onClick={onClose}>
          Play
        </GlassButton>
        <GlassButton
          variant="glass"
          icon={LogOut}
          onClick={() => {
            useAuthStore.getState().logout();
            onClose();
          }}
        >
          Sign out
        </GlassButton>
      </div>
      <p className="mt-4 text-[11px] leading-relaxed text-white/40">
        Change your hero skin and weapon tint from the Loadout button in the play lobby.
      </p>
    </div>
  );
}

/** Profile icon target: account summary when signed in, sign-in/register otherwise. */
export default function AuthModal() {
  const open = useUiStore((state) => state.authOpen);
  const close = useUiStore((state) => state.closeAuth);
  const profile = useAuthStore((state) => state.profile);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-void/75 p-4 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-label="Account"
          onClick={close}
        >
          <motion.div
            className="glass-deep relative w-full max-w-md rounded-2xl p-6"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              aria-label="Close"
              onClick={close}
              className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-xl glass text-white/70 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-cyan/70"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
            {profile ? <ProfileSummary profile={profile} onClose={close} /> : <AuthPanel onClose={close} />}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
