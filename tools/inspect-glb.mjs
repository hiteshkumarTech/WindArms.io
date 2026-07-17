#!/usr/bin/env node
/**
 * WindArms asset gate — zero-dependency GLB inspector.
 *
 *   node tools/inspect-glb.mjs <file.glb> [--target viewmodel|showpiece]
 *
 * Parses the GLB container + glTF JSON chunk and reports scale, pivot,
 * hierarchy, materials, topology and budget verdicts. Run this on every
 * weapon/character/prop before it enters public/v2-art/.
 */

import { readFileSync } from 'node:fs';

const BUDGETS = {
  viewmodel: { tris: 60_000, fileMB: 2, textureMB: 4 },
  showpiece: { tris: 150_000, fileMB: 5, textureMB: 8 },
};

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const target = args.includes('--target')
  ? args[args.indexOf('--target') + 1] ?? 'showpiece'
  : 'showpiece';

if (!file) {
  console.error('usage: node tools/inspect-glb.mjs <file.glb> [--target viewmodel|showpiece]');
  process.exit(1);
}

const buffer = readFileSync(file);
const magic = buffer.toString('ascii', 0, 4);
if (magic !== 'glTF') {
  console.error(`Not a GLB container (magic="${magic}")`);
  process.exit(1);
}

const version = buffer.readUInt32LE(4);
const totalLength = buffer.readUInt32LE(8);
const jsonLength = buffer.readUInt32LE(12);
const json = JSON.parse(buffer.toString('utf8', 20, 20 + jsonLength));

const mb = (bytes) => (bytes / 1024 / 1024).toFixed(2);
const num = (n) => n.toLocaleString('en-US');

console.log(`\n═ GLB Inspection: ${file}`);
console.log(`  container glTF v${version} · file ${mb(buffer.length)} MB (declared ${mb(totalLength)} MB)`);
console.log(`  generator: ${json.asset?.generator ?? 'unknown'}`);
if (json.extensionsRequired?.length) {
  console.log(`  REQUIRED extensions: ${json.extensionsRequired.join(', ')} (loader must support!)`);
}

// ── Hierarchy ────────────────────────────────────────────────────────
console.log('\n─ Node hierarchy');
const printNode = (index, depth) => {
  const node = json.nodes[index];
  const bits = [];
  if (node.mesh !== undefined) bits.push(`mesh ${node.mesh}`);
  if (node.matrix) bits.push('matrix');
  if (node.scale) bits.push(`scale [${node.scale.join(', ')}]`);
  if (node.translation) bits.push(`t [${node.translation.join(', ')}]`);
  console.log(`  ${'  '.repeat(depth)}• ${node.name ?? '(unnamed)'} ${bits.length ? `— ${bits.join(', ')}` : ''}`);
  (node.children ?? []).forEach((child) => printNode(child, depth + 1));
};
(json.scenes?.[json.scene ?? 0]?.nodes ?? []).forEach((root) => printNode(root, 0));

// ── World transforms (FIXED 2026-07-17) ──────────────────────────────
// Earlier versions read a single root uniform-scale value and ignored
// rotations entirely. That broke on the vortex v0.2 runtime derivative:
// its baked +90° Y rotation is persisted as a TRS quaternion (gltf-transform
// decomposes setMatrix into T/R/S fields), so this tool reported the
// PRE-rotation axes (Z-long) while the file truly renders X-long (the
// builder's getBounds and the in-engine render proof agreed). Fix: compose
// every node's local matrix (matrix field, or T·R·S per the glTF spec),
// accumulate from the scene roots, and transform real bbox corners.
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

const composeLocal = (node) => {
  if (node.matrix) return node.matrix;
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const [qx, qy, qz, qw] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz;
  const xx = qx * x2, xy = qx * y2, xz = qx * z2;
  const yy = qy * y2, yz = qy * z2, zz = qz * z2;
  const wx = qw * x2, wy = qw * y2, wz = qw * z2;
  // Column-major T·R·S, matching glTF's matrix layout.
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ];
};

const mulMat4 = (a, b) => {
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return out;
};

const applyMat4 = (m, [x, y, z]) => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
];

/** meshIndex → every world matrix that instances it. */
const meshWorldMatrices = new Map();
{
  const walk = (index, parent) => {
    const node = json.nodes[index];
    const world = mulMat4(parent, composeLocal(node));
    if (node.mesh !== undefined) {
      const list = meshWorldMatrices.get(node.mesh) ?? [];
      list.push(world);
      meshWorldMatrices.set(node.mesh, list);
    }
    (node.children ?? []).forEach((child) => walk(child, world));
  };
  (json.scenes?.[json.scene ?? 0]?.nodes ?? []).forEach((root) => walk(root, IDENTITY));
}

