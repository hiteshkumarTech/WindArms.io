# Skyfront Trial — `/v2/play` (Milestone 6)

The first genuinely playable WindArms V2 loop: **start → move → fight → die/respawn → win/lose → replay**, single-player, offline, using the real Vortex Rifle. "Skyfront Trial" is a **temporary internal match name**, not settled canon (see [decisions.md](decisions.md)).

> Status: **procedural gameplay blockout.** The arena is procedural primitives, the drone is a temporary training target, none of it is final art. What's real: the match loop, the weapon, the LOD-correct asset, the state machine.

## The loop

A pre-countdown **difficulty selection** (Low / Medium / Max, default Medium) → countdown (3s over the SKYFRONT TRIAL title) → destroy every hostile wind drone before the match timer → **Victory** (all drones down) or **Defeat** (time out). Unlimited respawns (~3s) on death or a fall; the match clock keeps running through a respawn. Replay/Restart keep the selected difficulty; a fresh route entry always defaults back to Medium.

### Difficulty presets (Milestone 6 polish pass)

One source of truth: `src/lib/v2/play/difficulty.ts` (`TrialDifficulty`, `TrialDifficultyConfig`, `TRIAL_DIFFICULTIES`, `resolveDroneConfig`, `resolveDroneSpawns`). Effective value = base `DRONE`/`TRIAL` constant × the selected preset's multiplier — nothing here restates a base stat.

| | Low | **Medium (unchanged)** | Max |
|---|---|---|---|
| Drones | 5 (`deck-a/b/c`, `left-lo`, `right-lo`) | 8 (all hand-placed spawns) | 8 (all hand-placed spawns — no new spawn points added) |
| Match time | 3:30 | **3:00** | 2:45 |
| Drone HP / bolt damage | ×0.75 / ×0.7 | **×1 / ×1** | ×1.35 / ×1.25 |
| Fire cooldown | ×1.35 (slower) | **×1** | ×0.75 (faster) |
| Aim spread | ÷0.75 (wider, more forgiving) | **÷1** | ÷1.3 (tighter) |
| Bolt speed / drone move speed | ×0.85 | **×1** | ×1.2 |

Medium is byte-identical to the original single-difficulty build: every multiplier is 1, `droneCount` is `TRIAL.DRONES_TOTAL` (8), `matchTimeS` is `TRIAL.MATCH_TIME_S` (180) — nothing about the original tuning changed. **Player health, movement and the Vortex Rifle's own stats (damage output, recoil, fire rate, magazine) are never touched by difficulty.** What *does* change with difficulty is the damage the player **takes** — `droneDamageMultiplier` scales each drone bolt's damage, so Max's drones hit harder per hit even though the player's max HP and the rifle's damage output are identical across all three presets. The pre-shot windup telegraph is also never scaled, so every drone attack stays equally readable and dodgeable regardless of preset.

Selection lives on the match store (`selectedDifficulty`, `selectDifficulty()`) and is locked once countdown begins; `beginCountdown()`/`restart()` both bump `restartNonce` right as combat starts so drones re-seed with the locked-in preset's stats even if the player switched difficulty during the pre-deploy screen. The HUD, drone AI and end screen all resolve the same `TRIAL_DIFFICULTIES`/`resolveDroneConfig` lookup — never a local copy.

## Architecture

Modular, each layer independently replaceable, all riding existing V2 systems:

