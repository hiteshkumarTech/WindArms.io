# WindArms — UI / HUD

> V2 direction extracted from [art-direction.md](art-direction.md) during the docs restructure (2026-07-12), content preserved verbatim. Expanded 2026-07-14 into the full UI/HUD hub with real v1 HUD facts and the real V2 preview UI (STORM tokens, section shells).

## V1 HUD (shipped, real)

Full detail: [../gameplay/mechanics.md](../gameplay/mechanics.md). Summary:

- **Combat HUD:** health with damage vignette, hitmarkers, ammo/reload state, a weapon strip, kill feed, pooled floating damage numbers and a dedicated headshot hit marker (Phase 9).
- **Scoreboard:** hold Tab — authoritative K/D from server snapshots, sorted standings, match clock, room code. Syncs into the UI store only on actual value change, so the 20 Hz snapshot stream never causes HUD re-renders.
- **Chat:** Enter or T opens it without releasing pointer lock; a global `chatOpen` flag stands down all game-input systems while typing.
- **Settings:** gear icon (lobby or pause menu) — mouse sensitivity, base FOV, weapon bob toggle, performance HUD toggle. Persisted to localStorage via a Zustand `persist` store; hot paths read with `getState()` so changes apply live with zero re-render cost to the simulation.
- **Match lifecycle UI:** round clock (counts down, pulses under 30s), full-screen end-podium (top 3 + standings), kill-streak and multikill center-screen banners, a small "Eliminated" confirmation under the crosshair distinct from the streak banners.
- **Death/respawn:** elimination screen with Space-to-redeploy.
- Component locations: `src/components/game/hud/` — see [../technical/naming-conventions.md](../technical/naming-conventions.md) for the naming pattern.

## V2 UI direction (original brief, not yet implemented as game UI)

Minimal.

Transparent.

Floating holographic glass.

No clutter.

Everything animated.

Every button has weight.

Every transition feels premium.

## V2 preview site UI (shipped, real — but marketing, not game HUD)

The V2 preview landing page (currently the site root — see [../versions/v2.md](../versions/v2.md)) has its own real, shipped UI system, separate from both the v1 HUD above and the abstract V2 game-UI brief:

- **Design tokens:** the STORM palette (`src/lib/v2/tokens.ts`) — see [art-direction.md](art-direction.md#storm-design-tokens-implementation-accurate) for the full token table. Mirrored 1:1 into Tailwind so canvas (Three.js) and DOM never drift.
- **Section shell system:** `landing/v2/shared/SectionShell.tsx`, `SectionHeading.tsx`, `SmartImage.tsx`, `V2Button.tsx` — shared primitives every landing section (`sections/index.ts`) is built from, rather than one-off styling per section.
- **Navigation:** `V2Navbar.tsx`, scroll-choreographed via `useScrollChoreography.ts` and `useReveal.ts`.
- **Boot sequence:** `Preloader.tsx` types out `BOOT_LINES` before revealing the page — see [animations.md](animations.md).

This is a landing/marketing UI, not the in-game HUD — it doesn't replace anything in the "V1 HUD" section above, and there's no confirmed relationship yet between this component system and what a future V2 in-game HUD would look like beyond sharing the STORM token palette.
