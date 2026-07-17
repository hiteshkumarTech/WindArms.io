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

// Uniform scale detection from a single root matrix chain.
let rootScale = 1;
const rootIndex = json.scenes?.[json.scene ?? 0]?.nodes?.[0];
const rootNode = rootIndex !== undefined ? json.nodes[rootIndex] : undefined;
if (rootNode?.matrix) rootScale = rootNode.matrix[0];
if (rootNode?.scale) rootScale = rootNode.scale[0];

// ── Geometry ─────────────────────────────────────────────────────────
console.log('\n─ Geometry');
let totalTris = 0;
let totalVerts = 0;
let boundsMin = null;
let boundsMax = null;
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
  const world = local.map((v) => v * rootScale);
  const center = boundsMax.map((v, i) => ((v + boundsMin[i]) / 2) * rootScale);
  console.log(`  local bounds:  ${local.map((v) => v.toFixed(3)).join(' × ')}`);
  console.log(`  world size:    ${world.map((v) => v.toFixed(3)).join(' × ')} m (root scale ${rootScale.toFixed(4)})`);
  console.log(`  bbox center:   [${center.map((v) => v.toFixed(3)).join(', ')}] (pivot offset from origin)`);
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
