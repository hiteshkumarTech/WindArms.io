/**
 * WindArms Forge — quality checklist as data. STUB ONLY, per
 * docs/forge/README.md: no production logic, interfaces and TODOs only.
 * `ChecklistCategory` mirrors docs/forge/quality-checklist.md's section
 * headers exactly — keep them in sync if that doc's sections change.
 */

export type ChecklistCategory =
  | 'naming'
  | 'pivot'
  | 'scale'
  | 'topology'
  | 'materials'
  | 'textures'
  | 'triangle-budget'
  | 'glb-export'
  | 'file-organization'
  | 'asset-preview';

export interface ChecklistItem {
  id: string;
  category: ChecklistCategory;
  label: string;
  /** null = not yet checked. */
  passed: boolean | null;
  notes?: string;
}

export interface AssetChecklist {
  assetSlot: string;
  items: ChecklistItem[];
  /** ISO 8601 timestamp, set once every item passes. */
  completedAt?: string;
}

// TODO: implement — generate a full AssetChecklist from
// docs/forge/quality-checklist.md's canonical item list, all items unchecked.
export function createChecklistForAsset(assetSlot: string): AssetChecklist {
  throw new Error('assetChecklist.createChecklistForAsset: not implemented — WindArms Forge is scaffolding only.');
}

// TODO: implement — set one item's pass/fail state, return the updated checklist.
export function markChecklistItem(
  checklist: AssetChecklist,
  itemId: string,
  passed: boolean,
  notes?: string,
): AssetChecklist {
  throw new Error('assetChecklist.markChecklistItem: not implemented — WindArms Forge is scaffolding only.');
}

// TODO: implement — true only when every item's `passed` is `true`.
export function isChecklistComplete(checklist: AssetChecklist): boolean {
  throw new Error('assetChecklist.isChecklistComplete: not implemented — WindArms Forge is scaffolding only.');
}
