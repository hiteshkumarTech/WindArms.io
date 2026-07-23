'use client';

import { create } from 'zustand';
import { FIRST_PERSON_ARM_IK_CONFIG } from '@/lib/v2/operators/firstPersonArmIkConfig';

/**
 * Dev-only staging state for the Kael FP-arm IK authoring tool
 * (`KaelArmIkTunerPanel`/`KaelArmIkDebug`, Milestone 7, Phase F, Step 13).
 * Exact same convention/guarantees as `gripTunerStore.ts` — Zustand for
 * occasionally-changed UI state (not per-frame transforms), never writes
 * to source files, never feeds back into production behavior outside an
 * active `?ik=1` dev session. `KaelFirstPersonArms.tsx` reads this store's
 * values as OVERRIDES on top of `FIRST_PERSON_ARM_IK_CONFIG` (falls back
 * to the shipped config when a tuner field is unset), so toggling the
 * panel never requires a code change to see its effect.
 */

export interface IkTunerState {
  rightElbowPoleLocal: readonly [number, number, number] | null;
  leftElbowPoleLocal: readonly [number, number, number] | null;
  shoulderRootOffset: readonly [number, number, number] | null;
  showAxes: boolean;
  showChainLines: boolean;
  showTargetMarkers: boolean;
  showPoleMarkers: boolean;
  frozen: boolean;
  /** Diagnostic-only (blocker pass, 2026-07-22): forces every arm to weight 0 (pure rest pose) while keeping the mesh mounted — proves the mesh/skeleton render independently of the IK solve, per the "disable IK, does rest pose become visible" diagnostic. Never affects `/v2/play` (this store's default is `false` and nothing outside `?ik=1` reads it). */
  ikDisabled: boolean;
  /** Diagnostic-only: shows a wireframe box around the mounted arms' current bounds in `KaelArmIkDebug`. */
  showBoundingBox: boolean;
  /**
   * Diagnostic-only (Step 6D, 2026-07-22): "REST MESH DIAGNOSTIC" — a HARD
   * bypass of the IK solver entirely (see `restoreRestPose` in
   * `kaelArmSolve.ts`), distinct from `ikDisabled` (which still runs
   * `solveSide` with weight=0, exercising the solver's own weight-blend
   * math). This mode also skips the `pose.ready` gate (grip targets aren't
   * needed to render a rest pose at all) so it can isolate "is the mesh/
   * skeleton renderable" from "is the grip-pose bridge publishing" as two
   * independently testable questions.
   */
  restPoseDiagnostic: boolean;
  /**
   * Diagnostic-only (Step 6E, 2026-07-22): "DIRECT CAMERA MOUNT" — parents
   * the complete arms clone (mesh + full bone hierarchy, moved together as
   * one rigid unit, never the mesh alone) directly onto the THREE.js camera
   * object itself, at a fixed local offset, bypassing the ENTIRE normal
   * transform chain (camera-follow copy, recenter anchor, shoulderRootOffset,
   * IK, wrist correction, finger posing). Also swaps every material on the
   * clone for a depth-ignoring, double-sided, fully-opaque high-contrast
   * `MeshBasicMaterial` and disables frustum culling, so the ONLY remaining
   * variables are "does this asset's geometry/skinning exist and bind
   * correctly" — everything else that could hide it is deliberately turned
   * off. If the arms are still invisible in this mode, the bug is in the
   * asset/clone/material/render path, not the camera-relative transform
   * chain; if they DO appear, the bug is specifically somewhere in that
   * transform chain (see `docs/decisions.md`'s Step 6E entry).
   */
  directCameraMount: boolean;

  /**
   * Step 6F hand-basis calibration — DEGREES (XYZ Euler, applied in the
   * canonical grip-anchor frame: X=finger-forward, Y=thumb-side,
   * Z=palm-normal), converted to radians only at the `solveSide` call site.
   * `null` (default) means "no adjustment," byte-identical to pre-6F
   * behavior — see `SideTuningOverrides.handBasisAdjustQuat` in
   * `kaelArmSolve.ts` for the exact composition math.
   */
  rightHandBasisAdjustDeg: readonly [number, number, number] | null;
  leftHandBasisAdjustDeg: readonly [number, number, number] | null;
  /** Step 6F: per-side override for `FIRST_PERSON_ARM_IK_CONFIG.rotationWeight` (0..1). `null` = use the shipped global value. */
  rightWristRotationWeight: number | null;
  leftWristRotationWeight: number | null;
  /** Step 6F: multiplies the authored finger-curl strength (0..1) per side. `null` = 1 (full authored curl, pre-6F behavior). */
  rightFingerCurlScale: number | null;
  leftFingerCurlScale: number | null;
  /**
   * Step 6F: continuous IK weight override (0..1), applied to BOTH sides
   * identically. Takes priority over the older binary `ikDisabled` toggle
   * when non-null — `ikDisabled` still works as a quick "snap to 0"
   * shortcut, but this slider is what Stage A/B/C-F calibration actually
   * needs (e.g. holding at exactly 0.5 to inspect the mid-blend chain).
   * `null` = fall back to `ikDisabled ? 0 : 1`, the pre-6F behavior.
   */
  ikWeight: number | null;
  /** Step 6F: shows the palm-forward/thumb-side/palm-normal axis markers from `KaelArmDebugSide` — the direct visual answer to "is the wrist just rotated wrong" vs "is the wrist in the wrong place." Default on, matching `showTargetMarkers`/`showChainLines`/`showPoleMarkers` — this is core calibration tooling, not a rare diagnostic. */
  showHandBasisAxes: boolean;

