'use client';

import { create } from 'zustand';
import { SHADOW_ARM_IK_CONFIG } from '@/lib/v2/operators/shadowArmIkConfig';

/**
 * Dev-only staging state for the shadow arm/spine IK calibration (Milestone
 * 8, Steps 8E-C/8E-C.1) — `KaelShadowDebugPanel.tsx`/
 * `KaelShadowArmDebugMarkers.tsx`, `/v2/range?shadow=1` only. Same
 * override-on-top-of-shipped-config convention as `ikTunerStore.ts`
 * (`null`/unset = fall back to `SHADOW_ARM_IK_CONFIG`).
 *
 * STEP 8E-C.1: `rightShoulderAssistLocal`/`leftShoulderAssistLocal` (fixed
 * offsets) are GONE — the assist is now computed dynamically every frame
 * from the real measured reach deficit (see `KaelFirstPersonShadowBody.tsx`).
 *
 * STEP 8E-C.2: `chestAimFalloffPitchRad` (the old reach-driven inverse
 * curve's falloff angle) is GONE, replaced by `chestAimFollowFraction` (the
 * new monotonic look-direction curve's proportional gain) — see
 * `shadowArmIkConfig.ts`'s doc comment for why the curve's whole shape
 * changed. `rightMaxShoulderAssistM`/`leftMaxShoulderAssistM` remain, now
 * defaulting much lower (0.06m, not 0.1/0.4m) since the shoulder assist is
 * a small residual corrector, not the primary reach mechanism, now that the
 * shadow weapon is chest-anchored (`shadowWeaponPresentationPose.ts`).
 */
export interface ShadowArmTunerState {
  rightElbowPoleLocal: readonly [number, number, number] | null;
  leftElbowPoleLocal: readonly [number, number, number] | null;
  rightHandBasisAdjustDeg: readonly [number, number, number] | null;
  leftHandBasisAdjustDeg: readonly [number, number, number] | null;
  rightWristRotationWeight: number | null;
  leftWristRotationWeight: number | null;
  chestAimFollowFraction: number | null;
  chestAimMaxPitchRad: number | null;
  rightMaxShoulderAssistM: number | null;
  leftMaxShoulderAssistM: number | null;

  armIkEnabled: boolean;
  weaponShadowEnabled: boolean;
  showElbowPoleMarkers: boolean;
  showShoulderMarkers: boolean;
  showGripTargetMarkers: boolean;

  setRightElbowPoleLocal: (v: readonly [number, number, number]) => void;
  setLeftElbowPoleLocal: (v: readonly [number, number, number]) => void;
  setRightHandBasisAdjustDeg: (v: readonly [number, number, number]) => void;
  setLeftHandBasisAdjustDeg: (v: readonly [number, number, number]) => void;
  setRightWristRotationWeight: (v: number) => void;
  setLeftWristRotationWeight: (v: number) => void;
  setChestAimFollowFraction: (v: number) => void;
  setChestAimMaxPitchRad: (v: number) => void;
  setRightMaxShoulderAssistM: (v: number) => void;
  setLeftMaxShoulderAssistM: (v: number) => void;
  toggleArmIkEnabled: () => void;
  toggleWeaponShadowEnabled: () => void;
  toggleElbowPoleMarkers: () => void;
  toggleShoulderMarkers: () => void;
  toggleGripTargetMarkers: () => void;
  reset: () => void;
}

const DEFAULTS = {
  rightElbowPoleLocal: null,
  leftElbowPoleLocal: null,
  rightHandBasisAdjustDeg: null,
  leftHandBasisAdjustDeg: null,
  rightWristRotationWeight: null,
  leftWristRotationWeight: null,
  chestAimFollowFraction: null,
  chestAimMaxPitchRad: null,
  rightMaxShoulderAssistM: null,
  leftMaxShoulderAssistM: null,
  armIkEnabled: true,
  weaponShadowEnabled: true,
  showElbowPoleMarkers: true,
  showShoulderMarkers: true,
  showGripTargetMarkers: true,
} as const;

