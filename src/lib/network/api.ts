import type {
  AuthResponse,
  LeaderboardResponse,
  LoadoutRequest,
  LoginRequest,
  Profile,
  RegisterRequest,
} from '@shared/accounts';

const BASE = process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:4000';

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function request<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const response = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
    const body = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      const message =
        typeof body === 'object' &&
        body !== null &&
        'error' in body &&
        typeof (body as { error: unknown }).error === 'string'
          ? (body as { error: string }).error
          : `Request failed (${response.status}).`;
      return { ok: false, error: message };
    }
    if (body === null) return { ok: false, error: 'Empty server response.' };
    return { ok: true, data: body as T };
  } catch {
    return { ok: false, error: 'Could not reach the game server.' };
  }
}

/** Typed REST client for the account endpoints on the game server. */
export const api = {
  register: (payload: RegisterRequest) =>
    request<AuthResponse>('/auth/register', { method: 'POST', body: JSON.stringify(payload) }),

  login: (payload: LoginRequest) =>
    request<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify(payload) }),

  me: (token: string) =>
    request<{ profile: Profile }>('/auth/me', { headers: { Authorization: `Bearer ${token}` } }),

  loadout: (token: string, payload: LoadoutRequest) =>
    request<{ profile: Profile }>('/account/loadout', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    }),

  leaderboard: () => request<LeaderboardResponse>('/leaderboard'),
};
