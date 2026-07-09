/**
 * Account REST contracts — shared by the server routes and the client
 * API layer so request/response shapes can never drift.
 */

export interface Profile {
  id: string;
  username: string;
  email: string;
  xp: number;
  level: number;
  kills: number;
  deaths: number;
  matchesPlayed: number;
  timePlayedS: number;
  /** Equipped cosmetics (validated against the shared/heroes catalogs). */
  equippedHeroSkin: string;
  equippedTint: string;
}

export interface RegisterRequest {
  email: string;
  username: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoadoutRequest {
  heroSkin: string;
  weaponTint: string;
}

export interface AuthResponse {
  token: string;
  profile: Profile;
}

export interface LeaderboardEntry {
  rank: number;
  username: string;
  level: number;
  xp: number;
  kills: number;
  deaths: number;
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
}
