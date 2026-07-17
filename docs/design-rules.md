# WindArms — Design Rules

An index, not a fourth independent ruleset. "Design Rules" as a category is already covered by four existing docs — this file exists so the category has a findable home, and to say explicitly how they relate rather than letting a fifth, competing rules document accumulate drift.

| Doc | Governs |
|---|---|
| [vision.md](vision.md) | The mission and the pillars nothing may be sacrificed for — checked first, before any spec. |
| [design-principles.md](design-principles.md) | The per-ability/per-mechanic checklist — what makes a specific piece of gameplay design valid. |
| [technical/naming-conventions.md](technical/naming-conventions.md) | What things are called — files, components, data. |
| [technical/coding-standards.md](technical/coding-standards.md) | How code is written — the four project-wide rules (don't remove features unassisted, preserve responsive design, prefer reusable components, keep TypeScript strict). |

## How they compose

A new ability, weapon, or mechanic must clear all four, roughly in this order:

1. Does it violate a pillar in [vision.md](vision.md)? (e.g. does it copy a mechanic from a named competitor, or work against "competitive first")
2. Does it pass the [design-principles.md](design-principles.md) checklist? (counterplay, readability, skill reward, fairness, 60–120 FPS, competitive viability, doesn't replace gun skill)
3. Is it named consistently with [technical/naming-conventions.md](technical/naming-conventions.md)?
4. Is it implemented consistently with [technical/coding-standards.md](technical/coding-standards.md)?

This ordering matches the root [`CLAUDE.md`](../CLAUDE.md) Documentation Loading Order — vision/design-principles rank above the active spec (they're a filter on what's a valid proposal), while naming/coding standards are implementation-detail tiers below it.

## Adding a new rule

Put it in the doc that already owns its category above. Resist creating a new top-level rules file for a single new rule — extend an existing one, or if it genuinely doesn't fit any of the four, raise that as a decision (log it in [decisions.md](decisions.md)) rather than silently starting a fifth document.
