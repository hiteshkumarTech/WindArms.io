# Vortex Rifle — v0.2 Source Inspection Report

**File:** `Hitem3d-1784224974921.glb` · **Status:** ACCEPTED as v0.2 source asset (supersedes v0.1 as the bake source; NOT web-ready as-is)
**Inspected:** parsed from the GLB's embedded glTF JSON chunk (exporter: THREE.GLTFExporter r178 — same Hitem3d image-to-3D pipeline as v0.1). Inspection only — the file was not modified.
**Rule of this asset:** silhouette is canon. All work below refines; nothing remodels.

## 1. Import verification

Valid glTF 2.0 GLB, single scene (`AuxScene`), no required extensions (no Draco/KTX2/meshopt) — loads in our `useGLTF` pipeline with zero loader configuration. Not render-tested in this session; structural validity confirmed from container + JSON.

## 2. Findings

| Property | Value | Assessment |
|---|---|---|
| File size | **~87.5 MB** (geometry 56.4 MB + textures 31.1 MB) | 🔴 ~17.5× showpiece budget (5 MB) — blocks web use as-is (expected for a source) |
| Triangles | **1,994,356** (1,015,525 verts, uint32 indices) | 🔴 ~13.3× showpiece (150k), ~33× viewmodel (60k) — this is the high-poly |
| World size | **0.139 × 0.270 × 1.000 m** (root scale 0.52489 baked in matrix) | 🟢 Realistic rifle cross-section (27 cm tall, 14 cm wide) — big improvement over v0.1's 0.62 × 0.28 m. Length exporter-normalized to 1 m; carbine target ≈ 0.82 m |
| Long axis | **+Z** (v0.1 was +X) | 🟡 Engine convention is muzzle → +X; one rotation in the Blender pass |
| Pivot | Bounding-box center = world origin (root translation exactly cancels the scaled bbox center) | 🟡 Same as v0.1 — needs grip-point origin for FPS use |
| Hierarchy | `(unnamed root, matrix)` → `world` → `tmpkuy_gy75obj` (**1 mesh, 1 primitive, 1 material**) | 🟢 Single weapon object, no loose scene parts · 🔴 temp names, no rotor/mag separation, no sockets |
| Connectivity | One mesh/primitive at container level. Internal shell-island count not verifiable from JSON (needs index-adjacency; run Blender `Select Linked` / `Separate by Loose Parts` as a check) | 🟡 Verify in checklist step 4 |
| Attributes | POSITION + NORMAL + TEXCOORD_0, UVs in 0–1 shell (max 0.962/0.9999) | 🟢 Complete vertex data |
| Materials | 1 × `pbr_material`: baseColor (18.9 MB PNG) + metallicRoughness (12.1 MB PNG), factors = 1 | 🟡 Single slot; blocks emissive `#58B7E6` energy tinting until split |
| Normal map | **None** | 🟡 All detail is geometry — the bake pass recovers it |
| Animations / skins / extensions | None | 🟢 Expected |
| Shading (inferred) | Smooth-welded recon surface (verts/tris ≈ 0.51); no marked sharps | 🟡 Mechanical edges will read soft until weighted-normals pass |

## 3. Delta vs v0.1 (`Hitem3d-1784196174775.glb`)

| Metric | v0.1 | v0.2 | Δ |
|---|---|---|---|
| Triangles | 1,993,858 | 1,994,356 | ≈ same (+498) |
| Vertices | 1,031,635 | 1,015,525 | −16,110 (cleaner welding) |
| File | 94.2 MB | 87.5 MB | −6.7 MB |
| Textures | 37.2 MB | 31.1 MB | −6.1 MB |
| World size | 1.000 × 0.621 × 0.278 m (X-long) | 0.139 × 0.270 × 1.000 m (Z-long) | Proportions now read as a real carbine |

**v0.2 supersedes v0.1 as the bake source.** Same detail budget, tighter proportions, smaller payload. Keep v0.1 archived; do not delete.

## 4. Suitability verdict

