# WindArms Art Bible

**Status: canonical. This document is the single source of truth for WindArms's visual, audio, UI, and animation identity.** Every AI agent, developer, designer, and contributor should read this before creating or approving any asset, mechanic-facing visual, or UI surface for V2. Where this bible and an older prose fragment in [art-direction.md](art-direction.md), [ui.md](ui.md), [audio.md](audio.md), [vfx.md](vfx.md), or [animations.md](animations.md) disagree, **this bible wins** — those files remain as supplementary implementation detail (v1 shipped facts, code file names) and are not being deleted, per [ai-rules.md](../ai-rules.md).

**Source of truth for this bible: `docs/images/image-1.png`** — the WindArms concept board, "THE WAR ABOVE THE STORM." Read directly and analyzed 2026-07-14. Every section below is traced back to either that board, existing code (`src/lib/v2/`, `shared/`), or existing docs — nothing here is invented. Where a requested topic has no source material anywhere, that's stated explicitly rather than filled in with a plausible-sounding guess; see "What this bible does not yet define" at the end.

**A second image, `docs/images/image.png`, did not match this direction** (removed from the repo as of 2026-07-14) — it was a generic, gritty-realistic military-shooter roadmap infographic (PBR realism, ragdoll animations, an ELO ranked system, a tech stack citing PhysX/Redis/WebRTC that existed nowhere else in this project) with a different logo entirely. Kept here as historical context — see §28, still a useful "what not to do" reference even though the file itself is gone.

**A third image, `docs/images/ChatGPT Image Jul 13, 2026, 11_04_24 PM.png`, is the source of the 2026-07-14 production backlog** (weapon/operator/map/vehicle/UI names in [todo.md](../todo.md)) but is **not** a style reference — confirmed 2026-07-14 ([decisions.md](../decisions.md)): "War Above The Storm" (this bible, `image-1.png`, the `STORM` tokens) stays canonical for everything visual. Pull weapon/operator/map **names** from that image and the backlog; pull **materials, colors, silhouette rules, and every other visual decision** from this bible, not from that image's rendered art style.

---

## 1. Overall Art Direction

WindArms is a civilization that survived the end of the world by building upward. Centuries ago, the continents were lost to an endless, planet-wide storm; what's left of humanity lives on colossal megastructures floating above the clouds, kept aloft by ancient wind technology. Every battle in WindArms happens on top of that — armed conflict fought on monuments, between clouds, above a hurricane that never ends.

The direction is not military sci-fi, not cyberpunk, not fantasy. It's **monumental ancient architecture reinterpreted through wind-powered engineering** — Roman/brutalist massing, aerospace-grade materials, and visible mechanical function, all lit like a clear morning rather than a warzone at night.

## 2. Core Design Philosophy

From the concept board's own "Visual Identity" panel, matched exactly by [art-direction.md](art-direction.md)'s "Art Direction Keywords": **Monumental. Elegant. Mechanical. Atmospheric. Vertical. Clean. Intelligent. Premium.** (Plus, from the fuller keyword list: Cinematic, Wind, Motion, Scale, Precision.)

Governing test, from the original master-prompt brief: *"Would a player recognize this as WindArms in less than one second?"* If a proposed asset could be mistaken for a screenshot of Halo, Destiny, Valorant, or a generic PBR military shooter, it has failed — regardless of how good it looks in isolation. See [vision.md](../vision.md) for the project pillar this enforces ("no copied abilities/mechanics from named competitors" generalizes here to "no copied visual identity" too).

Everything in WindArms should read as **one civilization's output** — a weapon, a building, an operator's armor, and a HUD icon should all look like they were manufactured by the same culture.

## 3. Visual Language

The founding creative brief (verbatim, from the original master prompt): *"Imagine if: Ancient Rome. Brutalist architecture. Floating cities. Weather technology. Modern weapon engineering. became one civilization. Nobody is doing this."*

Practically, that means every asset should be checked against this fusion:
- **From Ancient Rome:** monumentality, symmetry, arches, columns, ceremonial scale.
- **From Brutalist architecture:** raw massing, honest structure, weight, geometric confidence, function visible in form.
- **From floating cities:** verticality as the default, not the exception; nothing sits flush with a "ground" because there mostly isn't one.
- **From weather technology:** every large structure should look like it's doing something to the storm — venting, channeling, harvesting, stabilizing — not just decorating it.
- **From modern weapon engineering:** precision-machined surfaces, moving mechanical parts, visible tolerances — the opposite of ornamental fantasy armor.