  /**
   * Step 6G shoulder/clavicle assist — CONTAINER-LOCAL meters (same
   * camera-relative convention as `shoulderRootOffset`). `null` (default)
   * means "use the shipped `FIRST_PERSON_ARM_IK_CONFIG.rightShoulderAssistLocal`/
   * `leftShoulderAssistLocal` value" — NOT zero, unlike every other Step
   * 6F/6G override in this store. This one field deliberately falls back
   * to a non-zero shipped default rather than a no-op, because the shipped
   * default is itself a computed fix for a measured reach deficit (see
   * `firstPersonArmIkConfig.ts`'s doc comment) — "untouched" should mean
   * "the best current calibration," not "assist off," for a value that
   * exists specifically to close a real positional error.
   */
  rightShoulderAssistLocal: readonly [number, number, number] | null;
  leftShoulderAssistLocal: readonly [number, number, number] | null;

  setRightPole: (v: readonly [number, number, number]) => void;
  setLeftPole: (v: readonly [number, number, number]) => void;
  setShoulderOffset: (v: readonly [number, number, number]) => void;
  setRightHandBasisAdjustDeg: (v: readonly [number, number, number]) => void;
  setLeftHandBasisAdjustDeg: (v: readonly [number, number, number]) => void;
  setRightWristRotationWeight: (v: number) => void;
  setLeftWristRotationWeight: (v: number) => void;
  setRightFingerCurlScale: (v: number) => void;
  setLeftFingerCurlScale: (v: number) => void;
  setIkWeight: (v: number | null) => void;
  setRightShoulderAssistLocal: (v: readonly [number, number, number]) => void;
  setLeftShoulderAssistLocal: (v: readonly [number, number, number]) => void;
  toggleHandBasisAxes: () => void;
  toggleAxes: () => void;
  toggleChainLines: () => void;
  toggleTargetMarkers: () => void;
  togglePoleMarkers: () => void;
  toggleFrozen: () => void;
  toggleIkDisabled: () => void;
  toggleBoundingBox: () => void;
  toggleRestPoseDiagnostic: () => void;
  toggleDirectCameraMount: () => void;
  resetToShipped: () => void;
}

export const useIkTunerStore = create<IkTunerState>()((set) => ({
  rightElbowPoleLocal: null,
  leftElbowPoleLocal: null,
  shoulderRootOffset: null,
  showAxes: true,
  showChainLines: true,
  showTargetMarkers: true,
  showPoleMarkers: true,
  frozen: false,
  ikDisabled: false,
  showBoundingBox: false,
  restPoseDiagnostic: false,
  directCameraMount: false,
  rightHandBasisAdjustDeg: null,
  leftHandBasisAdjustDeg: null,
  rightWristRotationWeight: null,
  leftWristRotationWeight: null,
  rightFingerCurlScale: null,
  leftFingerCurlScale: null,
  ikWeight: null,
  showHandBasisAxes: true,
  rightShoulderAssistLocal: null,
  leftShoulderAssistLocal: null,

  setRightPole: (v) => set({ rightElbowPoleLocal: v }),
  setLeftPole: (v) => set({ leftElbowPoleLocal: v }),
  setShoulderOffset: (v) => set({ shoulderRootOffset: v }),
  setRightHandBasisAdjustDeg: (v) => set({ rightHandBasisAdjustDeg: v }),
  setLeftHandBasisAdjustDeg: (v) => set({ leftHandBasisAdjustDeg: v }),
  setRightWristRotationWeight: (v) => set({ rightWristRotationWeight: v }),
  setLeftWristRotationWeight: (v) => set({ leftWristRotationWeight: v }),
  setRightFingerCurlScale: (v) => set({ rightFingerCurlScale: v }),
  setLeftFingerCurlScale: (v) => set({ leftFingerCurlScale: v }),
  setIkWeight: (v) => set({ ikWeight: v }),
  setRightShoulderAssistLocal: (v) => set({ rightShoulderAssistLocal: v }),
  setLeftShoulderAssistLocal: (v) => set({ leftShoulderAssistLocal: v }),
  toggleHandBasisAxes: () => set((s) => ({ showHandBasisAxes: !s.showHandBasisAxes })),
  toggleAxes: () => set((s) => ({ showAxes: !s.showAxes })),
  toggleChainLines: () => set((s) => ({ showChainLines: !s.showChainLines })),
  toggleTargetMarkers: () => set((s) => ({ showTargetMarkers: !s.showTargetMarkers })),
  togglePoleMarkers: () => set((s) => ({ showPoleMarkers: !s.showPoleMarkers })),
  toggleFrozen: () => set((s) => ({ frozen: !s.frozen })),
  toggleIkDisabled: () => set((s) => ({ ikDisabled: !s.ikDisabled })),
  toggleBoundingBox: () => set((s) => ({ showBoundingBox: !s.showBoundingBox })),
  toggleRestPoseDiagnostic: () => set((s) => ({ restPoseDiagnostic: !s.restPoseDiagnostic })),
  toggleDirectCameraMount: () => set((s) => ({ directCameraMount: !s.directCameraMount })),
  resetToShipped: () =>
    set({
      rightElbowPoleLocal: FIRST_PERSON_ARM_IK_CONFIG.rightElbowPoleLocal,
      leftElbowPoleLocal: FIRST_PERSON_ARM_IK_CONFIG.leftElbowPoleLocal,
      shoulderRootOffset: FIRST_PERSON_ARM_IK_CONFIG.shoulderRootOffset,
      rightHandBasisAdjustDeg: null,
      leftHandBasisAdjustDeg: null,
      rightWristRotationWeight: null,
      leftWristRotationWeight: null,
      rightFingerCurlScale: null,
      leftFingerCurlScale: null,
      ikWeight: null,
      rightShoulderAssistLocal: null,
      leftShoulderAssistLocal: null,
    }),
}));

