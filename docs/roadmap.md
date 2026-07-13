# WindArms — Roadmap

> Forward-looking items only. v2 ([versions/v2.md](versions/v2.md)) is the current development target — start there. v1 ([versions/v1.md](versions/v1.md)) is the current stable build; its backlog below is kept for reference, not active planning.

## v1 backlog (stable build, reference only)

Verbatim from the v1 README backlog:

Friends, parties and achievements (need presence infrastructure); ranked matchmaking, ELO and seasons; Google OAuth; enabling `LAG_COMP` by default (currently flagged off pending a soak test); crosshair customization settings; Industrial Factory / Desert Base map entries; controller support and localization; spectator mode.

## Still open from the Phase 9 design

Crosshair customization settings (the crosshair already reacts dynamically to fire/movement/hits, it just isn't user-configurable yet) — tracked in [technical/PHASE-9-DESIGN.md](technical/PHASE-9-DESIGN.md) as F9, still unimplemented.

Full original Phase 9 design doc — implementation order, folder changes, database/API/WebSocket changes, performance budget, and a ranked list of potential bugs — lives at [technical/PHASE-9-DESIGN.md](technical/PHASE-9-DESIGN.md).

## v2 — planned ground-up rebuild

Scope (see [versions/v2.md](versions/v2.md) for the full breakdown):

- Hero abilities — see [gameplay/abilities.md](gameplay/abilities.md) for the framework and [gameplay/operators.md](gameplay/operators.md) for the four Founding Operators design brief
- Matchmaking (rework, scope not yet detailed beyond v1's fill-based system)
- New UI

World and visual direction for v2 is specified in [design/lore.md](design/lore.md), [design/art-direction.md](design/art-direction.md) and [design/ui.md](design/ui.md).

v2 has not started implementation — v1 remains the reference build until it does.