Explicitly rejected reference points (from the master prompt, verbatim): Call of Duty, Battlefield, Halo, Apex Legends, VALORANT, or "any existing franchise." Also explicitly rejected: "generic sci-fi, cyberpunk clichés, military realism, and random visual noise."

## 4. Color System

Two layers exist and must be reconciled, not treated as two different palettes:

**The original abstract brief** (from [art-direction.md](art-direction.md)):
- Primary: Marble White, Ash Grey, Storm Blue
- Secondary: Electric Cyan, Deep Navy, Steel Silver
- Accent: Amber Energy, Crimson Warning Lights
- Rule: *"Absolutely avoid rainbow neon."*

**The implemented STORM tokens** (`src/lib/v2/tokens.ts` — real hex values, the actual single source of truth for code):

| Token | Hex | Role |
|---|---|---|
| `marble` | `#EDEAE3` | Primary |
| `mist` | `#C7CFD6` | Primary |
| `steel` | `#8E99A4` | Primary |
| `slate` | `#3E4A5A` | Primary |
| `abyss` | `#0A1522` | Secondary |
| `deep` | `#12263C` | Secondary |
| `mid` | `#1E3A5C` | Secondary |
| `blue` | `#2E6FA3` | Secondary |
| `sky` | `#58B7E6` | Secondary |
| `energy` | `#4FC3FF` | Secondary — Kael Aurin's accent |
| `gold` | `#E3A23C` | Accent — Veyra Solace's accent, Tempest Cannon's accent |
| `goldDeep` | `#B8860B` | Accent |
| `crimson` | `#B02E2E` | Accent |
| `skyZenith` / `skyMid` / `skyHorizon` | `#16283E` / `#4E8DBE` / `#D9E7F2` | Sky gradient stops |

The concept board's own swatches confirm this split: a white/gray/blue-gray **Primary** row, a blue-family **Secondary** row, and a gold/orange/red **Accent** row — directly consistent with both the brief and the tokens above.

**Rule:** any new UI, material, or VFX color must map to a `STORM` token or be added as a new token in `tokens.ts` — never a one-off hex value. This is stated as a hard rule in [asset-pipeline.md](../technical/asset-pipeline.md) already; this bible restates it because color drift is the single easiest way to silently break visual consistency.

## 5. Material Library

Confirmed by the concept board's "Materials" panel — six materials, each shown as a lit sphere sample:

| Material | Look | Where it's used |
|---|---|---|
| **Marble Stone** | White/warm-gray stone, soft matte | Architecture — Wind Temples, floating structure mass |
| **Titanium** | Cool gray metal, satin finish, low reflectivity | Structural framing, weapon chassis, armor plating |
| **Brushed Steel** | Darker gray metal, directional micro-highlights | Mechanical components, weapon receivers, turbine housings |
| **Glass Crystal** | Pale cyan-white, translucent, faceted | Wind-energy conduits, canopy/dome surfaces, Sky Sanctum's `crystal` surface material (v1-confirmed: [maps.md](../gameplay/maps.md)) |
| **Energy Core** | Bright cyan-blue, emissive, glowing | Weapon power cells, operator visor/trim accents, reactor cores |
| **Ancient Alloy** | Warm gold-bronze metal, subtle patina | Ornamental trim, high-status architectural details, Storm Reactor accents |

These are the only six approved base materials for new V2 assets. A new asset should be built from a combination of these (e.g., a weapon = Titanium chassis + Brushed Steel receiver + Energy Core power cell), not from a new material invented ad hoc. If a genuinely new material is needed, that's a decision to raise and log in [decisions.md](../decisions.md), not a silent addition.

Rule, from the original brief: *"Every wall/platform/ramp/crate carries a baked per-face vertex-color jitter... so flat gray boxes read as worn surfaces"* — this v1 technique (real, shipped: [architecture.md](../technical/architecture.md)) is a reasonable pattern to carry forward for V2 materials too: even monumental marble should read as weathered, not showroom-new.

## 6. Lighting Style

From [art-direction.md](art-direction.md), verbatim intent: **Never night. Never dark. Never horror. Bright. Clean. Volumetric.** Massive clouds, sunlight scattering through storm walls, HDR skies. *"Everything should feel enormous."*

