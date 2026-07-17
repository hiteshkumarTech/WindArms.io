import type { ClipName } from '@/lib/v2/pipeline';
import type { OperatorAnimationConfig, OperatorAnimationState, OperatorClipBinding } from './types';

/**
 * Operator animation-state registry + default playback policies (Phase 5,
 * 2026-07-17). This is animation PLUMBING — loop modes, crossfade timing,
 * one-shot chaining — not gameplay: nothing here decides *when* a state
 * plays, only *how* its clip behaves once something (showcase, lobby,
 * future game code) requests it.
 *
 * Adding a state: extend OperatorAnimationState (types.ts), then the two
 * tables here — the compiler flags both until complete. No component edits.
 */

export const OPERATOR_ANIMATION_STATES: readonly OperatorAnimationState[] = [
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
] as const;

/**
 * Canonical clip name per state — what a rig authored to our Blender
 * checklist names its clips (state name = clip name, 1:1; the pipeline's
 * ClipName union carries all sixteen). Per-operator OperatorAnimationConfig
 * can remap any of these for rigs that arrive named differently.
 */
export const DEFAULT_CLIP_FOR_STATE: Record<OperatorAnimationState, ClipName> = {
  idle: 'idle',
  walk: 'walk',
  sprint: 'sprint',
  ads: 'ads',
  fire: 'fire',
  reload: 'reload',
  inspect: 'inspect',
  equip: 'equip',
  unequip: 'unequip',
  jump: 'jump',
  fall: 'fall',
  land: 'land',
  death: 'death',
  victory: 'victory',
  lobby_idle: 'lobby_idle',
  selection_pose: 'selection_pose',
};

/**
 * Default playback policy per state. Rationale, in animation-craft terms:
 * locomotion and holds loop (`repeat`); actions are one-shots that chain
 * back into a sensible resting state (`once` + returnTo); terminal poses
 * play once and freeze on their final frame (`clamp`). Fade times: fast
 * fades (≤0.1s) for reactive actions so they read immediately, slower
 * fades for ambient transitions so they read smooth.
 */
export const DEFAULT_STATE_POLICIES: Record<OperatorAnimationState, Omit<OperatorClipBinding, 'clip'>> = {
  idle: { loop: 'repeat', fadeInS: 0.25 },
  walk: { loop: 'repeat', fadeInS: 0.2 },
  sprint: { loop: 'repeat', fadeInS: 0.15 },
  ads: { loop: 'repeat', fadeInS: 0.12 },
  fire: { loop: 'once', fadeInS: 0.05, returnTo: 'idle' },
  reload: { loop: 'once', fadeInS: 0.12, returnTo: 'idle' },
  inspect: { loop: 'once', fadeInS: 0.2, returnTo: 'idle' },
  equip: { loop: 'once', fadeInS: 0.1, returnTo: 'idle' },
  // Unequip ends with the weapon away — hold the final frame rather than
  // snapping back to an armed idle; whatever requested the unequip decides
  // what happens next (equip of the next weapon, etc.).
  unequip: { loop: 'clamp', fadeInS: 0.1 },
  jump: { loop: 'once', fadeInS: 0.08, returnTo: 'fall' },
  fall: { loop: 'repeat', fadeInS: 0.15 },
  land: { loop: 'once', fadeInS: 0.08, returnTo: 'idle' },
  death: { loop: 'clamp', fadeInS: 0.1 },
  victory: { loop: 'repeat', fadeInS: 0.25 },
  lobby_idle: { loop: 'repeat', fadeInS: 0.35 },
  selection_pose: { loop: 'clamp', fadeInS: 0.3 },
};

/**
 * Builds the complete default OperatorAnimationConfig (state name = clip
 * name, default policies). `overrides` patches individual states — the only
 * thing a specific operator's registry entry should ever need to write.
 */
export function buildDefaultAnimationConfig(
  overrides: Partial<Record<OperatorAnimationState, Partial<OperatorClipBinding>>> = {},
): OperatorAnimationConfig {
  const clips = {} as Record<OperatorAnimationState, OperatorClipBinding>;
  for (const state of OPERATOR_ANIMATION_STATES) {
    clips[state] = {
      clip: DEFAULT_CLIP_FOR_STATE[state],
      ...DEFAULT_STATE_POLICIES[state],
      ...overrides[state],
    };
  }
  return { clips };
}
