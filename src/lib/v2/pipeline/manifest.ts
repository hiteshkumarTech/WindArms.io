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
   * First real entry. Two runtime derivatives ship today, both from the
   * same accepted v0.2 source (WindArms Assets/Weapons/VortexRifle/
   * vortex_v0.2_source.glb, archived read-only) via `tools/make-vortex-runtime.mjs`:
   *   LOD0 public/v2-art/vortex-rifle.glb      — 139,598 tris, 0.84 MB — landing showpiece
   *   LOD1 public/v2-art/vortex-rifle.lod1.glb —  55,834 tris, 0.57 MB — /v2/range FP viewmodel
   * One slot serves both; `budgetByLod` below gates each tier separately,
   * and each consumer requests its own tier via `PipelineModel`'s
   * `requestedLod` (see `WeaponShowpiece.tsx` — no override, quality-driven
   * default — vs `VortexViewmodel.tsx` — `requestedLod={1}`). Full
   * derivation/verification trail: docs/forge/vortex-rifle-v0.2.md,
   * docs/decisions.md (2026-07-17 entries).
   *
   * `budget` below was `{ maxTriangles: 18000, ... }` until 2026-07-17 —
   * copy-pasted from `__template` back when this entry was created (before
   * any real asset existed) and never revisited once real numbers were
   * known, so every load logged a false "exceeds budget of 18000" error
   * despite the asset correctly passing its actual (showpiece/viewmodel)
   * gate in `tools/inspect-glb.mjs`. Fixed to the same 150k/60k numbers
   * that tool already used.
   *
   * `requiredSockets`/`requiredClips` are empty: true today, not aspirational
   * — no current consumer reads a socket or clip on this asset (fire/reload/
   * muzzle-flash all use fixed offsets in `VortexFireSystem.tsx`/
   * `VortexViewmodel.tsx`). The v0.1→v0.2 target set is preserved below as
   * `plannedSockets`/`plannedClips` — informational, never validated — so a
   * future Blender-authored v1.0 asset has a real checklist to promote
   * entries from, without today's automatic-decimation output warning on
   * every load for a gap nothing is currently blocked on.
   *
   * HISTORY (superseded, kept for the trail, see docs/decisions.md for full
   * detail): the v0.1 source produced a runtime GLB that loaded successfully
   * but turned out to be a multi-part bake-layout sheet, not one assembled
   * rifle (Phase 4.1, 2026-07-16) — archived at `WindArms Assets/Weapons/
   * VortexRifle/vortex-rifle_preview-v0.1_BROKEN-multipart-needs-reexport.glb`.
   * The v0.2 source (2026-07-17) is a single correctly-assembled mesh and
   * supersedes it; that finding no longer applies to what ships today.
   */
  'vortex-rifle': {
    slot: 'vortex-rifle',
    category: 'weapon',
    label: 'Vortex Rifle',
    requiredSockets: [],
    requiredClips: [],
    plannedSockets: ['socket_muzzle', 'socket_ejection', 'socket_magazine'],
    plannedClips: ['idle', 'fire', 'reload', 'inspect'],
    audioEvents: ['fire', 'reload', 'empty'],
    // Default/LOD0 — showpiece tier, matches tools/inspect-glb.mjs --target showpiece.
    budget: { maxTriangles: 150_000, maxMaterials: 6, maxTextureSize: 2048 },
    budgetByLod: {
      // LOD1 — viewmodel tier, matches tools/inspect-glb.mjs --target viewmodel.
      // This checks whichever tier actually resolved against ITS OWN budget —
      // it does not by itself detect a misrouted tier (an accidental LOD0
      // load in /v2/range would check 139,598 tris against the 150k default
      // above, not this one, and pass). Request-vs-resolution mismatch is a
      // separate, deliberate check in useResolveModelSlot — see its
      // `requestedLod` comparison and docs/decisions.md 2026-07-17.
      1: { maxTriangles: 60_000, maxMaterials: 6, maxTextureSize: 2048 },
    },
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
    // Corrected 2026-07-21 (Phase F, gate-finalization follow-up): the
    // accepted source (docs/forge/kael-v0.1-inspection.md) has zero
    // authored socket_* empties and zero approved animation clips — a
    // Mixamo autorig with valid humanoid bones, nothing more. Listing all
    // 7/16 as `required` was false ("expected to expose RIGHT NOW" per
    // this field's own doc comment) and just noise on every load. Bone-
    // fallback resolution (DEFAULT_BONE_FALLBACKS) is a real runtime
    // capability that keeps sockets working today WITHOUT authored empties
    // — it is not proof the empties exist, and required arm/hand bone
    // chains are validated separately by the Blender rig gate
    // (tools/blender/inspect-kael-rig.py) and tools/inspect-operator.mjs's
    // own bone-fallback checks, not by this list. Same treatment
    // `vortex-rifle`'s entry above already uses for the identical situation.
    requiredSockets: [],
    requiredClips: [],
    plannedSockets: [
      'socket_head',
      'socket_spine',
      'socket_pelvis',
      'socket_right_hand',
      'socket_left_hand',
      'socket_weapon_primary',
      'socket_camera_fp',
    ],
    plannedClips: [
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
