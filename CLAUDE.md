# WindArms

WindArms is a browser-based multiplayer FPS game inspired by Deadshot.io, but with unique hero abilities.

This file is the entry point for every coding agent working in this repo. It only indexes — detail lives in `docs/` (the "WindArms Studio" documentation set — see [docs/README.md](docs/README.md) for the human-facing front door).

```
CLAUDE.md
   ↓
docs/ai-rules.md         (how an AI assistant should behave)
   ↓
docs/ (project docs)     (what the project is and how it's built)
   ↓
src/ · server/ · shared/ (actual code)
```

## Current Stable Build: V1

## Current Development: V2

V1 is the playable game (`/play`), feature-complete and stable. V2 is where active development happens, including a live marketing/preview experience that already occupies the site root (`/`) — see [docs/versions/v2.md](docs/versions/v2.md) for the correction to "v2 hasn't started." Site footer copy states it plainly: "Preview build — V1 remains live while V2 rises." Unless explicitly asked to work on v1, assume every request refers to the v2 rebuild.

- Use [docs/versions/v2.md](docs/versions/v2.md) as the primary specification.
- Use [docs/versions/v1.md](docs/versions/v1.md) as the reference for the stable build — architecture, gameplay and netcode patterns worth reusing or migrating into v2.

**Before doing anything else, read [docs/ai-rules.md](docs/ai-rules.md).** It holds the behavioral rules every AI assistant must follow in this repo (permissions, backward compatibility, docs-stay-in-sync, no placeholders, etc.) — separate from project/code documentation so it stays portable across tools (Claude Code, Claw, Codex, Gemini, Cursor, etc.).

## Documentation Loading Order

When two documents disagree, the one higher in this list wins:

