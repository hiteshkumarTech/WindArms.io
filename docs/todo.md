# WindArms — TODO

Project-level TODOs, not code TODOs (there are no `// TODO` comments in the codebase as of 2026-07-12 — see [known-bugs.md](known-bugs.md)). Every item below is pulled from the existing v1 backlog ([roadmap.md](roadmap.md)) and the v2 scope ([versions/v2.md](versions/v2.md)) — priority tiers are an organizing judgment call, not sourced from prior prioritization, so re-rank freely as real constraints (deadlines, user feedback) emerge.

## Priority

### HIGH

- **Kael Aurin source GLB exists and gated ACCEPTED WITH LIMITATIONS (2026-07-21)** — no longer blocked on the asset itself, but Phase F (runtime derivatives, FP arm extraction, IK, `/v2/play`/`/v2/range` integration) has not started. `WindArms Assets/Characters/Operator01_Kael/kael_v0.1_source.glb` (git-ignored) is structurally clean — 65 bones, all required limb + finger chains, 100% weighted, passing deformation test, correct 1.83 m normalization, forward direction empirically verified/corrected to `-Z`. Two real gaps before it's usable: **no texture data** (untextured, confirmed missing not just unembedded) and **no runtime-budget derivative yet** (source is 299,915 tris; `tools/make-kael-runtime.mjs` — the LOD0/LOD1/FP-arms builder — doesn't exist yet). Full gate report: [forge/kael-v0.1-inspection.md](forge/kael-v0.1-inspection.md); original production contract: [forge/kael-v0.1-source-brief.md](forge/kael-v0.1-source-brief.md). Everything downstream of the runtime derivative (slots, manifest, render modes, socket/bone fallbacks, FP rig) already exists and is waiting.