```
src/lib/v2/play/            match logic (no React, no THREE)
  types.ts                  MatchPhase, DroneAiState, spawn/box types
  constants.ts              TRIAL (base counts, timers, HP), WIND_LIFT
  difficulty.ts             TrialDifficulty presets + resolveDroneConfig/resolveDroneSpawns — single source of truth for anything difficulty-dependent
  matchStateMachine.ts      legal transitions + phase predicates (pure)
  matchStore.ts             authoritative match state (zustand), incl. selectedDifficulty + difficulty selectors
  spawnConfig.ts            arena boxes + drone spawns + LOS/box helpers (single source)
  enemyConfig.ts            DRONE base tuning (pre-multiplier)
src/lib/v2/weapons/
  vortexViewmodelPose.ts    typed hip/ADS FP pose config, shared by /v2/range + /v2/play
  vortexRuntimeAnchors.ts   TEMPORARY hand-measured muzzle anchor (no authored GLB socket yet)
src/lib/v2/range/muzzleWorldPose.ts  per-frame world-space muzzle position/direction bridge (viewmodel → fire system)
src/components/three/play/  scene (R3F)
  V2PlayScene.tsx           canvas: sky, lights, physics, all actors
  MatchDirector.tsx         the one match clock + combat gate
  PlayerController.tsx      match-aware FP controller (range movement core reused)
  SkyfrontTrialArena.tsx    procedural arena (visuals + colliders from spawnConfig)
  WindLift.tsx              cyan updraft visuals (force is in the controller)
  DroneSquad.tsx            drives the difficulty-sized drone squad + bolt pool in one frame loop
  DroneEnemy.tsx            one drone: geometry + ref-driven AI, difficulty-resolved combat numbers
  DroneBoltPool.tsx         pooled instanced energy bolts, speed/damage captured per-bolt at spawn
src/components/three/weapons/
  VortexViewmodel.tsx       shared FP rifle — corrected pose + per-frame runtime muzzle anchor publish
  VortexFireSystem.tsx      camera-based aim ray (unchanged) + anchor-based visual tracer/flash origin
src/components/v2/play/     DOM
  V2PlayView.tsx            orchestrator: pointer-lock ↔ phase, difficulty selector, overlays
  V2PlayHud.tsx             health/ammo/timer/drones/difficulty badge/crosshair/hitmarker/damage
  MatchOverlay.tsx          title card + countdown + effective drone count/difficulty
  PauseMenu.tsx / EndMatchScreen.tsx (+ difficulty badge) / MobileNotice.tsx
  useMatchClock.ts          throttles the per-frame timer to whole-second renders
src/app/v2/play/page.tsx    route
```

### Match state machine

