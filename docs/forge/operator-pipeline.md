# Operator Production Pipeline — Phase 5 Report

**Status:** architecture COMPLETE (2026-07-17) · **First operator:** Operator 01 — Kael Aurin (male) · **No GLB exists yet** — Phase 6 delivers it. Nothing in V1 was touched; no gameplay was invented; the Vortex Rifle assets were not modified.

This is the production report the Phase 5 directive asked for: architecture summary, folder tree, extension points, known blockers.

## 1. Architecture summary

One operator definition feeds every consumer — FP hands, reload/inspect animations, lobby character, hero page, skins, emotes, killcam, third-person — through three layers, each replaceable independently:

```
CONFIG (pure TS, no React)         src/lib/v2/operators/
  OperatorDefinition = meta (canon roster ref) + visual + animation + attachments + skins
        │  identity is REFERENCED from content/operators.ts (canon), never copied
        ▼
RUNTIME (R3F, no DOM)              src/components/three/operators/
  OperatorModel — THE component: LOD resolve → skeleton clone → sockets →
  animation states → render modes → skins → silhouette fallback
  FirstPersonOperatorRig / OperatorPawn / OperatorSocketAnchor wrap it per context
        ▼
PRESENTATION (DOM + Canvas)        src/components/v2/operators/
  OperatorShowcase — hero lighting + turntable + pedestal, own <Canvas>
```

Everything rides the EXISTING asset pipeline (`src/lib/v2/pipeline/`) — slot probing, LOD fallback (`.lod1`/`.lod2`), Draco/WebP via `useGLTF`, manifest validation, accent tinting. Zero duplication; the pipeline's `SocketName`/`ClipName` unions were extended (per their own "extend, don't invent" rule) and two operator manifest entries added.

### The six requested configs

| Type | Home | Notes |
|---|---|---|
| `OperatorDefinition` | `operators/types.ts` + `registry.ts` | Composes the five below; `kael` + `veyra` registered |
| `OperatorMetadata` | `operators/types.ts` | References the canon `OperatorContent` (never forks it); adds gender + typed weapon id |
| `OperatorVisualConfig` | `operators/types.ts` | slot, fpArmsSlot, scale (=1 until measured), groundOffsetY, targetHeightM, showcase rim/rotation |
| `OperatorAnimationConfig` | `operators/types.ts` + `animations.ts` | 16 states × {clip, loop, fade, timeScale, returnTo}; `buildDefaultAnimationConfig()` |
| `OperatorAttachmentConfig` | `operators/types.ts` + `sockets.ts` | 16 typed sockets; per-socket node override / bone fallbacks / local offset |
| `OperatorSkinConfig` | `operators/types.ts` | rarity ladder default→mythic; accent-tint tier (free) + model-override tier; only `default` populated |

### Animation states (16) — no component rewrites

`idle walk sprint ads fire reload inspect equip unequip jump fall land death victory lobby_idle selection_pose` — a `Record` keyed by the `OperatorAnimationState` union. Adding a state = extend the union + two tables; the compiler surfaces every consumer. Components receive states via ONE prop (`animationState`). One-shots chain (`jump→fall`, `reload→idle`) via the mixer's `finished` event; missing clips no-op with a single dev warning (fail-soft, like the rest of the pipeline).

### Sockets (16, typed)

`head neck spine pelvis left_hand right_hand left_foot right_foot weapon_primary weapon_secondary back belt grenade camera_fp camera_tp muzzle_reference`

Resolution order: explicit config node → authored `socket_<id>` empty (pipeline convention) → humanoid bone fallbacks (Mixamo / UE mannequin / Rigify names) — so a stock autorig works day one. `camera_tp`/`muzzle_reference` have no bone fallback by design: author them or they stay unresolved. Required subset (validation + inspector): `head spine pelvis right_hand left_hand weapon_primary camera_fp`.

### First person