As a **source/high-poly asset** — accepted. Single weapon object with production-plausible proportions and full vertex data: suitable for the optimization pipeline (retopo → bake → split materials → LODs).
As a **runtime asset** — not yet, same as v0.1: ~13× over triangle budget, bbox-center pivot, Z-forward axis, single material (no emissive slot), no separated `VortexRifle_Rotor`. Normal production flow, not a defect.

## 5. Runtime derivative (2026-07-17 milestone)

State when this milestone started: `public/v2-art/` held **no** vortex GLB — the v0.1-derived preview was archived as `vortex-rifle_preview-v0.1_BROKEN-multipart-needs-reexport.glb` (multipart bake-layout grid, see manifest.ts's Phase 4.1 note), so both consumers of the `vortex-rifle` slot (landing `WeaponShowpiece` @ scale 0.68, `/v2/range` `VortexViewmodel` @ scale 0.42) rendered `ProceduralAeolus`. One slot serves both contexts; no second slot required.

```powershell
# 1. Archive the source (read-only forever; .gitignore already excludes WindArms Assets/**/*.glb):
copy "<downloads>\Hitem3d-1784224974921.glb" "WindArms Assets\Weapons\VortexRifle\vortex_v0.2_source.glb"
node tools/inspect-glb.mjs "WindArms Assets/Weapons/VortexRifle/vortex_v0.2_source.glb" --target showpiece   # expect FAILs — it's the high-poly

# 2. One-time toolchain:
npm i -D @gltf-transform/cli@4

# 3. Build the derivative (LOD0 ≈140k tris + LOD1 ≈56k, webp≤2048, draco,
#    +90°Y bake so muzzle faces +X; backs up any existing outputs; source untouched):
node tools/make-vortex-runtime.mjs "WindArms Assets/Weapons/VortexRifle/vortex_v0.2_source.glb"

# 4. Gate the outputs:
node tools/inspect-glb.mjs "public/v2-art/vortex-rifle.glb" --target showpiece
node tools/inspect-glb.mjs "public/v2-art/vortex-rifle.lod1.glb" --target viewmodel
```

The builder does NOT bake scale — the 1.000 m long axis is preserved so the tuned engine-side scales (0.68 / 0.42) keep working. If the muzzle points backwards in-engine, re-run step 3 with `--muzzle -z`.

**Render proof (Step 8):** DONE. A temporary `PipelineDebugProbe` (dev console logs `[render-proof:*] drawCalls/renderedTris/realVortexNode` every 2s) was mounted in `AeolusShowpiece.tsx` and `RangeScene.tsx` to confirm the real mesh — not the fallback — renders in both contexts, then removed once confirmed (never committed to begin with; see docs/decisions.md 2026-07-17). Permanent replacement: `useAssetPipeline.ts`'s dev-mode `[asset-pipeline]` logging (resolve start, real-asset-found-at-lodN, load timing) reports the same "is this real" signal on every load without a temporary component.

**Known limits, reported not hidden:** simplification is automatic decimation, not retopology (real bake pass remains §4 of the v0.1 report); single material `pbr_material` carries no accent/energy/tint name → the skin/accent tint system has nothing to target (blocker until the Blender material split); no normal map exists, so decimation costs some fine detail. The "both contexts share LOD0" limitation noted in an earlier draft of this section is resolved — see §7.

## 6. Shipped derivative — verified results (2026-07-17)

| Output | Tris | Verts | File | Textures | Gate |
|---|---|---|---|---|---|
| `public/v2-art/vortex-rifle.glb` (LOD0) | **139,598** (from 1,994,356 — ratio 0.07) | 80,289 | **0.84 MB** (from 87.5 MB) | 2 × WebP, 0.35 MB | showpiece PASS |
| `public/v2-art/vortex-rifle.lod1.glb` (LOD1) | **55,834** | 33,573 | **0.57 MB** | 2 × WebP | viewmodel PASS |

Orientation: **muzzle +X, top +Y** — baked as a TRS rotation quaternion on the root node (world size 1.000 × 0.270 × 0.139 m, X-long). An apparent Z-long reading from `inspect-glb.mjs` was a bug in the *inspector* (it ignored node rotations); fixed 2026-07-17 with full transform accumulation — see decisions.md. The GLB was never re-rotated. Loaded node names in-engine: `VortexRifle_LOD0` on the landing hero, `VortexRifle_LOD1` in `/v2/range` (see §7) — render-proof-confirmed in both; fallback no longer renders in either.

Presentation: hero stage uses **display scale 2.9** (≈85% of the approved procedural-fallback footprint; derivation in `visualConfigs.ts` and decisions.md); physical scale 0.68 remains canon for physical contexts; FP viewmodel keeps its own `VIEWMODEL_SCALE` (0.42). Method on record: **automatic meshopt decimation — not retopology**; the professional bake pass (§4, v0.1 report) is still the path to v1.0.

## 7. LOD routing and validation budget fix (2026-07-17 cleanup)

Both runtime derivatives shipped in §6 from day one; what changed here is which consumer loads which one, and whether the pipeline's own validator agreed either was acceptable.

**LOD routing.** `/v2/range`'s `VortexViewmodel.tsx` was loading LOD0 (139,598 tris — the showpiece tier) instead of LOD1 (55,834 tris — the tier built for it), because nothing was asking for LOD1 specifically: `useResolveModelSlot` only ever picked a tier from the global render-quality store, and quality defaults to `'high'` → LOD0 for every consumer. Fixed by adding `requestedLod` end to end: `PipelineModel`'s new `requestedLod` prop → `useResolveModelSlot(slot, { requestedLod })` → `resolveModel(slot, requestedLod ?? qualityDefault)`. `VortexViewmodel.tsx` passes `requestedLod={1}`; `WeaponShowpiece.tsx` (the landing hero) passes nothing and keeps its existing quality-driven default — same `vortex-rifle` slot, same manifest entry, two tiers, no duplicated asset definition.

**Validation budget.** `manifest.ts`'s `vortex-rifle` entry had `budget.maxTriangles: 18000` — the generic `__template` placeholder, copy-pasted when the entry was first created (before either runtime derivative existed) and never revisited. Every load logged a false `[asset-pipeline] Vortex Rifle: 139598 triangles exceeds budget of 18000` error despite the asset correctly passing its real gate (`tools/inspect-glb.mjs --target showpiece/viewmodel`). Fixed with a new `budgetByLod` field on `AssetManifestEntry`, checked against whichever LOD tier actually resolved (`validateAsset` now takes a `lod` parameter): `budget` (default/LOD0) is 150,000 tris, `budgetByLod[1]` is 60,000 — the same numbers the inspector already used.

Note this budget check is *not* a mismatch detector on its own: it validates whichever tier actually resolved against that same tier's own budget, which it passes by definition — a `/v2/range` load that silently fell back to LOD0 would check 139,598 tris against the 150k *default* budget (since `budgetByLod` has no entry for LOD0) and pass, not fail. Request-vs-resolution mismatch is a separate, deliberately independent check in `useResolveModelSlot` (see decisions.md 2026-07-17, "LOD mismatch detection is a separate check from budget validation") — a dev-only `console.warn` fired when a call site passes `requestedLod` and the resolved tier doesn't match it, orthogonal to whether the resolved tier's own budget passes.

**Socket/clip warnings.** `requiredSockets`/`requiredClips` on the `vortex-rifle` entry listed the v1.0 target set even though no current consumer reads a socket or clip on this asset (fire/reload/muzzle-flash all use fixed offsets in code) — so every load warned about gaps nothing was blocked on. Emptied both to `[]` (true today) and moved the target set to new `plannedSockets`/`plannedClips` fields — informational only, never validated, promoted to `required*` once a Blender-authored v1.0 asset actually has a consumer reading them.

## 8. Path to v1.0

The 15-step Blender checklist in [vortex-rifle-v0.1.md](vortex-rifle-v0.1.md) §4 applies unchanged to v0.2, with two amendments:

- **Step 3 (axis):** v0.2 is Z-long — rotate so the muzzle faces **+X**, top **+Y**, then apply rotation.
- **Step 4 (cleanup):** also run `Select Linked` / `Separate by Loose Parts` to confirm single-shell connectivity flagged above; re-merge or delete floaters only if invisible.
