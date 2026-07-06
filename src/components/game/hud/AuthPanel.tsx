'use client';

import { useState } from 'react';
import { ArrowLeft, Loader2, LogIn, UserPlus } from 'lucide-react';
import GlassButton from '@/components/ui/GlassButton';
import { api } from '@/lib/network/api';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';

interface AuthPanelProps {
  onClose: () => void;
}

type Mode = 'login' | 'register';

const INPUT_CLASSES =
  'mt-1 h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/30 focus:border-neon-cyan/50 focus:outline-none focus:ring-2 focus:ring-neon-cyan/40';

/** Email/password sign-in and registration against the game server. */
export default function AuthPanel({ onClose }: AuthPanelProps) {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result =
      mode === 'register'
        ? await api.register({ email: email.trim(), username: username.trim(), password })
        : await api.login({ email: email.trim(), password });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    useAuthStore.getState().setSession(result.data.token, result.data.profile);
    onClose();
  };

  return (
    <div>
      <h2 className="text-2xl font-extrabold tracking-tight text-white">
        {mode === 'login' ? 'SIGN IN' : 'CREATE ACCOUNT'}
      </h2>
      <p className="mt-1 text-sm text-white/55">
        Track XP, levels and lifetime stats. Kills in online matches count toward your account.
      </p>

      <div className="mt-4 flex gap-1 rounded-xl bg-white/5 p-1">
        {(['login', 'register'] as Mode[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => {
              setMode(tab);
              setError(null);
            }}
            className={cn(
              'flex-1 rounded-lg py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors',
              mode === tab ? 'bg-neon-cyan/20 text-neon-cyan' : 'text-white/50 hover:text-white/80',
            )}
          >
            {tab === 'login' ? 'Sign In' : 'Register'}
          </button>
        ))}
      </div>

      <form
        className="mt-4 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label className="block">
          <span className="text-[10px] uppercase tracking-widest text-white/45">Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            disabled={busy}
            placeholder="you@example.com"
            className={INPUT_CLASSES}
          />
        </label>

        {mode === 'register' ? (
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-white/45">
              Call sign (3-16 characters)
            </span>
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
              minLength={3}
              maxLength={16}
              disabled={busy}
              placeholder="StormRider"
              className={INPUT_CLASSES}
            />
          </label>
        ) : null}

        <label className="block">
          <span className="text-[10px] uppercase tracking-widest text-white/45">
            Password{mode === 'register' ? ' (min 8 characters)' : ''}
          </span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={mode === 'register' ? 8 : 1}
            disabled={busy}
            placeholder="••••••••"
            className={INPUT_CLASSES}
          />
        </label>

        {error ? <p className="text-xs text-red-400">{error}</p> : null}

        <div className="flex items-center gap-3 pt-1">
          <GlassButton
            variant="primary"
            icon={busy ? Loader2 : mode === 'login' ? LogIn : UserPlus}
            onClick={() => void submit()}
          >
            {busy ? 'Working' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </GlassButton>
          <GlassButton variant="glass" icon={ArrowLeft} onClick={onClose}>
            Back
          </GlassButton>
        </div>
      </form>

      <p className="mt-4 text-[11px] leading-relaxed text-white/40">
        Accounts require the game server to have a database configured. Guests can always play —
        stats just aren&apos;t saved.
      </p>
    </div>
  );
}