One authoritative `MatchPhase` (`booting · ready · countdown · active · playerDead · victory · defeat · paused · restarting`) with a legal-transition table — never scattered `isPlaying/isDead/isPaused` booleans. Phase controls input, cursor lock, enemy simulation, damage, respawn, HUD visibility and pause. The store is a module singleton, so `/v2/play` re-initializes a fresh session on every mount (a prior victory can't leak in).

### Timing architecture (frame-rate independence)

Two deliberately different kinds of per-frame time flow through this milestone — never one ambiguous `delta`:

- **`realDeltaS`** — real elapsed wall-clock seconds, used for anything that must track real time regardless of frame rate: the pre-match countdown, match timer, respawn countdown (`matchStore.tick()`, driven by `MatchDirector`), and every drone attack cooldown/windup/stun/destruction duration (`DroneEnemy.tsx`, measured against absolute `performance.now()` timestamps, not accumulated) and every Vortex weapon timer (fire rate/RPM spin-up, reload, inspect, ADS — `vortexWeaponStore.ts`/`VortexFireSystem.tsx`, same `performance.now()` pattern). `matchStore.tick()` caps a single call at `MAX_TICK_REAL_DELTA_S` (1s, exported) — the documented tab-restoration policy: ordinary play at any frame rate is never dilated, only a genuinely large single gap (a backgrounded tab regaining focus) is capped rather than credited in full.
- **`simulationDeltaS`** — a clamped or fixed-step delta, used only for movement/visual integration: `PlayerController`'s physics (single clamped step, unchanged — see `docs/decisions.md` for why this one deliberately does NOT use the accumulator below), and `DroneSquad`/`DroneBoltPool`'s drone/projectile translation, which run through a shared fixed-step accumulator (`src/lib/v2/play/fixedStep.ts`, `FIXED_STEP_S = 1/60`, capped at 8 substeps/frame) so movement stays close to real time under a slow frame instead of running in slow motion, while still bounding any single step (no teleport, no spiral of death). `WindLift`'s cosmetic scroll uses a simple clamp of the same name.

Covered by a deterministic test suite, `src/lib/v2/play/matchTiming.test.ts` (`npm test`), simulating 60/30/10/5fps frame sequences.

### Reuse vs. new

**Reused unchanged:** the Vortex weapon store/state machine and `VortexFireSystem` (the single weapon truth — magazine, fire rate, reload, recoil, ADS, spin-up, raycast all from `shared/windWeapons.ts`), `VortexViewmodel` (real Vortex Rifle **LOD1** via `requestedLod={1}`), `RangeEffectsPools` (tracers/impacts/casings), and the `lib/game` movement core (`accelerate`/`applyFriction`/`wishDirection` + `PLAYER` tuning) through a new match-aware controller.

**Extracted to shared:** the `TargetUserData` damage contract → `src/lib/v2/combat/targets.ts` (range targets and drones both implement it, so one fire system damages both with no enemy-specific weapon code). `VortexFireSystem` moved `three/range/` → `three/weapons/` (its true home; the old path is a re-export shim) and gained one optional `combatGateRef` so the match can disable the weapon during countdown/death/pause/end.

**New (this milestone only):** match store/machine/clock, Skyfront arena blockout, Wind Lift, drone squad + AI + bolts, the play HUD/overlays/menus.

### Drone AI

Deterministic ref-driven states (`inactive · spawning · searching · engaging · attacking · stunned · destroyed`): hovers/patrols home, detects the player within radius with a line-of-sight check against the arena boxes, holds a preferred range band and strafes (doesn't rush the camera), winds up visibly (eye glows) then fires a dodgeable energy bolt with modest accuracy, staggers when hit, shrinks out on death. The squad (5 drones on Low, 8 on Medium/Max — see the difficulty table above) + their pooled bolts run in **one** `useFrame` — no per-drone render loop, no per-frame React state.

### LOD

Landing hero → **LOD0** (139,598 tris). `/v2/range` and `/v2/play` first-person → **LOD1** (55,834 tris) via the viewmodel's `requestedLod={1}`. One `vortex-rifle` slot, context-selected tier — no second slot.

### First-person pose and muzzle origin (Milestone 6 polish pass)

The FP rifle previously read as tilted/sideways because the loaded GLB's local **+X** (muzzle-forward) axis was never rotated to align with camera-forward — the viewmodel group only translated the model into view, never corrected its rotation. Ground-truth-verified (isolated zero-rotation screenshot test, not assumption): at identity rotation the model renders in pure side-profile, local +X = view +X (screen-right); a `rotateY(+π/2)` correctly maps it to view -Z (camera-forward). This correction plus small natural hip/ADS tilts now live in `vortexViewmodelPose.ts`'s `VORTEX_VIEWMODEL_POSES` — one typed `{position, rotation, scale}` pair per pose, shared unchanged by `/v2/range` and `/v2/play` (both mount the same `VortexViewmodel`). Recoil and sway/bob stay additive on top, unchanged. **Reload dip and inspect presentation (Step 7C, 2026-07-25)** are now computed by a shared pure module (`lib/v2/operators/actionPose.ts`) rather than inline math — reload's dip curve is the same shape as before; inspect's motion was redesigned into a held yaw/roll/lift presentation (see `docs/design/weapons/vortex-rifle.md` §22c).

**Updated 2026-07-22 — Kael's arms are now mounted here too.** A two-bone IK layer (`src/lib/v2/operators/ik/twoBoneIk.ts`, `kaelArmRig.ts`) solves the validated FP-arms derivative (`operator-kael-arms.glb`) toward the weapon's grip targets (`gripWorldPose.ts`, `docs/design/weapons/vortex-rifle.md` §22a–§22b) — first mounted in `/v2/range` on 2026-07-21, extended here on 2026-07-22 using the exact same `KaelFirstPersonArms` component, unmodified. Both hands visibly track the rifle through hip-fire/ADS/movement/recoil/reload/inspect, in both scenes. `KaelFirstPersonArms.tsx` still reads no match-phase state directly. `VortexViewmodel.tsx` DOES now check match phase as of Step 7C (2026-07-25, `docs/decisions.md`) — specifically to FREEZE the reload/inspect action pose while `paused`/`playerDead`, reusing the same freeze mechanism the grip-tuner's dev toggle already used. Verified in a real browser: two screenshots one real second apart while genuinely paused are byte-for-byte identical, and resuming correctly continues (an in-progress reload completes normally). **IK pose is fully calibrated as of 2026-07-24–25** (RIGHT 0.00cm / LEFT 0.00cm, real-browser motion validated) — the `?ik=1` dev tuner in `/v2/range` remains available for any future refinement.

**Updated 2026-07-26 — Kael's lower body is now mounted here too (Milestone 8, Step 8C, static integration only).** `KaelFirstPersonLowerBody.tsx` renders the Step 8B/8B.1 derivative (`operator-kael-lowerbody.glb` — waist/pelvis/thighs/knees/shins/boots, no head/arms) at the player's own world position, following world YAW ONLY — it never reads camera pitch and never derives position from `camera.position` (both `PlayerController.tsx` and `RangeController.tsx` instead publish their own already-computed kinematic-body translation/yaw every frame via a new bridge, `firstPersonBodyPose.ts`, same generation-counter safety pattern as `gripWorldPose.ts`). The mesh stays in its authored rest pose — no walk cycle, no bob, no jump/Wind-Lift posture; that's explicitly Step 8D's job. No shadow (Step 8E's job).

**Updated 2026-07-26, Step 8C.1 — the Step 8C visual gate failed and was fixed, visual-only.** The first calibration (a purely derived Y correction plus a tiny forward nudge) made the body read as one isolated rounded pelvis blob at 45-70° pitch rather than a coherent leg chain — real Blender bone measurement plus a new `showSkeletonLandmarks` debug diagnostic found the cause: at near-vertical pitch the camera looks almost straight down the LENGTH of the standing leg (an axial/end-on view that can only show cross-sections, never a side profile), and no vertical offset alone can fix that. A substantially larger forward offset does: `LOWERBODY_CANONICAL_LOCAL_OFFSET` is now `[0, -(PLAYER.HALF_HEIGHT + PLAYER.RADIUS) - 0.2, -0.5]` — the Y term still starts from the same derived capsule-to-feet reconciliation, the Z term is now empirically much larger. Confirmed via real screenshots at 45°/60°/70°/max pitch in both routes: a genuine pelvis→thigh→knee→shin→boot silhouette, not a blob. `PLAYER.EYE_STAND` and the collision capsule remain completely untouched — classified PASS WITHOUT EYE-HEIGHT CHANGE. Residual, smaller-magnitude limitation: this character's own eye-to-waist proportion is still a little shorter than a generic real human's even after this fix. Full trace: `docs/decisions.md`'s 2026-07-26 Step 8C and Step 8C.1 entries. Both Step 8C and Step 8C.1 are now committed (`42af28f`).

**Updated 2026-07-27, Step 8D — the lower body now moves.** `lowerBodyLocomotionPose.ts` (pure) computes restrained idle breathing/sway, an alternating walk/sprint gait (stride frequency/amplitude scaling continuously with real speed), short jump-takeoff/landing compression envelopes triggered by real grounded-state transitions, distinct rising/falling airborne postures, and a stable, symmetric Wind Lift posture that overrides the normal air pose while inside the column. `lowerBodyRig.ts` applies these as small additive rotations around the character's own world-space swing axes (never a guessed bone-local axis, never accumulated frame-to-frame — every frame resets to the exact validated Step 8C.1 rest pose before reapplying the offset). Both `PlayerController.tsx`/`RangeController.tsx` publish `horizontalSpeed`/`verticalVelocity`/`movementState`/Wind-Lift-active through the same `firstPersonBodyPose.ts` bridge (reusing their own already-computed values — no new movement/physics calculation anywhere in this pass). The Step 8C.1 hidden ~0.2m floor-sink offset was retested during real walking (not just static idle), per that step's own standing instruction — still not visibly noticeable. Movement speed, jump physics, Wind Lift physics, the collision capsule, camera, weapon, and FP-arm IK are all untouched. Human visual gate not yet claimed — awaiting review before commit. Full trace: `docs/decisions.md`'s 2026-07-27 entries.

**Updated 2026-07-28, Step 8E-B — `/v2/play` is explicitly NOT touched by the new shadow-foundation work, and this remains true by construction, not by omission.** The Step 8E-B dev-only full-body shadow prototype (`KaelFirstPersonShadowBody.tsx`) mounts exclusively inside `RangeScene.tsx`, gated behind `useShadowDebugEnabled()` (`NODE_ENV !== 'production'` AND an explicit `?shadow=1` query param) — `V2PlayScene.tsx` never imports the component, the gate hook, or the new shared-locomotion bridge at all, so there is no code path by which this route's bundle size, render tree, or per-frame cost could change. Real-browser confirmation: `/v2/play` was loaded and screenshotted during this pass's validation matrix specifically to check for the shadow debug panel or any full-body shadow presence — neither appeared, and the production build's `/v2/play` route size is unchanged from before this step. The one genuinely shared piece of infrastructure — `KaelFirstPersonLowerBody.tsx` now also publishing its already-computed locomotion pose through the new bridge, in addition to applying it locally as before — is additive and silent for any route with no reader of that bridge; `/v2/play` has no shadow-body consumer, so the extra publish call is a no-op write nobody reads there. Full detail: `docs/changelog.md`'s 2026-07-28 entry, `docs/decisions.md`.

**Updated 2026-07-28, Step 8E-C, same day — same isolation holds for the new arm-IK/shadow-weapon work; `/v2/play` remains untouched, now doubly confirmed.** `KaelFirstPersonShadowWeapon.tsx` and the arm/spine IK additions to `KaelFirstPersonShadowBody.tsx` mount through the exact same `useShadowDebugEnabled()` gate `RangeScene.tsx` already used for Step 8E-B — `V2PlayScene.tsx` was not modified in this step at all. The one piece of genuinely shared infrastructure this step reads from — `gripWorldPose.ts`'s existing `weaponWorldPosition`/`weaponWorldQuaternion` fields, already published every frame by `VortexViewmodel.tsx` on BOTH `/v2/range` and `/v2/play` since Milestone 7 — was a pure READ with zero new writes added to that bridge; `/v2/play` continues publishing the exact same fields it always has, for the exact same consumers (the visible arms) it always has. `KaelFirstPersonArms.tsx`'s new `useShadowDebugEnabled()` check (Section 9's authoritative-caster gate) evaluates to `false` unconditionally on `/v2/play` (the hook's own `NODE_ENV`/query-param gate can never be true there), so visible-arm shadow-casting on `/v2/play` is provably unchanged. Confirmed live: `/v2/play` loaded and checked for the shadow debug panel during this step's own validation matrix — absent, as expected. Full detail: `docs/changelog.md`'s 2026-07-28 entries, `docs/decisions.md`.

**Updated 2026-07-28, Step 8E-C.1, same day — the pitch-invariant aim-frame correction pass touches only files this doc already lists as `/v2/range?shadow=1`-only; `/v2/play` isolation is unaffected and was not re-verified with new code, since none was added to any shared path.** `shadowAimFrame.ts` (new) and the reworked `shadowUpperBodyRig.ts` are pure modules with no route dependency at all; `KaelFirstPersonShadowBody.tsx`'s changes stay inside the same `useShadowDebugEnabled()`-gated component this doc already documents as `/v2/play`-absent. No new reads or writes touch any bridge `/v2/play` also uses beyond the same `gripWorldPose.ts` fields already covered by the Step 8E-C entry above. Full detail: `docs/changelog.md`'s 2026-07-28 entries, `docs/decisions.md`.

**Updated 2026-07-29, Step 8E-C.2 — the chest-anchored weapon presentation pass, including its new `rangeLocalPose.pitch` read, is `/v2/range`-SPECIFIC by construction and does not touch `/v2/play`.** New modules `shadowWeaponPresentationPose.ts`/`shadowWeaponWorldPose.ts` are pure/pure-bridge with no route dependency; the one new external read this pass added, `src/lib/v2/range/localPose.ts`'s `rangeLocalPose.pitch`, is itself a `/v2/range`-only module by design (its own doc comment: "a separate module... so the two scenes never share state" — `/v2/play` has no equivalent import anywhere in this pass's diff). `KaelFirstPersonShadowBody.tsx`/`KaelFirstPersonShadowWeapon.tsx` stay inside the same `useShadowDebugEnabled()`-gated components this doc already documents as `/v2/play`-absent, so this new read is only ever reachable when the component is already confirmed not mounted on `/v2/play`. Full detail: `docs/changelog.md`'s 2026-07-29 entry, `docs/decisions.md`.

**Updated 2026-07-29, Step 8E-C.3, same day — the new external review camera/receiver are gated behind an EXTRA flag on top of the shadow gate (`?shadow=1&shadowReview=1`, never `?shadow=1` alone), and neither touches `RangeController.tsx`, the real gameplay camera, or `/v2/play` in any way.** `KaelShadowReviewCamera.tsx` owns a completely separate `THREE.PerspectiveCamera` object — R3F's own default camera (`RangeController.tsx`'s `useThree((state) => state.camera)`) is never reassigned, so that file needed zero changes and required no re-verification of its own isolation. `useShadowReviewEnabled.ts` layers its own `NODE_ENV`/`?shadowReview=1` check ON TOP OF `useShadowDebugEnabled()`, so it can never be true anywhere `useShadowDebugEnabled()` isn't — meaning it inherits every isolation guarantee this doc already established for the shadow prototype as a whole. Confirmed live this pass: `/v2/play` and plain `/v2/range` (no flags) both show zero shadow-panel and zero review-panel presence; the real gameplay camera keeps rendering correctly the instant review mode is disabled. Full detail: `docs/changelog.md`'s 2026-07-29 (later) entry, `docs/decisions.md`.

**Updated 2026-07-29, Step 8E-C.3.1, same day — a real isolation GAP in the 8E-C.3 claim above was found and fixed: the review camera's own color pass could still see the normal, visible first-person lower body (`KaelFirstPersonLowerBody`), which had been left OUTSIDE the `<group visible={!shadowReviewEnabled}>` wrapper that already hid the viewmodel/arms.** Moved inside that same group — a render-visibility-only change, the shared locomotion pose bridge this doc documents elsewhere keeps running underneath regardless, and gameplay routes/behavior outside review mode are completely unaffected. Re-verified live this pass: disabling `shadowReview=1` (keeping `shadow=1`) restores the visible lower body/arms/viewmodel and removes the review panel; plain `/v2/range` (no flags) shows zero shadow/review presence; zero console errors across a 55-screenshot capture run exercising every gameplay input (fire/reload/inspect/sprint/jump) while review mode was active. Full detail: `docs/changelog.md`'s 2026-07-29 (Step 8E-C.3.1) entry, `docs/decisions.md`.

The tracer/muzzle-flash previously originated from a fixed camera-relative offset with no tie to the weapon's actual geometry, so it visibly started near the receiver instead of the barrel. The real GLB has no authored `socket_muzzle` (Blender export is still v0.2), so a **temporary, hand-measured runtime anchor** stands in: `vortexRuntimeAnchors.ts`'s `VORTEX_RUNTIME_ANCHORS.muzzleLocal`, a local-space coordinate near the barrel's +X endpoint (bore-aligned, not bounding-box center). `VortexViewmodel` converts it to world space every frame (`group.localToWorld`, after `updateWorldMatrix(true, false)` to avoid a one-frame lag) and publishes it through `muzzleWorldPose.ts` — a plain-object singleton bridge (same convention as `rangeLocalPose`/`fireSignal`), read by `VortexFireSystem` for the *visual* tracer/flash origin only. **This is not an authored GLB socket** — do not treat it as one, and delete it once a Blender-exported v1.0 asset ships a real `socket_muzzle`. The gameplay aim ray (`raycaster.set(camera.position, dir)`, hit detection, damage, spread, recoil) is completely unchanged and stays camera-based — difficulty and the muzzle-anchor fix both leave weapon damage/hit-detection untouched.

## Controls

WASD move · Shift sprint · Space jump · Mouse look · LMB fire · RMB ADS · R reload · F inspect · Esc pause. Mobile shows a "desktop recommended" notice (no touch controls this milestone).

## Deliberately excluded

Multiplayer, networking, accounts, progression, additional operators/weapons/maps, touch controls, final art. Drone and arena are temporary blockout assets. Audio uses the existing procedural Vortex hooks (fire/reload/dry-fire/impact/spin-down) — no audio assets were fabricated or added. Step 7G (2026-07-26) gave those hooks a genuine layered signature identity (see [design/audio.md](../design/audio.md), [design/weapons/vortex-rifle.md](../design/weapons/vortex-rifle.md) §15) with no change to `/v2/play`'s match timing, fire rate, reload/inspect duration, or any other gameplay behavior — audio remains a passive consumer of accepted weapon events here exactly as before.