`FirstPersonOperatorRig` mounts under the camera: `eyeOffset → swayPivot → recoilPivot → OperatorModel` — pivots exposed via ref for future sway/procedural recoil (the range's existing `viewKick.ts` spring is the intended driver), children slot for the held weapon so body+weapon move as one. Body modes: `armsOnly` (mesh-name convention now; dedicated `operator-<id>-arms.glb` slot reserved for Phase 7), `fullBody`, `bodyHidden` (skeleton still animates → sockets track), `shadowOnly` (shadow-map-only material). All reversible at runtime — death cam can flip FP→TP without reloading.

### Third person

`OperatorPawn` context presets: `lobby→lobby_idle · killcam→idle · spectator→idle · victory→victory · mvp→selection_pose`. New context = one row. Future emotes = new animation states played through the same `animationState` prop.

### Model pipeline support

.glb ✓ (useGLTF) · Draco ✓ (drei auto-decoder) · WebP textures ✓ (EXT_texture_webp) · LOD0/1/2 ✓ (existing `.lodN` resolver + graphics-quality tier) · AnimationMixer ✓ (per-instance, `SkeletonUtils.clone` so two pawns of one operator never share a skeleton) · KTX2 — future (extension point: swap loader config in one place, `useGLTF`'s extendLoader, when we adopt it) · IK / facial / cloth — future (attach at the exposed skeleton via `OperatorModelHandle.object`; nothing rewrites).

## 2. Folder tree (new/changed only)

```
src/lib/v2/operators/            NEW — config layer (pure TS)
  types.ts                       the six config types + unions
  sockets.ts                     16 sockets, required set, bone fallbacks
  animations.ts                  16 states, clip names, playback policies
  assetSlots.ts                  slot naming: operator-kael[.lodN|-arms|-skin-<id>].glb
  registry.ts                    OPERATOR_DEFINITIONS (kael, veyra), DEFAULT_OPERATOR_ID
  index.ts
src/components/three/operators/  NEW — runtime layer (R3F)
  OperatorModel.tsx              THE operator component (+OperatorModelHandle)
  OperatorSilhouette.tsx         procedural fallback mannequin (accent-lit)
  OperatorSocketAnchor.tsx       typed socket mounting (reuses pipeline SocketAnchor)
  FirstPersonOperatorRig.tsx     FP mount: sway/recoil pivots, body modes
  OperatorPawn.tsx               TP contexts: lobby/killcam/spectator/victory/mvp
  renderModes.ts                 full/armsOnly/bodyHidden/shadowOnly (reversible)
  hooks/useOperatorAnimations.ts mixer + crossfades + one-shot chaining
  hooks/useOperatorSockets.ts    socket resolution (convention → bones)
  index.ts
src/components/v2/operators/     NEW — presentation layer (DOM+Canvas)
  OperatorShowcase.tsx           hero lighting, turntable, pedestal, error fallback
  index.ts
src/lib/v2/pipeline/types.ts     EXTENDED — SocketName +14, ClipName +8 (additive)
src/lib/v2/pipeline/manifest.ts  EXTENDED — operator-kael + operator-veyra entries, shared OPERATOR_BUDGET
tools/inspect-operator.mjs       NEW — character GLB gate (see §4)
WindArms Assets/Characters/      staging (create when the first source GLB arrives)
  Operator01_Kael/               → kael_v0.1_source.glb, bakes, textures
```

## 3. Authoring contract (what Phase 6's GLB must be)

Scale: 1 unit = 1 m, Kael height ≈ **1.83 m** (`targetHeightM`) — mismatches are corrected via `visual.scale` after measuring, never eyeballed. Origin at the **feet**, facing **-Z** (project rig convention, `pipeline/sockets.ts`). One armature, one skin, ≤120 joints web-budget. Socket empties named `socket_<id>` (16 above; 7 required). Clips named exactly like states (16; ship what exists, the rest warn). Materials named; the tintable one contains `accent`/`energy`/`tint` (skin-tint target). LOD0 ≤ **45k tris / 10 materials / 2048px textures** (matches `OPERATOR_BUDGET`), LOD1 ≤ 20k, LOD2 ≤ 8k, exported as `operator-kael.glb` / `.lod1.glb` / `.lod2.glb` into `public/v2-art/`. Arms model (Phase 7): `operator-kael-arms.glb`.

## 4. Validation

`node tools/inspect-operator.mjs <file.glb> [--lod 0|1|2]` — zero-dep gate: skeleton/joints, skinning coverage, per-clip channels+duration vs the 16 states, `socket_*` empties vs the 16 sockets (with "resolvable via bone fallback" downgrades), duplicate node names, materials/tintable check, tris/materials/file/texture budgets per LOD. Exits non-zero on errors (CI-ready). In-engine, the existing dev validator runs the manifest checks automatically on load.

## 5. Extension points (typed, functional, empty by design)

Skins beyond `default` (rarity ladder + two mechanisms ready); emotes (new states, same prop); hand IK / facial / cloth (skeleton exposed on the handle); dedicated FP arms GLB (slot reserved, rig prefers it when present); scripted showcase cameras (`cameraDirector` prop); showcase background scenes (`background` prop); KTX2; per-operator clip remaps (`buildDefaultAnimationConfig(overrides)`); abilities/gameplay stats (deliberately absent — no design exists; will follow `windWeapons.gameplayStats` optional-field precedent); server-side operator identity (graduates to `shared/` when V2 combat needs it, per `windWeapons.ts` precedent).

**Hand IK — implemented and mounted in BOTH `/v2/range` and `/v2/play` (2026-07-21, Phase F Step 6; extended to `/v2/play` 2026-07-22).** `src/lib/v2/operators/ik/twoBoneIk.ts` (pure analytic two-bone solver) plus `src/lib/v2/operators/kaelArmRig.ts` (bone resolution + rest-metrics, hand-basis correction measured independently per side — confirming in running code what `inspect-kael-hand-basis.py` proved on the static rest pose) connect the FP arms GLB (`operator-kael-arms.glb`) to the Vortex Rifle's published grip targets (`gripWorldPose.ts`) via `KaelFirstPersonArms.tsx`, a standalone component mounted identically (unmodified) in both `RangeScene.tsx` and `V2PlayScene.tsx` — extending to the second route required zero changes to the arms system itself, confirming the original route-agnostic design (`docs/decisions.md`). Both hands visibly track the weapon through hip-fire/ADS/movement/recoil/reload/inspect, in both scenes; VortexViewmodel remains the sole owner of the weapon transform. **Not visually calibrated** (no browser access this session — elbow-pole/shoulder-offset/finger-curl values are first-pass structural defaults, a `?ik=1` dev tuner exists in `/v2/range` to correct them; not mounted in `/v2/play`, matching the existing grip/muzzle debug-tool precedent of range-only calibration UI). The grip-target VALUES this IK layer solves toward remain final (visually calibrated `/v2/range?grips=1`, 2026-07-21): right hand `position: [-0.25, -0.065, 0.0]` / `rotationEuler: [0.0, 0.0, -1.1519]` (-66° Z); left hand `position: [0.22, -0.05, 0.0]` / `rotationEuler: [0.0, 0.0, -0.5061]` (-29° Z), both `rotationOrder: 'XYZ'`, both temporary runtime proxies not authored GLB sockets. Full detail: `docs/design/weapons/vortex-rifle.md` §22a–§22b.

**Visibility blocker fixed 2026-07-22.** The arms mesh was invisible at runtime (mount/IK were both working, but the asset's skeleton is authored in full-body character space, not shoulder-relative — see `docs/decisions.md`'s "Kael FP-arm visibility blocker" entry for the full root-cause trace and fix). Verified structurally (unit tests + a headless real-asset simulation); not yet confirmed in an actual browser.

**`operator-kael-arms.glb` rebuilt 2026-07-22 (Step 6C) — "exploded geometry" traced to a Decimate-modifier artifact, not the extraction method or the IK runtime.** After the shoulder-offset fix above, manual browser testing still showed giant polygon slabs. Real Blender automation against the accepted rigged source found the actual mechanism: the existing `tools/blender/make-kael-fp-arms.py` pipeline's Decimate step protects hand/finger vertices from reduction but has zero protection at the open shoulder/torso cut boundary — Collapse decimation next to that open edge stretched individual triangles to ~0.12–0.16m (max face area 104x normal) even though the raw pre-decimation extraction never exceeds ~0.02m anywhere. Fixed with a new post-decimation cleanup step (delete any face whose longest edge exceeds 0.035m, then clean up loose vertices) — measured on the real asset: max edge 0.1615m → 0.0344m, max face area 0.008674 → 0.000318 m² (27x). A genuine independent bug in the same script (`proximal_bones` silently resolving to almost nothing since Step 4, due to a dict-nesting mistake) was found and fixed along the way. `tools/inspect-operator.mjs --mode arms` gained a permanent max-edge-length check so this defect class is caught at the inspector gate going forward, not just by a human looking at a browser. Full investigation, rejected alternatives, and measurements: `docs/decisions.md`. Runtime compatibility (bone resolution, recentering, a 20-frame IK simulation) confirmed against the rebuilt asset; not yet confirmed visually.

**Debug tooling fixed 2026-07-22 (Step 6D) — the `?ik=1` tuner's own bounding-box overlay was never measuring the deformed mesh; a harder "true rest pose" diagnostic was added.** Manual browser testing after the Step 6C rebuild reported the rebuilt arms still unusable — completely invisible with `IK disabled` on, and the bounding-box helper drawing enormous magenta lines across most of the screen. Headless investigation found and fixed one confirmed bug: `ArmBoundingBoxHelper` used `THREE.Box3.setFromObject()`, which reads each mesh's static `geometry.boundingBox` (computed once at load from the undeformed vertex attributes) — GPU skinning happens entirely in the vertex shader and never touches that CPU-side data, so the box was identical regardless of IK weight or pose. Replaced with `computeDeformedSkinnedBounds()` (`kaelArmSolve.ts`), which walks every vertex through `SkinnedMesh.applyBoneTransform` — the same math the GPU actually runs — verified against the real rebuilt asset (`[1.009, 0.745, 0.195]` m, finite, arm-scale) and against a new synthetic 2-bone unit-test mesh that visibly moves when rotated (the static method never would have). Separately, since `IK disabled` only *converges toward* rest pose via the solver's own weight=0 blend branch rather than hard-bypassing it, a genuinely solver-free `restoreRestPose()` was added — captures each bone's transform once at mount, restores it verbatim on demand, with test coverage for exact restoration, 100-cycle no-drift, and finger-pose removal. Exposed as a new, separate **"REST MESH DIAGNOSTIC"** toggle in the `/v2/range` tuner panel, alongside (not replacing) the existing "IK disabled" toggle. Whether a genuine invisibility bug remains beyond the now-fixed bounding-box display bug is still an **open question** — headless simulation against the real asset produces sane results, but "completely invisible in-browser" could not be reproduced without a browser. Full investigation and reasoning: `docs/decisions.md`'s 2026-07-22 "bounding box was measuring the wrong thing" entry.

**Resolved 2026-07-23 (Step 6E) — "invisible in REST MESH DIAGNOSTIC" was a viewing-angle mismatch, not a bug.** Manual testing after the above fix still reported invisible arms with an oversized/detached bounding box. Built `classifyVerticesInCameraSpace()` (`kaelArmSolve.ts`) — true camera-space/NDC frustum classification of every deformed vertex, the same math the GPU rasterizer uses — and ran it headlessly against the real rebuilt asset through every stage of the transform chain. Result: with the shipping `shoulderRootOffset`, the arm's rest pose (dangling at the sides, authored for third-person viewing) places only 0.1% of vertices inside the visible frustum from this close a first-person camera — it sits almost entirely below the screen. The SAME measurement at the actual shipping IK weights (0.25/0.5/1.0) shows the arm correctly entering frame as it's pulled toward the grip target (0.1% → 36.3% → 66.7%). Four other explanations were tested and disproven by direct measurement: backface culling (material is `THREE.DoubleSide`), camera render layers (none used anywhere in `src/components/three`), a second/dedicated viewmodel camera (`VortexViewmodel.tsx` has none), and the debug helper double-applying the camera transform (read `Box3Helper`'s three.js source directly — it's mounted at scene root with an identity parent, mathematically correct as-is). Two small unrelated bugs were fixed along the way: a debug-only bone-`matrixWorld` staleness window (never affected the real rendered frame), and a three.js gotcha in the newly-built "DIRECT CAMERA MOUNT" diagnostic where objects parented directly to R3F's default camera don't render at all unless the camera is explicitly added to the scene graph — caught and fixed before it shipped. Conclusion: the transform/recenter/skinning/IK chain was already correct; the acceptance check going forward is the IK-enabled shipping configuration, not the rest-pose diagnostic. Full investigation: `docs/decisions.md`'s 2026-07-23 entry.

## 6. Known blockers

1. **No operator GLB exists** — the entire runtime renders the procedural silhouette until Phase 6 lands `operator-kael.glb`. That's the designed state, not a bug.
2. **`armsOnly` before Phase 7** is convention-dependent: on a full-body model it shows only meshes named per `FP_ARMS_NAME_HINTS`; on the silhouette it correctly shows nothing (no arms asset exists — pretending otherwise would be fake). The dedicated arms GLB removes the convention dependency.
3. **`camera_tp` / `muzzle_reference` sockets cannot be bone-derived** — they must be authored empties; until then consumers use their own defaults.
4. **`visual.scale` is 1 by definition, unmeasured** — recompute from `inspect-operator.mjs` world height when the GLB lands (weapon-pipeline precedent: computed, not guessed).
5. **Sandbox unavailable this session** — `npm run typecheck && npm run build` must be run locally before commit (same handoff as every prior phase).
6. Docs follow-up already on record: `docs/gameplay/operators.md` still calls Veyra's weapon "Vortex Carbine" (stale naming, flagged in `shared/windWeapons.ts`).
