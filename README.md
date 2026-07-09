# WindArms.io

A complete browser multiplayer FPS built from scratch: cinematic landing page, movement-shooter character controller, authoritative multiplayer server, seven weapons with server-side hit detection, four themed maps, fully procedural audio, accounts with persistent XP and a global leaderboard, anti-cheat, round-based match lifecycle, procedural hero rigs, and a unit-tested core. No downloads, no game engine — Next.js, Three.js, Rapier, Socket.IO, PostgreSQL.

**Play:** `/play` · **Leaderboard:** `/leaderboard`

All eight original build phases are complete — (1) landing page, (2) FPS controller, (3) multiplayer, (4) combat, (5) match UI, (6) maps/audio/VFX, (7) accounts/progression, (8) anti-cheat/security/testing/deployment — plus Phase 9 (see below): match lifecycle, headshots, hero rigs, wall-run, lag compensation, and cosmetics.

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

## Phase 6 — Maps, Audio & VFX

Maps are pure data (`shared/maps.ts`): layout boxes, spawn points, crates and a full visual theme (fog, lighting rig, grid colors, accent palette, ambient particle type) per entry. Three ship — **Cyber City** (neon rooftops, rising embers, city skyline), **Snow Base** (arctic bunkers, falling snow, cold flat light) and **Forest Temple** (overgrown central plinth, drifting motes, warm gold core). The server assigns maps to rooms round-robin and resolves occlusion geometry per room from the same data the client renders, so every map keeps the wall-shot guarantee automatically. Offline practice gets a map picker in the lobby; adding a fourth map is one new data entry, zero engine changes.

Audio is 100% synthesized on raw Web Audio — noise bursts through biquad filters plus enveloped oscillators, zero audio assets shipped. Each weapon class has its own shot recipe (the shotgun booms, the SMG cracks, the energy rifle adds a descending square-wave whine); remote shots are spatialized with stereo panning and distance attenuation computed against the listener's pose. Hits, damage, deaths, respawns, reloads, dry-fire, jumps, landings (scaled by impact speed) and speed-cadenced footsteps are all covered, with a master volume slider in settings. The context unlocks on the pointer-lock gesture to satisfy autoplay policy and fails silently where unavailable.

Combat feel additions: eliminations detonate a ring of sparks at the victim's last known position (with positional boom), and taking damage applies squared-trauma screen shake that decays fast — juice without disorientation.

## Phase 7 — Accounts & Progression

Accounts are email + password (bcrypt) with 7-day JWTs, served by REST endpoints on the game server (`/auth/register`, `/auth/login`, `/auth/me`, `/leaderboard`). The Socket.IO handshake carries the token: authenticated players are identified by their account call sign in matches, and every kill awards 100 XP live (`account:xp` events update the lobby level bar in real time) plus 20 XP per minute played on session end. Stats (kills, deaths, matches, playtime, XP) flush to PostgreSQL via Prisma when a player leaves a room — fire-and-forget with logging, so a database hiccup can never take a room down. The level curve lives in `shared/progression.ts`, used identically by server awards, the lobby profile card and the leaderboard.

**The database is optional.** Without `DATABASE_URL` the server boots in guest-only mode: auth endpoints return 503 with a clear message, the lobby explains stats aren't saved, and gameplay is untouched. To enable accounts:

```bash
cd server
# create server/.env with:
#   DATABASE_URL=postgresql://...   (free at neon.tech, or local Postgres)
#   JWT_SECRET=some-long-random-string
npm install                  # installs prisma + generates the client
npx prisma db push           # creates the User table
npm run dev
```

`/leaderboard` (linked from the landing nav) ranks the top 20 by XP with level, kills and K/D. Deliberately deferred to the backlog rather than shipped half-done: friends, parties and achievements — they need presence infrastructure that deserves its own phase.

## Phase 8 — Anti-Cheat, Security & Testing