export const useShadowArmTunerStore = create<ShadowArmTunerState>()((set) => ({
  ...DEFAULTS,
  setRightElbowPoleLocal: (v) => set({ rightElbowPoleLocal: v }),
  setLeftElbowPoleLocal: (v) => set({ leftElbowPoleLocal: v }),
  setRightHandBasisAdjustDeg: (v) => set({ rightHandBasisAdjustDeg: v }),
  setLeftHandBasisAdjustDeg: (v) => set({ leftHandBasisAdjustDeg: v }),
  setRightWristRotationWeight: (v) => set({ rightWristRotationWeight: v }),
  setLeftWristRotationWeight: (v) => set({ leftWristRotationWeight: v }),
  setChestAimFollowFraction: (v) => set({ chestAimFollowFraction: v }),
  setChestAimMaxPitchRad: (v) => set({ chestAimMaxPitchRad: v }),
  setRightMaxShoulderAssistM: (v) => set({ rightMaxShoulderAssistM: v }),
  setLeftMaxShoulderAssistM: (v) => set({ leftMaxShoulderAssistM: v }),
  toggleArmIkEnabled: () => set((s) => ({ armIkEnabled: !s.armIkEnabled })),
  toggleWeaponShadowEnabled: () => set((s) => ({ weaponShadowEnabled: !s.weaponShadowEnabled })),
  toggleElbowPoleMarkers: () => set((s) => ({ showElbowPoleMarkers: !s.showElbowPoleMarkers })),
  toggleShoulderMarkers: () => set((s) => ({ showShoulderMarkers: !s.showShoulderMarkers })),
  toggleGripTargetMarkers: () => set((s) => ({ showGripTargetMarkers: !s.showGripTargetMarkers })),
  reset: () => set({ ...DEFAULTS }),
}));

/** Copy-paste-ready `ShadowArmIkConfig` object literal from the current tuned values (falling back to shipped constants for any untouched field) — same manual-write-back convention as `formatIkConfigAsCode`. */
export function formatShadowArmConfigAsCode(state: ShadowArmTunerState): string {
  const rp = state.rightElbowPoleLocal ?? SHADOW_ARM_IK_CONFIG.rightElbowPoleLocal;
  const lp = state.leftElbowPoleLocal ?? SHADOW_ARM_IK_CONFIG.leftElbowPoleLocal;
  const rb = state.rightHandBasisAdjustDeg ?? SHADOW_ARM_IK_CONFIG.rightHandBasisAdjustDeg;
  const lb = state.leftHandBasisAdjustDeg ?? SHADOW_ARM_IK_CONFIG.leftHandBasisAdjustDeg;
  const rw = state.rightWristRotationWeight ?? SHADOW_ARM_IK_CONFIG.rotationWeight;
  const lw = state.leftWristRotationWeight ?? SHADOW_ARM_IK_CONFIG.rotationWeight;
  const cf = state.chestAimFollowFraction ?? SHADOW_ARM_IK_CONFIG.chestAimFollowFraction;
  const cp = state.chestAimMaxPitchRad ?? SHADOW_ARM_IK_CONFIG.chestAimMaxPitchRad;
  const ra = state.rightMaxShoulderAssistM ?? SHADOW_ARM_IK_CONFIG.rightMaxShoulderAssistM;
  const la = state.leftMaxShoulderAssistM ?? SHADOW_ARM_IK_CONFIG.leftMaxShoulderAssistM;
  return (
    `rightElbowPoleLocal: [${rp.map((n) => n.toFixed(3)).join(', ')}],\n` +
    `leftElbowPoleLocal: [${lp.map((n) => n.toFixed(3)).join(', ')}],\n` +
    `rightHandBasisAdjustDeg: [${rb.map((n) => n.toFixed(2)).join(', ')}],\n` +
    `leftHandBasisAdjustDeg: [${lb.map((n) => n.toFixed(2)).join(', ')}],\n` +
    `rightWristRotationWeight (via rotationWeight): ${rw.toFixed(3)},\n` +
    `leftWristRotationWeight (via rotationWeight): ${lw.toFixed(3)},\n` +
    `chestAimFollowFraction: ${cf.toFixed(3)},\n` +
    `chestAimMaxPitchRad: ${cp.toFixed(4)} (${((cp * 180) / Math.PI).toFixed(1)}deg),\n` +
    `rightMaxShoulderAssistM: ${ra.toFixed(4)},\n` +
    `leftMaxShoulderAssistM: ${la.toFixed(4)},`
  );
}
