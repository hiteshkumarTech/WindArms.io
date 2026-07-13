# WindArms — TODO

Project-level TODOs, not code TODOs (there are no `// TODO` comments in the codebase as of 2026-07-12 — see [known-bugs.md](known-bugs.md)). Every item below is pulled from the existing v1 backlog ([roadmap.md](roadmap.md)) and the v2 scope ([versions/v2.md](versions/v2.md)) — priority tiers are an organizing judgment call, not sourced from prior prioritization, so re-rank freely as real constraints (deadlines, user feedback) emerge.

## Priority

### HIGH

- Hero ability system (the four Founding Operators — [gameplay/abilities.md](gameplay/abilities.md), [gameplay/operators.md](gameplay/operators.md)) — this is the headline v2 feature.
- v2 new UI ([design/ui.md](design/ui.md), [design/art-direction.md](design/art-direction.md))
- v2 matchmaking rework (scope not yet detailed beyond v1's fill-based system — needs a design pass)

### MEDIUM

- Ranked matchmaking, ELO, and seasons (v1 backlog)
- Enabling `LAG_COMP` by default in v1 — currently flagged off pending a soak test ([technical/networking.md](technical/networking.md))
- Crosshair customization settings (v1 backlog; the crosshair already reacts dynamically, just isn't user-configurable — tracked as F9 in [technical/PHASE-9-DESIGN.md](technical/PHASE-9-DESIGN.md))
- Google OAuth (v1 backlog)

### LOW

- Friends, parties, and achievements (v1 backlog — needs presence infrastructure, deliberately deferred, see [decisions.md](decisions.md))
- Industrial Factory / Desert Base map entries (v1 backlog)
- Controller support and localization (v1 backlog)
- Spectator mode (v1 backlog)

## Adding items

New items go under the tier that reflects actual urgency, with a link to whichever doc has the detail (or "no design doc yet" if it's a raw idea). Move an item to [history.md](history.md) once it ships.
