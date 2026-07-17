#!/usr/bin/env node
/**
 * WindArms operator gate — zero-dependency character GLB inspector
 * (Phase 5, 2026-07-17). The character-side sibling of inspect-glb.mjs:
 * everything that tool checks, plus what only matters for a rigged
 * operator — skeleton, skinning, animation clips, socket empties, LOD tier
 * budgets.
 *
 *   node tools/inspect-operator.mjs <file.glb> [--lod 0|1|2]
 *
 * Run on every operator model (and every LOD export) before it enters
 * public/v2-art/. Exits non-zero on budget/rigging ERRORS so it can gate CI.
 *
 * Budgets: LOD0 mirrors src/lib/v2/pipeline/manifest.ts's OPERATOR_BUDGET
 * (45k tris / 10 materials / 2048px) — keep the two in sync by hand, this
 * file stays dependency-free and cannot import TypeScript.
 */

import { readFileSync } from 'node:fs';

const LOD_BUDGETS = {
  0: { tris: 45_000, materials: 10, texPx: 2048, fileMB: 6, textureMB: 8 },
  1: { tris: 20_000, materials: 8, texPx: 1024, fileMB: 3, textureMB: 4 },
  2: { tris: 8_000, materials: 4, texPx: 512, fileMB: 1.5, textureMB: 2 },
};

/** Mirrors src/lib/v2/operators/types.ts OperatorSocketId (16) — socket empties are named socket_<id>. */
const ALL_SOCKETS = [
  'head', 'neck', 'spine', 'pelvis',
  'left_hand', 'right_hand', 'left_foot', 'right_foot',
  'weapon_primary', 'weapon_secondary', 'back', 'belt', 'grenade',
  'camera_fp', 'camera_tp', 'muzzle_reference',
];

/** Mirrors src/lib/v2/operators/sockets.ts REQUIRED_OPERATOR_SOCKETS. */
const REQUIRED_SOCKETS = ['head', 'spine', 'pelvis', 'right_hand', 'left_hand', 'weapon_primary', 'camera_fp'];

/** Mirrors src/lib/v2/operators/sockets.ts DEFAULT_BONE_FALLBACKS (required subset) — "missing socket but runtime-resolvable via bone". */
const BONE_FALLBACKS = {
  head: ['head', 'mixamorig:head', 'def-head'],
  spine: ['spine_03', 'spine2', 'chest', 'mixamorig:spine2', 'def-chest', 'spine'],
  pelvis: ['pelvis', 'hips', 'mixamorig:hips', 'def-hips'],
  right_hand: ['hand_r', 'righthand', 'hand.r', 'mixamorig:righthand', 'def-hand.r'],
  left_hand: ['hand_l', 'lefthand', 'hand.l', 'mixamorig:lefthand', 'def-hand.l'],
  weapon_primary: ['hand_r', 'righthand', 'hand.r', 'mixamorig:righthand'],
  camera_fp: ['head', 'mixamorig:head'],
};

/** Mirrors src/lib/v2/operators/animations.ts OPERATOR_ANIMATION_STATES (16) — clip name = state name. */
const EXPECTED_CLIPS = [
  'idle', 'walk', 'sprint', 'ads', 'fire', 'reload', 'inspect', 'equip', 'unequip',
  'jump', 'fall', 'land', 'death', 'victory', 'lobby_idle', 'selection_pose',
];

// ── CLI ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const lod = args.includes('--lod') ? Number(args[args.indexOf('--lod') + 1] ?? 0) : 0;

if (!file || !(lod in LOD_BUDGETS)) {
  console.error('usage: node tools/inspect-operator.mjs <file.glb> [--lod 0|1|2]');
  process.exit(1);
}

// ── Container ─────────────────────────────────────────────────────────
const buffer = readFileSync(file);
if (buffer.toString('ascii', 0, 4) !== 'glTF') {
  console.error(`Not a GLB container (magic="${buffer.toString('ascii', 0, 4)}")`);
  process.exit(1);
}
const jsonLength = buffer.readUInt32LE(12);
const json = JSON.parse(buffer.toString('utf8', 20, 20 + jsonLength));

const mb = (bytes) => (bytes / 1024 / 1024).toFixed(2);
const num = (n) => n.toLocaleString('en-US');
const errors = [];
const warnings = [];

console.log(`\n═ Operator GLB Inspection: ${file} (target LOD${lod})`);
console.log(`  container glTF v${buffer.readUInt32LE(4)} · file ${mb(buffer.length)} MB`);
console.log(`  generator: ${json.asset?.generator ?? 'unknown'}`);
if (json.extensionsRequired?.length) {
  console.log(`  REQUIRED extensions: ${json.extensionsRequired.join(', ')}`);
  const supported = ['KHR_draco_mesh_compression', 'EXT_texture_webp', 'KHR_texture_transform'];
  for (const extension of json.extensionsRequired) {
    if (!supported.includes(extension)) warnings.push(`extension "${extension}" is not in the known-supported set (${supported.join(', ')}) — verify the loader path before shipping.`);
  }
}

