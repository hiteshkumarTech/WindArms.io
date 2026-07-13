# WindArms — History

Every major milestone. Sourced from the actual git log and the phase narrative in [versions/v1.md](versions/v1.md) — nothing here is invented. When a new milestone ships, add it here (see [ai-rules.md](ai-rules.md)). For a finer-grained, dated log of individual changes (including documentation work), see [changelog.md](changelog.md).

## Milestones

- **Phases 1–5** — landing page, FPS movement controller, multiplayer (authoritative server + netcode), combat (weapons, server-side hit detection), match UI (scoreboard, chat, settings).
- **Phase 6** — maps, audio, VFX: three themed maps, fully procedural Web Audio, combat feel additions.
- **Phase 7** — accounts & progression: email/password auth, JWTs, XP, leaderboard, optional PostgreSQL via Prisma.
- **Phase 8** — anti-cheat, security, testing, deployment: strike-based anti-cheat, security headers/rate limiting, `node:test` suites, Vercel/Railway/Render deployment.
- **Phase 9 — AAA Experience Upgrade** — match lifecycle (timed rounds, podium), headshots + damage numbers, procedurally rigged hero characters, wall-run, lag compensation (flagged off), kill streaks/multikills, a fourth map (Sky Sanctum).
- **Phase 9.1** — shell casings, surface-specific bullet impacts, Ion Lance energy VFX identity, kill confirmation UI.
- **Phase 9.2** — graphics & rendering: adaptive quality tiers, live shadows, real-time reflections, GPU weather, sky domes, ground fog.
- **Visual Quality Pass** — unique weapon models (module system), worn-metal/matte-polymer materials, per-map grading, upgraded tracers.
- **Premium Weapon Visual Overhaul** — layered chassis geometry, new material roles, mechanical-action animation, VFX sync.
- **Stabilization round** — fixed the shared root cause of intermittent audio loss and weather/particle stalls (raycaster `.camera` bug); fixed `AudioEngine.ensure()`'s async resume check; retuned `PerformanceMonitor` quality-tier bounds.
- **v1 tagged and frozen** — snapshot tagged `prototype-v1` as a rollback point; README updated to mark the build as v1 and note the planned v2 rebuild.
- **v2 planning started** — world lore, art direction, and the four Founding Operators design brief written; docs restructured (this session, 2026-07-12) into `CLAUDE.md` + `docs/` with v1/v2 separation, then into topic subfolders with AI rules, project-management docs, a documentation loading order, and v2 declared the current development target. Day-by-day detail in [changelog.md](changelog.md).

## Commit log

Full, unmodified `git log --oneline --reverse`:

```
502f9e8 Phases 1-5: landing, movement, multiplayer, combat, match UI
088181a Phase 6: maps, audio, VFX
7d45fb0 Phase 8: anti-cheat, security, tests, deployment
770c4ac Deployment: render.yaml, multi-origin CORS
2fc04b1 Fix duplicate handleChat method
cb3b581 Complete Phase 9 improvements
7eeb040 Update README to simplify quick start section
e0cba72 Update README to remove offline and production details
e7b9ccc Phase 9: match lifecycle, headshots, hero rigs, wall-run, lag comp, cosmetics
0364e2f docs: bring README up to date with Phase 9 work
8c6dd25 Phase 9.1: shell casings, surface-specific impacts, energy VFX, kill confirm
33f7eb9 Merge remote README simplification with local Phase 9.1 work
13d725e Fix global scroll lock on all informational pages
74a61a7 Phase 9.2: graphics & rendering (adaptive quality, shadows, weather, fog)
0929b13 Visual Quality Pass: unique weapon models, materials, environment, lighting, VFX
51c5a4f Premium Weapon Visual Overhaul: layered geometry, materials, mechanical animation, VFX sync
983e013 Stabilization: fix root causes of intermittent audio loss and weather stalls
41e2230 docs: bring README up to date through the visual overhaul and stability pass
4d1bec0 docs: mark current build as v1, note prototype-v1 tag and planned v2 rebuild
```

Note: Phase 7 (accounts & progression) doesn't have its own commit title in this log — it shipped folded into one of the phases above rather than as a separately titled commit. `git log` is the authoritative source if this list and the real history ever diverge.