The concept board confirms this directly: every environment shot is lit by strong, warm/cool directional sunlight breaking through cloud layers, with visible god-rays and atmospheric scattering — not moody, not underlit, not neon-noir. Lightning is present but as scale-communicating environmental drama (storm walls in the far distance), not as the primary light source.

This is a deliberate contrast with v1's landing page, which is dark/neon (see [architecture.md](../technical/architecture.md)) — do not carry v1's dark cyberpunk lighting mood into V2 assets. They are different visual eras of the same product and should look it.

## 7. Architecture Style

From the concept board's "Architecture" panel and confirmed by [skyfront.md](skyfront.md)'s code-sourced POI list, five architectural categories:

1. **Wind Temples** — the central, most monumental structure type; ceremonial, symmetrical, tallest silhouettes, ring-shaped turbine crowns.
2. **Storm Reactors** — industrial-monumental hybrids; visibly generating/processing energy, glowing cores, more mechanical than temples.
3. **Floating Bridges** (documented elsewhere as "Sky Bridges") — thin, elegant connective structures; the most exposed, most vertigo-inducing spaces.
4. **Airship Docks** — functional, less ornamental; where the civilization's transport infrastructure lives, docking arms and mooring structures.
5. **Vertical Combat Spaces** — not a location type but a design requirement: architecture must offer verticality as a first-class trait everywhere, not just at these four landmark types.

General rules, from [art-direction.md](art-direction.md): no skyscrapers, no apartments — *"everything should feel engineered for gods."* Huge bridges, floating cathedrals, storm reactors, wind temples, airship docks. Verticality everywhere.

## 8. Floating Island Design Rules

Synthesized from [skyfront.md](skyfront.md)'s hub-and-spoke POI layout and the concept board's "Map Overview" diagram (also hub-and-spoke, Wind Temple at center):

- **Hub-and-spoke as the default topology:** one dominant central structure (typically a Wind Temple), with secondary POIs arranged around it, connected by bridges/gaps rather than contiguous ground.
- **No floor is guaranteed.** v1 already has precedent for this — Sky Sanctum has `killPlaneY: -8` and no floor mesh at all ([maps.md](../gameplay/maps.md)); this should be the *default* assumption for V2 spaces, not the exception v1 treats it as.
- **Scale communicates civilization, not just level geometry.** Per Key Features on the concept board: *"Massive Scale — Fight on structures larger than everything you've seen before."* A floating island isn't a "map" in the small-arena sense; it should read as a fragment of a much larger, implied megacity extending past the playable bounds.
- **Islands should look inhabited, not sterile.** The concept board's architecture shots show weathering, secondary detail (smaller structures, cables, platforms) around the primary silhouette — avoid single-purpose "arena boxes" that only exist for gameplay.

## 9. Wind Technology Design Language

Governed by the hard world rules in [lore.md](lore.md) (verbatim): *"WindArms is NOT fantasy. WindArms is NOT magical. WindArms is NOT superhero-based. Every ability must be believable within the world's technology."*

All powers/technology must trace to one of: atmospheric pressure engineering, wind manipulation through advanced machinery, kinetic energy storage, storm energy harvesting, electromagnetic technology, mechanical engineering, aerodynamics, advanced materials. Explicitly banned: spellcasting, glowing magical hands, elemental magic, summoned creatures, unexplained teleportation.