Anti-cheat is a rolling-window strike system on top of the per-packet validation that has existed since Phase 3: every rejected packet (teleport, speed hack, fire-rate abuse, implausible shot origin, out-of-cone shotgun pellets, malformed data) counts as a violation, and clients exceeding 20 violations per minute are kicked with a `system:kicked` event — legitimate jitter never comes close, sustained invalid traffic means the client isn't running our code. Stats still flush through the normal disconnect path.

Security: strict CORS, baseline security headers, 10 KB JSON body limit, per-IP fixed-window rate limiting on credential endpoints (10/min), a 10 KB Socket.IO message cap, bcrypt(10) password hashing, and JWT secrets from the environment with a loud warning if the dev secret leaks into production.

Testing: the deterministic core — ray/AABB and ray/capsule intersection, occlusion, damage falloff, movement validation, sanitizers, and the XP curve — is covered by `node:test` suites with zero test-framework dependencies. Run with `npm test` in `server/`. Performance: snapshots quantize positions to centimeters (~30% smaller payloads), and the game canvas drops render resolution under sustained load and recovers automatically (`PerformanceMonitor`-driven DPR).

## Phase 9 — AAA Experience Upgrade

Match lifecycle: rooms now run timed rounds (`playing` → `intermission` → next map) instead of an endless deathmatch. Round end broadcasts a podium (top 3 + full standings) with win/top-3 XP bonuses, and rotates to the next map in a fixed order — a fourth map, **Sky Sanctum**, joins the rotation (floating platforms over a kill plane).

Combat feel: hit resolution is now two-zone (head sphere tested before the body capsule) with per-weapon headshot multipliers, backed by pooled floating damage numbers and a dedicated hit marker. Kill streaks (Rampage/Unstoppable/Storm Lord) and multikills (Double/Triple/Quad) get center-screen banners; ending someone else's 5+ streak is called out in the feed.

Characters: remote players render as procedurally rigged hero characters (9-node primitive skeleton) driven by a pure, unit-tested pose animator instead of bare capsules. Cosmetic loadouts (hero skin + weapon tint) are unlocked by account level, equipped from a lobby panel, and persisted server-side.

Movement: wall-run is live — airborne + fast + a wall probe reduces gravity and lets players ride the wall before ejecting on a wall-jump; validated server-side with its own speed-tolerance band rather than trusting the client.

Netcode: lag compensation is implemented and unit-tested (per-room pose history ring buffer, RTT-smoothed rewind on `combat:fire`) but ships **behind an env flag** (`LAG_COMP`) — off by default until soak-tested with real players.

Still open from the Phase 9 design (tracked in `docs/PHASE-9-DESIGN.md`): shell casings, surface-specific impact effects, and a visually distinct energy-weapon hit effect (the energy gun currently reuses the generic impact/tracer pipeline); crosshair customization settings (the crosshair already reacts dynamically to fire/movement/hits, it just isn't user-configurable yet); a distinct per-kill confirmation banner separate from streak/multikill banners.

## Deployment

Client: zero-config on Vercel — import the repo, preset "Next.js", set `NEXT_PUBLIC_WS_URL` to the deployed server URL. Server: deploy `server/` to Railway or Render (build `npm run build`, start `npm start`, root directory `server`), set `CLIENT_ORIGIN` to the Vercel domain, plus `DATABASE_URL`/`JWT_SECRET` for accounts. A `Dockerfile.server` is included for container platforms (`docker build -f Dockerfile.server .` from the repo root). `GET /health` reports uptime and whether accounts are enabled.

## Backlog

Friends, parties and achievements (need presence infrastructure); ranked matchmaking, ELO and seasons; Google OAuth; enabling `LAG_COMP` by default (currently flagged off pending a soak test); shell casings, surface-specific impact effects and a distinct energy-weapon hit effect; crosshair customization settings; Industrial Factory / Desert Base map entries; controller support and localization; spectator mode.
