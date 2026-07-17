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

## 5. Pipeline placement (no asset modification)

```powershell
# Source of truth (versioned, never overwritten):
copy "<downloads>\Hitem3d-1784224974921.glb" "WindArms Assets\Weapons\VortexRifle\vortex_v0.2_source.glb"

# Gate:
node tools/inspect-glb.mjs "WindArms Assets\Weapons\VortexRifle\vortex_v0.2_source.glb" --target showpiece
```

Runtime slot `public/v2-art/vortex-rifle.glb` currently holds the v0.1-derived model. When a v0.2 derivative is approved, it replaces that file (source never ships):

```powershell
npx @gltf-transform/cli optimize "WindArms Assets\Weapons\VortexRifle\vortex_v0.2_source.glb" "public\v2-art\vortex-rifle.glb" --compress draco --texture-compress webp --texture-size 2048 --simplify 0.04
node tools/inspect-glb.mjs "public\v2-art\vortex-rifle.glb" --target showpiece
```

## 6. Path to v1.0

The 15-step Blender checklist in [vortex-rifle-v0.1.md](vortex-rifle-v0.1.md) §4 applies unchanged to v0.2, with two amendments:

- **Step 3 (axis):** v0.2 is Z-long — rotate so the muzzle faces **+X**, top **+Y**, then apply rotation.
- **Step 4 (cleanup):** also run `Select Linked` / `Separate by Loose Parts` to confirm single-shell connectivity flagged above; re-merge or delete floaters only if invisible.
