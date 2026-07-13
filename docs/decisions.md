# WindArms — Decisions

Every major decision goes here, in the order they were made. Future agents should check this before reintroducing a discarded idea. Entries below are drawn from real project history (git/docs) — nothing is hypothetical. See [ai-rules.md](ai-rules.md) for when to add an entry.

---

**2026-07-12 (approx., inferred from README wording) — v1 frozen, v2 declared a ground-up rebuild**

Decision: v2 is a ground-up visual/architecture rebuild, not incremental changes layered onto v1.

Reason: the visual/architecture ambitions for v2 (see [design/art-direction.md](design/art-direction.md), [design/lore.md](design/lore.md)) are a large enough departure that incremental changes on v1's existing rendering/art approach weren't considered viable.

Rejected: incrementally evolving v1's Cyber-City/neon visual identity toward the v2 art direction.

Chosen: v1 stays frozen and playable at windarms.com; v2 starts as a separate effort.

---

**(v1, Phase 9 era) — Lag compensation shipped behind a flag, not enabled by default**

Decision: lag compensation (`LAG_COMP`) is implemented and unit-tested but ships off by default.

Reason: needs real-player soak testing before trusting it in production — the risk (documented in [technical/PHASE-9-DESIGN.md](technical/PHASE-9-DESIGN.md) §9) is "I was behind the wall!" complaints from peeker's-advantage growing with rewind distance.

Rejected: enabling it immediately alongside the rest of Phase 9.

Chosen: ship dark, flip on per-room for A/B testing later (tracked in [roadmap.md](roadmap.md)).

---

**(v1, Phase 7 era) — Accounts are optional, not required**

Decision: the server boots in guest-only mode without `DATABASE_URL` rather than requiring a database.

Reason: keeps the game playable with zero setup; a database hiccup should never be able to take a room down.

Rejected: requiring accounts/database as a hard dependency for any gameplay.

Chosen: guest mode by default, accounts as an opt-in enhancement (see [technical/deployment.md](technical/deployment.md)).

---

**(v1, Phase 7 era) — Friends, parties, and achievements deferred rather than shipped half-done**

Decision: explicitly deferred to the backlog instead of building a partial version.

Reason: these need presence infrastructure that deserves its own phase, rather than being bolted onto the progression system.

Rejected: a minimal/partial friends-list or achievement system alongside Phase 7.

Chosen: full deferral, tracked in [roadmap.md](roadmap.md).

---

**2026-07-12 — Documentation restructured from a single component-level file into `CLAUDE.md` + `docs/`**

Decision: moved the world lore / art direction / operator design brief out of `src/components/game/hud/CLAUDE.md` (where it had been pasted directly into a component folder) into a root `CLAUDE.md` plus a topic-organized `docs/` tree (`gameplay/`, `technical/`, `design/`, `versions/`), and added `ai-rules.md`, `project-overview.md`, `decisions.md`, `todo.md`, `known-bugs.md`, `history.md`.

Reason: the content wasn't HUD-specific, was undiscoverable buried in a component folder, and the project is intended to scale to 30–40 docs over the next few years — a flat single file doesn't scale.

Rejected: keeping everything in one large `CLAUDE.md`, or a flat `docs/*.md` list without subfolders.

Chosen: layered structure (`CLAUDE.md` → agent rules → project docs → code), matching how large software projects organize documentation.

---

**2026-07-12 — v2 declared the current development target; v1 kept as the live, stable build**

Decision: default every new request to v2 unless explicitly scoped to v1; v1 stays live at windarms.com and is not deprecated, just not where new work happens.

Reason: avoids two failure modes — accidentally building v2-scoped work against the old v1 architecture, and treating the still-live, revenue/traffic-bearing v1 build as dead code to be ignored or broken.

Rejected: calling v1 "archived" (implies it's no longer maintained or live, which isn't true).

Chosen: "current stable build" (v1) vs. "current development target" (v2) as the framing, stated in the root [CLAUDE.md](../CLAUDE.md).

---

**2026-07-12 — `agent-rules.md` renamed to `ai-rules.md`**

Decision: the AI-behavior-rules file is named `ai-rules.md`, not `agent-rules.md`.

Reason: "agent" is already an overloaded term in a game codebase — it can mean game AI/NPC agents, network agents, or autonomous player bots, in addition to a coding assistant. "AI Rules" is unambiguous and every coding assistant recognizes it immediately, while staying just as tool-agnostic as "Agent Rules" was intended to be.

Rejected: `agent-rules.md` (the initial choice, made specifically to sound generic/tool-agnostic — see the docs-restructure entry above) and `assistant-rules.md` (also considered, `ai-rules.md` was shorter and equally clear).

Chosen: `ai-rules.md`. If a genuine in-game "agent" concept (NPC AI, bots) is added later, keep it clearly out of this filename's namespace to avoid the same ambiguity recurring.
