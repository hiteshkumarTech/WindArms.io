import { OPERATORS, type OperatorContent } from '@/lib/v2/content/operators';
import { buildDefaultAnimationConfig } from './animations';
import { operatorArmsSlot, operatorModelSlot } from './assetSlots';
import type { OperatorDefinition, OperatorId, OperatorSkinDef } from './types';

/**
 * The operator registry — one OperatorDefinition per roster member
 * (Phase 5, 2026-07-17). Identity fields are REFERENCES into
 * content/operators.ts (canon per docs/gameplay/operators.md), never
 * copies; everything else is character-system configuration this file owns.
 *
 * No operator GLB exists yet (Phase 6 delivers the first). Every value
 * below is therefore either (a) canon roster data, (b) a documented
 * production convention, or (c) an explicit "recompute when the asset
 * lands" default — no fake asset facts.
 */

function requireContent(id: OperatorId): OperatorContent {
  const entry = OPERATORS.find((operator) => operator.id === id);
  if (!entry) {
    // Roster drift between content/operators.ts and this registry is a
    // build-breaking docs bug, not a runtime condition to paper over.
    throw new Error(`[operators] no content/operators.ts entry for id "${id}" — the registry and the canon roster have drifted.`);
  }
  return entry;
}

const DEFAULT_SKIN: OperatorSkinDef = { id: 'default', name: 'Default', rarity: 'default' };

const kaelContent = requireContent('kael');
const veyraContent = requireContent('veyra');

/**
 * OPERATOR 01 — Kael Aurin (male). The Phase 5 directive's first playable
 * operator: this single definition feeds FP hands, reload/inspect
 * animations, the lobby character, the hero page, skins, emotes, killcam
 * and the third-person model — all through the same components.
 */
const KAEL: OperatorDefinition = {
  id: 'kael',
  meta: {
    id: 'kael',
    content: kaelContent,
    gender: 'male',
    // content.signatureWeapon is the display string "Aeolus Rifle" — this
    // is its machine id in shared/windWeapons.ts.
    signatureWeaponId: 'aeolus',
  },
  visual: {
    slot: operatorModelSlot('kael'),
    fpArmsSlot: operatorArmsSlot('kael'),
    // 1 until the Phase 6 GLB exists — then measured world height ÷
    // targetHeightM via tools/inspect-operator.mjs (WeaponVisualConfig's
    // "computed, not guessed" precedent).
    scale: 1,
    groundOffsetY: 0,
    // Production convention for a male combat build — a scale/eye-height
    // reference, not lore (no canonical height exists in any doc).
    targetHeightM: 1.83,
    rotationBaseY: -0.42,
    rimLightColor: kaelContent.accent,
    rimLightIntensity: { base: 2.4, pulseAmplitude: 1.2 },
    rimLightOffset: [-0.9, 1.6, -1.1],
  },
  animation: buildDefaultAnimationConfig(),
  // Empty = resolve every socket via the `socket_<id>` convention, then the
  // shared humanoid bone fallbacks (sockets.ts). Populated per-rig only if
  // Phase 6's actual export deviates from the checklist.
  attachments: {},
  skins: { defaultSkinId: 'default', skins: [DEFAULT_SKIN] },
};

/** OPERATOR 02 — Veyra Solace (female). Defined now to prove the registry pattern holds beyond one entry; her GLB is a later phase. */
const VEYRA: OperatorDefinition = {
  id: 'veyra',
  meta: {
    id: 'veyra',
    content: veyraContent,
    gender: 'female',
    // Display string is "Vortex Carbine" (see the NAMING note in
    // shared/windWeapons.ts — 'vortex' is now "Vortex Rifle"); the machine
    // id is unambiguous either way.
    signatureWeaponId: 'vortex',
  },
  visual: {
    slot: operatorModelSlot('veyra'),
    fpArmsSlot: operatorArmsSlot('veyra'),
    scale: 1,
    groundOffsetY: 0,
    targetHeightM: 1.74,
    rotationBaseY: 0.38,
    rimLightColor: veyraContent.accent,
    rimLightIntensity: { base: 2.4, pulseAmplitude: 1.2 },
    rimLightOffset: [0.9, 1.6, -1.1],
  },
  animation: buildDefaultAnimationConfig(),
  attachments: {},
  skins: { defaultSkinId: 'default', skins: [DEFAULT_SKIN] },
};

export const OPERATOR_DEFINITIONS: Record<OperatorId, OperatorDefinition> = {
  kael: KAEL,
  veyra: VEYRA,
};

export const OPERATOR_IDS: readonly OperatorId[] = ['kael', 'veyra'] as const;

/** Operator 01 — the male first operator per the Phase 5 directive. */
export const DEFAULT_OPERATOR_ID: OperatorId = 'kael';

export function getOperatorDefinition(id: OperatorId): OperatorDefinition {
  return OPERATOR_DEFINITIONS[id];
}

export function isOperatorId(value: string): value is OperatorId {
  return value in OPERATOR_DEFINITIONS;
}

/** Resolves a skin by id, falling back to the operator's default skin — never returns undefined, so render paths need no null-handling. */
export function getOperatorSkin(def: OperatorDefinition, skinId?: string): OperatorSkinDef {
  const found = skinId ? def.skins.skins.find((skin) => skin.id === skinId) : undefined;
  return found ?? def.skins.skins.find((skin) => skin.id === def.skins.defaultSkinId) ?? DEFAULT_SKIN;
}
