# WindArms Studio

This is the WindArms production documentation — the single source of truth for art direction, gameplay, world, technical standards, and process, organized the way a studio bible would be. If you're a human browsing GitHub, this is your front door. If you're an AI coding assistant, start at the root [`CLAUDE.md`](../CLAUDE.md) instead — it has the load-bearing index and conflict-resolution order this page doesn't repeat.

## Two builds, right now

- **V1** — the actual playable game, live at `/play`. Stable, feature-complete. Reference: [versions/v1.md](versions/v1.md).
- **V2** — the current development target. Gameplay hasn't started, but a real marketing/preview experience already has, currently occupying the site root: named operators, a named wind-weapon arsenal, a named world (the Skyfront). Reference: [versions/v2.md](versions/v2.md).

## Disciplines

| Discipline | Where |
|---|---|
| Gameplay & mechanics | [gameplay/mechanics.md](gameplay/mechanics.md) |
| Weapons | [gameplay/weapons.md](gameplay/weapons.md) |
| Operators & abilities | [gameplay/abilities.md](gameplay/abilities.md), [gameplay/operators.md](gameplay/operators.md) |
| Maps | [gameplay/maps.md](gameplay/maps.md) |
| World & lore | [design/lore.md](design/lore.md), [design/skyfront.md](design/skyfront.md) |
| Art direction | [design/art-direction.md](design/art-direction.md) |
| UI / HUD | [design/ui.md](design/ui.md) |
| Audio | [design/audio.md](design/audio.md) |
| VFX | [design/vfx.md](design/vfx.md) |
| Animation | [design/animations.md](design/animations.md) |
| Architecture | [technical/architecture.md](technical/architecture.md) |
| Networking | [technical/networking.md](technical/networking.md) |
| Performance | [technical/performance.md](technical/performance.md) |
| Deployment | [technical/deployment.md](technical/deployment.md) |
| Asset pipeline | [technical/asset-pipeline.md](technical/asset-pipeline.md) |
| Naming conventions | [technical/naming-conventions.md](technical/naming-conventions.md) |
| Coding standards | [technical/coding-standards.md](technical/coding-standards.md) |
| Tech stack | [technical/tech-stack.md](technical/tech-stack.md) |
| Folder structure | [technical/folder-structure.md](technical/folder-structure.md) |

## Governance

| What | Where |
|---|---|
| AI behavior rules | [ai-rules.md](ai-rules.md) |
| Vision & pillars | [vision.md](vision.md) |
| Design principles (per-ability checklist) | [design-principles.md](design-principles.md) |
| Design rules (index of the above) | [design-rules.md](design-rules.md) |

## Records

| What | Where |
|---|---|
| Roadmap | [roadmap.md](roadmap.md) |
| TODO (prioritized) | [todo.md](todo.md) |
| Decisions log | [decisions.md](decisions.md) |
| Known issues (intentionally postponed) | [known-bugs.md](known-bugs.md) |
| History (milestones) | [history.md](history.md) |
| Changelog (dated, fine-grained) | [changelog.md](changelog.md) |

## Every document is a source of truth for its discipline

That's the point of this structure: an AI agent or a new contributor should never have to guess where the answer to "what's the correct X" lives, or reconcile two documents that quietly disagree. When something's ambiguous or two docs conflict, that's a docs bug — flag it, fix it, and log the resolution in [decisions.md](decisions.md) (see the root [`CLAUDE.md`](../CLAUDE.md) Documentation Loading Order for how conflicts are supposed to resolve). Full orientation, if this page wasn't enough: [project-overview.md](project-overview.md).