- ~~**The Vortex Rifle GLB needs to be re-exported as a single assembled mesh**~~ — **RESOLVED 2026-07-17.** The v0.2 source (`Hitem3d-1784224974921.glb`) is a clean single mesh; the runtime derivative (`tools/make-vortex-runtime.mjs`) now ships `public/v2-art/vortex-rifle.glb` (LOD0, 139,598 tris, 0.84 MB) and `vortex-rifle.lod1.glb` (LOD1, 55,834 tris, 0.57 MB). Real mesh confirmed rendering: landing hero → LOD0, `/v2/range` + `/v2/play` first-person → LOD1 (via `requestedLod={1}`). The old broken multipart v0.1 preview stays archived. **Remaining, lower-priority follow-ups** (see `docs/forge/vortex-rifle-v0.2.md`): the derivative is automatic decimation, not professional retopology (Blender bake pass = the path to v1.0); single `pbr_material` has no accent/energy/tint-named slot, so skin/accent tinting is inert until a material split; no normal map, so fine detail is lost at the current ratio.
- **Skyfront Trial (`/v2/play`) follow-ups** (2026-07-17, updated 2026-07-18, [gameplay/skyfront-trial.md](gameplay/skyfront-trial.md)): the playable loop, match state machine, weapon, LOD, FP pose, muzzle/tracer origin and a Low/Medium/Max difficulty system are all real now. The arena is still a **procedural blockout** and the drone a **temporary training target** — both need production art/replacement. Also open: real playtesting of the Low/Max multipliers (`difficulty.ts` — currently first-pass numbers, not soak-tested; Medium is the only playtested tier), Wind Lift arc tuning, **first-person operator hands + real hand/grip contact** (the 2026-07-18 pose fix corrects orientation but is still a *floating* viewmodel, not a *held* one — waiting on the Phase 6 operator GLB + hand IK, the operator architecture from the prior milestone is ready), a real Blender-exported v1.0 muzzle socket (the current `vortexRuntimeAnchors.ts` anchor is a temporary hand-measured stand-in — delete it once `socket_muzzle` exists), real reload/inspect animations, touch controls (deliberately deferred — mobile shows a desktop-recommended notice), and real gameplay audio (currently the procedural Vortex hooks only).
- Hero ability system for Kael Aurin and Veyra Solace ([gameplay/abilities.md](gameplay/abilities.md), [gameplay/operators.md](gameplay/operators.md)) — bios/roles/signature weapons exist, but passive/signature/ultimate abilities are undefined anywhere in code. This is the headline v2 feature.
- **Reconcile the 2026-07-14 production backlog against existing code-confirmed canon** before more blueprints are built on top of it: backlog names Vortex Rifle / Stormbreaker SMG / Aeon Sniper / Tempest Shotgun / Cyclone LMG / Zephyr Pistol (weapons) and Kai / Lira / Zephyr / Orion (operators) — none of which match `shared/windWeapons.ts` (Aeolus Rifle, Vortex Carbine, Tempest Cannon, Gust Blade) or `operators.ts` (Kael Aurin, Veyra Solace). "Zephyr" also collides within the backlog itself (operator name and weapon name). Not resolved — raise with the user rather than guessing which roster wins.
- v1's Vortex SMG vs. v2's Vortex Rifle: **partially resolved 2026-07-16** ([decisions.md](decisions.md)) — v2's `vortex` is now "Vortex Rifle" (was "Vortex Carbine"), different id namespace than v1's `smg`, no runtime collision. Still open: the marketing name "Vortex" is reused for two different weapons across v1/v2 — decide before both are ever shown together (e.g. a cross-version weapons page) — see [gameplay/weapons.md](gameplay/weapons.md#v2-arsenal-windweaponsts).
- `docs/gameplay/operators.md` still describes Veyra Solace's signature weapon as "Vortex Carbine" — stale since the 2026-07-16 rename, not yet fixed.
- v2 new UI ([design/ui.md](design/ui.md), [design/art-direction.md](design/art-direction.md)) — note the V2 preview site already has its own marketing UI system (STORM tokens, section shells); clarify its relationship to a future in-game UI.
- v2 matchmaking rework (scope not yet detailed beyond v1's fill-based system — needs a design pass)
- Answer the open questions in [design/skyfront.md](design/skyfront.md): is the Skyfront one contiguous space or per-POI arenas; how many POIs are planned; how does it relate to v1's four existing maps (or the backlog's Celestial City / Frosthaven / Verdant Ruins / Aeolus Station, which also don't match either existing map set).

### Production backlog (2026-07-14, from the user)

**Names only — style is NOT from this backlog's source image.** Confirmed 2026-07-14 ([decisions.md](decisions.md)): "War Above The Storm" ([design/art-bible.md](design/art-bible.md), `image-1.png`, the `STORM` tokens) stays canonical for materials/colors/silhouette/everything visual. This list's source, `docs/images/ChatGPT Image Jul 13, 2026, 11_04_24 PM.png`, is a names/composition reference only.

Also note: the user's typed list doesn't exactly match that image's own labels for 3 of the 6 weapons — image says **Inferno Shotgun** (typed as "Tempest Shotgun"), **Windlance Marksman** (typed as "Cyclone LMG"), **Nova Launcher** (typed as "Zephyr Pistol"). Both variants are recorded below; confirm which is correct before more blueprints use the wrong name.

- Weapons: Vortex Rifle (blueprint in progress — [design/weapons/vortex-rifle.md](design/weapons/vortex-rifle.md)), Stormbreaker SMG, Aeon Sniper, **Tempest Shotgun / Inferno Shotgun (name conflict)**, **Cyclone LMG / Windlance Marksman (name conflict)**, **Zephyr Pistol / Nova Launcher (name conflict)**
- Operators: Kai, Lira, Zephyr, Orion (matches the image exactly)
- Maps: Celestial City, Frosthaven (image: "Frosthaven Base"), Verdant Ruins, Aeolus Station
- Vehicles: Wind Bike, Sky Carrier, Cargo Airship
- UI: Main Menu, HUD, Inventory, Matchmaking, Scoreboard

### MEDIUM

- Ranked matchmaking, ELO, and seasons (v1 backlog)
- Enabling `LAG_COMP` by default in v1 — currently flagged off pending a soak test ([technical/networking.md](technical/networking.md))
- Crosshair customization settings (v1 backlog; the crosshair already reacts dynamically, just isn't user-configurable — tracked as F9 in [technical/PHASE-9-DESIGN.md](technical/PHASE-9-DESIGN.md))
- Google OAuth (v1 backlog)

### LOW

- Friends, parties, and achievements (v1 backlog — needs presence infrastructure, deliberately deferred, see [decisions.md](decisions.md))
- Industrial Factory / Desert Base map entries (v1 backlog)
- Controller support and localization (v1 backlog)
- Spectator mode (v1 backlog)

## Adding items

New items go under the tier that reflects actual urgency, with a link to whichever doc has the detail (or "no design doc yet" if it's a raw idea). Move an item to [history.md](history.md) once it ships.
