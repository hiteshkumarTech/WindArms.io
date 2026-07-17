import type { ClipName } from '@/lib/v2/pipeline';
import type { OperatorContent } from '@/lib/v2/content/operators';
import type { WindWeaponId } from '@shared/windWeapons';

/**
 * WindArms V2 — operator architecture, type contract (Phase 5, 2026-07-17).
 *
 * The character-side equivalent of the weapon layering established in
 * src/lib/v2/weapons/types.ts — same separation, one row added:
 *
 *   Identity / roster copy    → src/lib/v2/content/operators.ts (OperatorContent — canon per docs/gameplay/operators.md, IMPORTED here, never forked)
 *   Asset validation          → src/lib/v2/pipeline/manifest.ts (AssetManifestEntry, category 'operator')
 *   Character configuration   → this folder (OperatorDefinition and friends)
 *   Materials / tinting       → src/lib/v2/pipeline/materials.ts (applyAccentTint — reused, not duplicated)
 *   Sockets (extraction)      → src/lib/v2/pipeline/sockets.ts + this folder's bone-fallback layer
 *   Animation (extraction)    → src/lib/v2/pipeline/animationClips.ts; playback in src/components/three/operators/hooks/
 *   Rendering                 → src/components/three/operators/ (OperatorModel + rigs)
 *   Showcase (DOM+Canvas)     → src/components/v2/operators/OperatorShowcase.tsx
 *
 * DELIBERATELY ABSENT (per "no invented gameplay"): abilities, cooldowns,
 * health, movement stats, balance numbers. docs/gameplay/operators.md
 * confirms none of that is designed yet — when it is, it gets its own
 * config block here following shared/windWeapons.ts's `gameplayStats`
 * precedent (optional fields, absence = "not yet decided", never zero).
 */

/** Roster ids — must match `OperatorContent.id` in content/operators.ts (canon). */
export type OperatorId = 'kael' | 'veyra';

/**
 * Typed attachment points on an operator rig. A GLB advertises one by
 * containing an empty named `socket_<id>` (see sockets.ts for the node-name
 * builder and per-socket humanoid bone fallbacks used when a rig ships
 * without authored empties).
 */
export type OperatorSocketId =
  | 'head'
  | 'neck'
  | 'spine'
  | 'pelvis'
  | 'left_hand'
  | 'right_hand'
  | 'left_foot'
  | 'right_foot'
  | 'weapon_primary'
  | 'weapon_secondary'
  | 'back'
  | 'belt'
  | 'grenade'
  | 'camera_fp'
  | 'camera_tp'
  | 'muzzle_reference';

/**
 * Every animation state the operator system supports. Adding a state later
 * = extend this union + the policy/clip tables in animations.ts — the
 * compiler then surfaces every site that needs a decision. Components never
 * hardcode state lists.
 */
export type OperatorAnimationState =
  | 'idle'
  | 'walk'
  | 'sprint'
  | 'ads'
  | 'fire'
  | 'reload'
  | 'inspect'
  | 'equip'
  | 'unequip'
  | 'jump'
  | 'fall'
  | 'land'
  | 'death'
  | 'victory'
  | 'lobby_idle'
  | 'selection_pose';

/** How a state's clip loops. `clamp` = play once and hold the final frame (death, selection pose). */
export type OperatorLoopMode = 'repeat' | 'once' | 'clamp';

/** Binds one animation state to a GLB clip plus its playback policy. */
export interface OperatorClipBinding {
  /**
   * Clip name looked up (case-insensitively) on the loaded GLB. Defaults to
   * the state's own name (see DEFAULT_CLIP_FOR_STATE) — override per
   * operator when a rig ships differently-named clips (e.g. Mixamo exports).
   */
  clip: ClipName | string;
  loop: OperatorLoopMode;
  /** Crossfade-in seconds when transitioning INTO this state. */
  fadeInS: number;
  /** Playback speed multiplier. Omit for 1. */
  timeScale?: number;
  /** For one-shots: state to auto-transition to when the clip finishes (e.g. jump → fall, reload → idle). Omit to hold/stop per `loop`. */
  returnTo?: OperatorAnimationState;
}

/** Complete state→clip mapping for one operator. Built via buildDefaultAnimationConfig() and overridden per rig only where needed. */
export interface OperatorAnimationConfig {
  clips: Record<OperatorAnimationState, OperatorClipBinding>;
}

/** Local-space offset applied on top of a resolved socket node. */
export interface OperatorSocketOffset {
  position?: [number, number, number];
  /** Euler XYZ, radians. */
  rotationEuler?: [number, number, number];
}