/** Generates a copy-paste-ready `FirstPersonArmIkConfig` object literal from the current tuned values (falling back to shipped constants for any untouched field) — the tool's one write path back to source, always manual. */
export function formatIkConfigAsCode(state: IkTunerState): string {
  const r = state.rightElbowPoleLocal ?? FIRST_PERSON_ARM_IK_CONFIG.rightElbowPoleLocal;
  const l = state.leftElbowPoleLocal ?? FIRST_PERSON_ARM_IK_CONFIG.leftElbowPoleLocal;
  const s = state.shoulderRootOffset ?? FIRST_PERSON_ARM_IK_CONFIG.shoulderRootOffset;
  const rb = state.rightHandBasisAdjustDeg ?? FIRST_PERSON_ARM_IK_CONFIG.rightHandBasisAdjustDeg;
  const lb = state.leftHandBasisAdjustDeg ?? FIRST_PERSON_ARM_IK_CONFIG.leftHandBasisAdjustDeg;
  const rw = state.rightWristRotationWeight ?? FIRST_PERSON_ARM_IK_CONFIG.rotationWeight;
  const lw = state.leftWristRotationWeight ?? FIRST_PERSON_ARM_IK_CONFIG.rotationWeight;
  const rc = state.rightFingerCurlScale ?? FIRST_PERSON_ARM_IK_CONFIG.rightFingerCurlScale;
  const lc = state.leftFingerCurlScale ?? FIRST_PERSON_ARM_IK_CONFIG.leftFingerCurlScale;
  const ra = state.rightShoulderAssistLocal ?? FIRST_PERSON_ARM_IK_CONFIG.rightShoulderAssistLocal;
  const la = state.leftShoulderAssistLocal ?? FIRST_PERSON_ARM_IK_CONFIG.leftShoulderAssistLocal;
  return (
    `rightElbowPoleLocal: [${r.map((n) => n.toFixed(3)).join(', ')}],\n` +
    `leftElbowPoleLocal: [${l.map((n) => n.toFixed(3)).join(', ')}],\n` +
    `shoulderRootOffset: [${s.map((n) => n.toFixed(3)).join(', ')}],\n` +
    `// Step 6F hand-basis calibration (degrees, canonical grip-anchor frame):\n` +
    `rightHandBasisAdjustDeg: [${rb.map((n) => n.toFixed(2)).join(', ')}],\n` +
    `leftHandBasisAdjustDeg: [${lb.map((n) => n.toFixed(2)).join(', ')}],\n` +
    `rightWristRotationWeight: ${rw.toFixed(3)},\n` +
    `leftWristRotationWeight: ${lw.toFixed(3)},\n` +
    `rightFingerCurlScale: ${rc.toFixed(3)},\n` +
    `leftFingerCurlScale: ${lc.toFixed(3)},\n` +
    `// Step 6G shoulder assist (container-local meters):\n` +
    `rightShoulderAssistLocal: [${ra.map((n) => n.toFixed(4)).join(', ')}],\n` +
    `leftShoulderAssistLocal: [${la.map((n) => n.toFixed(4)).join(', ')}],`
  );
}
