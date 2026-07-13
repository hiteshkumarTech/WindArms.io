# WindArms — Changelog

A dated, fine-grained log of actual changes — documentation and code. Newest entry at the top. This is *not* the same as [history.md](history.md) (curated narrative of major game milestones) or [decisions.md](decisions.md) (why a choice was made) — this is just "what changed, when." When you make a structural change (per [ai-rules.md](ai-rules.md)'s sync rule), add an entry here.

---

## 2026-07-12

- Renamed `docs/agent-rules.md` back to `docs/ai-rules.md` (see [decisions.md](decisions.md) for why); added `docs/vision.md` (mission + core pillars) and `docs/design-principles.md` (per-ability design checklist).
- Added a "Documentation Loading Order" section to root `CLAUDE.md` establishing conflict priority across the doc set.
- Restructured `docs/` from a flat file list into subfolders: `gameplay/` (`mechanics.md`, `weapons.md`, `abilities.md`, `operators.md`), `technical/` (`architecture.md`, `networking.md`, `performance.md`, `deployment.md`, `coding-standards.md`, `tech-stack.md`, `folder-structure.md`, `PHASE-9-DESIGN.md`), `design/` (`art-direction.md`, `ui.md`, `lore.md`), `versions/` (`v1.md`, `v2.md`).
- Split `docs/abilities.md` into `gameplay/abilities.md` (ability-design framework) and `gameplay/operators.md` (the four Founding Operators).
- Split `docs/gameplay.md` into `gameplay/mechanics.md` and `gameplay/weapons.md`.
- Added `docs/project-overview.md`, `docs/decisions.md`, `docs/todo.md`, `docs/known-bugs.md`, `docs/history.md`.
- Declared v2 the current development target and v1 the current stable (not archived) build; propagated that framing across `CLAUDE.md`, `versions/v1.md`, `versions/v2.md`, `roadmap.md`.
- Created the initial documentation restructure: moved the world lore, art direction, and Founding Operators design brief out of `src/components/game/hud/CLAUDE.md` (where they'd been pasted directly into a component folder) into a new root `CLAUDE.md` and a topic-organized `docs/` tree; replaced `hud/CLAUDE.md` with a short pointer note; moved `docs/images/` reference art out of the HUD folder.
