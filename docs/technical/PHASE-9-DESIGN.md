# Phase 9 Technical Design — "Arcade Feel"

**Status:** Proposed (design only — no implementation)
**Owner:** WindArms.io core
**Goal:** Close the look-and-feel gap between WindArms.io and top browser arena shooters (Krunker.io, Shell Shockers) without copying any of their assets, characters or branding.

---

## 0. Gap Analysis — what actually makes those games "feel" right

| Factor | Krunker/Shell Shockers | WindArms.io today | Phase 9 fix |
|---|---|---|---|
| Visible characters | Animated low-poly people / eggs | Capsules with a visor | F1 hero rigs |
| Hit feedback | Damage numbers, headshots, dings | Hitmarker + health event | F2 |
| Match structure | Timed rounds, end podium, map vote | Endless deathmatch | F3 |
| Netcode fairness | Lag-compensated hits | Hits vs latest known pose | F4 |
| Movement expression | Slide-hop / bhop chains, wall interactions | Sprint/slide/dash | F5 |
| Dopamine loop | Streak banners, multikills | Kill feed only | F6 |
| Art readability | Bright skies, flat high-contrast light | Dark neon fog | F7 |
| Identity | Skins and cosmetics | None | F8 |

Feel benchmarks (measurable acceptance targets):

- Two clicks from landing page to being in a match, under 5 seconds on warm server.
- A spectator can tell who is winning within 3 seconds of looking at the screen.
- Every kill produces ≥3 simultaneous feedback channels (number, sound, banner/feed).
- Remote players read as *characters* at 40 m, not geometry.

---

## 1. New Features

### F1 — Procedural hero rigs & animation (P0)
Replace remote capsules with articulated low-poly characters built entirely from primitives (zero external assets, consistent with project philosophy): a 9-node rig (hips, torso, head, 2× upper/lower arms, 2× legs) under one group per player. A code-driven animation state machine maps the already-replicated `MovementState` to poses: run cycle (legs/arms swing at speed-matched cadence), air pose, slide pose (tucked), idle sway, death ragdoll-lite (fixed collapse animation, no physics). Two silhouettes ("Gale" slim / "Bastion" heavy) and 6 accent skins. Weapon held in right hand, oriented by yaw/pitch.

### F2 — Headshots + damage numbers (P0)
Two-zone hitbox: head sphere (r = 0.22 m, center at capsule top − 0.1) tested before the body capsule; exclusive resolution. Multipliers: 1.75× all weapons, 2.0× sniper (one-shot head). Client: pooled floating damage numbers (16 sprite slots, rise + fade 600 ms, yellow body / red-orange head), headshot "ding" synth, skull-adjacent icon in kill feed for headshot kills, `headshots` stat persisted.

### F3 — Match lifecycle (P0)
Server-driven state machine per room: `playing (300 s) → intermission (15 s) → playing (next map)`. On round end: freeze combat, broadcast podium (top 3 + full standings), award +250 XP win / +100 XP top-3, rotate to the next map in `MAP_ORDER`, teleport everyone to fresh spawns, reset room K/D (account stats keep accumulating). Client: round clock replaces match clock (counts down, pulses < 30 s), full-screen end podium with winner callout, auto-continue.

### F4 — Lag-compensated hit validation (P1)
Server keeps a per-player pose ring buffer (last 1 s at tick rate = 20 entries × 8 players ≈ 4 KB/room). On `combat:fire`, rewind every victim candidate to `now − shooterRtt/2 − INTERPOLATION_DELAY_MS` (RTT sampled from the existing `net:ping` acks, stored per socket, EMA-smoothed), clamped to 250 ms max rewind. Static geometry needs no rewind. Behind env flag `LAG_COMP=on|off` for rollback.

