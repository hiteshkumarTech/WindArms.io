import type * as THREE from 'three';

/**
 * Core types for the WindArms V2 asset pipeline. See ./README.md for the
 * full naming convention and usage guide — this file is the type contract
 * every other module in this folder implements against.
 */

/** Level-of-detail tier, highest detail first. Mirrors useGraphicsStore's 2-tier quality signal 1:1 at the low end. */
export type LodLevel = 0 | 1 | 2;

/**
 * Canonical socket names. A GLB signals a socket by naming an empty
 * (Object3D with no mesh) exactly this. Extended 2026-07-17 (Phase 5,
 * operator architecture) with the full operator socket set — per this
 * union's own rule ("extend that union, don't invent ad hoc names").
 * `socket_hand_right`/`socket_hand_left` predate that set and are kept as
 * legacy aliases; new character rigs should author `socket_right_hand`/
 * `socket_left_hand` (see src/lib/v2/operators/sockets.ts, the canonical
 * operator-side list).
 */
export type SocketName =
  // Weapons
  | 'socket_muzzle'
  | 'socket_ejection'
  | 'socket_magazine'
  | 'socket_sight'
  | 'socket_grip_hand'
  | 'socket_grip_support'
  // Characters (legacy naming, pre-Phase 5)
  | 'socket_hand_right'
  | 'socket_hand_left'
  // Characters (canonical operator set — mirrors OperatorSocketId 1:1)
  | 'socket_head'
  | 'socket_neck'
  | 'socket_spine'
  | 'socket_pelvis'
  | 'socket_left_hand'
  | 'socket_right_hand'
  | 'socket_left_foot'
  | 'socket_right_foot'
  | 'socket_weapon_primary'
  | 'socket_weapon_secondary'
  | 'socket_back'
  | 'socket_belt'
  | 'socket_grenade'
  | 'socket_camera_fp'
  | 'socket_camera_tp'
  | 'socket_muzzle_reference';

/**
 * Canonical animation clip names a GLB's `animations[]` array may provide.
 * Unrecognized clip names are kept but flagged in validation. Extended
 * 2026-07-17 (Phase 5) with the operator locomotion/presentation set —
 * mirrors OperatorAnimationState (src/lib/v2/operators/animations.ts) 1:1.
 */
export type ClipName =
  | 'idle'
  | 'fire'
  | 'reload'
  | 'inspect'
  | 'sprint'
  | 'ads'
  | 'equip'
  | 'unequip'
  | 'walk'
  | 'jump'
  | 'fall'
  | 'land'
  | 'death'
  | 'victory'
  | 'lobby_idle'
  | 'selection_pose';

/** Which asset category a manifest entry describes — drives which validation rules apply. */
export type AssetCategory = 'weapon' | 'operator' | 'map' | 'vehicle' | 'ui';

export interface AssetBudget {
  /** Hard cap, triangles, at LOD 0. */
  maxTriangles: number;
  /** Hard cap, individual material count. */
  maxMaterials: number;
  /** Hard cap, texture dimension (width or height), px. */
  maxTextureSize: number;
}

export interface AssetManifestEntry {
  /** Matches the `{slot}` token in every filename this asset resolves — see README naming convention. */
  slot: string;
  category: AssetCategory;
  /** Human label, for dev-tool / validator output only — never shown to players. */
  label: string;
  /** Sockets this asset is expected to expose. Missing ones are a validation warning, not a hard failure. */
  requiredSockets: SocketName[];
  /** Animation clips this asset is expected to expose. Missing ones are a validation warning. */
  requiredClips: ClipName[];
  /** Audio events this asset may ship real audio for (see README "Audio" section). Falls back to procedural synthesis per event when absent. */
  audioEvents: string[];
  budget: AssetBudget;
}

export interface SocketEntry {
  name: SocketName | string;
  /** Live reference into the loaded scene graph — read `.matrixWorld` each frame, don't cache position/rotation snapshots. */
  object3D: THREE.Object3D;
}

/** Sockets found on a loaded asset, keyed by name for O(1) lookup; iterate `.all` for validation/debug listing. */
export interface SocketMap {
  all: SocketEntry[];
  get(name: SocketName | string): THREE.Object3D | undefined;
}

export interface AnimationClipMap {
  all: THREE.AnimationClip[];
  get(name: ClipName | string): THREE.AnimationClip | undefined;
}

export type ValidationSeverity = 'error' | 'warning';

export interface ValidationIssue {
  severity: ValidationSeverity;
  code:
    | 'missing-socket'
    | 'missing-clip'
    | 'triangle-budget-exceeded'
    | 'material-budget-exceeded'
    | 'texture-budget-exceeded'
    | 'unnamed-material';
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

/** What `useAssetPipeline` hands back to a consumer component. */
export interface PipelineAssetResult {
  /** Null while loading, or when no GLB exists at any LOD and no procedural fallback was requested. */
  scene: THREE.Group | null;
  sockets: SocketMap;
  clips: AnimationClipMap;
  /** True when `scene` came from a resolved GLB; false when nothing resolved (consumer should render its own procedural fallback). */
  isReal: boolean;
  /** Which LOD actually resolved (may be lower than requested if higher tiers are missing). */
  resolvedLod: LodLevel | null;
  loading: boolean;
  validation: ValidationResult | null;
}
