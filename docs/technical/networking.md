# WindArms — Networking

> Topic-sliced excerpt of the v1 build. Full context in [v1.md](../versions/v1.md); nothing here has been reworded. Covers the multiplayer server, netcode model, matchmaking, and anti-cheat/security. Deep technical design for lag compensation and protocol changes is in [PHASE-9-DESIGN.md](PHASE-9-DESIGN.md) (kept as its own file, referenced rather than duplicated here).

## Multiplayer server

The game server is a standalone TypeScript package in `server/` (Express + Socket.IO). Event contracts live in `shared/protocol.ts`, imported by both sides — the client through the `@shared/*` alias, the server relatively — so client and server can never disagree about the wire format.

## Netcode model

Netcode model: the local player is fully client-predicted (movement never waits on the network), while the server stays authoritative over membership and position plausibility. Clients stream poses at 30 Hz over volatile emits; each `GameRoom` validates them (monotonic sequence numbers, speed caps derived from the movement tuning with jitter headroom, arena bounds, input-rate flood protection) and broadcasts 20 Hz snapshots. Failed validation triggers a `player:correction` teleport on the offending client. Remote players render 120 ms in the past, interpolating between snapshot pairs with clock-offset estimation and shortest-arc angle lerp — smooth motion at the cost of a fixed, known latency.

## Matchmaking

Matchmaking is fill-based: Quick Play joins the most-populated public room with space, so players meet each other as fast as possible; new rooms spin up only when all are full (8 players max). Private rooms generate six-character join codes from an unambiguous alphabet. Empty rooms dispose their tick loops and are garbage-collected immediately.

## Anti-Cheat, Security & Testing

Anti-cheat is a rolling-window strike system on top of the per-packet validation that has existed since Phase 3: every rejected packet (teleport, speed hack, fire-rate abuse, implausible shot origin, out-of-cone shotgun pellets, malformed data) counts as a violation, and clients exceeding 20 violations per minute are kicked with a `system:kicked` event — legitimate jitter never comes close, sustained invalid traffic means the client isn't running our code. Stats still flush through the normal disconnect path.

Security: strict CORS, baseline security headers, 10 KB JSON body limit, per-IP fixed-window rate limiting on credential endpoints (10/min), a 10 KB Socket.IO message cap, bcrypt(10) password hashing, and JWT secrets from the environment with a loud warning if the dev secret leaks into production.

Testing: the deterministic core — ray/AABB and ray/capsule intersection, occlusion, damage falloff, movement validation, sanitizers, and the XP curve — is covered by `node:test` suites with zero test-framework dependencies. Run with `npm test` in `server/`. Performance: snapshots quantize positions to centimeters (~30% smaller payloads), and the game canvas drops render resolution under sustained load and recovers automatically (`PerformanceMonitor`-driven DPR).

## Lag compensation (Phase 9)

Netcode: lag compensation is implemented and unit-tested (per-room pose history ring buffer, RTT-smoothed rewind on `combat:fire`) but ships **behind an env flag** (`LAG_COMP`) — off by default until soak-tested with real players. Enabling it by default is tracked in [roadmap.md](../roadmap.md). Full design (rewind algorithm, buffer sizing, clamp behavior, protocol version bump, WebSocket event changes, and known risks like peeker's advantage) is in [PHASE-9-DESIGN.md](PHASE-9-DESIGN.md) §4, §5 and §9.
