# Vortex Rifle — v0.1 Blockout Inspection Report

**File:** `Hitem3d-1784196174775.glb` · **Status:** v0.1 source asset (accepted, NOT web-ready) · **Superseded as bake source by [v0.2](vortex-rifle-v0.2.md) (2026-07-17); keep archived**
**Inspected:** parsed from the GLB's embedded glTF JSON chunk (exporter: THREE.GLTFExporter r178 — Hitem3d image-to-3D pipeline).
**Rule of this asset:** silhouette is canon. All work below refines; nothing remodels.

## 1. Import verification

Valid glTF 2.0 GLB, single scene, no required extensions (no Draco/KTX2/meshopt) — loads in our `useGLTF` pipeline with zero loader configuration. Not render-tested in this session; structural validity is confirmed from the container and JSON.

## 2. Findings

| Property | Value | Assessment |
|---|---|---|
| File size | **~94.2 MB** (geometry 56.9 MB + textures 37.2 MB) | 🔴 ~19× over showpiece budget (5 MB) — blocks web use as-is |
| Triangles | **1,993,858** (1,031,635 verts, uint32 indices) | 🔴 ~13× showpiece budget (150k), ~33× viewmodel (60k) |
| World size | **1.000 × 0.621 × 0.278 m** (root scale 0.5631 baked in matrix) | 🟡 Exporter-normalized to 1 m length; carbine target ≈ 0.80–0.85 m |
| Pivot | Bounding-box center ≈ world origin (root matrix re-centers it) | 🟡 Wrong for FPS — needs grip-point origin + axis convention |
| Hierarchy | `(unnamed root, matrix)` → `world` → `tmp6jvgfipsobj` (1 mesh, 1 primitive) | 🔴 Temp names; no part separation (no rotor, no mag, no sockets) |
| Attributes | POSITION + NORMAL + TEXCOORD_0, fully UV'd (0–1 shell) | 🟢 Complete vertex data |
| Materials | 1 × `pbr_material`: baseColor (22.4 MB PNG) + metallicRoughness (14.9 MB PNG), factors = 1 | 🟡 Single slot; likely 4K uncompressed PNGs |
| Normal map | **None** | 🟡 All detail is geometry — exactly why it's 2M tris |
| Animations / skins | None | 🟢 Expected for a blockout |
| Shading (inferred) | Smooth-welded recon surface (verts/tris ≈ 0.52); no marked sharps | 🟡 Mechanical edges will read soft under our directional light |

**Suitability verdict:** as a *source/high-poly asset* — accepted, good acquisition. As a *runtime asset* — not yet: too heavy for web delivery, pivot/axis unsuitable for a viewmodel, no articulated rotor for the Vortex's signature spin, single material prevents emissive energy tinting (`WIND_WEAPONS.vortex` accent `#58B7E6`). This is the classic high-poly → we now bake a game mesh from it. That is normal production flow, not a defect.

## 3. Pipeline placement (no asset modification)

```powershell
# Source of truth (never overwritten, versioned):
mkdir "WindArms Assets\Weapons\VortexRifle" -Force
copy "<downloads>\Hitem3d-1784196174775.glb" "WindArms Assets\Weapons\VortexRifle\vortex_v0.1_source.glb"

# Gate any derivative with the inspector:
node tools/inspect-glb.mjs "WindArms Assets\Weapons\VortexRifle\vortex_v0.1_source.glb" --target showpiece
```

Reserved runtime slot (AssetResolver convention): `public/v2-art/vortex.glb` — only optimized derivatives go here, never the source.

**Optional quick preview derivative without Blender** (acceptable quality loss for a first in-engine look):

```powershell
npx @gltf-transform/cli optimize "WindArms Assets\Weapons\VortexRifle\vortex_v0.1_source.glb" "public\v2-art\vortex.glb" --compress draco --texture-compress webp --texture-size 2048 --simplify 0.04
node tools/inspect-glb.mjs "public\v2-art\vortex.glb" --target showpiece
```

(`--simplify 0.04` ≈ 80k tris. Our `useGLTF` handles Draco automatically.)

## 4. Blender checklist — v0.1 → v1.0 (silhouette-preserving)

1. **Import & apply transforms** — import GLB, `Ctrl+A → All Transforms` so the 0.5631 matrix scale becomes real geometry scale (scale = 1.0).
2. **True scale** — uniform-scale length from 1.00 m to **0.82 m** (carbine class); verify grip fits a 9 cm hand span.
3. **Pivot & axis convention** — set object origin to the grip/trigger point; orient **muzzle toward +X, top toward +Y** (matches every WindArms procedural rifle). Apply rotation.
4. **Interior cleanup** — `Select Interior Faces` + manual pass for hidden shells/floaters from the AI recon; delete only invisible geometry (silhouette untouched).
5. **Duplicate: keep this cleaned 2M-tri mesh as `VortexRifle_HP`** — it is the bake source, never shipped.
6. **Retopo/decimate the copy** — Quad Remesher or Decimate (planar+collapse) to **~80k tris (`_LOD0` showpiece)** and **~25k (`_LOD1` future viewmodel)**. Preserve silhouette edges; sacrifice interior/occluded density first.
7. **Shading** — Auto Smooth ≈ 35° + Weighted Normals modifier; mark sharp along mechanical creases (rails, vents, barrel steps) so edges read crisp again.
8. **UV the low-poly** — seams along the marked sharps, single 0–1 atlas, ≥85% utilization.
9. **Bake HP → LP** — Normal (bake 4K, ship 2K), AO, and re-project the existing baseColor. This recovers the 2M-tri detail on the 80k mesh.
10. **Materials (2 slots max)** — `vortex_body` (baseColor/MR/normal/AO) + `vortex_emissive` (energy conduits, core — so the engine can pulse it and tint skins with `#58B7E6`).
11. **Articulate the signature part** — separate the turbine/spinner as child object **`VortexRifle_Rotor`** with its own centered pivot (the engine spins it, like the procedural guns).
12. **Sockets** — add empties `socket_muzzle`, `socket_grip`, `socket_eject` for tracer/VFX attachment.
13. **Naming hygiene** — collection `VortexRifle`; objects `VortexRifle_LOD0/1`, `_Rotor`; delete `tmp6jvgfipsobj`/`world` temp nodes.
14. **Export** — glTF Binary, +Y up, apply modifiers, no Blender-side compression → then post-compress: `npx @gltf-transform/cli optimize in.glb out.glb --compress draco --texture-compress webp --texture-size 2048`.
15. **Gate** — `node tools/inspect-glb.mjs public/v2-art/vortex.glb --target showpiece` must print all PASS (≤150k tris, ≤5 MB file, ≤8 MB textures).

## 5. Improvement suggestions (silhouette-safe)

Bevel-read via baked normals rather than geometry; emissive separation for the energy language; rotor articulation for the turbine identity; 2K WebP/KTX2 textures; grip-relative pivot for instant FPS mounting; delete internal shells (free 30–50% tris before any decimation cost is paid).
