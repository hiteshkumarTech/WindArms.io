# WindArms — Known Issues

Bugs that are known and intentionally not being fixed right now (postponed, low-priority, or awaiting more info) — so an agent doesn't "fix" something that was deliberately left alone. This is **not** a general bug tracker; day-to-day bugs get fixed as found.

## Currently tracked

### Shadow review camera presets: "front"/"rear" naming doesn't match which side of the character they show

**Where:** `src/lib/v2/operators/shadowReviewCameraPresets.ts` (dev-only, `/v2/range?shadow=1&shadowReview=1`)
**Symptom:** the `threeQuarterFront`/`bodyCloseThreeQuarter` presets (and by extension `handsCloseRight`, positive `yawOffsetDeg` generally) show the character's BACK, not front; `threeQuarterRear` shows the FRONT. Found while building Step 8E-C.3.1's close camera presets and cross-checking against the character's actual facing (hands/face direction) in captured screenshots — the naming has been backwards since these presets were introduced in Step 8E-C.3, just never visually audited against the character's own facing until this pass's close-up work made it obvious.
**Why postponed:** out of Step 8E-C.3.1's explicit scope (that pass's brief was review-harness isolation and calibration, not further camera-convention changes) and low-risk — it's a dev-only diagnostic label, not gameplay-facing. Root cause is presumably a yaw-convention mismatch between how these presets compute their offset and the character rig's own rest-pose facing, not yet root-caused.
**Do not:** rename the preset labels or flip the yaw math as a quick fix without first root-causing WHY the mismatch exists — it may share a cause with other yaw/forward-convention bugs this milestone has already found and fixed elsewhere (the weapon-position and weapon-orientation history in this same file family). Treat it as one symptom of a pattern, not an isolated typo.

The closest thing to another known limitation is a flagged-off feature, not a bug: lag compensation (`LAG_COMP`) is implemented but disabled by default pending a soak test — see [decisions.md](decisions.md) and [technical/networking.md](technical/networking.md). Don't "fix" this by flipping the flag on without a soak test.

## Adding an entry

```
### <short title>

**Where:** file/component
**Symptom:** what a player/dev observes
**Why postponed:** the actual reason (low priority, needs more repro info, root cause unclear, intentional tradeoff, etc.)
**Do not:** what an agent should avoid doing about it (e.g. "don't silently swallow the error", "don't revert the related feature")
```