### F5 — Wall-run + slide-hop (P1)
Wall-run: while airborne, speed > 7 m/s, and a side probe (2 short raycasts against Rapier world, left/right) touches a wall — gravity scales to 30%, speed floor maintained, camera rolls ±12°, wall-jump ejects at 45°. Max duration 1.6 s per wall. Slide-hop: jumping during a slide preserves slide velocity + 5% (cap 12.5 m/s), landing into a new slide within 0.3 s chains momentum — Krunker-style hop rhythm without full bhop physics. Adds `wallrun` to `MovementState` (both validators must extend the whitelist) and a contextual vertical-speed allowance in `validateMovement`.

### F6 — Kill streaks & multikills (P0.5)
Server tracks `streak` (reset on death) and multikill windows (kills ≤ 4 s apart). Announcements at streak 3 ("Rampage"), 5 ("Unstoppable"), 8 ("Storm Lord") and multikill 2/3/4 ("Double/Triple/Quad"). Client: center banner (1.8 s, stagger-in), synth stinger per tier, `bestStreak` persisted. Ending an enemy's 5+ streak is called out in the feed ("shut down X").

### F7 — Bright art direction pass + 4th map (P1)
Per-map procedural sky dome (inverted sphere, 3-stop gradient shader: horizon/mid/zenith) replacing void black; exposure and ambient raised on a "bright" theme variant; optional flat-toon ramp (theme flag swaps `MeshStandardMaterial` → `MeshToonMaterial` with a 3-step gradient map). New showcase map **Sky Sanctum** (the spec's Floating Islands): floating platforms over a kill plane, bright blue sky, long dash-gaps — designed to demo wall-run and hero silhouettes in screenshots.

### F8 — Cosmetic loadout (P2)
Hero skin + weapon tint unlocked by account level (derived from level thresholds — no unlock table needed), equipped choices persisted and replicated so other players see them. Loadout picker in the lobby (locked entries show required level).

### F9 — Crosshair customization (P2)
Settings additions: style (dot/cross/circle), color, size, gap. Client-only, persisted with existing settings store.

---

## 2. Folder Changes

```
shared/
├── match.ts                      # NEW: phase enum, round/intermission durations, podium types
├── heroes.ts                     # NEW: hero + skin + tint catalogs, level-unlock table
├── protocol.ts                   # MOD: events/fields in §5
├── maps.ts                       # MOD: sky/toon theme fields, Sky Sanctum entry
src/components/game/
├── characters/
│   ├── HeroRig.tsx               # NEW: primitive-built articulated character
│   ├── heroAnimator.ts           # NEW: pure pose functions per MovementState (unit-testable)
│   └── RemotePlayers.tsx         # MOVED here (replaces capsule avatar)
├── hud/
│   ├── RoundClock.tsx            # NEW  · EndPodium.tsx  # NEW  · StreakBanner.tsx  # NEW
│   └── LoadoutPanel.tsx          # NEW (lobby)
├── weapons/DamageNumbers.tsx     # NEW: pooled 3D number sprites
├── world/SkyDome.tsx             # NEW: gradient sky shader
server/src/game/
├── history.ts                    # NEW: PoseHistory ring buffer
├── lagcomp.ts                    # NEW: rewind sampling + RTT registry
├── matchPhase.ts                 # NEW: room phase state machine (extracted, testable)
server/src/tests/
├── lagcomp.test.ts · matchPhase.test.ts · heroAnimator? (client math stays client)  # NEW
docs/PHASE-9-DESIGN.md            # this document
```

`GameRoom.ts` shrinks: phase logic and lag comp move to the new modules; the room orchestrates.

## 3. Database Changes (Prisma — additive, zero-downtime)

```prisma
model User {
  // existing fields unchanged
  headshots        Int    @default(0)
  bestStreak       Int    @default(0)
  wins             Int    @default(0)
  equippedHeroSkin String @default("gale_cyan")
  equippedTint     String @default("default")
}
```

All additive with defaults → `prisma migrate dev` (or `db push`) with no backfill and no downtime. Flush path extends the existing session delta (headshots, bestStreak max-write, wins increment on round win). Equip strings validated against the `shared/heroes.ts` whitelist before write.

## 4. API Changes (REST)

| Method | Path | Auth | Body / Query | Notes |
|---|---|---|---|---|
| PATCH | `/account/loadout` | Bearer | `{heroSkin, weaponTint}` | 400 on non-whitelist or level-locked ids |
| GET | `/leaderboard` | — | `?sort=xp\|wins\|headshots` (default xp) | index on `wins` added |
| GET | `/auth/me` | Bearer | — | profile gains new fields (backward-compatible) |

Rate limiting and 503-when-no-DB behavior identical to existing endpoints.

## 5. WebSocket Events

**Changed payloads (breaking → bump `PROTOCOL_VERSION` to 3):**
- `PlayerSnapshot` += `heroSkin: string`, `tint: string` (sent as catalog indexes, not strings — see §7), `streak: number`.
- `HitEvent` += `headshot: boolean`.
- `DeathEvent` += `headshot: boolean`, `victimStreakEnded: number`.
- `MovementState` += `'wallrun'` (extend both validation whitelists — single shared source already enforces this).

**New S2C:**
- `match:phase` `{ phase: 'playing'|'intermission', endsAt: number, mapId: MapId }` — on join + every transition.
- `match:ended` `{ podium: PodiumEntry[3], standings: …, winnerId }`.
- `combat:streak` `{ playerId, name, tier: 3|5|8 }`.
- `combat:multikill` `{ playerId, name, count: 2|3|4 }`.

**New C2S:** none (loadout goes through REST; the room reads it from the socket's user record at join and on a lightweight `loadout:refresh` REST→socket nudge is *not* needed — re-join applies it).

**Semantics changes:** `combat:fire` rejected during `intermission`; `net:ping` acks now also feed the server-side RTT registry used by lag comp (no wire change).

## 6. Assets Required

None — the phase stays 100% procedural (rigs from primitives, sky from a shader, stingers from the synth engine), preserving the zero-asset, zero-copyright story. Documented upgrade path if art quality ceiling is hit later: replace `HeroRig` primitives with Blockbench-authored GLTFs (≤ 500 KB each, CC0/own-made only, same bone naming so `heroAnimator` is reusable). Explicit non-goals: no ripped or "inspired" meshes/sounds from Krunker/Shell Shockers; no trademarked names in skins.

## 7. Performance Impact

| Change | Cost | Budget check / mitigation |
|---|---|---|
| Hero rigs | ~14 meshes × 8 players ≈ 112 draw calls worst case | Share 3 materials across all rigs; merge static torso pieces; target < 300 total draw calls (currently ~120) |
| Animator | Pure math per remote per frame | O(bones), no allocations; < 0.1 ms for 8 players |
| Damage numbers | 16 pooled sprites | Same pattern as tracers — zero alloc |
| Sky dome | +1 draw call, trivial shader | Replaces vignette overdraw partially |
| Pose history | 8 × 20 × 32 B ≈ 5 KB/room RAM | Negligible; ring buffer, no GC churn |
| Lag comp per shot | ≤ 8 candidates × O(1) buffer lookup + existing capsule math | Micro-benchmark in tests; worst case shotgun 8 pellets × 8 players ≈ 64 tests/shot (same order as today) |
| Snapshot growth | +streak (int) + 2 catalog indexes | Send skins as `number` indexes into `shared/heroes.ts` — +3 ints, not strings; stays under 2 KB/snapshot @ 8 players |
| Toon/bright pass | Material swap, no extra passes | Neutral |

## 8. Estimated Implementation Order

| Step | Scope | Size | Rationale |
|---|---|---|---|
| 9.1 | F3 match lifecycle (`matchPhase.ts`, events, RoundClock, EndPodium) | 1–2 days | Foundation others hook into; instantly changes game feel |
| 9.2 | F2 headshots + damage numbers, F6 streaks | 1–2 days | Highest feedback-per-effort; touches combat path once |
| 9.3 | F1 hero rigs + animator | 2–3 days | Biggest visual jump; independent of netcode |
| 9.4 | F7 sky/bright pass + Sky Sanctum map | 1–2 days | Screenshot/trailer payoff; pure data + shaders |
| 9.5 | F4 lag compensation (flagged) | 2 days | Riskiest — isolated behind env flag, shipped dark first |
| 9.6 | F5 wall-run/slide-hop + F8/F9 cosmetics | 2 days | Movement last: it retunes validation, so land it after netcode settles |

Each step is releasable on its own; protocol version bumps once at 9.1.

## 9. Potential Bugs (ranked by likelihood × pain)

1. **"I was behind the wall!"** — lag comp rewinds victims but not their *perception*; peeker's advantage grows with rewind cap. Mitigate: 250 ms clamp, log rewind magnitude per kill, tune with real players.
2. **MovementState growth breaks validation** — `'wallrun'` must be added to the shared enum *and* both structural validators; the shared-source design covers it, but the server's contextual speed limits (vertical during wallrun) can false-positive kick. Mitigate: state-aware tolerances + violation-log soak test before enabling kicks on new states.
3. **Kill during intermission race** — in-flight `combat:fire` arriving after phase flip double-awards XP or breaks the podium. Gate all combat handlers on phase; snapshot standings at flip.
4. **Map rotation vs client physics remount** — players teleported to new-map spawns while old colliders still mounted client-side → fall through world. Sequence: `match:phase` first, client remounts arena (keyed by mapId), *then* server sends respawn corrections; keep a 1 s grace where kill-Y is ignored.
5. **Animation flicker** — 20 Hz replicated state toggling run/idle at speed boundaries. Hysteresis (enter run > 2.2 m/s, exit < 1.6 m/s) in the animator, not the network.
6. **Head/body double-count** — a ray clipping both sphere and capsule must resolve exclusively (head wins); shotgun pellets each resolve independently (multi-pellet headshots are legitimate).
7. **Streak double-fire on simultaneous kills** — two pellets killing two players in one packet must emit one multikill, two feed entries; process kills in-order within the shot loop.
8. **Ring buffer aliasing** — reading history for a tick that was just overwritten (exactly 1 s old) returns future data. Guard: reject rewind targets older than buffer span minus one tick.
9. **Cosmetic spoofing** — clients can't be trusted for equip; server reads equips only from DB at join (already the design), so the only vector is the REST whitelist — keep it exhaustive.
10. **Free-tier sleep vs match timer** — Render sleeping mid-round on empty rooms is fine (rooms dispose), but a lone player at round end during a cold DB write can stall the podium; podium must never await persistence.

## 10. Testing Strategy

**Unit (extend `server/src/tests/`, same zero-dep `node:test`):** `matchPhase` transition table (all edges incl. join-during-intermission); lag-comp interpolation determinism (known buffer → exact rewound pose) and clamp behavior; head-vs-body exclusive resolution incl. multiplier math; streak/multikill window logic (simultaneous-kill cases); validator acceptance of `wallrun` speeds and rejection of abuse; `heroAnimator` pose functions are pure — snapshot-test joint angles per state.

**Integration (new, headless):** a Node script driving 2–4 real `socket.io-client` instances through join → phase events → scripted fire packets → podium assertion; doubles as the load smoke test at 8 bots × 30 Hz input (assert tick loop stays < 5 ms and no violation kicks of honest bots).

**Regression:** existing combat/validation/progression suites must pass untouched except deliberate protocol-v3 updates; `npm run build` + `typecheck` on both packages in CI order.

**Manual matrix:** 2 browsers × 4 maps × {round end, map rotation, death during rotation, wallrun chains, 200 ms artificial latency (Chrome throttling) with lag comp on/off}.

**Rollout:** ship 9.1–9.4 to production early (visual features, low risk); enable `LAG_COMP` on a second Render instance first, A/B by room, watch the rewind-magnitude and violation logs for a day before defaulting on.

---

*End of design. Implementation begins on approval, in the order of §8.*
