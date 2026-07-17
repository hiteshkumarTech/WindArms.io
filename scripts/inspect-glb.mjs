#!/usr/bin/env node
/**
 * Standalone GLB inspector — parses the binary glTF container directly
 * (no three.js/WebGL dependency, so it runs in plain Node). Reports
 * triangle count, material/texture count, embedded texture dimensions,
 * animation clips, socket-named nodes, and flags anything that looks risky
 * against this project's real pipeline budgets
 * (src/lib/v2/pipeline/manifest.ts's DEFAULT_BUDGETS).
 *
 * Usage: node scripts/inspect-glb.mjs <path-to-glb> [category]
 *   category: weapon | operator | map | vehicle | ui (default: weapon)
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const BUDGETS = {
  weapon: { maxTriangles: 18000, maxMaterials: 6, maxTextureSize: 2048 },
  operator: { maxTriangles: 45000, maxMaterials: 10, maxTextureSize: 2048 },
  map: { maxTriangles: 250000, maxMaterials: 40, maxTextureSize: 2048 },
  vehicle: { maxTriangles: 60000, maxMaterials: 12, maxTextureSize: 2048 },
  ui: { maxTriangles: 4000, maxMaterials: 2, maxTextureSize: 1024 },
};

const filePath = process.argv[2];
const category = process.argv[3] ?? 'weapon';
if (!filePath) {
  console.error('Usage: node scripts/inspect-glb.mjs <path-to-glb> [category]');
  process.exit(1);
}

const buffer = readFileSync(filePath);

if (buffer.readUInt32LE(0) !== 0x46546c67) {
  console.error('Not a valid GLB file (bad magic number).');
  process.exit(1);
}
const glbVersion = buffer.readUInt32LE(4);
const totalLength = buffer.readUInt32LE(8);

let offset = 12;
let jsonChunk = null;
let binChunk = null;
while (offset < buffer.length) {
  const chunkLength = buffer.readUInt32LE(offset);
  const chunkType = buffer.readUInt32LE(offset + 4);
  const chunkData = buffer.subarray(offset + 8, offset + 8 + chunkLength);
  if (chunkType === 0x4e4f534a) jsonChunk = chunkData; // 'JSON'
  else if (chunkType === 0x004e4942) binChunk = chunkData; // 'BIN\0'
  offset += 8 + chunkLength;
}

if (!jsonChunk) {
  console.error('No JSON chunk found — malformed GLB.');
  process.exit(1);
}

const gltf = JSON.parse(jsonChunk.toString('utf-8'));

function primitiveTriangleCount(primitive) {
  if ((primitive.mode ?? 4) !== 4) return 0; // only count TRIANGLES-mode primitives
  if (primitive.indices !== undefined) return Math.floor(gltf.accessors[primitive.indices].count / 3);
  if (primitive.attributes?.POSITION !== undefined) return Math.floor(gltf.accessors[primitive.attributes.POSITION].count / 3);
  return 0;
}

let uniqueTriangleCount = 0;
let primitiveCount = 0;
const boundsMin = [Infinity, Infinity, Infinity];
const boundsMax = [-Infinity, -Infinity, -Infinity];
for (const mesh of gltf.meshes ?? []) {
  for (const primitive of mesh.primitives ?? []) {
    primitiveCount++;
    uniqueTriangleCount += primitiveTriangleCount(primitive);
    const posAccessor = primitive.attributes?.POSITION !== undefined ? gltf.accessors[primitive.attributes.POSITION] : null;
    if (posAccessor?.min && posAccessor?.max) {
      for (let i = 0; i < 3; i++) {
        boundsMin[i] = Math.min(boundsMin[i], posAccessor.min[i]);
        boundsMax[i] = Math.max(boundsMax[i], posAccessor.max[i]);
      }
    }
  }
}
const hasBounds = boundsMin.every((v) => Number.isFinite(v));
const boundingBox = hasBounds
  ? {
      min: boundsMin,
      max: boundsMax,
      size: boundsMin.map((min, i) => +(boundsMax[i] - min).toFixed(4)),
      // KNOWN LIMITATION, found the hard way on 2026-07-16: this is the RAW
      // mesh-local bounding box only — it does NOT apply any scale/translation
      // already baked into the node hierarchy above the mesh. If a node
      // already carries its own scale (common in AI-generated/kitbashed
      // exports), the real world-space size is different from this, and using
      // this value directly to compute a caller-side scale factor will be
      // wrong. Use `node tools/inspect-glb.mjs <file> --target <viewmodel|showpiece>`
      // instead for a scale/pivot decision — it walks the node hierarchy and
      // reports actual post-transform world bounds.
      note: 'Local bounds only — does not account for existing node scale/transform. See tools/inspect-glb.mjs for world-space bounds.',
    }
  : null;

// Instanced total: walk the scene graph, multiply each mesh's triangles by how many nodes reference it.
const meshUsage = new Map();
function walkNode(nodeIndex) {
  const node = gltf.nodes[nodeIndex];
  if (!node) return;
  if (node.mesh !== undefined) meshUsage.set(node.mesh, (meshUsage.get(node.mesh) ?? 0) + 1);
  for (const child of node.children ?? []) walkNode(child);
}
if (gltf.scenes && gltf.nodes) {
  const scene = gltf.scenes[gltf.scene ?? 0];
  for (const rootNodeIndex of scene?.nodes ?? []) walkNode(rootNodeIndex);
}
let instancedTriangleCount = 0;
for (const [meshIndex, useCount] of meshUsage) {
  const mesh = gltf.meshes[meshIndex];
  const meshTris = (mesh.primitives ?? []).reduce((sum, p) => sum + primitiveTriangleCount(p), 0);
  instancedTriangleCount += meshTris * useCount;
}

function readWebpDimensions(bytes) {
  if (bytes.length < 30) return null;
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') return null;
  const fourCC = bytes.toString('ascii', 12, 16);
  if (fourCC === 'VP8X') {
    const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
    const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
    return { width, height, format: 'WebP (extended)' };
  }
  if (fourCC === 'VP8 ') {
    const d = 20; // chunk data starts after the 8-byte RIFF sub-chunk header
    if (bytes[d + 3] === 0x9d && bytes[d + 4] === 0x01 && bytes[d + 5] === 0x2a) {
      return { width: bytes.readUInt16LE(d + 6) & 0x3fff, height: bytes.readUInt16LE(d + 8) & 0x3fff, format: 'WebP (lossy)' };
    }
    return null;
  }
  if (fourCC === 'VP8L') {
    const d = 20;
    if (bytes[d] !== 0x2f) return null; // signature byte
    const b0 = bytes[d + 1], b1 = bytes[d + 2], b2 = bytes[d + 3], b3 = bytes[d + 4];
    const width = 1 + (((b1 & 0x3f) << 8) | b0);
    const height = 1 + (((b3 & 0xf) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
    return { width, height, format: 'WebP (lossless)' };
  }
  return null;
}

function readImageDimensions(bytes) {
  if (!bytes || bytes.length < 24) return null;
  // PNG: signature 89 50 4E 47, width/height are big-endian uint32 at offset 16/20 (IHDR).
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), format: 'PNG' };
  }
  // JPEG: scan markers for the first SOFn (start-of-frame) segment.
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i < bytes.length - 9) {
      if (bytes[i] !== 0xff) { i++; continue; }
      const marker = bytes[i + 1];
      if (marker >= 0xc0 && marker <= 0xc3) {
        return { height: bytes.readUInt16BE(i + 5), width: bytes.readUInt16BE(i + 7), format: 'JPEG' };
      }
      const segmentLength = bytes.readUInt16BE(i + 2);
      i += 2 + segmentLength;
    }
  }
  const webp = readWebpDimensions(bytes);
  if (webp) return webp;
  return null;
}

const images = (gltf.images ?? []).map((image, idx) => {
  let byteLength = null;
  let dims = null;
  if (image.bufferView !== undefined && binChunk) {
    const bufferView = gltf.bufferViews[image.bufferView];
    byteLength = bufferView.byteLength;
    const bytes = binChunk.subarray(bufferView.byteOffset ?? 0, (bufferView.byteOffset ?? 0) + bufferView.byteLength);
    dims = readImageDimensions(bytes);
  }
  return { index: idx, name: image.name ?? `image_${idx}`, mimeType: image.mimeType, byteLength, ...dims };
});

const animationClips = (gltf.animations ?? []).map((a) => a.name ?? '(unnamed)');
const socketNodes = (gltf.nodes ?? []).filter((n) => n.name?.startsWith('socket_')).map((n) => n.name);
const hasSkin = (gltf.skins ?? []).length > 0;
const materialCount = (gltf.materials ?? []).length;
const textureCount = (gltf.textures ?? []).length;

const budget = BUDGETS[category] ?? BUDGETS.weapon;
const risks = [];
if (uniqueTriangleCount > budget.maxTriangles) {
  risks.push(`Triangle count ${uniqueTriangleCount.toLocaleString()} exceeds the ${category} budget of ${budget.maxTriangles.toLocaleString()}.`);
}
if (materialCount > budget.maxMaterials) {
  risks.push(`Material count ${materialCount} exceeds the ${category} budget of ${budget.maxMaterials}.`);
}
for (const image of images) {
  if (image.width && image.width > budget.maxTextureSize) risks.push(`Texture "${image.name}" is ${image.width}x${image.height}px, exceeds the ${budget.maxTextureSize}px budget.`);
  if (image.height && image.height > budget.maxTextureSize) risks.push(`Texture "${image.name}" is ${image.width}x${image.height}px, exceeds the ${budget.maxTextureSize}px budget.`);
}
if (socketNodes.length === 0) risks.push('No socket_* nodes found — this asset exposes no attachment points.');
if (animationClips.length === 0) risks.push('No animation clips found.');
if (buffer.length > 15 * 1024 * 1024) risks.push(`File size ${(buffer.length / 1024 / 1024).toFixed(1)} MB is large for a browser-delivered weapon asset — consider further texture/geometry compression.`);
const totalImageBytes = images.reduce((sum, i) => sum + (i.byteLength ?? 0), 0);
if (totalImageBytes > 0 && totalImageBytes / buffer.length > 0.85) {
  risks.push(`Embedded textures account for ${(100 * totalImageBytes / buffer.length).toFixed(0)}% of file size — geometry is cheap here, textures are the cost driver.`);
}
const usesDraco = JSON.stringify(gltf.extensionsUsed ?? []).includes('KHR_draco_mesh_compression');
if (!usesDraco && uniqueTriangleCount > 5000) risks.push('Not Draco-compressed — geometry could likely be smaller for the same visual result.');

const report = {
  file: path.basename(filePath),
  fileSizeBytes: buffer.length,
  fileSizeMB: +(buffer.length / 1024 / 1024).toFixed(2),
  glbContainerVersion: glbVersion,
  gltfAssetVersion: gltf.asset?.version,
  generator: gltf.asset?.generator ?? '(unspecified)',
  category,
  meshPrimitiveCount: primitiveCount,
  uniqueTriangleCount,
  instancedTriangleCount,
  materialCount,
  textureCount,
  images,
  animationClips,
  socketNodes,
  hasSkin,
  nodeCount: (gltf.nodes ?? []).length,
  sceneCount: (gltf.scenes ?? []).length,
  extensionsUsed: gltf.extensionsUsed ?? [],
  boundingBox,
  budget,
  risks,
};

console.log(JSON.stringify(report, null, 2));
