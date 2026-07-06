# WindArms.io

Fast-paced browser multiplayer FPS. Currently implemented: **Phase 1** (AAA landing page with a real-time WebGL backdrop), **Phase 2** (first-person character controller on Rapier physics), **Phase 3** (real-time multiplayer: authoritative Socket.IO server, matchmaking, private rooms), **Phase 4** (full combat: seven weapons, server-side hit detection, health/damage, respawns, kill feed) and **Phase 5** (match UI: Tab scoreboard, in-match chat, persistent settings, match clock) — playable at `/play`.

![Stack](https://img.shields.io/badge/Next.js%2014-black) ![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue) ![Three.js](https://img.shields.io/badge/Three.js-r169-green)

## Quick start

Two processes: the Next.js client and the multiplayer server.

```bash
# 1. Client
npm install
npm run dev              # http://localhost:3000

# 2. Server (second terminal)
cd server && npm install && cd ..
npm run dev:server       # ws://localhost:4000
```

Offline practice works without the server; Quick Play / rooms need both running.

Production:

```bash
npm run build
npm run start
```

Quality gates:

```bash
npm run typecheck  # tsc --noEmit
npm run lint       # next lint
```

**Environment variables** (see `.env.example`): all optional locally. `NEXT_PUBLIC_WS_URL` points the client at the game server (default `http://localhost:4000`); the server reads `PORT` and `CLIENT_ORIGIN` (CORS allow-list, default `http://localhost:3000`).

## Tech

Next.js 14 (App Router), React 18, TypeScript (strict), Tailwind CSS, GSAP, Framer Motion, React Three Fiber + Drei + postprocessing, Rapier physics (`@react-three/rapier`), Zustand, Lucide icons.

## Architecture

```
src/
├── app/                      # App Router: layout (metadata, Inter font), page, globals.css, icon.svg
├── components/
│   ├── landing/              # Page composition
│   │   ├── LandingView.tsx   # Single-viewport shell; code-splits the WebGL canvas (ssr: false)
│   │   ├── Navbar.tsx        # Liquid-glass navbar, staggered links, glow underline
│   │   ├── MobileMenu.tsx    # Full-screen glass menu (AnimatePresence)
│   │   ├── Hero.tsx          # GSAP word-stagger blur-fade, pointer parallax, CTAs
│   │   ├── StatusRow.tsx     # Live status chips (players / servers / ping / season)
│   │   ├── StatCards.tsx     # Floating glass stat cards over the 3D rifle
│   │   └── PreviewCards.tsx  # Heroes / Weapons / Maps / Competitive cards
│   ├── three/                # WebGL layer
│   │   ├── CinematicBackground.tsx   # Canvas config (DPR clamp, no-AA + bloom)
│   │   ├── SceneErrorBoundary.tsx    # WebGL failure → static fallback
│   │   ├── BackgroundFallback.tsx    # Ambient gradient (loading + fallback)
│   │   └── scene/
│   │       ├── Scene.tsx             # Fog, lighting rig, composition
│   │       ├── Rifle.tsx             # Procedural assault rifle, emissive accents
│   │       ├── CitySkyline.tsx       # Instanced silhouette + neon windows
│   │       ├── Embers.tsx / Rain.tsx # Buffer-attribute particle systems
│   │       ├── Smoke.tsx             # Canvas-texture billboards
│   │       ├── LightRays.tsx         # Additive shafts + lens flare sprite
│   │       ├── CameraRig.tsx         # Handheld drift + pointer parallax
│   │       └── Effects.tsx           # Bloom / noise / vignette composer
│   └── ui/                   # Reusable primitives
│       ├── GlassButton.tsx   # Magnetic hover, click ripple, 3 variants
│       ├── GlassCard.tsx     # Cursor tilt + glare + hover lift
│       ├── IconButton.tsx, Logo.tsx, DiscordIcon.tsx
├── hooks/                    # useMagnetic, useTilt, usePrefersReducedMotion,
│                             # useSimulatedLiveStats, useIsomorphicLayoutEffect
├── lib/                      # cn(), clamp(), seeded PRNG, content constants
└── types/                    # Shared landing types
```

## Engineering notes

The page holds exactly one viewport (`h-[100dvh]`, `overflow-hidden`) — no scrolling, like a game launcher.

The "trailer" is a real-time Three.js scene rather than a video: procedural rifle, instanced cyber-city skyline, GPU particle fields (embers, rain), smoke billboards, volumetric-style light shafts, HDR bloom, film grain and vignette. It costs no asset downloads and stays crisp at any resolution. It can be swapped for an `<video>` trailer later without touching the page layout.

Performance decisions: canvas is dynamically imported (`ssr: false`) so the landing shell paints immediately; DPR is clamped to 1.75; MSAA is off because bloom renders offscreen anyway; particles mutate a single `BufferAttribute` per frame (zero allocations in the frame loop); the skyline is two instanced meshes (2 draw calls for ~100 boxes); all procedural layouts use a seeded PRNG so the scene is deterministic.

Accessibility: `prefers-reduced-motion` disables camera shake, particle motion, parallax and entrance animation; the WebGL layer is `aria-hidden` with a static fallback when WebGL is unavailable; all interactive elements have focus rings and labels.

The status row (player count, ping) is a clearly-named simulation (`useSimulatedLiveStats`) — it gets replaced by real Socket.IO telemetry in Phase 3.

## Phase 2 — Movement (`/play`)

Click Play on the landing page (or open `/play`) and click to capture the cursor. Controls: WASD to move, mouse to look, Space to jump, Shift to sprint, C to slide while sprinting, Q to dash, R to respawn, Esc to pause.

The controller is a kinematic capsule driven by Rapier's KinematicCharacterController (collide-and-slide, autostep for stairs, ground snapping, slope limits, push-impulses on dynamic crates). Velocity is integrated manually using source-engine-style accelerate/friction so slides and dashes preserve momentum instead of hard-clamping speed. Game feel details: coyote time (0.12s) and jump input buffering (0.12s), a momentum slide with steering that decays over 0.9s, a flat dash burst with a 2s cooldown, FOV kick on sprint/dash, and eye-height lerp when sliding.

Engineering notes: the whole simulation lives in refs — the controller component never re-renders and the frame loop performs zero allocations. Physics steps on a variable timestep synced to the render loop, correct for per-frame kinematic integration. HUD state is published to a Zustand store at ~10 Hz so DOM components re-render cheaply, fully decoupled from the simulation rate. Keyboard input is level-triggered for held keys and edge-triggered (timestamps) for buffered actions, with a window-blur reset to prevent stuck keys. The test arena includes ramps at two slopes, an autostep staircase, jump/dash platform chains and pushable dynamic crates; movement math (`lib/game/movement.ts`) is pure and unit-testable, with all tuning in `lib/game/constants.ts`.

## Phase 3 — Multiplayer

The game server is a standalone TypeScript package in `server/` (Express + Socket.IO). Event contracts live in `shared/protocol.ts`, imported by both sides — the client through the `@shared/*` alias, the server relatively — so client and server can never disagree about the wire format.

Netcode model: the local player is fully client-predicted (movement never waits on the network), while the server stays authoritative over membership and position plausibility. Clients stream poses at 30 Hz over volatile emits; each `GameRoom` validates them (monotonic sequence numbers, speed caps derived from the movement tuning with jitter headroom, arena bounds, input-rate flood protection) and broadcasts 20 Hz snapshots. Failed validation triggers a `player:correction` teleport on the offending client. Remote players render 120 ms in the past, interpolating between snapshot pairs with clock-offset estimation and shortest-arc angle lerp — smooth motion at the cost of a fixed, known latency.

Matchmaking is fill-based: Quick Play joins the most-populated public room with space, so players meet each other as fast as possible; new rooms spin up only when all are full (8 players max). Private rooms generate six-character join codes from an unambiguous alphabet. Empty rooms dispose their tick loops and are garbage-collected immediately.

## Phase 4 — Combat

Seven weapon classes (pistol, SMG, AR, shotgun, sniper, LMG, energy) defined as data in `shared/weapons.ts` — damage, fire rate, magazine, reload, spread, falloff curve, recoil and procedural viewmodel proportions. Client and server import the same definitions, so balance can never drift between them. Fire with LMB, reload with R, switch with 1–7 or the mouse wheel.

Hit detection is fully server-authoritative: clients only report shot rays (`combat:fire` with origin + per-pellet directions). The server enforces fire rate and muzzle-origin plausibility, then raycasts each pellet against player capsules (Ericson segment-segment closest approach) with static-geometry occlusion — the arena layout lives in `shared/arena.ts` and is consumed by both the client (meshes + Rapier colliders) and the server (AABB slab tests), so cover behaves identically on both sides and wall-shots are impossible. Damage applies linear falloff by distance; kills increment authoritative K/D, broadcast a `combat:death` for the kill feed, and respawns are server-gated by a 3-second redeploy timer.

Client feel: procedural first-person viewmodels (no external models) with movement bob, look sway, recoil punch, reload dip and switch raise; recoil kicks the camera through an accumulator the controller consumes. Tracers and hit sparks come from fixed-size pooled meshes fed by an imperative effects bus — zero allocation and zero React re-renders at any fire rate. Remote shots replicate with server-resolved endpoints, so every client sees the same tracer geometry. The HUD adds health with damage vignette, hitmarkers, ammo/reload state, a weapon strip and the kill feed; death shows an elimination screen with Space-to-redeploy.

## Phase 5 — Match UI

Hold Tab for the scoreboard: authoritative K/D straight from server snapshots, sorted standings, match clock and room code. Score data syncs into the UI store only when a value actually changes, so the 20 Hz snapshot stream never causes HUD re-renders.

Chat opens with Enter (or T) without releasing pointer lock — the input keeps keyboard focus while the cursor stays captured, Enter sends, and a global `chatOpen` flag makes every game-input system (movement, firing, weapon switching) stand down while typing. Messages are sanitized and rate-limited server-side (600 ms per player) and fade from the HUD after six seconds.

Settings (gear icon in the lobby, or the pause menu) persist to localStorage via a Zustand `persist` store: mouse sensitivity multiplier, base FOV (sprint/dash kicks stack on top), weapon bob toggle and the performance HUD toggle. Hot paths read settings with `getState()` inside the frame loop, so changes apply live without re-rendering the simulation. The match clock is derived from server snapshot ticks — no extra network traffic.

## Deployment

Client: zero-config on Vercel — import the repo, preset "Next.js", set `NEXT_PUBLIC_WS_URL` to the deployed server URL. Server: deploy `server/` to Railway or Render (build `npm run build`, start `npm start`, root directory `server`), and set `CLIENT_ORIGIN` to the Vercel domain. `GET /health` is available for uptime checks.

## Roadmap

Phase 6: maps, lighting, audio and VFX. Phase 7: accounts, XP, ranks and parties. Phase 8: anti-cheat, security, testing and final polish.
