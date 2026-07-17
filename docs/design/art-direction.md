# WindArms — Art Direction

> Source: originally written into `src/components/game/hud/CLAUDE.md`; moved here during the docs restructure (2026-07-12). Content preserved verbatim. This is V2 design material — none of it is implemented in the v1 build described in [v1.md](../versions/v1.md); v1's actual visual/audio implementation is documented in [../gameplay/mechanics.md](../gameplay/mechanics.md) and [../technical/architecture.md](../technical/architecture.md). UI-specific direction has its own file: [ui.md](ui.md).

## Visual Philosophy

Nature fused with impossible engineering.

Not neon.

Not rusty.

Not futuristic.

Instead...

Massive white stone.

Titanium.

Floating monoliths.

Ancient wind turbines.

Gigantic rotating rings.

Cloud oceans.

Lightning rivers.

Flying islands.

Energy flowing through carved architecture.

Imagine if:

Ancient Rome

Brutalist architecture

Floating cities

Weather technology

Modern weapon engineering

became one civilization.

Nobody is doing this.

## Color Palette

### Primary

Marble White
Ash Grey
Storm Blue

### Secondary

Electric Cyan
Deep Navy
Steel Silver

### Accent

Amber Energy
Crimson Warning Lights

Absolutely avoid rainbow neon.

## STORM Design Tokens (Implementation, Accurate)

> Added 2026-07-14. The abstract palette above is the original creative brief; this is what's actually implemented. `src/lib/v2/tokens.ts` — comment: *"STORM design tokens — the concept board's palette as TypeScript constants, mirrored 1:1 by the storm.* Tailwind colors. Three.js materials import from here so canvas and DOM can never drift. When the Figma file lands, this is the single reconciliation point."* This is the single source of truth for V2 color — code and design, not just design intent.

| Token | Hex | Role |
|---|---|---|
| `marble` | `#EDEAE3` | Primary — marble & steel |
| `mist` | `#C7CFD6` | Primary |
| `steel` | `#8E99A4` | Primary |
| `slate` | `#3E4A5A` | Primary |
| `abyss` | `#0A1522` | Secondary — storm blues |
| `deep` | `#12263C` | Secondary |
| `mid` | `#1E3A5C` | Secondary |
| `blue` | `#2E6FA3` | Secondary |
| `sky` | `#58B7E6` | Secondary |
| `energy` | `#4FC3FF` | Secondary — this is Kael Aurin's accent, see [../gameplay/operators.md](../gameplay/operators.md) |
| `gold` | `#E3A23C` | Accent — this is Veyra Solace's accent and the Tempest Cannon's accent |
| `goldDeep` | `#B8860B` | Accent |
| `crimson` | `#B02E2E` | Accent |
| `skyZenith` | `#16283E` | Sky gradient stop (backdrop dome) |
| `skyMid` | `#4E8DBE` | Sky gradient stop |
| `skyHorizon` | `#D9E7F2` | Sky gradient stop |

Rough mapping to the abstract palette above: `marble` ≈ Marble White, `abyss`/`deep` ≈ Deep Navy, `energy`/`sky` ≈ Electric Cyan, `gold`/`goldDeep` ≈ Amber Energy, `crimson` ≈ Crimson Warning Lights. Ash Grey, Storm Blue and Steel Silver don't have an exact 1:1 token yet (`mist`/`steel`/`slate`/`mid`/`blue` are the closest neighbors) — reconcile explicitly rather than guessing if a new token is needed.

## Lighting

Never night.

Never dark.

Never horror.

Bright.

Clean.

Volumetric.

Massive clouds.

Sunlight scattering through storm walls.

HDR skies.

Everything should feel enormous.

## Weapons

Not military guns.

Not fantasy staffs.

Not laser rifles.

Weapons are:

Wind-powered kinetic technology.

Every weapon has:

rotating turbines

pressure chambers

magnetic rails

floating energy coils

moving mechanical components

Every reload becomes satisfying mechanical choreography.

## Architecture

No skyscrapers.

No apartments.

Everything should feel engineered for gods.

Huge bridges.

Floating cathedrals.

Storm reactors.

Wind temples.

Airship docks.

Verticality everywhere.

## Gameplay Feeling

Players shouldn't feel like soldiers.

They should feel like elite aerial operators.

Movement philosophy:

Momentum.

Wall running.

Air dashes.

Jump pads.

Wind currents.

Vertical combat.

The sky itself becomes part of the map.

## Audio Identity

See [audio.md](audio.md) — moved into its own file during the docs expansion (2026-07-14), alongside the real v1 audio implementation facts.

## UI

See [ui.md](ui.md) — moved into its own file during the docs restructure (2026-07-12).

## Art Direction Keywords

Monumental
Elegant
Mechanical
Atmospheric
Vertical
Clean
Intelligent
Premium
Cinematic
Wind
Motion
Scale
Precision

## The Master Prompt

This is the kind of prompt I'd give Claude + Higgsfield—not to generate a single scene, but to define the entire creative direction:

You are the Creative Director, Lead Environment Artist, Senior Concept Designer, AAA Art Director, Gameplay Cinematographer, UI/UX Director, Sound Director, and Technical Art Lead for WindArms. Forget every existing FPS art style. Do not imitate Call of Duty, Battlefield, Halo, Apex Legends, VALORANT, or any existing franchise. Create an original visual identity that is instantly recognizable from a single screenshot. The world of WindArms is built above an endless planet-wide storm where humanity survives on colossal floating megastructures powered by ancient wind technology and advanced engineering. The artistic philosophy is "Nature + Monumental Architecture + Mechanical Elegance + Atmospheric Scale." Design every environment, weapon, prop, animation, particle, sound, UI element, lighting setup, material, color palette, architectural rule, and gameplay space as part of one cohesive universe. Prioritize verticality, momentum, massive cloud oceans, floating structures, rotating turbines, wind reactors, suspended bridges, colossal rings, pressure-driven weapon technology, clean marble and titanium materials, electric cyan energy, volumetric clouds, cinematic daylight, and world-class environmental storytelling. Every asset must belong to the same civilization and reinforce the fantasy of fighting above an infinite storm. Eliminate generic sci-fi, cyberpunk clichés, military realism, and random visual noise. Build a timeless AAA visual language with unforgettable landmarks, emotionally powerful vistas, satisfying mechanical motion, premium animation, realistic physics, elegant minimal UI, distinctive audio, and cohesive world-building. Every design decision must answer one question: "Would a player recognize this as WindArms in less than one second?" Iterate internally until every element reaches blockbuster quality, then present only the strongest, most original creative direction and implement it consistently across the entire project.

## Art Direction (Operators)

The operators must visually belong to the same civilization.

Design language:

* White marble
* Titanium
* Brushed steel
* Electric cyan energy
* Mechanical turbines
* Rotating pressure mechanisms
* Wind reactors
* Clean engineering
* Elegant silhouettes
* Functional armor
* Premium AAA realism

Avoid oversized fantasy armor, glowing magical effects, and exaggerated sci-fi clichés.

See [../gameplay/operators.md](../gameplay/operators.md) for the full four-operator design brief this section was originally part of.
