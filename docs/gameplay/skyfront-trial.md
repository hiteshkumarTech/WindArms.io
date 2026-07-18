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

The FP rifle previously read as tilted/sideways because the loaded GLB's local **+X** (muzzle-forward) axis was never rotated to align with camera-forward — the viewmodel group only translated the model into view, never corrected its rotation. Ground-truth-verified (isolated zero-rotation screenshot test, not assumption): at identity rotation the model renders in pure side-profile, local +X = view +X (screen-right); a `rotateY(+π/2)` correctly maps it to view -Z (camera-forward). This correction plus small natural hip/ADS tilts now live in `vortexViewmodelPose.ts`'s `VORTEX_VIEWMODEL_POSES` — one typed `{position, rotation, scale}` pair per pose, shared unchanged by `/v2/range` and `/v2/play` (both mount the same `VortexViewmodel`). Recoil, sway, bob, reload dip and inspect wobble stay additive on top, unchanged in behavior.

**Honest limitation:** this is a corrected *floating* viewmodel, not a *held* one — there is no operator-arms model this milestone, so there's no real hand/grip contact or wrist rotation. True holding needs a future arms rig + hand IK (tracked in [todo.md](../todo.md)).

The tracer/muzzle-flash previously originated from a fixed camera-relative offset with no tie to the weapon's actual geometry, so it visibly started near the receiver instead of the barrel. The real GLB has no authored `socket_muzzle` (Blender export is still v0.2), so a **temporary, hand-measured runtime anchor** stands in: `vortexRuntimeAnchors.ts`'s `VORTEX_RUNTIME_ANCHORS.muzzleLocal`, a local-space coordinate near the barrel's +X endpoint (bore-aligned, not bounding-box center). `VortexViewmodel` converts it to world space every frame (`group.localToWorld`, after `updateWorldMatrix(true, false)` to avoid a one-frame lag) and publishes it through `muzzleWorldPose.ts` — a plain-object singleton bridge (same convention as `rangeLocalPose`/`fireSignal`), read by `VortexFireSystem` for the *visual* tracer/flash origin only. **This is not an authored GLB socket** — do not treat it as one, and delete it once a Blender-exported v1.0 asset ships a real `socket_muzzle`. The gameplay aim ray (`raycaster.set(camera.position, dir)`, hit detection, damage, spread, recoil) is completely unchanged and stays camera-based — difficulty and the muzzle-anchor fix both leave weapon damage/hit-detection untouched.

## Controls

WASD move · Shift sprint · Space jump · Mouse look · LMB fire · RMB ADS · R reload · F inspect · Esc pause. Mobile shows a "desktop recommended" notice (no touch controls this milestone).

## Deliberately excluded

Multiplayer, networking, accounts, progression, additional operators/weapons/maps, touch controls, final art. Drone and arena are temporary blockout assets. Audio uses the existing procedural Vortex hooks; no new audio was fabricated.
