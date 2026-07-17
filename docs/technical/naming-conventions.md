# WindArms — Naming Conventions

Grounded in the actual patterns observed in the codebase (`src/`, `server/src/`, `shared/`) on 2026-07-14, not invented from a generic template. Follow existing patterns when adding files; if a genuinely new category doesn't fit anything below, pick the closest existing pattern rather than inventing a new one, and update this doc.

## Components (`.tsx`)

PascalCase, one component per file, grouped by domain subfolder under `src/components/`:

- `game/hud/` — `Scoreboard.tsx`, `KillFeed.tsx`, `CombatHud.tsx`, `StreakBanner.tsx`
- `game/weapons/` — pooled-effect components end in `Pool`: `ShellCasingPool.tsx`, `ExplosionPool.tsx`, `MuzzleSmokePool.tsx`, `HeatDistortionPool.tsx`
- `game/world/` — `SkyDome.tsx`, `GroundFog.tsx`, `WeatherParticles.tsx`, `ArenaEnvironment.tsx`
- `game/characters/` — `HeroRig.tsx`
- `game/player/` — `PlayerController.tsx`
- `game/multiplayer/` — `NetworkSync.tsx`
- `landing/` (v1) and `landing/v2/` (v2 preview) — kept as sibling trees, not merged; v2 additionally splits into `v2/sections/`, `v2/shared/`, `v2/hooks/`
- `ui/` — generic reusable primitives: `GlassButton.tsx`, `GlassCard.tsx`, `IconButton.tsx`, `Logo.tsx`

## Hooks (`.ts`, not `.tsx`)

`use`-prefixed camelCase, flat under `src/hooks/` (app-wide) or nested under a feature's own `hooks/` folder (e.g. `landing/v2/hooks/`) when the hook is scoped to that feature: `useKeyboardInput.ts`, `usePointerLock.ts`, `useMultiplayer.ts`, `useMagnetic.ts`, `usePrefersReducedMotion.ts`.

## Zustand stores (`.ts`)

camelCase + `Store` suffix, flat under `src/stores/`: `playerStore.ts`, `weaponStore.ts`, `combatStore.ts`, `multiplayerStore.ts`, `authStore.ts`, `settingsStore.ts`, `chatStore.ts`, `uiStore.ts`, `graphicsStore.ts`. One store per domain — don't add fields to an unrelated store because it's convenient.

## `lib/` (`.ts`)

Organized by domain subfolder, not flat: `lib/game/` (`movement.ts`, `constants.ts`, `localPose.ts`, `effectsBus.ts`, `surfaces.ts`), `lib/network/` (`socket.ts`, `interpolation.ts`, `api.ts`), `lib/three/` (`variedGeometry.ts`, `rimLight.ts`), `lib/audio/` (`audioEngine.ts`), `lib/v2/` (v2-preview-specific: `tokens.ts`, `scrollProgress.ts`, `assetResolver.ts`, `v2/content/*.ts`). A file that's genuinely cross-cutting (not owned by one domain) stays flat at `lib/` root (`lib/utils.ts`, `lib/constants.ts`) — that's the exception, not the default.

## `shared/` (`.ts`)

Singular domain noun, one file per data domain, flat (no subfolders — this is intentionally a small, flat catalog): `protocol.ts`, `weapons.ts`, `arena.ts`, `maps.ts`, `progression.ts`, `match.ts`, `heroes.ts`, `accounts.ts`. V2-specific data gets a distinguishing prefix rather than colliding with the v1 name: `windWeapons.ts` (not `weapons2.ts` or overloading `weapons.ts`) — follow this pattern for any future v2 shared data that would otherwise collide with a v1 file.

## `server/src/` (`.ts`)

Organized by domain subfolder: `auth/` (`auth.ts`, `routes.ts`), `game/` (`combat.ts`, `streaks.ts`, `persistence.ts`, `history.ts`, `lagcomp.ts`, `validation.ts`), `rooms/` (`RoomManager.ts`, `GameRoom.ts`), `db/` (`prisma.ts`), plus flat `config.ts`, `types.ts`, `index.ts` at the root for cross-cutting concerns — mirrors the client's `lib/<domain>/` pattern.

## Tests

Two different conventions coexist — match whichever side you're adding a test to, don't unify them without a separate decision logged in [../decisions.md](../decisions.md):
- **Client:** co-located next to the source file, same name + `.test.ts` (e.g. `heroAnimator.ts` / `heroAnimator.test.ts` in `game/characters/`).
- **Server:** centralized in `server/src/tests/`, one `<domain>.test.ts` per system (`combat.test.ts`, `validation.test.ts`, `progression.test.ts`, `streaks.test.ts`, `lagcomp.test.ts`), not co-located with the module under test.

## App Router pages

`src/app/<route>/page.tsx`, lowercase route folder names, one segment per route: `app/play/page.tsx`, `app/leaderboard/page.tsx`, `app/heroes/page.tsx`, `app/weapons/page.tsx`, `app/maps/page.tsx`. The root `app/page.tsx` has no folder segment.

## V2-specific naming

- Content-only modules (no rendering logic) live in `lib/v2/content/*.ts`, one file per landing section: `hero.ts`, `weapons.ts`, `operators.ts`, `skyfront.ts`, `pillars.ts`, `cta.ts`. Keep this split — presentation components (`landing/v2/sections/*.tsx`) import from these, never inline content directly (this is stated explicitly in `windWeapons.ts`'s comment: *"Do not fork this data into the landing layer"*).
- Design tokens are UPPER_SNAKE exported constants of a lowercase-keyed object: `export const STORM = { marble: '#EDEAE3', ... }`. Follow this shape for any new token group rather than inventing a different casing convention.
- Art slot ids are lowercase-kebab or lowercase-plus-number strings matching a `public/v2-art/{slot}.{ext}` filename — see [asset-pipeline.md](asset-pipeline.md).

## Documentation

kebab-case `.md` files, one topic per file, grouped into `docs/gameplay/`, `docs/technical/`, `docs/design/`, `docs/versions/` — see the root [`CLAUDE.md`](../../CLAUDE.md) tree for the full index. This convention is documentation-specific and intentionally different from the code conventions above (`.md` is always kebab-case; `.ts`/`.tsx` follow the per-category rules above) — don't try to unify them.
