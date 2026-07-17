import type { AssetBudget, AssetManifestEntry } from './types';

/**
 * Single operator budget object — referenced by both real operator entries
 * below AND by DEFAULT_BUDGETS.operator at the bottom of this file, so the
 * two can never drift. tools/inspect-operator.mjs mirrors these numbers as
 * its LOD0 gate (flagged there to keep in sync with this constant).
 */
const OPERATOR_BUDGET: AssetBudget = { maxTriangles: 45000, maxMaterials: 10, maxTextureSize: 2048 };

/**
 * The asset registry — one entry per slot. This is the single source of
 * truth `validation.ts` and `useAssetPipeline.ts` both read from: add an
 * entry here *before* dropping a GLB in, not after.
 *
 * Deliberately empty of real weapons/operators/maps — per the "build the
 * reusable foundation first" directive, this file ships with only the
 * template entry below. Copy its shape when a real asset is ready to be
 * wired in; delete the template once at least one real entry exists.
 */
export const ASSET_MANIFEST: Record<string, AssetManifestEntry> = {
  __template: {
    slot: '__template',
    category: 'weapon',
    label: 'Template — copy this entry, do not ship it',
    requiredSockets: ['socket_muzzle', 'socket_ejection', 'socket_magazine'],
    requiredClips: ['idle', 'fire', 'reload', 'inspect'],
    audioEvents: ['fire', 'reload', 'empty'],
    budget: { maxTriangles: 18000, maxMaterials: 6, maxTextureSize: 2048 },
  },
  /**
   * First real entry. Source: WindArms Assets/Weapons/VortexRifle/vortex_v0.1_source.glb
   * (archived, read-only). Optimized preview: public/v2-art/vortex.glb, currently
   * mounted only in the V2 showpiece (AeolusShowpiece.tsx) — not gameplay.
   *
   * Sockets/clips below are the real target for a shippable weapon, matching
   * __template — NOT a claim the current v0.1 preview has them. It doesn't.
   * Inspected 2026-07-16 with both `scripts/inspect-glb.mjs` and the repo's
   * own `tools/inspect-glb.mjs --target showpiece` (the latter is more
   * complete — walks the node hierarchy and reports real world-space bounds,
   * catch this manifest's own scale bug in AeolusShowpiece.tsx's first pass):
   * 0 socket_* nodes, 0 animation clips, no normal map, 1,993,858 triangles
   * (111x this weapon budget, also over the showpiece tool's more permissive
   * 150k budget), file size 5.30 MB (just over that tool's 5 MB showpiece
   * budget too). Validation will correctly report the budget/socket/clip gaps
   * — that's the point of listing the real target here rather than leaving it
   * empty.
   *
   * PHASE 4.1 FINDING (2026-07-16, see docs/decisions.md): this is NOT a
   * loader/pipeline bug — PipelineModel/useGLTF/DRACOLoader/EXT_texture_webp
   * all load and parse this exact file correctly (proven with a manual
   * GLTFLoader bypass, isolated PipelineModel timing, and node-level
   * inspection). It is genuinely slow (~2.3s best case, 10s+ competing with
   * a live render/physics loop) purely because of the triangle count, which
   * `useAssetPipeline.ts` now logs clearly in dev instead of looking silently
   * broken. BUT once loaded, the mesh (single node "tmp6jvgfipsobj") is
   * visually NOT one assembled rifle — rendered alone, fully isolated, with
   * both the original material and a plain shaded override, it reads as a
   * grid of roughly 10 separate weapon-part copies (consistent with an
   * intermediate UV-bake/layout sheet exported by mistake as the final
   * asset, not a finished prop). Decimating this file would decimate that
   * same grid, not produce a usable single weapon. This needs correction at
   * the export/authoring stage — re-export a single assembled mesh — before
   * decimation is even a meaningful next step. Until then, both consumers
   * (this showpiece and the V2 range's first-person viewmodel) correctly
   * keep showing `ProceduralAeolus`, which is not a placeholder standing in
   * for a bug — it is the better asset today.
   *
   * Because `PipelineModel` swaps fallback → real asset automatically once
   * loading finishes (correct, existing behavior — not touched here), and
   * this file WAS still sitting in `public/v2-art/` and DOES successfully
   * load given enough time (see above), leaving it in place meant any
   * visitor patient enough (~10-12s dwell, not unusual on a hero landing
   * page) would eventually see the broken multi-part mesh silently replace
   * the correct-looking fallback — a live regression nobody had actually
   * seen yet, just not waited long enough to trigger. Moved out of the
   * served path to `WindArms Assets/Weapons/VortexRifle/
   * vortex-rifle_preview-v0.1_BROKEN-multipart-needs-reexport.glb` (archived
   * alongside the original source, not deleted) so `resolveAsset` correctly
   * finds nothing and this slot permanently — not just today — resolves to
   * the fallback, exactly like any other not-yet-built slot. Restore it to
   * `public/v2-art/vortex-rifle.glb` once a real, single-mesh re-export
   * exists; no other code changes will be needed when that happens.
   */
  'vortex-rifle': {
    slot: 'vortex-rifle',
    category: 'weapon',
    label: 'Vortex Rifle',
    requiredSockets: ['socket_muzzle', 'socket_ejection', 'socket_magazine'],
    requiredClips: ['idle', 'fire', 'reload', 'inspect'],
    audioEvents: ['fire', 'reload', 'empty'],
    budget: { maxTriangles: 18000, maxMaterials: 6, maxTextureSize: 2048 },
  },
  /**
   * Operator entries (Phase 5, 2026-07-17). These describe the TARGET a
   * shippable operator GLB must hit — no operator GLB exists yet (Phase 6
   * delivers the first one), so until a file lands in public/v2-art/ these
   * entries validate nothing and the operator slots resolve to their
   * procedural silhouette fallback, exactly like any other empty slot.
   *
   * requiredSockets is the FPS-critical subset of the 16-socket operator
   * set (src/lib/v2/operators/sockets.ts) — the remaining sockets are
   * optional-but-recommended and reported by tools/inspect-operator.mjs.
   * requiredClips is the full 16-state set: every missing clip warns in
   * dev, which doubles as the outstanding-animation-work checklist.
   */
  'operator-kael': {
    slot: 'operator-kael',
    category: 'operator',
    label: 'Operator 01 — Kael Aurin',
    requiredSockets: [
      'socket_head',
      'socket_spine',
      'socket_pelvis',
      'socket_right_hand',
      'socket_left_hand',
      'socket_weapon_primary',
      'socket_camera_fp',
    ],
    requiredClips: [
      'idle',
      'walk',
      'sprint',
      'ads',
      'fire',
      'reload',
      'inspect',
      'equip',
      'unequip',
      'jump',
      'fall',
      'land',
      'death',
      'victory',
      'lobby_idle',
      'selection_pose',
    ],
    audioEvents: ['footstep', 'jump', 'land', 'death'],
    budget: OPERATOR_BUDGET,
  },
  'operator-veyra': {
    slot: 'operator-veyra',
    category: 'operator',
    label: 'Operator 02 — Veyra Solace',
    requiredSockets: [
      'socket_head',
      'socket_spine',
      'socket_pelvis',
      'socket_right_hand',
      'socket_left_hand',
      'socket_weapon_primary',
      'socket_camera_fp',
    ],
    requiredClips: [
      'idle',
      'walk',
      'sprint',
      'ads',
      'fire',
      'reload',
      'inspect',
      'equip',
      'unequip',
      'jump',
      'fall',
      'land',
      'death',
      'victory',
      'lobby_idle',
      'selection_pose',
    ],
    audioEvents: ['footstep', 'jump', 'land', 'death'],
    budget: OPERATOR_BUDGET,
  },
};

export function getManifestEntry(slot: string): AssetManifestEntry | undefined {
  return ASSET_MANIFEST[slot];
}

/** Category-default budgets, used when a slot has no manifest entry yet (e.g. during early iteration). Not a substitute for a real entry before shipping. */
export const DEFAULT_BUDGETS: Record<AssetManifestEntry['category'], AssetManifestEntry['budget']> = {
  weapon: { maxTriangles: 18000, maxMaterials: 6, maxTextureSize: 2048 },
  operator: OPERATOR_BUDGET,
  map: { maxTriangles: 250000, maxMaterials: 40, maxTextureSize: 2048 },
  vehicle: { maxTriangles: 60000, maxMaterials: 12, maxTextureSize: 2048 },
  ui: { maxTriangles: 4000, maxMaterials: 2, maxTextureSize: 1024 },
};
