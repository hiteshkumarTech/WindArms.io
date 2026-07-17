import type { OperatorDefinition, OperatorId, OperatorSkinDef } from './types';

/**
 * Slot-name builders for operator assets — the single place the operator
 * filename convention is spelled (Phase 5, 2026-07-17). All slots follow
 * the pipeline's flat lowercase-kebab rule under public/v2-art/, with LOD
 * handled by the pipeline's own `.lod1`/`.lod2` suffixes (see
 * src/lib/v2/pipeline/README.md):
 *
 *   operator-kael.glb            ← LOD0 full body
 *   operator-kael.lod1.glb       ← LOD1
 *   operator-kael.lod2.glb       ← LOD2
 *   operator-kael-arms.glb       ← dedicated first-person arms (Phase 7)
 *   operator-kael-skin-<id>.glb  ← full-model skin override (legendary+)
 *
 * NOTE the deliberate split from the 2D convention: content/operators.ts's
 * `artSlot` ('operator-1', 'operator-2') is the numbered 2D CARD art slot
 * that predates this system and stays untouched; 3D model slots are keyed
 * by roster id, which reads better in the console and never renumbers.
 */

export function operatorModelSlot(id: OperatorId): string {
  return `operator-${id}`;
}

export function operatorArmsSlot(id: OperatorId): string {
  return `operator-${id}-arms`;
}

export function operatorSkinModelSlot(id: OperatorId, skinId: string): string {
  return `operator-${id}-skin-${skinId}`;
}

/**
 * Resolves which model slot a given skin renders: the skin's explicit
 * modelSlotOverride if set, else the operator's base slot. Accent-tint-only
 * skins (the common case) intentionally reuse the base model + pipeline
 * tinting, costing zero extra downloads.
 */
export function resolveOperatorModelSlot(def: OperatorDefinition, skin?: OperatorSkinDef): string {
  return skin?.modelSlotOverride ?? def.visual.slot;
}