Visually, this means every "powered" surface (a weapon's Energy Core, a Storm Reactor's glow, an operator's visor) should look like it's plugged into a *system* — visible conduits, turbines, pressure chambers, coils — not a floating unexplained light. The concept board's giant ring structures crowning the Wind Temples are the clearest visual statement of this: wind technology is monumental, mechanical, and load-bearing, not a special-effects layer on top of the architecture.

## 10. Weapon Design Language

Code-confirmed roster ([weapons.md](../gameplay/weapons.md#v2-arsenal-windweaponsts), matched word-for-word by the concept board):

| Weapon | Class | Description | Mechanic |
|---|---|---|---|
| Aeolus Rifle | rifle | High-velocity kinetic rounds powered by compressed wind. | Precision spine — tightens while aimed |
| Vortex Carbine | carbine | Rapid-fire turbine driven projectiles. | Turbine spin-up — rate climbs as you hold |
| Tempest Cannon | cannon | Charges wind pressure for devastating explosive bursts. | Charge & release — pressure decides the blast |
| Gust Blade | blade | Wind-channeled blade that cuts with compressed force. | Dash-strike — momentum feeds the edge |

From [art-direction.md](art-direction.md): weapons are *"wind-powered kinetic technology"* — not military guns, not fantasy staffs, not laser rifles. Every weapon has rotating turbines, pressure chambers, magnetic rails, floating energy coils, moving mechanical components. *"Every reload becomes satisfying mechanical choreography."*

The concept board's weapon renders confirm the material application directly: Titanium/marble-white chassis, Energy Core glow at clearly readable points (not full-weapon glow), gold Ancient Alloy trim on higher-tier pieces. This is a fundamentally different silhouette language from v1's real weapons (pistol/SMG/AR/shotgun/sniper/LMG/energy, documented in [weapons.md](../gameplay/weapons.md)) — do not reuse v1 weapon geometry or materials as a V2 starting point.

**Open naming issue:** v1 already has a weapon named "Vortex" (the Vortex SMG); V2's "Vortex Carbine" collides with it. Flagged in [todo.md](../todo.md) — resolve before this becomes real balance data.

## 11. Operator Design Language

Code-confirmed roster ([operators.md](../gameplay/operators.md)): **Kael Aurin** ("Temple Warden," Aeolus Rifle, accent `#4FC3FF`) and **Veyra Solace** ("Tempest Vanguard," Vortex Carbine, accent `#E3A23C`). The concept board's "Elite Operators" panel shows both — matching the confirmed count of two.

From the original brief ([operators.md](../gameplay/operators.md)'s historical section, still valid as material-language guidance even though the specific archetypes it describes are superseded): white marble, titanium, brushed steel, electric cyan energy, mechanical turbines, rotating pressure mechanisms, wind reactors, clean engineering, elegant silhouettes, functional armor, premium AAA realism. Explicitly avoid: oversized fantasy armor, glowing magical effects, exaggerated sci-fi clichés.

The concept board's portraits confirm this: both operators wear white/marble armor with gold trim, a glowing visor as the primary "readable at range" identity marker (matching each operator's accent token color), and functional rather than decorative silhouettes — no capes, no oversized pauldrons, no fantasy ornamentation. **Every operator must be recognizable by silhouette and visor color alone at combat distance** — this is a hard readability requirement, not a style preference (see [design-principles.md](../design-principles.md)'s "must be readable" rule).

## 12. Vehicle Design Language

**No source material exists.** Airships appear in the concept board's background architecture art (docked at "Airship Docks") and in `hero.ts`'s boot-sequence copy (*"Calibrating Airship Docks…"*), but nothing confirms whether airships are player-operable vehicles, background set dressing, or a future system. Do not design a vehicle roster, control scheme, or vehicle-specific material rules from this bible — that's an open question to raise with the user (see [skyfront.md](skyfront.md)'s "Open questions"), not something to infer from an aesthetic reference.

## 13. Enemy Design Language (future)

**No source material exists, and the user's own request labels this "(future)."** WindArms is a PvP FPS in every existing doc — there is no AI enemy, no PvE mode, and no bestiary anywhere in code, docs, or the concept board. Do not invent enemy types, silhouettes, or a threat-design language. If a PvE/enemy system is ever greenlit, this section should be written then, from a real brief — not backfilled speculatively now.

## 14. UI Style Guide

From [ui.md](../design/ui.md)'s original brief: Minimal. Transparent. Floating holographic glass. No clutter. Everything animated. Every button has weight. Every transition feels premium.

The concept board's "UI / HUD Design" panel adds two confirmed descriptors not previously captured in text: **Elegant** and **Informative** (alongside Minimal, Transparent, Animated). Treat the full confirmed set as: Minimal, Transparent, Elegant, Animated, Informative.

The V2 preview site's real, shipped UI system (component shells, STORM tokens — [ui.md](../design/ui.md)) is a landing/marketing UI, not this in-game HUD system — they share only the token palette today. Any future in-game V2 UI should be built to this style guide, using the STORM tokens (§4), not by extending the marketing-site component library, unless a decision is explicitly made to unify them.

## 15. HUD Design Principles

The concept board includes an actual HUD mockup, which is the most concrete UI reference in this entire bible. Confirmed elements, reading left to right:
- **Top-left:** a minimal circular minimap.
- **Bottom-left:** a cluster of circular ability icons (implying an ability-bar HUD element doesn't exist in v1 and is new V2 scope — consistent with hero abilities being the headline V2 feature per [todo.md](../todo.md)).
- **Bottom-right:** health/ammo readout, clean sans-serif numerals (shown as "25 / 75" in the mockup), a horizontal health bar.
- **Overall frame:** dark semi-transparent panels with thin light-colored borders — "floating holographic glass" made concrete.

Compare against v1's real, shipped HUD ([ui.md](../design/ui.md)) — v1 has no ability-bar concept at all (it has weapon-strip + ammo + health + kill feed + hitmarkers). A V2 in-game HUD needs a genuinely new ability-bar element that v1 never required. Everything else (health, ammo) can plausibly evolve from v1's existing HUD components rather than being built from scratch — confirm this assumption before implementation, don't treat it as settled.

## 16. Iconography

v1 uses Lucide icons throughout ([tech-stack.md](../technical/tech-stack.md)) — thin-line, geometric, consistent stroke weight. The concept board's own infographic iconography (the small circular icons next to "Visual Identity," "Gameplay Feel," "Audio Identity," and "Key Features" list items) follows the same thin-line circular-badge language, which suggests continuity is achievable: Lucide's style is compatible with the concept board's icon language, not in conflict with it. No confirmed decision exists yet to keep using Lucide for V2 in-game iconography (ability icons, HUD elements) — but it's a reasonable default given the visual compatibility, not a random pick.

## 17. Typography

**Limited source material.** v1 uses the Inter font family ([architecture.md](../technical/architecture.md): "layout (metadata, Inter font)"). The concept board's own headers ("WINDARMS," section titles) use a bold, condensed, all-caps sans-serif with wide letter-spacing on labels (e.g. "THE WAR ABOVE THE STORM," "VISUAL IDENTITY") — visually in the same family as Inter's bold weights but this is a visual read of a flattened infographic image, not a confirmed typeface name or a font file in the codebase. **No V2 typeface has been formally specified.** Do not assume Inter carries forward to V2 without confirming — flag this as an open decision rather than picking a font unilaterally.

## 18. Logo Rules

**No formal logo system exists, and the two images in this repo actively disagree with each other.** `image-1.png` (the canonical concept board) uses a clean "WINDARMS" wordmark, all caps, no separator, in the bold condensed style described in §17. `image.png` (the flagged mismatched file) uses "WIND ARMS.IO" — a space-separated wordmark plus a ".io" suffix and a shield/star icon — a completely different lockup. Until this is resolved by the user, **treat the `image-1.png` "WINDARMS" wordmark as the only confirmed reference**, and do not build a formal logo system (clear-space rules, minimum sizes, color variants) from a single flattened infographic instance — ask for real logo source files before that work starts.

## 19. Animation Style

From [animations.md](animations.md) (real, shipped v1 systems) and the concept board's "Gameplay Feel" panel (Momentum-Based Movement, Wall Running, Air Dashes, Jump Pads, Wind Currents, Vertical Combat — an exact match to `pillars.ts`):

V1's animation architecture is a strong technical foundation to carry forward: a pure, unit-tested, state-driven pose animator (not physics ragdoll), mechanical-action animation for weapons (slides, charging handles, rotating cores) mirroring real firearm/machinery mechanics. V2's animation *content* should express momentum and verticality specifically — the concept board's operator action shot (mid-air, trailing a light-streak from a dash) is the clearest single reference for how movement should read: fast, committed, momentum-preserving, not floaty.

## 20. VFX Style

From [vfx.md](vfx.md) (real, shipped v1 systems) plus the concept board's environment art: visible lightning in the distant storm walls (scale/atmosphere, not gameplay-relevant), soft volumetric cloud lighting, and each weapon's Energy Core rendered as a contained, readable glow point rather than a full-object emissive wash.

V1's effects-bus pattern (pooled, zero-allocation, imperative — [vfx.md](vfx.md)) is architecturally sound to reuse for V2 combat VFX. V2 VFX *content* should lean into the wind/pressure/electromagnetic vocabulary from §9 rather than generic sci-fi muzzle flashes — every weapon in §10 has a stated "signature mechanic" (spin-up, charge & release, dash-strike) that implies a distinct VFX read per weapon, not a shared generic tracer.

## 21. Audio Mood

Confirmed by both [audio.md](audio.md) and the concept board's "Audio Identity" panel — five real categories: **Turbine Spin, Wind Resonance, Pressure Release, Electromagnetic Crack, Storm Ambience.** (Documented elsewhere with slightly different phrasing — "deep mechanical turbine spin," "compressed air bursts," "electromagnetic crack," "pressure release," "wind resonance," plus ambient "distant thunder," "moving air," "storm engines," "metal cables under tension" — the concept board's five-item summary is the canonical short list.)

Not generic gunshots. *"The environment constantly breathes."* V1's proven architecture (100% procedural Web Audio synthesis, per-weapon shot recipes, spatialization — [audio.md](audio.md)) is the recommended technical foundation for V2 audio content in this vocabulary.

## 22. Environmental Storytelling

The world should explain itself through what's built, not through text. Key visual cues, from [lore.md](lore.md) and [skyfront.md](skyfront.md):
- **Ancient + advanced, simultaneously.** Structures should read as centuries-old (weathering, monumental stone massing) while clearly still functioning (glowing energy cores, moving turbines) — the civilization didn't rebuild, it adapted in place.
- **Function is never hidden.** A Storm Reactor should look like it's *doing* something (per its description: *"control it to dominate the battle"*) — visible energy flow, not a black box with a glow sticker.
- **Absence tells the story too.** No ground, no horizon, no other civilizations visible — the endless storm below and the isolation of each floating structure is itself the backstory, communicated by what's *not* there.

## 23. Lore Through Visuals

The "Ancient Rome + Brutalist + floating cities + weather tech + weapon engineering" fusion (§3) is itself the lore delivery mechanism: a player should be able to infer "this civilization survived an apocalypse by building upward and mastering wind energy" from silhouette and material alone, without reading [lore.md](lore.md). If an asset requires a tooltip or loading-screen text to explain why it looks the way it does, it likely isn't expressing the fusion clearly enough — the concept board's own "Visual Identity" panel exists precisely because those seven words (Monumental, Elegant, Mechanical, Atmospheric, Vertical, Clean, Intelligent) are meant to be legible in the art itself.

## 24. Camera Language

**Limited source material**, assembled from real shipped code and one confirmed design intent:
- V1's landing camera: handheld drift + pointer parallax (`CameraRig.tsx`, [architecture.md](../technical/architecture.md)) — a subtle, cinematic-trailer feel, not locked-off.
- V1's gameplay camera: FOV kick on sprint/dash, eye-height lerp when sliding, camera roll ±12° during wall-run ([animations.md](animations.md), [PHASE-9-DESIGN.md](../technical/PHASE-9-DESIGN.md)) — momentum is felt through the camera, not just the character.
- The concept board's hero composition: always first-person, weapon prominent in lower-frame, monumental architecture filling the background at a scale that dwarfs the viewer — this is a compositional rule (§25) as much as a camera one.

No V2-specific camera design (third-person operator select, cinematic kill-cams, etc.) is confirmed anywhere — don't assume one exists.

## 25. Composition Rules

Derived directly from how the concept board composes its own hero shot and environment thumbnails:
- **Foreground:** a weapon or character, large, grounded at the bottom of frame.
- **Midground:** open sky/cloud layer — the "breathing room" that sells scale.
- **Background:** monumental architecture, always positioned to dwarf the foreground subject, never competing with it for silhouette clarity.
- **Never symmetric-static.** Even the most monumental structures are shot at a dynamic angle, reinforcing verticality over stability.

Apply this to marketing renders, loading screens, and promotional key art. It does not necessarily apply to in-game HUD-camera framing, which has its own constraints (§15, §24).

## 26. Scale Reference

From the concept board's Key Features: *"Massive Scale — Fight on structures larger than everything you've seen before."* From [art-direction.md](art-direction.md): *"No skyscrapers. No apartments. Everything should feel engineered for gods."*

Practical implication: human-scale reference objects (doors, railings, individual windows) should be rare and small relative to the structure — the goal is a player character reading as genuinely small against the architecture, closer to a figure in front of a real Roman aqueduct than a character in a human-scaled office building. This is the opposite instinct from most competitive-shooter arena design (which favors legible, human-scaled cover) — reconcile the two deliberately when actual playable geometry is designed, don't let one silently override the other without a decision.

## 27. Asset Consistency Rules

- Every color traces to a `STORM` token (§4) — no unlisted hex values.
- Every material traces to the six-item Material Library (§5) — no invented materials without a logged decision.
- Every powered/glowing surface traces to the wind-technology vocabulary (§9) — no unexplained magic glow.
- Every new art-bearing component gets an `artSlot` and a procedural fallback per the resolver pattern ([asset-pipeline.md](../technical/asset-pipeline.md)) — assets are optional upgrades, never hard requirements.
- File and component naming follows [naming-conventions.md](../technical/naming-conventions.md) — a V2 asset system that invents its own naming scheme creates exactly the kind of drift this bible exists to prevent.

## 28. Common Mistakes to Avoid

Collected from explicit "avoid" statements across the existing docs, plus one concrete real example:

- Rainbow neon ([art-direction.md](art-direction.md)).
- Oversized fantasy armor, glowing magical effects, exaggerated sci-fi clichés (operator design, §11).
- Generic sci-fi, cyberpunk clichés, military realism, random visual noise (master prompt, §2).
- Copying Call of Duty, Battlefield, Halo, Apex Legends, VALORANT, or any existing franchise (§3).
- Copying abilities/mechanics from Valorant, Apex, Overwatch, or Deadlock ([vision.md](../vision.md)).
- Unexplained magic — spellcasting, glowing hands, elemental effects, summoned creatures, unexplained teleportation (§9).
- **A concrete real example, not hypothetical:** `docs/images/image.png` (removed from the repo 2026-07-14, but worth remembering) was a fully-realized illustration of nearly every mistake on this list at once — gritty PBR military realism, generic tactical-shooter roadmap iconography, a mismatched logo lockup, dark/moody lighting instead of bright/clean/volumetric. It was the clearest "wrong direction" reference available while it existed — if a similar direction resurfaces, recognize the pattern.

## 29. Quality Bar (AAA Standards)

The standard, verbatim from the master prompt: every asset should reach *"blockbuster quality"* and pass the test *"Would a player recognize this as WindArms in less than one second?"* This bible interprets that as three concrete checks any new asset must pass before being considered done:

1. **Material check:** built from the six-item Material Library (§5), not invented materials.
2. **Color check:** every color traces to a `STORM` token (§4).
3. **Silhouette check:** recognizable and distinct at combat/readable distance without relying on color or texture — per [design-principles.md](../design-principles.md)'s "must be readable" rule for abilities, generalized here to all assets.

An asset that's individually beautiful but fails any of these three is not shippable as-is — flag it and reconcile, don't ship an exception silently.

## 30. Future Expansion Guidelines

- **Real assets can be added without code changes** via the `artSlot` + resolver pattern already built ([asset-pipeline.md](../technical/asset-pipeline.md)) — dropping a correctly-named file into `public/v2-art/` is the entire integration step for images; GLB models follow the same pattern.
- **A documented upgrade path already exists for character rigs**, from [PHASE-9-DESIGN.md](../technical/PHASE-9-DESIGN.md) §6 (written for v1, still valid guidance): if the procedural `HeroRig` primitives hit a quality ceiling, replace them with Blockbench-authored GLTFs (≤500 KB each, CC0/own-made only, same bone naming so the existing pose animator is reusable) — not a wholesale animation-system rewrite.
- **Figma reconciliation is scaffolded but not active.** `src/lib/v2/tokens.ts` and `sections/index.ts`'s `figmaNode` fields are explicitly future-proofed for a Figma file "when it lands" — when that happens, `tokens.ts` is the stated single reconciliation point; update it there, not by hand-matching hex values in components.
- **New operators, weapons, or POIs** should follow the exact content-module pattern already established (`lib/v2/content/*.ts`, one file per category) rather than inventing a new data shape — see [naming-conventions.md](../technical/naming-conventions.md).
- **Any expansion that would violate a rule in this bible** (a new material outside §5, a color outside §4, an enemy per §13, a vehicle per §12) needs a logged decision in [decisions.md](../decisions.md) before implementation — not a silent exception.

---

## What this bible does not yet define

Stated plainly rather than guessed at: **Vehicle Design Language (§12)** and **Enemy Design Language (§13)** have no source material at all. **Typography (§17)** and **Logo Rules (§18)** have only partial, visually-inferred source material and no confirmed formal specification — §18 in particular is blocked on the `image.png` vs `image-1.png` logo conflict. **Camera Language (§24)** for anything beyond existing v1 systems is unconfirmed. Do not backfill these with invented specifics; raise them with the user when they become load-bearing for actual implementation work, and log the resolution in [decisions.md](../decisions.md).
