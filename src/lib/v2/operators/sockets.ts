import type { OperatorSocketId } from './types';

/**
 * Operator socket registry — the typed attachment-point contract every
 * operator rig is authored against (Phase 5, 2026-07-17).
 *
 * A GLB advertises a socket by containing an empty (no mesh) named
 * `socket_<id>` — the exact convention the asset pipeline already extracts
 * (src/lib/v2/pipeline/sockets.ts scans for the `socket_` prefix; the
 * pipeline's SocketName union was extended with this set in the same
 * change). When a rig ships WITHOUT authored empties (Mixamo/AccuRig
 * autorigs), resolution falls back to standard humanoid bone names below —
 * so a stock autorig is usable on day one while the Blender pass that adds
 * real socket empties happens in parallel.
 */

export const OPERATOR_SOCKETS: readonly OperatorSocketId[] = [
  'head',
  'neck',
  'spine',
  'pelvis',
  'left_hand',
  'right_hand',
  'left_foot',
  'right_foot',
  'weapon_primary',
  'weapon_secondary',
  'back',
  'belt',
  'grenade',
  'camera_fp',
  'camera_tp',
  'muzzle_reference',
] as const;

/**
 * The FPS-critical subset — missing any of these is flagged prominently by
 * validation (manifest.ts requiredSockets mirrors this list) and by
 * tools/inspect-operator.mjs. The rest are optional-but-recommended.
 */
export const REQUIRED_OPERATOR_SOCKETS: readonly OperatorSocketId[] = [
  'head',
  'spine',
  'pelvis',
  'right_hand',
  'left_hand',
  'weapon_primary',
  'camera_fp',
] as const;

/** GLB node name a socket empty must carry — single place the `socket_` prefix convention is spelled for operators. */
export function operatorSocketNodeName(id: OperatorSocketId): string {
  return `socket_${id}`;
}

export function isOperatorSocketId(value: string): value is OperatorSocketId {
  return (OPERATOR_SOCKETS as readonly string[]).includes(value);
}

/**
 * Humanoid bone-name fallbacks per socket, ordered by preference and
 * matched case-insensitively (and with `mixamorig:` prefixes listed
 * explicitly rather than stripped — matching is exact-lowercase, no fuzzy
 * logic). Sources: Mixamo autorig naming, Unreal mannequin naming, and
 * Blender Rigify deform-bone naming — the three rig families a sourced or
 * commissioned character most plausibly arrives in.
 *
 * Sockets with an EMPTY list (`camera_tp`, `muzzle_reference`) cannot be
 * meaningfully derived from any bone — they must be authored as real
 * `socket_*` empties, and stay unresolved (renderers use their own
 * defaults) until they are.
 */
export const DEFAULT_BONE_FALLBACKS: Record<OperatorSocketId, readonly string[]> = {
  head: ['head', 'mixamorig:head', 'def-head'],
  neck: ['neck', 'neck_01', 'mixamorig:neck', 'def-neck'],
  spine: ['spine_03', 'spine2', 'chest', 'mixamorig:spine2', 'def-chest', 'spine'],
  pelvis: ['pelvis', 'hips', 'mixamorig:hips', 'def-hips'],
  left_hand: ['hand_l', 'lefthand', 'hand.l', 'mixamorig:lefthand', 'def-hand.l'],
  right_hand: ['hand_r', 'righthand', 'hand.r', 'mixamorig:righthand', 'def-hand.r'],
  left_foot: ['foot_l', 'leftfoot', 'foot.l', 'mixamorig:leftfoot', 'def-foot.l'],
  right_foot: ['foot_r', 'rightfoot', 'foot.r', 'mixamorig:rightfoot', 'def-foot.r'],
  // A weapon socket without an authored empty is best approximated by the
  // holding hand — correct enough for lobby/showcase posing, replaced by a
  // real empty before FP work (Phase 7) needs exact alignment.
  weapon_primary: ['hand_r', 'righthand', 'hand.r', 'mixamorig:righthand'],
  weapon_secondary: ['hand_l', 'lefthand', 'hand.l', 'mixamorig:lefthand'],
  back: ['spine_03', 'spine2', 'chest', 'mixamorig:spine2'],
  belt: ['pelvis', 'hips', 'mixamorig:hips'],
  grenade: ['pelvis', 'hips', 'mixamorig:hips'],
  camera_fp: ['head', 'mixamorig:head'],
  camera_tp: [],
  muzzle_reference: [],
};