// ── Skeleton ──────────────────────────────────────────────────────────
console.log('\n─ Skeleton');
const skins = json.skins ?? [];
if (skins.length === 0) {
  errors.push('no skins[] — this is a static mesh, not a rigged character. Export with armature + skin weights.');
  console.log('  NONE — static mesh');
} else {
  for (const [skinIndex, skin] of skins.entries()) {
    const jointNames = (skin.joints ?? []).map((j) => json.nodes[j]?.name ?? `(node ${j})`);
    console.log(`  skin ${skinIndex}: ${jointNames.length} joints${skin.skeleton !== undefined ? ` · root "${json.nodes[skin.skeleton]?.name ?? skin.skeleton}"` : ''}`);
    console.log(`    joints: ${jointNames.slice(0, 8).join(', ')}${jointNames.length > 8 ? `, … (+${jointNames.length - 8})` : ''}`);
    if (jointNames.length > 120) warnings.push(`skin ${skinIndex} has ${jointNames.length} joints — >120 is heavy for web skinning; consider pruning twist/facial helpers into LOD0-only.`);
  }
  if (skins.length > 1) warnings.push(`${skins.length} skins — a single character should ship one skin; multiple usually means un-merged export objects.`);
}

// ── Geometry ──────────────────────────────────────────────────────────
console.log('\n─ Geometry');
let totalTris = 0;
let totalVerts = 0;
let unskinnedMeshes = 0;
for (const [meshIndex, mesh] of (json.meshes ?? []).entries()) {
  for (const [primIndex, prim] of mesh.primitives.entries()) {
    const position = json.accessors[prim.attributes.POSITION];
    const indices = prim.indices !== undefined ? json.accessors[prim.indices] : null;
    const tris = Math.round(indices ? indices.count / 3 : position.count / 3);
    totalTris += tris;
    totalVerts += position.count;
    const skinned = prim.attributes.JOINTS_0 !== undefined && prim.attributes.WEIGHTS_0 !== undefined;
    if (!skinned) unskinnedMeshes += 1;
    console.log(
      `  mesh ${meshIndex}.${primIndex}: ${num(position.count)} verts · ${num(tris)} tris` +
        `${skinned ? ' · skinned' : ' · NOT SKINNED'}` +
        `${prim.attributes.NORMAL === undefined ? ' · NO NORMALS' : ''}` +
        `${prim.attributes.TEXCOORD_0 === undefined ? ' · NO UVs' : ''}`,
    );
  }
}
if (unskinnedMeshes > 0 && skins.length > 0) {
  warnings.push(`${unskinnedMeshes} primitive(s) carry no JOINTS_0/WEIGHTS_0 — rigid attachments are fine (helmets, plates parented to bones), loose statics are not.`);
}

// ── Sockets ───────────────────────────────────────────────────────────
console.log('\n─ Sockets (empties named socket_<id>)');
const nodeNamesLower = new Set((json.nodes ?? []).map((n) => (n.name ?? '').toLowerCase()).filter(Boolean));
const presentSockets = ALL_SOCKETS.filter((id) => nodeNamesLower.has(`socket_${id}`));
const missingRequired = REQUIRED_SOCKETS.filter((id) => !nodeNamesLower.has(`socket_${id}`));
const missingOptional = ALL_SOCKETS.filter((id) => !REQUIRED_SOCKETS.includes(id) && !nodeNamesLower.has(`socket_${id}`));
console.log(`  present (${presentSockets.length}/${ALL_SOCKETS.length}): ${presentSockets.join(', ') || '(none)'}`);
for (const id of missingRequired) {
  const viaBone = (BONE_FALLBACKS[id] ?? []).find((bone) => nodeNamesLower.has(bone));
  if (viaBone) {
    warnings.push(`required socket "socket_${id}" missing — runtime will fall back to bone "${viaBone}"; author the real empty before FP alignment work (Phase 7).`);
  } else {
    errors.push(`required socket "socket_${id}" missing and no known fallback bone found — attachment/camera systems cannot resolve it.`);
  }
}
if (missingOptional.length > 0) console.log(`  optional missing: ${missingOptional.join(', ')}`);

// Duplicate node names break name-based socket/bone resolution.
const nameCounts = new Map();
for (const node of json.nodes ?? []) {
  if (!node.name) continue;
  const key = node.name.toLowerCase();
  nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
}
const duplicates = [...nameCounts.entries()].filter(([, count]) => count > 1).map(([name]) => name);
if (duplicates.length > 0) warnings.push(`duplicate node names (${duplicates.slice(0, 6).join(', ')}${duplicates.length > 6 ? ', …' : ''}) — name-based socket/bone resolution takes the first match; rename for determinism.`);

