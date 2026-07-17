# WindArms Forge — Quality Checklist

The bar an asset must clear before it moves from `WindArms Assets/` into the real pipeline (`public/v2-art/`). Every rule here traces to something already real — the pipeline's actual budgets/conventions ([`src/lib/v2/pipeline/`](../../src/lib/v2/pipeline/)) or the Art Bible's actual rules ([`docs/design/art-bible.md`](../design/art-bible.md)) — nothing here is a new, competing standard.

## Naming

- [ ] Asset slot is lowercase-kebab-case (`vortex-rifle`, not `VortexRifle` or `vortex_rifle`) — matches [`docs/technical/naming-conventions.md`](../technical/naming-conventions.md)'s existing art-slot rule.
- [ ] Sockets are named exactly from the recognized set (`socket_muzzle`, `socket_ejection`, `socket_magazine`, `socket_sight`, `socket_grip_hand`, `socket_grip_support`, `socket_hand_right`, `socket_hand_left`, `socket_head`, `socket_spine`) — see [`src/lib/v2/pipeline/types.ts`](../../src/lib/v2/pipeline/types.ts)'s `SocketName`. No ad hoc socket names.
- [ ] Animation clips are named exactly from the recognized set (`idle`, `fire`, `reload`, `inspect`, `sprint`, `ads`, `equip`, `unequip`) — case-insensitive but spelled exactly, see `ClipName`.
- [ ] Materials are named descriptively, never left as `Material.001`-style defaults — required for tinting (`applyAccentTint` matches on material name containing `accent`/`energy`/`tint`) and for the material audit tool to report anything useful.

## Pivot

- [ ] Weapons: pivot at the grip, not the geometric center — this is what the character rig's hand socket will align to.
- [ ] Characters/operators: pivot at the feet/ground contact point.
- [ ] Props: pivot at the base center (where it would touch a floor), unless the prop is meant to hang/mount, in which case pivot at the mount point.
- [ ] All transforms applied (`Ctrl+A` → All Transforms) before export — an un-applied rotation/scale is the single most common cause of an asset looking correct in Blender and wrong in-engine.

## Scale

- [ ] Modeled in real-world meters, 1 Blender unit = 1 meter (matches this project's existing convention — see weapon dimensions in [`docs/design/weapons/vortex-rifle.md`](../design/weapons/vortex-rifle.md) §5, given in cm/meters directly).
- [ ] Checked against a human-scale reference (a 1.8 m capsule/cube placed in-scene) before export — per the Art Bible §26 Scale Reference, environment pieces should read as monumental, not human-scaled; weapons and equipment should not.

## Topology

- [ ] No n-gons on any surface that deforms (character/rig-adjacent geometry) — quads only there.
- [ ] No unnecessary geometry hidden inside a mesh (interior faces never seen by the camera) — delete, don't just hide.
- [ ] Hard edges get real edge loops or a bevel, not just a shading-only "fake" hard edge, for silhouette read at the Art Bible's readability requirement (§11, §29).

## Materials

- [ ] Every material traces to the Art Bible's six-material library (Marble Stone, Titanium, Brushed Steel, Glass Crystal, Energy Core, Ancient Alloy — [`art-bible.md`](../design/art-bible.md) §5) or is flagged as a proposed new material, not invented silently.
- [ ] Every color traces to a `STORM` token ([`src/lib/v2/tokens.ts`](../../src/lib/v2/tokens.ts)) — no unlisted hex values. Run the material audit (`auditMaterials()` in [`src/lib/v2/pipeline/materials.ts`](../../src/lib/v2/pipeline/materials.ts)) once this asset is loadable.
- [ ] Material count within category budget (see Triangle budget table below — same source, `maxMaterials`).

## Textures

- [ ] Texture dimensions within category budget (2048px for weapons/operators/maps/vehicles, 1024px for UI — see budget table below).
- [ ] Power-of-two dimensions (512/1024/2048), no odd sizes.
- [ ] Prefer material-driven color (no texture) over a texture where the Art Bible's material language allows it — matches this project's existing v1 precedent of baked vertex-color jitter instead of texture maps ([`docs/technical/architecture.md`](../technical/architecture.md)).

## Triangle budget

Category budgets are real and already enforced by [`src/lib/v2/pipeline/validation.ts`](../../src/lib/v2/pipeline/validation.ts) via [`manifest.ts`](../../src/lib/v2/pipeline/manifest.ts)'s `DEFAULT_BUDGETS` — check against these before export, don't wait for the pipeline to reject it. Check a real exported `.glb` immediately with `node scripts/inspect-glb.mjs <path> <category>` (no browser needed) — it reports real triangle count, material/texture count, texture dimensions, bounding box, and flags budget overruns directly.

| Category | Max triangles | Max materials | Max texture size |
|---|---|---|---|
| Weapon | 18,000 | 6 | 2048px |
| Operator | 45,000 | 10 | 2048px |
| Map | 250,000 | 40 | 2048px |
| Vehicle | 60,000 | 12 | 2048px |
| UI | 4,000 | 2 | 1024px |

- [ ] LOD1 is meaningfully lower triangle count than LOD0 (a rough target: ~40% of LOD0), not a copy with a different filename.
- [ ] LOD2 (if present) is meaningfully lower than LOD1.

## GLB export

- [ ] Exported as `.glb` (binary, single file — not `.gltf` + separate `.bin`/textures), matching [`src/lib/v2/pipeline/README.md`](../../src/lib/v2/pipeline/README.md)'s expected format.
- [ ] Filename follows the LOD convention exactly: `{slot}.glb` (LOD0), `{slot}.lod1.glb`, `{slot}.lod2.glb`.
- [ ] Animations included in the export (check the exporter's "Animation" toggle — easy to accidentally leave off).
- [ ] Re-imported and visually checked once, in Blender or a GLB viewer, straight after export — catches axis/scale export mistakes before they reach the pipeline.

## File organization

- [ ] Lives under `WindArms Assets/<Category>/<Asset Name>/` following [`WindArms Assets/README.md`](../../WindArms%20Assets/README.md)'s structure (Reference/, Concept Sheets/, Blender/, Export/, Textures/, Audio/ as applicable).
- [ ] `.blend` source file kept in `Blender/`, never deleted after export — the export is derived, the source is canonical.
- [ ] Only `Export/`'s contents are ever copied into `public/v2-art/` — nothing else in the asset's folder should end up in the runtime pipeline.

## Asset preview

- [ ] A rendered thumbnail/preview image exists (even a simple Blender viewport screenshot) before the asset is considered submission-ready — this is what a future `AssetCard`/`AssetPreview` component ([`src/components/forge/`](../../src/components/forge/)) would eventually display.
- [ ] Preview shows the asset from the Art Bible §2's composition angle where applicable (three-quarter front-left, camera slightly below centerline) for consistency with existing key art.
