# WindArms — Design Principles

The DNA of the game. Every ability, weapon, and mechanic proposed for WindArms must pass this checklist before it's built — this is what stops an AI (or a human) from inventing a broken mechanic later. See [vision.md](vision.md) for the higher-level pillars this checklist enforces, and [gameplay/abilities.md](gameplay/abilities.md) for how it applies specifically to operator ability design.

## Every ability must

- ✔ have counterplay
- ✔ be readable
- ✔ reward skill
- ✔ punish mistakes
- ✔ never feel unfair
- ✔ work at 60–120 FPS
- ✔ support competitive play
- ✔ not replace gun skill

## Using this checklist

When proposing a new ability, weapon, or mechanic, check it against every line above explicitly — don't skip items that seem obviously fine. If something fails a check, that's not automatically a rejection: note the tradeoff and flag it for a human decision (log the resolution in [decisions.md](decisions.md)) rather than silently shipping a violation or silently blocking the idea.

This file is a first pass, seeded from the project's stated design intent — extend it as concrete abilities get built and edge cases show up that the checklist didn't anticipate.
