import * as THREE from 'three';
import { auditMaterials } from './materials';
import type { AnimationClipMap, AssetManifestEntry, SocketMap, ValidationIssue, ValidationResult } from './types';

/**
 * Dev-time validation: checks a loaded asset against its manifest entry
 * (required sockets, required clips, poly/material/texture budget). Never
 * throws — returns structured issues so a partially-valid asset still
 * renders (with warnings logged), matching this project's existing
 * fail-soft conventions (e.g. `AudioEngine` failing silently rather than
 * breaking gameplay). Call this in development only; it walks the whole
 * scene graph and isn't free.
 */
export function validateAsset(
  entry: AssetManifestEntry,
  scene: THREE.Object3D,
  sockets: SocketMap,
  clips: AnimationClipMap,
): ValidationResult {
  const issues: ValidationIssue[] = [];

  for (const required of entry.requiredSockets) {
    if (!sockets.get(required)) {
      issues.push({
        severity: 'warning',
        code: 'missing-socket',
        message: `${entry.label}: expected socket "${required}" not found in the loaded model.`,
      });
    }
  }

  for (const required of entry.requiredClips) {
    if (!clips.get(required)) {
      issues.push({
        severity: 'warning',
        code: 'missing-clip',
        message: `${entry.label}: expected animation clip "${required}" not found in the loaded model.`,
      });
    }
  }

  let triangles = 0;
  const materialNames = new Set<string>();
  scene.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const geometry = node.geometry;
    const index = geometry.getIndex();
    const vertexCount = index ? index.count : geometry.getAttribute('position')?.count ?? 0;
    triangles += Math.floor(vertexCount / 3);
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) materialNames.add(material.uuid);
  });

  if (triangles > entry.budget.maxTriangles) {
    issues.push({
      severity: 'error',
      code: 'triangle-budget-exceeded',
      message: `${entry.label}: ${triangles} triangles exceeds budget of ${entry.budget.maxTriangles}.`,
    });
  }

  if (materialNames.size > entry.budget.maxMaterials) {
    issues.push({
      severity: 'error',
      code: 'material-budget-exceeded',
      message: `${entry.label}: ${materialNames.size} materials exceeds budget of ${entry.budget.maxMaterials}.`,
    });
  }

  const oversizedTextures = new Set<string>();
  scene.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      for (const map of [material.map, material.normalMap, material.roughnessMap, material.emissiveMap]) {
        const image = map?.image as { width?: number; height?: number } | undefined;
        if (!image) continue;
        const size = Math.max(image.width ?? 0, image.height ?? 0);
        if (size > entry.budget.maxTextureSize) oversizedTextures.add(`${material.name || material.uuid} (${size}px)`);
      }
    }
  });
  if (oversizedTextures.size > 0) {
    issues.push({
      severity: 'error',
      code: 'texture-budget-exceeded',
      message: `${entry.label}: texture(s) exceed ${entry.budget.maxTextureSize}px budget — ${Array.from(oversizedTextures).join(', ')}.`,
    });
  }

  for (const audit of auditMaterials(scene)) {
    if (audit.materialName === '(unnamed)') {
      issues.push({
        severity: 'warning',
        code: 'unnamed-material',
        message: `${entry.label}: an unnamed material (${audit.hex}) was found — name it so tinting/audit tooling can target it.`,
      });
    }
  }

  const ok = !issues.some((issue) => issue.severity === 'error');
  return { ok, issues };
}

/** Formats a ValidationResult for console output — call from dev code only, never in a production build path. */
export function logValidation(result: ValidationResult): void {
  for (const issue of result.issues) {
    const log = issue.severity === 'error' ? console.error : console.warn;
    log(`[asset-pipeline] ${issue.message}`);
  }
}