// ── Animation clips ───────────────────────────────────────────────────
console.log('\n─ Animation clips');
const animations = json.animations ?? [];
const clipNamesLower = new Set(animations.map((a) => (a.name ?? '').toLowerCase()));
if (animations.length === 0) {
  console.log('  NONE');
  warnings.push('0 animation clips — acceptable for a model-only drop (clips can land in a later export), but every OperatorAnimationState is a no-op until they exist.');
} else {
  for (const animation of animations) {
    let duration = 0;
    for (const sampler of animation.samplers ?? []) {
      const input = json.accessors[sampler.input];
      if (input?.max?.[0] !== undefined) duration = Math.max(duration, input.max[0]);
    }
    console.log(`  "${animation.name ?? '(unnamed)'}": ${(animation.channels ?? []).length} channels · ${duration.toFixed(2)}s`);
    if (!animation.name) warnings.push('an unnamed animation clip exists — the state system resolves clips by name; name every clip.');
  }
}
const missingClips = EXPECTED_CLIPS.filter((c) => !clipNamesLower.has(c));
const presentClips = EXPECTED_CLIPS.filter((c) => clipNamesLower.has(c));
console.log(`  state coverage: ${presentClips.length}/${EXPECTED_CLIPS.length}${missingClips.length ? ` · missing: ${missingClips.join(', ')}` : ' — complete'}`);
const unknownClips = animations.map((a) => (a.name ?? '').toLowerCase()).filter((n) => n && !EXPECTED_CLIPS.includes(n));
if (unknownClips.length > 0) console.log(`  extra (non-state) clips: ${unknownClips.join(', ')}`);

// ── Materials & textures ──────────────────────────────────────────────
console.log('\n─ Materials');
const materials = json.materials ?? [];
for (const material of materials) {
  const pbr = material.pbrMetallicRoughness ?? {};
  const maps = [
    pbr.baseColorTexture && 'baseColor',
    pbr.metallicRoughnessTexture && 'metallicRoughness',
    material.normalTexture && 'normal',
    material.occlusionTexture && 'occlusion',
    material.emissiveTexture && 'emissive',
  ].filter(Boolean);
  console.log(`  "${material.name ?? 'unnamed'}": maps: ${maps.join(', ') || 'none'}${material.normalTexture ? '' : ' · NO NORMAL MAP'}`);
  if (!material.name) warnings.push('unnamed material — name it (and name the tintable one *accent*/*energy*/*tint* for the skin tint system).');
}
const hasTintable = materials.some((m) => ['accent', 'energy', 'tint'].some((hint) => (m.name ?? '').toLowerCase().includes(hint)));
if (materials.length > 0 && !hasTintable) {
  warnings.push('no material named *accent*/*energy*/*tint* — accent-tint skins (the cheap skin tier) have nothing to target.');
}
let textureBytes = 0;
for (const image of json.images ?? []) {
  if (image.bufferView !== undefined) textureBytes += json.bufferViews[image.bufferView].byteLength;
}
// Texture pixel dimensions aren't in the glTF JSON (they're inside the
// encoded PNG/WebP) — report byte weight here; the in-engine validator
// (src/lib/v2/pipeline/validation.ts) checks decoded pixel size at load.
console.log(`  embedded textures: ${(json.images ?? []).length} · ${mb(textureBytes)} MB (pixel-size check happens in-engine)`);

// ── Budget verdicts ───────────────────────────────────────────────────
const budget = LOD_BUDGETS[lod];
const gate = (ok, label, message) => {
  console.log(`  ${label}  ${ok ? 'PASS' : 'FAIL'}`);
  if (!ok) errors.push(message);
};
console.log(`\n─ Budget (LOD${lod})`);
gate(totalTris <= budget.tris, `triangles: ${num(totalTris)} / ${num(budget.tris)}`, `${num(totalTris)} triangles exceeds the LOD${lod} budget of ${num(budget.tris)}.`);
gate(materials.length <= budget.materials, `materials: ${materials.length} / ${budget.materials}`, `${materials.length} materials exceeds the LOD${lod} budget of ${budget.materials}.`);
gate(buffer.length <= budget.fileMB * 1024 * 1024, `file size: ${mb(buffer.length)} / ${budget.fileMB} MB`, `file ${mb(buffer.length)} MB exceeds the LOD${lod} budget of ${budget.fileMB} MB.`);
gate(textureBytes <= budget.textureMB * 1024 * 1024, `textures:  ${mb(textureBytes)} / ${budget.textureMB} MB`, `textures ${mb(textureBytes)} MB exceed the LOD${lod} budget of ${budget.textureMB} MB.`);
console.log(`  verts: ${num(totalVerts)} · clips: ${animations.length} · skins: ${skins.length}`);

// ── Verdict ───────────────────────────────────────────────────────────
console.log('\n─ Verdict');
for (const message of errors) console.log(`  ✖ ERROR   ${message}`);
for (const message of warnings) console.log(`  ▲ warning ${message}`);
if (errors.length === 0 && warnings.length === 0) console.log('  clean — ship it.');
console.log(`  ${errors.length} error(s), ${warnings.length} warning(s)\n`);
process.exitCode = errors.length > 0 ? 1 : 0;
