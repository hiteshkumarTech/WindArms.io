# WindArms — Known Issues

Bugs that are known and intentionally not being fixed right now (postponed, low-priority, or awaiting more info) — so an agent doesn't "fix" something that was deliberately left alone. This is **not** a general bug tracker; day-to-day bugs get fixed as found.

## Currently tracked

None currently tracked. The one prior entry (shadow review camera preset "front"/"rear" naming, found in Step 8E-C.3.1) was root-caused and fixed in Step 8E-C.3.2 — see [changelog.md](changelog.md) and [decisions.md](decisions.md) for the full trace.

The closest thing to a known limitation is a flagged-off feature, not a bug: lag compensation (`LAG_COMP`) is implemented but disabled by default pending a soak test — see [decisions.md](decisions.md) and [technical/networking.md](technical/networking.md). Don't "fix" this by flipping the flag on without a soak test.

## Adding an entry

```
### <short title>

**Where:** file/component
**Symptom:** what a player/dev observes
**Why postponed:** the actual reason (low priority, needs more repro info, root cause unclear, intentional tradeoff, etc.)
**Do not:** what an agent should avoid doing about it (e.g. "don't silently swallow the error", "don't revert the related feature")
```