1. [docs/ai-rules.md](docs/ai-rules.md) — how an AI assistant should behave, always wins on process/permissions questions.
2. [docs/decisions.md](docs/decisions.md) — a logged decision overrides the general docs below on the specific point it addresses; it exists precisely to prevent relitigating settled questions.
3. [docs/vision.md](docs/vision.md) and [docs/design-principles.md](docs/design-principles.md) (indexed together at [docs/design-rules.md](docs/design-rules.md)) — the project's mission/pillars and the per-ability design checklist. Any new feature or mechanic must satisfy these *before* being checked against the spec below — they're a filter on what's even a valid proposal, not just more detail.
4. [docs/versions/v2.md](docs/versions/v2.md) — the active spec (or [docs/versions/v1.md](docs/versions/v1.md) instead, only when the request is explicitly scoped to v1).
5. [docs/technical/architecture.md](docs/technical/architecture.md) and [docs/technical/folder-structure.md](docs/technical/folder-structure.md) — how the codebase is organized.
6. The domain doc relevant to the task — [docs/gameplay/*](docs/gameplay/), [docs/technical/networking.md](docs/technical/networking.md), [docs/technical/performance.md](docs/technical/performance.md), [docs/technical/deployment.md](docs/technical/deployment.md), [docs/technical/asset-pipeline.md](docs/technical/asset-pipeline.md), [docs/technical/naming-conventions.md](docs/technical/naming-conventions.md), [docs/technical/coding-standards.md](docs/technical/coding-standards.md), [docs/technical/tech-stack.md](docs/technical/tech-stack.md), [docs/design/*](docs/design/).
7. Folder-specific `CLAUDE.md` (e.g. [src/components/game/hud/CLAUDE.md](src/components/game/hud/CLAUDE.md)) — local guidance only, never project-wide.
8. Source code — ground truth for what's actually implemented *today*. If code and docs disagree about current behavior, code wins for "what is," but that's a docs bug: fix the doc (per the sync rule in [ai-rules.md](docs/ai-rules.md)) rather than just working around the stale description. (This is exactly what happened 2026-07-14 — an already-built V2 preview site existed uncaptured in the docs; see [docs/decisions.md](docs/decisions.md).)

[docs/roadmap.md](docs/roadmap.md), [docs/todo.md](docs/todo.md), [docs/known-bugs.md](docs/known-bugs.md), [docs/history.md](docs/history.md) and [docs/changelog.md](docs/changelog.md) are records, not specifications — they don't participate in this order. If two documents at the *same* tier conflict, that's a docs bug: flag it, fix it, and log the resolution in `decisions.md` rather than guessing which one is right.

## Documentation index

| Topic | Doc |
|---|---|
| **AI behavior rules** | [docs/ai-rules.md](docs/ai-rules.md) |
| Vision (mission + pillars) | [docs/vision.md](docs/vision.md) |
| Design principles (per-ability checklist) | [docs/design-principles.md](docs/design-principles.md) |
| Design rules (index of the above two) | [docs/design-rules.md](docs/design-rules.md) |
| Studio front door (human-facing) | [docs/README.md](docs/README.md) |
| Project overview | [docs/project-overview.md](docs/project-overview.md) |
| Roadmap | [docs/roadmap.md](docs/roadmap.md) |
| TODO (project-level, prioritized) | [docs/todo.md](docs/todo.md) |
| Decisions log | [docs/decisions.md](docs/decisions.md) |
| Known issues (intentionally postponed) | [docs/known-bugs.md](docs/known-bugs.md) |
| History / milestones | [docs/history.md](docs/history.md) |
| Changelog (dated, fine-grained) | [docs/changelog.md](docs/changelog.md) |
| v2 — current spec | [docs/versions/v2.md](docs/versions/v2.md) |
| v1 — stable build reference | [docs/versions/v1.md](docs/versions/v1.md) |
| Gameplay mechanics | [docs/gameplay/mechanics.md](docs/gameplay/mechanics.md) |
| Weapons (v1 + v2 arsenal) | [docs/gameplay/weapons.md](docs/gameplay/weapons.md) |
| Maps | [docs/gameplay/maps.md](docs/gameplay/maps.md) |
| Abilities framework (v2) | [docs/gameplay/abilities.md](docs/gameplay/abilities.md) |
| Operators — Kael Aurin, Veyra Solace (v2) | [docs/gameplay/operators.md](docs/gameplay/operators.md) |
| Per-weapon production blueprints (v2) | [docs/design/weapons/](docs/design/weapons/) — starts with `vortex-rifle.md`, unreconciled with the roster above, see [docs/todo.md](docs/todo.md) |
| Architecture | [docs/technical/architecture.md](docs/technical/architecture.md) |
| Networking | [docs/technical/networking.md](docs/technical/networking.md) |
| Performance | [docs/technical/performance.md](docs/technical/performance.md) |
| Deployment | [docs/technical/deployment.md](docs/technical/deployment.md) |
| Asset pipeline | [docs/technical/asset-pipeline.md](docs/technical/asset-pipeline.md) |
| Naming conventions | [docs/technical/naming-conventions.md](docs/technical/naming-conventions.md) |
| Coding standards | [docs/technical/coding-standards.md](docs/technical/coding-standards.md) |
| Tech stack | [docs/technical/tech-stack.md](docs/technical/tech-stack.md) |
| Folder structure | [docs/technical/folder-structure.md](docs/technical/folder-structure.md) |
| Phase 9 technical design (v1) | [docs/technical/PHASE-9-DESIGN.md](docs/technical/PHASE-9-DESIGN.md) |
| **Art Bible — canonical visual/audio/UI/animation reference** | [docs/design/art-bible.md](docs/design/art-bible.md) |
| Art direction (v2, incl. real STORM tokens) | [docs/design/art-direction.md](docs/design/art-direction.md) |
| UI / HUD (v1 + v2) | [docs/design/ui.md](docs/design/ui.md) |
| Audio (v1 + v2) | [docs/design/audio.md](docs/design/audio.md) |
| VFX (v1) | [docs/design/vfx.md](docs/design/vfx.md) |
| Animation (v1 + v2) | [docs/design/animations.md](docs/design/animations.md) |
| Lore | [docs/design/lore.md](docs/design/lore.md) |
| The Skyfront — v2 world (code-confirmed) | [docs/design/skyfront.md](docs/design/skyfront.md) |
| **WindArms Forge** — internal asset production pipeline (scaffolding only, not gameplay) | [docs/forge/README.md](docs/forge/README.md) |

```
WindArms/
├── CLAUDE.md                ← this file — index only, no inline detail
├── docs/
│   ├── README.md              ← human-facing studio front door
│   ├── ai-rules.md            ← read this first
│   ├── vision.md
│   ├── design-principles.md
│   ├── design-rules.md
│   ├── project-overview.md
│   ├── roadmap.md
│   ├── todo.md
│   ├── decisions.md
│   ├── known-bugs.md
│   ├── history.md
│   ├── changelog.md
│   ├── gameplay/
│   │   ├── mechanics.md
│   │   ├── weapons.md
│   │   ├── maps.md
│   │   ├── abilities.md
│   │   └── operators.md
│   ├── technical/
│   │   ├── architecture.md
│   │   ├── networking.md
│   │   ├── performance.md
│   │   ├── deployment.md
│   │   ├── asset-pipeline.md
│   │   ├── naming-conventions.md
│   │   ├── coding-standards.md
│   │   ├── tech-stack.md
│   │   ├── folder-structure.md
│   │   └── PHASE-9-DESIGN.md
│   ├── design/
│   │   ├── art-bible.md       ← canonical, read first for anything visual/audio/UI
│   │   ├── art-direction.md
│   │   ├── ui.md
│   │   ├── audio.md
│   │   ├── vfx.md
│   │   ├── animations.md
│   │   ├── lore.md
│   │   └── skyfront.md
│   ├── versions/
│   │   ├── v1.md
│   │   └── v2.md
│   ├── forge/              ← WindArms Forge: internal asset production docs, not gameplay
│   └── images/
├── src/                   (incl. lib/forge/, components/forge/ — Forge stubs, unwired)
├── server/
├── shared/
└── WindArms Assets/        ← Forge production staging folders (Weapons/, Characters/, Maps/, ...)
```

`docs/` is the source of truth for every coding agent working in this repo (Claude Code, Claw, Codex, Gemini, Cursor, etc.) — this file is only the index into it.

Component-level `CLAUDE.md` files (e.g. [src/components/game/hud/CLAUDE.md](src/components/game/hud/CLAUDE.md)) hold guidance specific to that folder only — never project-wide documentation.
