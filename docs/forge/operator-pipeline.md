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

## 6. Known blockers

1. **No operator GLB exists** — the entire runtime renders the procedural silhouette until Phase 6 lands `operator-kael.glb`. That's the designed state, not a bug.
2. **`armsOnly` before Phase 7** is convention-dependent: on a full-body model it shows only meshes named per `FP_ARMS_NAME_HINTS`; on the silhouette it correctly shows nothing (no arms asset exists — pretending otherwise would be fake). The dedicated arms GLB removes the convention dependency.
3. **`camera_tp` / `muzzle_reference` sockets cannot be bone-derived** — they must be authored empties; until then consumers use their own defaults.
4. **`visual.scale` is 1 by definition, unmeasured** — recompute from `inspect-operator.mjs` world height when the GLB lands (weapon-pipeline precedent: computed, not guessed).
5. **Sandbox unavailable this session** — `npm run typecheck && npm run build` must be run locally before commit (same handoff as every prior phase).
6. Docs follow-up already on record: `docs/gameplay/operators.md` still calls Veyra's weapon "Vortex Carbine" (stale naming, flagged in `shared/windWeapons.ts`).
