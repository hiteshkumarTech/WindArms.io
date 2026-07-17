/**
 * WindArms Forge — naming validation. STUB ONLY, per docs/forge/README.md:
 * no production logic, interfaces and TODOs only. Once implemented, this
 * should enforce exactly the convention already documented in
 * src/lib/v2/pipeline/README.md and docs/forge/quality-checklist.md's
 * Naming section — not a second, competing naming standard.
 */

export interface NamingRuleResult {
  valid: boolean;
  errors: string[];
}

// TODO: implement — validate a slot is lowercase-kebab-case, matching
// docs/technical/naming-conventions.md's art-slot rule.
export function validateSlotName(name: string): NamingRuleResult {
  throw new Error('assetNaming.validateSlotName: not implemented — WindArms Forge is scaffolding only.');
}

// TODO: implement — validate a socket name against src/lib/v2/pipeline/types.ts's SocketName union.
export function validateSocketName(name: string): NamingRuleResult {
  throw new Error('assetNaming.validateSocketName: not implemented — WindArms Forge is scaffolding only.');
}

// TODO: implement — validate an animation clip name against ClipName (case-insensitive).
export function validateClipName(name: string): NamingRuleResult {
  throw new Error('assetNaming.validateClipName: not implemented — WindArms Forge is scaffolding only.');
}

// TODO: implement — build a pipeline-ready filename for a given slot/LOD/extension,
// e.g. buildAssetFilename('vortex-rifle', 1, 'glb') -> 'vortex-rifle.lod1.glb'.
export function buildAssetFilename(slot: string, lod: 0 | 1 | 2, extension: string): string {
  throw new Error('assetNaming.buildAssetFilename: not implemented — WindArms Forge is scaffolding only.');
}
