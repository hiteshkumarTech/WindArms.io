# WindArms Forge

**WindArms Forge is the internal asset production pipeline for WindArms.** It is not a gameplay feature, not a public-facing application, and not part of the game a player ever sees. It's an internal production workspace developers and artists use to create, review, validate, and import assets into WindArms.

**Status: scaffolding only.** Everything under `docs/forge/`, `src/lib/forge/`, and `src/components/forge/` is a stub — folder structure, placeholder docs, empty interfaces, unwired components. Nothing here implements real logic, nothing is connected to a route, and nothing modifies existing gameplay systems or the existing asset pipeline. See "What this is not" below.

## The workflow

```
Concept Art
    ↓
Reference Board
    ↓
Blender
    ↓
GLB Export
    ↓
Validation
    ↓
Asset Manifest
    ↓
Pipeline
    ↓
Game
```

| Stage | What happens | Where |
|---|---|---|
| Concept Art | Generated or hand-drawn reference imagery for an asset | `WindArms Assets/References/`, `WindArms Assets/<Category>/<Asset>/Reference/` |
| Reference Board | Concept art organized into a build-ready brief (silhouette, materials, dimensions — the shape of a production blueprint) | `docs/design/weapons/` and future per-category equivalents (see [`docs/design/art-bible.md`](../design/art-bible.md) for the visual rules any reference board must satisfy) |
| Blender | The asset is actually modeled, rigged, and animated | `WindArms Assets/<Category>/<Asset>/Blender/` — see [`training-roadmap.md`](training-roadmap.md) for how a contributor gets there and [`blender-shortcuts.md`](blender-shortcuts.md) for the minimum keybind set |
| GLB Export | The model is exported to `.glb`, following the pipeline's naming/LOD convention | `WindArms Assets/<Category>/<Asset>/Export/` — see [`quality-checklist.md`](quality-checklist.md) before export |
| Validation | The export is checked against budget, socket, and clip requirements | `src/lib/forge/assetChecklist.ts` (stub) today; real validation already exists at [`src/lib/v2/pipeline/validation.ts`](../../src/lib/v2/pipeline/validation.ts) — Forge's job is pre-flighting an asset *before* it reaches that check, not replacing it |
| Asset Manifest | A manifest entry describing the asset's sockets/clips/budget is written | [`src/lib/v2/pipeline/manifest.ts`](../../src/lib/v2/pipeline/manifest.ts) — this is real, existing, unmodified by Forge |
| Pipeline | The validated `.glb` is copied into `public/v2-art/` under the pipeline's flat naming convention and resolved at runtime | [`src/lib/v2/pipeline/`](../../src/lib/v2/pipeline/) — real, existing, unmodified by Forge |
| Game | The asset renders in WindArms | Out of scope for Forge entirely |

## What this is not

- **Not a modification to gameplay systems.** No file under `src/components/game/`, `src/stores/`, `server/`, or `shared/` is touched by Forge.
- **Not a modification to the existing asset pipeline.** [`src/lib/v2/pipeline/`](../../src/lib/v2/pipeline/) and [`src/lib/v2/assetResolver.ts`](../../src/lib/v2/assetResolver.ts) are unchanged — Forge is the human/process layer that produces assets *for* that pipeline to consume, not a second pipeline competing with it.
- **Not a public-facing app.** Nothing in `src/components/forge/` is wired to a route. There is no `/forge` page.
- **Not implemented yet.** Every module in `src/lib/forge/` throws `Not implemented` — they're typed interfaces and TODOs, ready for real logic later, per the explicit "scaffolding only" scope of this phase.

## Folder map

```
docs/forge/                    ← this file, training roadmap, quality checklist, shortcuts reference
src/lib/forge/                 ← stub TypeScript modules (interfaces + TODOs, no logic)
src/components/forge/          ← stub React components (unwired, no routes)
WindArms Assets/                ← the actual production folders — see WindArms Assets/README.md
```

## Long-term vision

Not built now — recorded here so future work has a target to grow toward, per the project's decision-logging convention ([`docs/decisions.md`](../decisions.md) — if this vision changes, log why there, don't just silently drift from it):

```
WindArms Forge
├── Academy      (Learn)
├── Assets       (Store)
├── Pipeline     (Import)
├── Validator    (Check)
├── Library      (Materials)
├── Templates    (Starter Blender files)
├── References   (Concept Art)
└── Showcase     (Final Approved Assets)
```

Mapped against what exists today:

| Pillar | Role | Current state |
|---|---|---|
| Academy | Learn | [`training-roadmap.md`](training-roadmap.md) — the 10-level curriculum |
| Assets | Store | `WindArms Assets/` — the production folder tree |
| Pipeline | Import | [`src/lib/v2/pipeline/`](../../src/lib/v2/pipeline/) — real, already built, untouched by Forge |
| Validator | Check | [`quality-checklist.md`](quality-checklist.md) + `src/lib/forge/assetChecklist.ts` (stub) |
| Library | Materials | `WindArms Assets/Materials/` |
| Templates | Starter Blender files | `WindArms Assets/Templates/` — new, empty, added this pass |
| References | Concept Art | `WindArms Assets/References/` |
| Showcase | Final Approved Assets | `WindArms Assets/Showcase/` — new, empty, added this pass |

If this structure holds up over time, the honest framing is: WindArms Forge is a small internal game-studio production pipeline, built incrementally alongside the game itself, not a one-off script or folder convention. Building it out further is future work, gated on real production need — not something to pre-build speculatively past what this pass scaffolds.
