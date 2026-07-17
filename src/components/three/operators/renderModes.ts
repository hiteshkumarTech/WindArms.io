import * as THREE from 'three';

/**
 * Operator render modes — how one skinned model serves first-person,
 * third-person, and shadow-proxy duty without separate scene graphs
 * (Phase 5, 2026-07-17).
 *
 *   full       — normal rendering (third person, lobby, killcam, showcase)
 *   armsOnly   — only meshes matching the FP-arms naming convention render
 *                (first person before a dedicated arms GLB exists; once
 *                OperatorVisualConfig.fpArmsSlot ships a real arms model in
 *                Phase 7, FirstPersonOperatorRig prefers that instead)
 *   bodyHidden — nothing renders, but the skeleton still animates, so
 *                sockets keep tracking (classic FP: body invisible to the
 *                owner, weapon parented to a live hand socket)
 *   shadowOnly — meshes cast shadows but draw no color (FP "shadow of
 *                yourself on the wall" — the body exists only in the
 *                shadow-map pass)
 *
 * Mode application is a plain scene-graph traversal, fully reversible (a
 * WeakMap remembers original material/visibility), so switching modes at
 * runtime — e.g. death camera zooming out from FP to TP — never reloads
 * the model.
 */
export type OperatorRenderMode = 'full' | 'armsOnly' | 'bodyHidden' | 'shadowOnly';

/**
 * Mesh-name convention for FP arms inside a FULL-BODY model: any mesh whose
 * own name (or an ancestor's, up to the model root) contains one of these
 * fragments, case-insensitively. Rigs authored to our Blender checklist
 * name their arm meshes `fp_arms_*`; the extra fragments cover common
 * artist naming so a sourced model still has a chance of working unedited.
 */
export const FP_ARMS_NAME_HINTS = ['fp_arms', 'fparms', 'arms', 'forearm', 'hand'] as const;

interface OriginalMeshState {
  material: THREE.Material | THREE.Material[];
  visible: boolean;
  castShadow: boolean;
}

/** Per-mesh pre-override state, so `full` restores exactly. WeakMap: entries die with their meshes, no manual cleanup. */
const originalState = new WeakMap<THREE.Mesh, OriginalMeshState>();

/**
 * One shared, never-disposed material for shadowOnly mode: writes no color
 * and no depth in the main pass (invisible, doesn't occlude), while shadow
 * mapping — which renders with its own internal depth material — still
 * sees the mesh via `castShadow`.
 */
const SHADOW_ONLY_MATERIAL = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
SHADOW_ONLY_MATERIAL.name = 'operator_shadow_only';

function rememberOriginal(mesh: THREE.Mesh): void {
  if (!originalState.has(mesh)) {
    originalState.set(mesh, { material: mesh.material, visible: mesh.visible, castShadow: mesh.castShadow });
  }
}

function restoreOriginal(mesh: THREE.Mesh): void {
  const original = originalState.get(mesh);
  if (!original) return;
  mesh.material = original.material;
  mesh.visible = original.visible;
  mesh.castShadow = original.castShadow;
}

function isFpArmsMesh(mesh: THREE.Mesh, root: THREE.Object3D): boolean {
  let node: THREE.Object3D | null = mesh;
  while (node && node !== root.parent) {
    const name = node.name.toLowerCase();
    if (FP_ARMS_NAME_HINTS.some((hint) => name.includes(hint))) return true;
    node = node.parent;
  }
  return false;
}

/** Applies a render mode to every mesh under `root`, in place. Idempotent; call again with 'full' to restore. */
export function applyOperatorRenderMode(root: THREE.Object3D, mode: OperatorRenderMode): void {
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;

    if (mode === 'full') {
      restoreOriginal(node);
      return;
    }

    rememberOriginal(node);
    // Reset to the remembered baseline first so mode switches (e.g.
    // shadowOnly → armsOnly) never stack overrides on overrides.
    restoreOriginal(node);

    switch (mode) {
      case 'bodyHidden':
        node.visible = false;
        break;
      case 'shadowOnly':
        node.material = SHADOW_ONLY_MATERIAL;
        node.castShadow = true;
        node.visible = true;
        break;
      case 'armsOnly':
        node.visible = isFpArmsMesh(node, root);
        break;
    }
  });
}
