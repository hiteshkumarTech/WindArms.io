# AI Rules

Behavioral rules for AI coding assistants working in this repo — Claude Code, Claw, Codex, Gemini, Cursor, Cline, Roo, or any other tool. Named "AI Rules" rather than "Agent Rules" deliberately: in a game codebase, "agent" is already overloaded (game AI/NPC agents, network agents, autonomous player bots), so it's ambiguous where "Agent Rules" points. "AI Rules" is unambiguous and every coding assistant recognizes it immediately — still tool-agnostic, just not tool-name-specific. This file is about *how an assistant should act* in this codebase — for code style and conventions that apply to any contributor (human or AI), see [technical/coding-standards.md](technical/coding-standards.md).

- Never remove features without permission.
- Never rename folders unless requested.
- Always preserve backward compatibility.
- Never delete documentation.
- Always update docs after changing gameplay.
- Prefer composition over inheritance.
- Maintain TypeScript strict mode.
- Never use `any` unless absolutely necessary.
- Never create placeholder implementations.
- Every new feature must include:
  - documentation
  - types
  - comments where needed
  - error handling
- Never modify game balance without approval.

## Keep documentation in sync

Whenever you make structural code changes:

1. Update documentation.
2. Update [roadmap.md](roadmap.md) if a milestone changes.
3. Update [technical/architecture.md](technical/architecture.md) if a system changes.
4. Update [technical/folder-structure.md](technical/folder-structure.md) if folders change.
5. Never leave docs outdated.

Log the change itself in [decisions.md](decisions.md) if it was a real design decision (not just an implementation detail), and in [history.md](history.md) once it ships as a milestone.

## Scope

These rules apply to both v1 maintenance work and v2 development. See [CLAUDE.md](../CLAUDE.md) for which build a given request should target.
