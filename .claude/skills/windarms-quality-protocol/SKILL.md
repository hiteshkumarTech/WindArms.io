---
name: windarms-quality-protocol
description: "WindArms V2 quality-milestone orchestration protocol — audit, focused single-owner implementation, automated tests, real-browser validation, adversarial critic review, human gate, isolated commit. Use ONLY when the user explicitly asks to run a milestone under this protocol (e.g. \"run the quality protocol on X\", \"use the orchestration protocol\"). Never self-trigger from generic \"improve quality\" or \"make this better\" requests — the user gates entry to this deliberately."
---
# WindArms V2 — Quality Orchestration Protocol

Saved 2026-07-29 at the user's explicit request, as a reusable prompt for
future milestones — NOT to be run automatically, and not run at the time it
was saved. Only invoke this protocol when the user explicitly asks for it by
name or clearly asks to run a bounded milestone "under the protocol."

The user's own framing for why this exists (kept verbatim, it's the point):

> Our current workflow is already better: Audit → focused implementation →
> automated tests → real-browser validation → screenshots/listening → your
> approval → isolated commit. That is exactly why Steps 7A–7F stayed stable.
>
> So yes — we should steal the discipline, architecture contract, critics
> and measurement tools. We should not steal the uncontrolled "everyone edit
> everything until perfect" strategy.

Concretely: sub-agents are fine for independent, read-only, parallel
analysis (audit, perf profiling, test planning, visual/audio critique, doc
inspection). Implementation of the chosen milestone gets exactly ONE owner.
Reviewers critique; they do not also edit the same files the owner is
editing. This is the opposite of "spawn N agents and let them all touch the
codebase until it converges" — that pattern is explicitly rejected.

**Also note** (the user's own caveat, keep it attached to this skill): `/loop`
and "ultracode" are not universally-supported magic words — they only do
anything in a harness/config that specifically defines them. Don't assume
this protocol can lean on either just because some other repo's prompt
mentions them; this skill's own agent/review structure below is what
actually carries the discipline, not a keyword.

---

## Objective

Raise WindArms one measurable milestone at a time toward premium browser-FPS
quality while preserving gameplay correctness, performance, and the existing
art direction (Skyfront: wind-powered military technology, floating
architecture, white/titanium/gold materials, storm-energy combat — never
another game's visual identity).

This is an established project, not a blank slate. Do not rebuild it. Do not
replace working systems.

"AAA quality" is an aspiration, not a claim — never report a result as AAA
without objective evidence and human approval.

## Agent strategy

Sub-agents may run in parallel for independent, READ-ONLY work:

- read-only code audit
- performance analysis
- test-plan creation
- visual criticism
- documentation inspection

Implementation of the selected milestone has exactly ONE primary owner.
Every other agent acts as a reviewer/critic and must NOT modify files unless
explicitly assigned a non-overlapping ownership slice. Never let multiple
agents edit tightly coupled systems concurrently.

## Required agents, per milestone

1. Architecture auditor
2. Primary implementation owner
3. Regression/test reviewer
4. Performance reviewer
5. Adversarial visual or audio critic — must evaluate the actual browser
   result (real screenshots/audio captures), never descriptions or test
   output alone.

## Milestone rule

Work on exactly ONE bounded milestone at a time. Before implementation,
report:

- current behaviour
- exact weakness
- files involved
- systems that must remain unchanged
- measurable acceptance gates
- expected performance budget
- rollback plan

Do not begin unrelated improvements alongside it.

## Quality gates

Every milestone must verify:

- typecheck
- automated tests
- lint
- production build
- real Chromium validation
- console and network errors
- route remount behaviour
- resource cleanup
- no gameplay regression
- working-tree diff review

Visual milestones additionally capture deterministic screenshots.

Performance milestones additionally report:

- frame-time p50 / p95 / p99
- worst frame
- draw calls
- triangles
- active WebGL programs
- memory/resource leaks
- shader-compilation hitches

Never approve a change that materially damages performance without explicit
human permission.

## Critic loop

The critic may reject a result, but only with specific evidence:

- exact visible or measurable defect
- severity
- likely root cause
- smallest proposed correction
- screenshot or metric supporting it

Maximum THREE implementation-review cycles per milestone. After three failed
cycles, stop and report the blocker rather than making uncontrolled changes.

## Human gate

Claude may confirm technical stability (typecheck/tests/lint/build/no
console errors/no regression). Only the human owner approves:

- final visual quality
- animation feel
- sound identity
- weapon feel
- artistic direction

Never commit automatically.

## Protection rules

- Do not modify V1 `/play`.
- Do not replace approved assets.
- Do not change gameplay balance during art/audio passes.
- Do not change art/audio during gameplay bug fixes.
- Do not mix multiple milestones into one commit.
- Do not add dependencies without demonstrating necessity.
- Do not create unbounded per-frame allocations.
- Dispose resources created during route lifecycle.
- Preserve deterministic validation wherever possible.

## Final report format

1. Milestone scope
2. Agents used
3. Audit findings
4. Architecture chosen
5. Files created
6. Files modified
7. Tests
8. Browser validation
9. Performance before/after
10. Critic findings
11. Remaining limitations
12. Human-review steps
13. Exact `git status`

Stop before committing.
