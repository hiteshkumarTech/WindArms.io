# WindArms — Maps

> V1 section grounded in `shared/maps.ts` (read directly, 2026-07-14) and the existing v1 docs. V2 section points to [../design/skyfront.md](../design/skyfront.md) — the Skyfront is world/setting content, not playable map geometry yet.

## V1 maps (code-confirmed)

Maps are pure data (`shared/maps.ts`): the client renders and collides against it, the server uses the same boxes for shot occlusion and spawn selection — "adding a map is adding an entry here: no engine changes on either side." All four share a 60×60 footprint so movement-validation bounds stay uniform across rooms. Public overview page: `/maps` (`src/app/maps/page.tsx`).

| Map | Description | Spawns | Surface material | Weather/particles | Notes |
|---|---|---|---|---|---|
| **Cyber City** (`cyber_city`, default) | Neon rooftop district — platform chains and long sightlines. | 8 | Metal, reflective floor | Embers + rain | Skyline shown |
| **Snow Base** (`snow_base`) | Arctic outpost — bunkers, trenches of cover, one long watchtower angle. | 8 | Snow | Snow | |
| **Forest Temple** (`forest_temple`) | Overgrown ruin — a contested central plinth ringed by stone. | 8 | Stone | Motes + dust | Two-tier central plinth, temple pillars |
| **Sky Sanctum** (`sky_sanctum`) | Floating ruins in open sky — long dash gaps and no floor to catch you. | 8 | Crystal | Motes | No floor — `killPlaneY: -8`; step off an island and fall |

Rotation order (`MAP_ORDER`): Cyber City → Snow Base → Forest Temple → Sky Sanctum. Each `MapDef` carries layout boxes (walls/platforms/obstacles/ramps/stairs), 8 spawn points, pushable crates (client-side flavor only, no server occlusion), and a full `MapTheme` (fog, lighting rig, grid colors, accent cycle, particles, optional weather layer, sky-dome gradient, exposure/contrast grading, dominant surface material, optional reflective floor — `'high'` quality tier only).

Gameplay integration (from [mechanics.md](mechanics.md)): the server assigns maps to rooms round-robin; every map keeps the "wall-shot guarantee" automatically since server and client consume the same box data. Offline practice gets a map picker in the lobby. Round structure (timed rounds, podium, rotation) is in [mechanics.md](mechanics.md#match-lifecycle-phase-9).

v1 backlog additions (not yet built): Industrial Factory / Desert Base map entries — see [../roadmap.md](../roadmap.md).

## V2 world/maps

There is no v2 playable map geometry yet. What exists is **the Skyfront** — a named world/setting (a megacity of floating islands with points of interest: Wind Temple, Storm Reactor, Sky Bridges, Airship Docks) presented on the V2 preview landing page. Full detail: [../design/skyfront.md](../design/skyfront.md). Whether the Skyfront becomes one contiguous map, a set of POI-based arenas replacing the four above, or something else entirely is an open question — see that file's "Open questions" section.