// ── Geometry ─────────────────────────────────────────────────────────
console.log('\n─ Geometry');
let totalTris = 0;
let totalVerts = 0;
let boundsMin = null;
let boundsMax = null;
let worldMin = null;
let worldMax = null;
for (const [meshIndex, mesh] of (json.meshes ?? []).entries()) {
  for (const [primIndex, prim] of mesh.primitives.entries()) {
    const position = json.accessors[prim.attributes.POSITION];
    const indices = prim.indices !== undefined ? json.accessors[prim.indices] : null;
    const tris = indices ? indices.count / 3 : position.count / 3;
    totalTris += tris;
    totalVerts += position.count;
    if (position.min && position.max) {
      boundsMin = boundsMin
        ? boundsMin.map((v, i) => Math.min(v, position.min[i]))
        : [...position.min];
      boundsMax = boundsMax
        ? boundsMax.map((v, i) => Math.max(v, position.max[i]))
        : [...position.max];
      // World AABB: transform all 8 local bbox corners by every world
      // matrix that instances this mesh (rotation-safe, unlike the old
      // single-root-scale shortcut).
      for (const matrix of meshWorldMatrices.get(meshIndex) ?? [IDENTITY]) {
        for (let corner = 0; corner < 8; corner++) {
          const point = applyMat4(matrix, [
            corner & 1 ? position.max[0] : position.min[0],
            corner & 2 ? position.max[1] : position.min[1],
            corner & 4 ? position.max[2] : position.min[2],
          ]);
          worldMin = worldMin ? worldMin.map((v, i) => Math.min(v, point[i])) : [...point];
          worldMax = worldMax ? worldMax.map((v, i) => Math.max(v, point[i])) : [...point];
        }
      }
    }
    const attrs = Object.keys(prim.attributes).join(', ');
    console.log(
      `  mesh ${meshIndex}.${primIndex}: ${num(position.count)} verts · ${num(Math.round(tris))} tris · [${attrs}]` +
        `${prim.attributes.NORMAL === undefined ? ' · NO NORMALS' : ''}` +
        `${prim.attributes.TEXCOORD_0 === undefined ? ' · NO UVs' : ''}`,
    );
  }
}
if (boundsMin && boundsMax) {
  const local = boundsMax.map((v, i) => v - boundsMin[i]);
  console.log(`  local bounds:  ${local.map((v) => v.toFixed(3)).join(' × ')} (raw vertex space, pre-transform)`);
}
if (worldMin && worldMax) {
  const world = worldMax.map((v, i) => v - worldMin[i]);
  const center = worldMax.map((v, i) => (v + worldMin[i]) / 2);
  const axis = ['X', 'Y', 'Z'][world.indexOf(Math.max(...world))];
  console.log(`  world size:    ${world.map((v) => v.toFixed(3)).join(' × ')} m · long axis ${axis} (full node-transform accumulation)`);
  console.log(`  world center:  [${center.map((v) => v.toFixed(3)).join(', ')}] (pivot offset from origin)`);
}

// ── Materials & textures ─────────────────────────────────────────────
console.log('\n─ Materials');
for (const material of json.materials ?? []) {
  const pbr = material.pbrMetallicRoughness ?? {};
  const maps = [
    pbr.baseColorTexture && 'baseColor',
    pbr.metallicRoughnessTexture && 'metallicRoughness',
    material.normalTexture && 'normal',
    material.occlusionTexture && 'occlusion',
    material.emissiveTexture && 'emissive',
  ].filter(Boolean);
  console.log(
    `  "${material.name ?? 'unnamed'}": metal=${pbr.metallicFactor ?? 1} rough=${pbr.roughnessFactor ?? 1} · maps: ${maps.join(', ') || 'none'}` +
      `${material.normalTexture ? '' : ' · NO NORMAL MAP'}`,
  );
}
let textureBytes = 0;
for (const image of json.images ?? []) {
  if (image.bufferView !== undefined) textureBytes += json.bufferViews[image.bufferView].byteLength;
}
console.log(`  embedded textures: ${(json.images ?? []).length} · ${mb(textureBytes)} MB`);

// ── Budget verdicts ──────────────────────────────────────────────────
const budget = BUDGETS[target] ?? BUDGETS.showpiece;
const verdict = (ok) => (ok ? 'PASS' : 'FAIL');
console.log(`\n─ Budget (${target})`);
console.log(`  triangles: ${num(Math.round(totalTris))} / ${num(budget.tris)}  ${verdict(totalTris <= budget.tris)}`);
console.log(`  file size: ${mb(buffer.length)} / ${budget.fileMB} MB  ${verdict(buffer.length <= budget.fileMB * 1024 * 1024)}`);
console.log(`  textures:  ${mb(textureBytes)} / ${budget.textureMB} MB  ${verdict(textureBytes <= budget.textureMB * 1024 * 1024)}`);
console.log(`  animations: ${(json.animations ?? []).length} · skins: ${(json.skins ?? []).length}`);
console.log('');
