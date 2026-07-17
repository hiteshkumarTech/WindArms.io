# WindArms — Asset Pipeline

There is no traditional 3D-asset pipeline in this project — no Blender/Maya exports, no texture baking, no shipped audio files. That's a deliberate, load-bearing architectural choice, not a gap. Read this before assuming a "normal" game asset workflow applies.

## V1: 100% procedural, zero assets (shipped, real)

Confirmed across [../technical/tech-stack.md](../technical/tech-stack.md), [../gameplay/weapons.md](../gameplay/weapons.md), and [../design/audio.md](../design/audio.md):

- **Geometry:** every model — weapons, characters, environment, particles — is built from primitives in code. Weapons use a shared chassis builder (`weapons/weaponGeometry.tsx`) with a per-class `ChassisKind` trim pass; characters are a 9-node primitive skeleton (`HeroRig.tsx`); environment art uses baked per-face vertex-color jitter (`lib/three/variedGeometry.ts`) instead of texture maps.
- **Audio:** 100% synthesized at runtime on raw Web Audio (noise through biquad filters, enveloped oscillators) — zero audio files shipped. See [../design/audio.md](../design/audio.md).
- **"Textures":** procedural (canvas-texture billboards for smoke) or absent (materials use color/roughness/metalness plus the vertex-color jitter, not image maps).
- **Determinism:** all procedural layouts use a seeded PRNG, so the same inputs always produce the same visuals — no baked/exported asset needed for reproducibility.

The "asset pipeline" for v1 **is the code** — a chassis builder, a rig builder, a synthesis recipe, a PRNG seed. There's no separate authoring tool, no export step, no asset-versioning problem, because there's no asset file.

## V2: hybrid — procedural-first, real-asset-optional (shipped, real)

`src/lib/v2/assetResolver.ts` (comment, verbatim): *"Asset resolution for `public/v2-art/`. Probes candidate files by extension priority and caches the verdict for the session. Components never know whether art exists — they render the resolved URL or their procedural fallback. Dropping `aeolus.glb` into the folder upgrades the showpiece with zero code changes; deleting it degrades gracefully."*

How it works:
1. Every art-bearing component (operator portraits, weapon showpieces, etc.) is assigned an **art slot** — a string id like `operator-1` or `aeolus` (see e.g. `artSlot` in [../gameplay/operators.md](../gameplay/operators.md)).
2. `resolveAsset(slot, extensions)` HEAD-probes `public/v2-art/{slot}.{extension}` in priority order — images try `webp`, `png`, `jpg` (`IMAGE_EXTENSIONS`); 3D showpieces try `glb` (`MODEL_EXTENSIONS`).
3. Result is cached per session (`Map` keyed by slot+extensions) so repeated lookups don't re-probe.
4. `useResolvedAsset(slot, extensions)` is the component-facing hook — returns the resolved URL once found, or `null` forever if nothing's there. Components render the resolved asset if present, or their procedural fallback if not. Neither path is an error state.

**Implication for anyone dropping in real art:** place a correctly-named file in `public/v2-art/` matching an existing `artSlot` — no code changes needed. **Implication for anyone adding a new art-bearing component:** give it an `artSlot` string and wire it through `useResolvedAsset` with a procedural fallback; don't require the asset to exist.

## Design tokens as the other half of the pipeline

`src/lib/v2/tokens.ts` (comment, verbatim): *"STORM design tokens — the concept board's palette as TypeScript constants, mirrored 1:1 by the storm.* Tailwind colors. Three.js materials import from here so canvas and DOM can never drift. When the Figma file lands, this is the single reconciliation point."* Full palette: [../design/art-direction.md](../design/art-direction.md#storm-design-tokens-implementation-accurate).

`src/components/landing/v2/sections/index.ts` also reserves a `figmaNode: string | null` field per landing section — currently `null` everywhere, explicitly "for 1:1 reconciliation once the design file exists." No Figma file is wired up yet; this is forward scaffolding, not an active integration. Don't assume a Figma pipeline exists today.

## What this means for future asset work

- Don't propose a traditional asset pipeline (DCC tool exports, texture atlases, LOD generation) without first checking whether the procedural approach can be extended instead — that's the established pattern and the "zero-asset, zero-copyright story" is called out as a deliberate property elsewhere in the docs (see [../technical/PHASE-9-DESIGN.md](../technical/PHASE-9-DESIGN.md) §6).
- If real art assets are introduced (the resolver pattern anticipates this), they're strictly additive/optional upgrades over a procedural baseline, not a replacement requirement — every component must keep working with zero assets present.
- New art slots, new tokens, and any future Figma reconciliation should go through the same single-source-of-truth pattern already established (`tokens.ts` for color, `assetResolver.ts` for files) rather than introducing a second parallel system.