/** Per-socket resolution overrides for one operator's rig. */
export interface OperatorSocketBinding {
  /** Exact GLB node name to use instead of the `socket_<id>` convention. */
  node?: string;
  /** Ordered bone-name candidates (case-insensitive) to fall back to when no socket empty exists — overrides sockets.ts's DEFAULT_BONE_FALLBACKS for this socket. */
  fallbackBones?: string[];
  offset?: OperatorSocketOffset;
}

/**
 * Attachment configuration for one operator. Sparse by design: an empty
 * object means "resolve every socket via the `socket_<id>` convention, then
 * the shared humanoid bone fallbacks" — which is the expected steady state
 * for rigs authored to our Blender checklist.
 */
export type OperatorAttachmentConfig = Partial<Record<OperatorSocketId, OperatorSocketBinding>>;

/** Skin rarity ladder. Presentation/economy tiering only — zero gameplay effect, matching v1's cosmetics-only precedent (shared/heroes.ts). */
export type OperatorSkinRarity = 'default' | 'rare' | 'epic' | 'legendary' | 'mythic';

export interface OperatorSkinDef {
  id: string;
  name: string;
  rarity: OperatorSkinRarity;
  /**
   * Accent recolor applied via the pipeline's existing applyAccentTint
   * (materials named "accent" / "energy" / "tint") — the same single-accent
   * model as v1's WeaponTint/HeroSkin. The cheap tier: no new assets.
   */
  accentTint?: string;
  /**
   * Full model swap for high tiers — a complete alternate GLB slot
   * (resolved through the same LOD pipeline). Absent = reuse the base model.
   */
  modelSlotOverride?: string;
}

/** Skin architecture for one operator. Ships with only the default skin until a real cosmetics pass exists — no fake skin entries. */
export interface OperatorSkinConfig {
  defaultSkinId: string;
  skins: OperatorSkinDef[];
}

/**
 * Visual presentation + model-space facts. The character-side sibling of
 * WeaponVisualConfig (src/lib/v2/weapons/types.ts) — "how does it present,"
 * never "what is it."
 */
export interface OperatorVisualConfig {
  /** Base model slot in the asset pipeline (LOD via `.lod1`/`.lod2` suffixes — see pipeline README). */
  slot: string;
  /** Dedicated first-person arms GLB slot (Phase 7 asset). Until it exists, FP arms-only mode filters the full-body model by mesh-name convention — see renderModes.ts. */
  fpArmsSlot: string;
  /**
   * Scale applied ONLY to the loaded real model, never the procedural
   * fallback (same rule as PipelineModel's `scale` prop). 1 until Phase 6's
   * GLB exists — then computed from the asset's measured world height ÷
   * targetHeightM (tools/inspect-operator.mjs reports world height; don't guess).
   */
  scale: number;
  /** Y offset correcting a model whose origin isn't at the feet. 0 for rigs authored to our checklist (feet at origin). */
  groundOffsetY: number;
  /** Presentation-convention character height, meters — the denominator for `scale` derivation and the FP eye-height estimate. A production convention, not lore. */
  targetHeightM: number;
  /** Three-quarter presentation angle (Y, radians) the silhouette reads clearest at — showcase/lobby default. */
  rotationBaseY: number;
  /** STORM-token hex for the showcase rim light — keeps the silhouette separated from the sky, same treatment as WeaponShowpiece. */
  rimLightColor: string;
  rimLightIntensity: { base: number; pulseAmplitude: number };
  /** Local offset (pre-scale) for the rim light in showcase framing. */
  rimLightOffset: [number, number, number];
}

/**
 * Identity metadata. `content` IS the canonical roster entry from
 * content/operators.ts (docs/gameplay/operators.md: "code is canon") —
 * referenced, never copied, so name/bio/accent can never drift between the
 * landing page and the character system. Fields here add only what the
 * roster entry doesn't carry.
 */
export interface OperatorMetadata {
  id: OperatorId;
  /** Canonical roster entry — name, role, bio, accent, 2D artSlot, monogram. */
  content: OperatorContent;
  /** Body build the rig/animation set is authored for. Operator 01 = male per the Phase 5 directive. */
  gender: 'male' | 'female';
  /** Typed link to the signature weapon (content.signatureWeapon is the display string; this is the machine id). */
  signatureWeaponId: WindWeaponId;
  /** Path to the production blueprint doc, once one exists (weapon precedent: docs/design/weapons/vortex-rifle.md). */
  blueprintDoc?: string;
}

/** The complete, self-contained description of one operator. Everything the runtime components need — they take an OperatorDefinition (or id) and nothing else. */
export interface OperatorDefinition {
  id: OperatorId;
  meta: OperatorMetadata;
  visual: OperatorVisualConfig;
  animation: OperatorAnimationConfig;
  attachments: OperatorAttachmentConfig;
  skins: OperatorSkinConfig;
}
