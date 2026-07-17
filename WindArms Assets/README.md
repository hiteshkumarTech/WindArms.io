# WindArms Assets

The production staging area for every WindArms asset — source files, concept art, and exports, organized so any future `.glb` (or texture, sound, or animation) has a home before it exists. This is not what the game loads at runtime; it's what feeds the real pipeline. See [`docs/forge/README.md`](../docs/forge/README.md) for the full concept-to-game workflow this folder sits inside.

## Relationship to the runtime pipeline

**This folder is not `public/v2-art/`.** The real asset pipeline ([`src/lib/v2/pipeline/`](../src/lib/v2/pipeline/)) reads flat-named files from `public/v2-art/` (e.g. `vortex-rifle.glb`) — see [`src/lib/v2/pipeline/README.md`](../src/lib/v2/pipeline/README.md) for that convention. Nothing here is served to a browser. An asset's finished `Export/` files get *copied* into `public/v2-art/` when it's ready to ship — this folder is the working area before that handoff, organized per-asset rather than flat, since source files, references, and multiple work-in-progress iterations need a real folder structure that the flat runtime convention doesn't.

## Folder structure

```
WindArms Assets/
├── Weapons/          ← per-weapon subfolders
├── Characters/        ← per-operator subfolders
├── Maps/               ← per-location subfolders
├── Materials/           ← shared material library (see docs/design/art-bible.md §5)
├── Vehicles/
├── Props/
├── UI/
├── Icons/
├── Logos/
├── Sounds/               ← sound effects source files
├── Music/
├── Animations/            ← shared/reusable animation source files
├── References/             ← general concept art not tied to one specific asset yet
├── Templates/               ← starter Blender files (new — see docs/forge/README.md's long-term vision)
└── Showcase/                 ← final, approved, ship-ready assets (new — see docs/forge/README.md's long-term vision)
```

## Per-asset structure

Each real asset gets its own subfolder under the matching category, shaped like this:

```
Weapons/Vortex Rifle/
├── Reference/            ← concept art, mood boards, real-world reference photos
├── Concept Sheets/         ← turnaround sheets, orthographic views, the production blueprint's visual companion
├── Blender/                  ← .blend source file(s) — canonical, never delete after export
├── Export/                     ← final .glb / .lod1.glb / .lod2.glb — the only files that ever get copied into public/v2-art/
├── Textures/                    ← source texture files, if any (before baking into the GLB)
└── Audio/                        ← source sfx files (e.g. fire.wav, reload.wav), if this asset ships real audio
```

```
Characters/Kai/
├── Reference/
├── Concept Sheets/
├── Blender/
├── Export/
├── Textures/
├── Animations/            ← character-specific animation source files (idle, run, ability poses)
└── Audio/                    ← voice lines, if any
```

```
Maps/Skyfront/
├── Reference/
├── Concept Sheets/
├── Blender/
├── Export/
├── Textures/
└── Audio/                    ← ambient/environmental audio specific to this location
```

Not every subfolder is required for every asset — a simple prop may only need `Blender/` and `Export/`. Add what the asset actually needs; don't create empty subfolders speculatively.

## Before anything ships

Run it through [`docs/forge/quality-checklist.md`](../docs/forge/quality-checklist.md). An asset isn't done when it looks right in Blender — it's done when it passes that checklist and its `Export/` files are ready to copy into `public/v2-art/` following [`src/lib/v2/pipeline/README.md`](../src/lib/v2/pipeline/README.md)'s naming convention.

## A naming note

"Kai" above is used purely as a folder-naming example, matching the operator name from the current production backlog ([`docs/todo.md`](../docs/todo.md)) — the operator roster (Kai/Lira/Zephyr/Orion vs. the code-confirmed Kael Aurin/Veyra Solace) is still an open naming conflict, not resolved by this README. Check `docs/todo.md` and `docs/decisions.md` before committing real production work to one name over the other.
