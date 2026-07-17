# WindArms — The Skyfront

> Canon source: `src/lib/v2/content/skyfront.ts`, added to docs 2026-07-14 as part of reconciling the docs with the already-built V2 preview site (see [decisions.md](../decisions.md)). This is code-confirmed content, not a text brief — it's live at `/#skyfront` on the V2 preview landing page (`SkyfrontSection.tsx`). World rules and narrative context: [lore.md](lore.md).

## What it is

"The Skyfront" is the name of the WindArms V2 world/setting: a megacity of floating islands. Section heading copy (`SKYFRONT_HEADING`): *"MAP OVERVIEW — THE SKYFRONT — A megacity of floating islands. Control the structures, control the sky."*

This is presentation content (an SVG hub-and-spoke diagram on the landing page), not playable map geometry — contrast with v1's actual server-side arena data in [../gameplay/maps.md](../gameplay/maps.md). Treat the Skyfront as the world v2 gameplay maps will eventually be set in, not as a map definition itself.

## Points of interest (code-confirmed)

| POI | Description | Accent | Diagram position (x%, y%, size) |
|---|---|---|---|
| Wind Temple | Central strategic stronghold with high ground advantages. | `#EDEAE3` | 50, 48, 16 |
| Storm Reactor | Powerful energy hub. Control it to dominate the battle. | `#4FC3FF` | 78, 30, 11 |
| Sky Bridges | Connects major islands. Expect intense mid-air battles. | `#E3A23C` | 26, 34, 10 |
| Airship Docks | Fast traversal points and vertical flanking opportunities. | `#58B7E6` | 66, 72, 12 |

The diagram layout (hub-and-spoke, percentages) implies the Wind Temple is the literal center of the Skyfront, with the other three POIs arranged around it — this is a presentation detail, not confirmed gameplay-map topology.

## Connections to other docs

- **Operators:** both current operators are explicitly "forged for the skyfront" ([operators.md](../gameplay/operators.md)) — Kael Aurin guards "the Wind Temple's inner sanctum" specifically, one of the four POIs above.
- **Preloader/boot copy** (`src/lib/v2/content/hero.ts`) reinforces the same names: *"Calibrating Airship Docks… Charging Storm Reactors…"* — consistent with the POI table, a good sign the naming is stable rather than placeholder.
- **Lore:** the general world rules (no magic, wind/pressure/storm technology only) in [lore.md](lore.md) govern how these locations should be explained mechanically — e.g., a "Storm Reactor" should be an atmospheric-energy-harvesting structure, not a fantasy artifact.
- **Art direction:** the diagram's accent colors overlap with the STORM token palette in [art-direction.md](art-direction.md#storm-design-tokens-implementation-accurate) (`#EDEAE3` = `marble`, `#4FC3FF` = `energy`, `#E3A23C` = `gold`, `#58B7E6` = `sky`).

## Open questions

Not yet answered anywhere in code or docs — flag for the user rather than guessing if they become load-bearing for a task:

- Is the Skyfront one contiguous playable space, or will each POI become (or map to) a separate arena like v1's map rotation?
- Are there more POIs planned beyond these four, or is four the intended final count?
- How does the Skyfront relate to v1's four existing maps (Cyber City, Snow Base, Forest Temple, Sky Sanctum) — replaced entirely, or coexisting?
