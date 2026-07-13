# WindArms — Gameplay Mechanics (v1)

> Topic-sliced excerpt of the v1 build. Full context in [../versions/v1.md](../versions/v1.md); nothing here has been reworded. Covers movement, combat resolution, match UI/lifecycle, maps/audio/VFX, characters, and progression. Weapon data/visuals live in [weapons.md](weapons.md); netcode/anti-cheat specifics live in [../technical/networking.md](../technical/networking.md).

## Movement (`/play`)

Click Play on the landing page (or open `/play`) and click to capture the cursor. Controls: WASD to move, mouse to look, Space to jump, Shift to sprint, C to slide while sprinting, Q to dash, R to respawn, Esc to pause.

The controller is a kinematic capsule driven by Rapier's KinematicCharacterController (collide-and-slide, autostep for stairs, ground snapping, slope limits, push-impulses on dynamic crates). Velocity is integrated manually using source-engine-style accelerate/friction so slides and dashes preserve momentum instead of hard-clamping speed. Game feel details: coyote time (0.12s) and jump input buffering (0.12s), a momentum slide with steering that decays over 0.9s, a flat dash burst with a 2s cooldown, FOV kick on sprint/dash, and eye-height lerp when sliding.

Engineering notes: the whole simulation lives in refs — the controller component never re-renders and the frame loop performs zero allocations. Physics steps on a variable timestep synced to the render loop, correct for per-frame kinematic integration. HUD state is published to a Zustand store at ~10 Hz so DOM components re-render cheaply, fully decoupled from the simulation rate. Keyboard input is level-triggered for held keys and edge-triggered (timestamps) for buffered actions, with a window-blur reset to prevent stuck keys. The test arena includes ramps at two slopes, an autostep staircase, jump/dash platform chains and pushable dynamic crates; movement math (`lib/game/movement.ts`) is pure and unit-testable, with all tuning in `lib/game/constants.ts`.

Movement (Phase 9): wall-run is live — airborne + fast + a wall probe reduces gravity and lets players ride the wall before ejecting on a wall-jump; validated server-side with its own speed-tolerance band rather than trusting the client.

## Combat resolution

Hit detection is fully server-authoritative: clients only report shot rays (`combat:fire` with origin + per-pellet directions). The server enforces fire rate and muzzle-origin plausibility, then raycasts each pellet against player capsules (Ericson segment-segment closest approach) with static-geometry occlusion — the arena layout lives in `shared/arena.ts` and is consumed by both the client (meshes + Rapier colliders) and the server (AABB slab tests), so cover behaves identically on both sides and wall-shots are impossible. Damage applies linear falloff by distance; kills increment authoritative K/D, broadcast a `combat:death` for the kill feed, and respawns are server-gated by a 3-second redeploy timer.

Weapon data, viewmodels, and weapon-specific Phase 9 additions (headshots, shell casings, surface impacts, visual/geometry overhaul) are in [weapons.md](weapons.md).

## Match UI

Hold Tab for the scoreboard: authoritative K/D straight from server snapshots, sorted standings, match clock and room code. Score data syncs into the UI store only when a value actually changes, so the 20 Hz snapshot stream never causes HUD re-renders.

Chat opens with Enter (or T) without releasing pointer lock — the input keeps keyboard focus while the cursor stays captured, Enter sends, and a global `chatOpen` flag makes every game-input system (movement, firing, weapon switching) stand down while typing. Messages are sanitized and rate-limited server-side (600 ms per player) and fade from the HUD after six seconds.

Settings (gear icon in the lobby, or the pause menu) persist to localStorage via a Zustand `persist` store: mouse sensitivity multiplier, base FOV (sprint/dash kicks stack on top), weapon bob toggle and the performance HUD toggle. Hot paths read settings with `getState()` inside the frame loop, so changes apply live without re-rendering the simulation. The match clock is derived from server snapshot ticks — no extra network traffic.

## Match lifecycle (Phase 9)

Match lifecycle: rooms now run timed rounds (`playing` → `intermission` → next map) instead of an endless deathmatch. Round end broadcasts a podium (top 3 + full standings) with win/top-3 XP bonuses, and rotates to the next map in a fixed order — a fourth map, **Sky Sanctum**, joins the rotation (floating platforms over a kill plane).

## Maps, Audio & VFX

Maps are pure data (`shared/maps.ts`): layout boxes, spawn points, crates and a full visual theme (fog, lighting rig, grid colors, accent palette, ambient particle type) per entry. Three ship — **Cyber City** (neon rooftops, rising embers, city skyline), **Snow Base** (arctic bunkers, falling snow, cold flat light) and **Forest Temple** (overgrown central plinth, drifting motes, warm gold core). The server assigns maps to rooms round-robin and resolves occlusion geometry per room from the same data the client renders, so every map keeps the wall-shot guarantee automatically. Offline practice gets a map picker in the lobby; adding a fourth map is one new data entry, zero engine changes.

Audio is 100% synthesized on raw Web Audio — noise bursts through biquad filters plus enveloped oscillators, zero audio assets shipped. Each weapon class has its own shot recipe (the shotgun booms, the SMG cracks, the energy rifle adds a descending square-wave whine); remote shots are spatialized with stereo panning and distance attenuation computed against the listener's pose. Hits, damage, deaths, respawns, reloads, dry-fire, jumps, landings (scaled by impact speed) and speed-cadenced footsteps are all covered, with a master volume slider in settings. The context unlocks on the pointer-lock gesture to satisfy autoplay policy and fails silently where unavailable.

Combat feel additions: eliminations detonate a ring of sparks at the victim's last known position (with positional boom), and taking damage applies squared-trauma screen shake that decays fast — juice without disorientation.

## Characters (Phase 9)

Characters: remote players render as procedurally rigged hero characters (9-node primitive skeleton) driven by a pure, unit-tested pose animator instead of bare capsules. Cosmetic loadouts (hero skin + weapon tint) are unlocked by account level, equipped from a lobby panel, and persisted server-side.

## Accounts & Progression

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

## v2 gameplay direction

Hero abilities and the four Founding Operators are planned for v2, not implemented in v1. Full design brief: [abilities.md](abilities.md) and [operators.md](operators.md).
