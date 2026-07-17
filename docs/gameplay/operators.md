# WindArms — Operators

> **Canon source: `src/lib/v2/content/operators.ts`** (the code powering the live V2 preview site, `OperatorsSection` at `/#operators`) — not the original text brief. See [decisions.md](../decisions.md) for why: on 2026-07-14, discovery of the already-built V2 preview landing page showed its operator roster had diverged from the original "Founding Operators" brief that used to be the entire content of this file. Code was declared canon. The original brief is preserved below as historical/reference material, not current design.

## Current roster (code-confirmed)

Heading copy (`OPERATORS_HEADING`): *"ELITE OPERATORS — CHOOSE YOUR WARDEN — Original operators forged for the skyfront — each with a silhouette you can read across a battlefield."*

Two operators are defined today. This is confirmed as a work-in-progress roster, not a final count — the original brief's ambition was four "founding" operators, and nothing in the code caps it at two.

### Kael Aurin — "Temple Warden"

- **Bio:** Guardian of the Wind Temple's inner sanctum. Fights patient and vertical — the high ground was never optional.
- **Signature weapon:** Aeolus Rifle (see [weapons.md](weapons.md#v2-arsenal-windweaponsts))
- **Accent color:** `#4FC3FF`
- **Art slot:** `operator-1` (see [../technical/asset-pipeline.md](../technical/asset-pipeline.md) for how art slots resolve)
- **Monogram fallback:** K

### Veyra Solace — "Tempest Vanguard"

- **Bio:** First through every breach, riding wind currents the way others ride gravity. Momentum is her doctrine.
- **Signature weapon:** Vortex Carbine (see [weapons.md](weapons.md#v2-arsenal-windweaponsts))
- **Accent color:** `#E3A23C`
- **Art slot:** `operator-2`
- **Monogram fallback:** V

### What's defined vs. not

Defined in code today: name, codename/role, bio, signature weapon, accent color, art slot. **Not yet defined anywhere in code:** passive ability, signature ability, ultimate, cooldowns, counterplay, team synergy, strengths/weaknesses, skill ceiling, sound design, VFX direction, animation concepts, HUD indicators, voice lines, competitive balance. That's the open design work — use the checklist in [abilities.md](abilities.md) (the "DESIGN REQUIREMENTS" section) to fill it in for each operator, and check every proposal against [../design-principles.md](../design-principles.md) before it's considered final.

A loose, unconfirmed observation, not settled design: Veyra Solace's bio ("riding wind currents... momentum is her doctrine") reads close to the original brief's "Operator 01 — Momentum Engineer" archetype below, and Kael Aurin's "guardian... high ground... patient" framing has some overlap with "Operator 02 — Pressure Architect." If true, that would mean the original four-archetype brief isn't fully discarded, just narrowed and renamed — but this is a pattern match, not a stated fact anywhere in the code. Confirm with the user before building on it, and log the outcome in [decisions.md](../decisions.md) either way.

## World context

Kael and Veyra are "forged for the skyfront" — see [skyfront.md](../design/skyfront.md) for the actual named V2 world locations (Wind Temple, Storm Reactor, Sky Bridges, Airship Docks) their bios reference, and [../design/lore.md](../design/lore.md) for the broader world rules and narrative.

---

## Historical: the original "Founding Operators" brief (superseded)

> Everything below this line is the original four-archetype design brief, written into `src/components/game/hud/CLAUDE.md` before the coded V2 preview existed. It does not match the current roster above. Kept as reference material — it may still be useful raw material for fleshing out Kael, Veyra, or future operators, but it is not confirmed canon. Do not treat "Operator 01–04" as real operator names or specs going forward.

You are the Creative Director, Lead Gameplay Designer, Systems Designer, Combat Designer, and Lore Director for **WindArms**.

Your task is to create the **first four playable operators** that will become the foundation of the WindArms universe.

### Operator 01 — Momentum Engineer

Theme:
Master of kinetic energy.

Core Passive:
Stores movement energy while sprinting, sliding, wall-running, air-dashing, falling, and grappling.

Signature Ability:
Release stored momentum into a powerful directional burst that can be used offensively or for advanced movement.

Ultimate:
Overcharge the kinetic reservoir, enabling extreme mobility for a short duration while preserving weapon accuracy.

Role:
High-skill mobility duelist.

---

### Operator 02 — Pressure Architect

Theme:
Shapes the battlefield by compressing air.

Core Passive:
Air structures form faster after consecutive successful placements.

Signature Ability:
Instantly create temporary solid-air structures such as walls, ramps, bridges, or elevated platforms.

Ultimate:
Generate a large atmospheric fortress zone with multiple pressure constructs that constantly evolve for several seconds.

Role:
Strategic controller.

---

### Operator 03 — Storm Synchronizer

Theme:
Uses the rhythm of the planet-wide storm.

Core Passive:
Actions performed in sync with storm pulses gain small efficiency bonuses.

Signature Ability:
Emit a localized storm pulse that briefly enhances nearby allies' movement and disrupts enemy stability.

Ultimate:
Call down a controlled atmospheric resonance field that changes combat flow by amplifying wind currents and altering traversal opportunities.

Role:
Support / battlefield coordinator.

---

### Operator 04 — Refraction Specialist

Theme:
Controls airflow to bend light.

Core Passive:
Movement leaves behind subtle atmospheric distortions that are difficult to track.

Signature Ability:
Create a localized refraction field that visually distorts the environment without making the operator invisible.

Ultimate:
Generate a large atmospheric mirage zone where perception is altered through realistic light refraction, forcing enemies to rely on awareness rather than visual certainty.

Role:
Recon / deception specialist.

---

### Art Direction (from the original brief)

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

See [../design/art-direction.md](../design/art-direction.md) for the full civilization-wide art direction this section belongs to.

---

![alt text](../images/image-1.png)
