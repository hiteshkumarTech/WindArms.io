# Kael Aurin v0.1 — Source Asset Brief (Milestone 7 gate)

**Status: BLOCKED — no source GLB exists.** Checked 2026-07-20: `WindArms Assets/` contains no operator/character GLB (`Characters/` is empty). Per the milestone's asset gate, no fake humanoid, procedural tube arms, or mannequin stand-in was built. This brief is the production order that unblocks it.

**Deliver the file to:** `WindArms Assets/Characters/Operator01_Kael/kael_v0.1_source.glb` (the staging convention already documented in [operator-pipeline.md](operator-pipeline.md) §2; the alternate `WindArms Assets/Operators/Kael/…` is acceptable — the gate checks both). Source files stay git-ignored (`WindArms Assets/**/*.glb`).

**Gate command once it exists:** `node tools/inspect-operator.mjs "WindArms Assets/Characters/Operator01_Kael/kael_v0.1_source.glb" --lod 0`

## 1. Who Kael is (canon — do not reinvent)

Kael Aurin, **"Temple Warden"** — male operator, guardian of the Wind Temple's inner sanctum; patient, vertical fighter. Identity accent **#4FC3FF** (STORM.energy). Signature weapon: Aeolus Rifle. Civilization design language (art bible / operators.md): **white marble, titanium, brushed steel, electric cyan energy, mechanical turbines/pressure mechanisms, clean engineering, elegant silhouettes, functional armor, premium AAA realism.** Avoid: oversized fantasy armor, glowing magic, sci-fi clichés, cyberpunk. Presentation height convention: **1.83 m** (documented in `registry.ts` as `targetHeightM` — not lore, but the number the runtime normalizes to).

## 2. Source contract (what the GLB must satisfy)

**Pose** — full-body neutral **A-pose**: arms clearly separated from torso, elbows only slightly bent, palms roughly forward/inward, legs separated, feet flat, fingers separated enough to rig. No crossed limbs, no held weapon, no props, no action pose.

**Model quality** — one coherent character; believable anatomy/proportions; clean silhouette; no duplicated limbs, fused fingers, disconnected/floating armor, baked environment, display stand, baked text/logos.

**Mesh structure** — prefer logically separated meshes or material groups (`head, torso, upper_arm_L/R, lower_arm_L/R, hand_L/R, legs, boots, armor` — names may differ). This enables full-body, body-hidden, and **arms-only first-person** rendering plus future cosmetics. A single monolithic skinned mesh is acceptable **only if** arm geometry can be isolated without breaking weights (the runtime `armsOnly` mode filters by mesh name — see `renderModes.ts` `FP_ARMS_NAME_HINTS`: name arm meshes `fp_arms_*` or containing `arm`/`hand`).

**Rig (required — an unrigged model is REJECTED)** — humanoid skeleton with at least: root, pelvis/hips, spine(+chest), neck, head, and per side: clavicle, upperArm, lowerArm, hand, upperLeg, lowerLeg, foot. **Finger bones strongly preferred** (thumb/index/middle/ring/pinky) — without them the grip pose is a neutral hand, documented as a limitation, and "believable grip quality" will not be claimed. ≤120 joints (web budget, `inspect-operator.mjs` warns above). One skin, no duplicate bone names, no negative scales, clean inverse binds. Mixamo-style naming is fine — the runtime's `DEFAULT_BONE_FALLBACKS` already resolves `mixamorig:*`, UE, and Rigify names.

**Textures** — PBR baseColor + metallic/roughness; **normal map strongly preferred**; ≤2048 px (OPERATOR_BUDGET); clearly named materials; no baked background/logos. Name the cyan-energy material with `accent`/`energy`/`tint` in it so the existing tint system can target it.

**Scale & axes** — document source up/forward axis, height, origin. Runtime convention the derivative will normalize to (builder's job, not the generator's): **1 unit = 1 m, feet at origin (y=0), facing −Z, height 1.83 m**. Socket empties (`socket_right_hand`, `socket_left_hand`, `socket_weapon_primary`, `socket_camera_fp` …) are authored in the later Blender pass, not required of the generator — bone fallbacks cover the interim.

**Animation** — clips are NOT required for v0.1 (FP grip is IK/pose-driven; clip names for later: `idle walk sprint ads fire reload inspect equip unequip jump fall land death victory lobby_idle selection_pose`). Do not ship junk clips.

**Budgets (existing, not new)** — source high-poly is unconstrained; runtime derivatives must hit `OPERATOR_BUDGET`/LOD gates: LOD0 ≤ 45k tris / 10 materials / 2048px / 6 MB · LOD1 ≤ 20k / 3 MB · arms-FP derivative within the viewmodel-class budget (≈ ≤60k tris, target well under).

## 3. External generation brief (copy-paste)

> **Character commission/generation prompt — "Kael Aurin, WindArms":**
> Full-body male sci-fi operator in a strict neutral **A-pose** (arms ~45° from torso, elbows nearly straight, palms facing slightly inward, legs shoulder-width, feet flat, fingers straight and separated). Lean athletic guardian build, ~1.83 m proportions. **Costume:** elegant functional combat armor for an ancient-but-advanced sky civilization — white marble-like composite plates with brushed titanium and dark steel underlayers, restrained gold trim lines, subtle glowing **electric-cyan (#4FC3FF)** energy channels across chest/forearms, small wind-turbine/pressure-mechanism details at the back and wrist armor, fitted hood-less helmet or bare head with short dark hair (artist's choice, no face covering required). Clean engineering, elegant silhouette, AAA realism. **Must not include:** weapons, props, base/stand, cape/loose cloth simulation meshes, oversized fantasy pauldrons, cyberpunk neon signage, text/logos, background. Single connected character, symmetrical, production topology preferred, PBR textures (baseColor, metal/rough, normal), ≤2048 px maps.
>
> **Rigging pass (Blender or Mixamo):** auto-rig acceptable for v0.1 — Mixamo humanoid rig WITH fingers ("with skin" FBX → Blender → glTF export), or Blender Rigify/manual with the bone list in §2. Verify: weights deform elbows/wrists/fingers cleanly in a test pose; no bone scale ≠ 1; apply all transforms; export **glTF Binary (.glb)** with skin, +Y up, meshes/materials named per §2.

## 4. What happens automatically once the file lands

1. `inspect-operator.mjs` gates it → `docs/forge/kael-v0.1-inspection.md` (ACCEPTED / WITH LIMITATIONS / REJECTED).
2. A deterministic builder (`tools/make-kael-runtime.mjs`, to be written that milestone) produces `public/v2-art/operator-kael.glb` (+`.lod1`) and the arms derivative for `operator-kael-arms` — the slots and manifest entry **already exist** (`assetSlots.ts`, `manifest.ts`), so the showcase/pawn/FP rig light up with no new wiring.
3. FP arms integration: weapon stays transform-authoritative (camera → viewmodel pose/sway/recoil → rifle); `RuntimeWeaponAnchors` gains `rightHandGripLocal`/`leftHandGripLocal` (temporary runtime proxies, like the existing hand-measured `muzzleLocal`); a two-bone IK solver drives Kael's arms toward those anchors through the existing `FirstPersonOperatorRig`/`useOperatorSockets` machinery.

**Next asset-production action:** run the §3 prompt through the chosen generator (Hitem3D — same pipeline that produced the accepted Vortex v0.2 — or equivalent), rig per §3, drop the GLB at the §"Deliver" path, and re-run Milestone 7.
