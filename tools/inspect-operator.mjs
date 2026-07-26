#!/usr/bin/env node
/**
 * WindArms operator gate — zero-dependency character GLB inspector
 * (Phase 5, 2026-07-17). The character-side sibling of inspect-glb.mjs:
 * everything that tool checks, plus what only matters for a rigged
 * operator — skeleton, skinning, animation clips, socket empties, LOD tier
 * budgets.
 *
 *   node tools/inspect-operator.mjs <file.glb> [--lod 0|1|2]
 *   node tools/inspect-operator.mjs <file.glb> --mode arms
 *
 * Run on every operator model (and every LOD export) before it enters
 * public/v2-art/. Exits non-zero on budget/rigging ERRORS so it can gate CI.
 *
 * Budgets: LOD0 mirrors src/lib/v2/pipeline/manifest.ts's OPERATOR_BUDGET
 * (45k tris / 10 materials / 2048px) — keep the two in sync by hand, this
 * file stays dependency-free and cannot import TypeScript.
 *
 * --mode arms is a SEPARATE validation path (Milestone 7, Phase F, Step 4)
 * for first-person arms derivatives (operator-kael-arms.glb and future
 * equivalents) — a partial-body mesh that is CORRECTLY missing legs, head,
 * and torso by design. Running the normal full-body path against one would
 * either false-fail (REQUIRED_SOCKETS expects pelvis/spine coverage a
 * deliberately-partial mesh has no reason to carry) or false-pass (LOD
 * budgets sized for a full body are meaningless for an arms-only mesh).
 * This mode does not alter or weaken the default full-body path at all —
 * it's an early, fully separate branch.
 */

import { readFileSync } from 'node:fs';

const LOD_BUDGETS = {
  0: { tris: 45_000, materials: 10, texPx: 2048, fileMB: 6, textureMB: 8 },
  1: { tris: 20_000, materials: 8, texPx: 1024, fileMB: 3, textureMB: 4 },
  2: { tris: 8_000, materials: 4, texPx: 512, fileMB: 1.5, textureMB: 2 },
};

/** operator-kael-arms.glb budget (Step 4) — materially below LOD0's 45k;
 * see tools/blender/make-kael-fp-arms.py's ARMS_BUDGET_TRIS comment for
 * the full reasoning (measured pre-decimation size, hand/finger protection
 * floor). Keep in sync by hand if that script's budget ever changes. */
const ARMS_BUDGET = { tris: 21_000, materials: 4, fileMB: 3, textureMB: 1 };

/** operator-kael-lowerbody.glb budget (Milestone 8, Step 8B) — raised from
 * the brief's original 15,000/17,000 after a real, measured quality curve
 * (four live Blender runs against the real source): 60,000 tris was the
 * only target that rendered completely clean (zero holes); 40,000 still
 * showed minor visible blemishes, and 26,000/15-17k were both visibly
 * broken. Keep in sync by hand with tools/blender/make-kael-fp-lowerbody.py's
 * own LOWERBODY_BUDGET_TRIS/LOWERBODY_TARGET_TRIS if either ever changes. */
const LOWERBODY_BUDGET = { trisTarget: 60_000, trisCeiling: 62_000, materials: 2, fileMB: 6, textureMB: 1 };

/** Required bone-name fragments for the lower-body derivative — pelvis,
 * both upper/lower legs, both feet, both toe chains. Deliberately does NOT
 * include any head/neck/shoulder/arm/hand chain — those must be ABSENT,
 * checked separately by LOWERBODY_FORBIDDEN_BONE_FRAGMENTS below. */
const LOWERBODY_REQUIRED_BONE_FRAGMENTS = {
  pelvis: ['hips', 'pelvis'],
  upper_leg_left: ['leftupleg', 'leftthigh'], upper_leg_right: ['rightupleg', 'rightthigh'],
  lower_leg_left: ['leftleg', 'leftcalf'], lower_leg_right: ['rightleg', 'rightcalf'],
  foot_left: ['leftfoot'], foot_right: ['rightfoot'],
  toe_left: ['lefttoe'], toe_right: ['righttoe'],
};

/** Bone-name fragments that must have NO real weighted vertex influence in
 * the lower-body derivative — head/neck/shoulder/arm/hand/finger chains.
 * Presence of the BONE NODE itself (inherited from the full 65-bone
 * skeleton, kept for compatibility per Step 8B section 6) is fine; real
 * skin WEIGHT on one of these is the actual contamination signal, checked
 * via WEIGHTS_0/JOINTS_0 below, not just node-name presence. */
const LOWERBODY_FORBIDDEN_WEIGHT_FRAGMENTS = ['head', 'neck', 'shoulder', 'arm', 'hand', 'thumb', 'index', 'middle', 'ring', 'pinky'];

/** Required bone-name fragments (case-insensitive substring match against
 * node names) for an FP-arms derivative — both arm chains, both hands, all
 * 5 finger chains per side. Deliberately does NOT include any leg/hip/head
 * chain — missing those is correct for this asset, not a failure. */
const ARMS_REQUIRED_BONE_FRAGMENTS = {
  upper_arm_left: ['leftarm'], upper_arm_right: ['rightarm'],
  lower_arm_left: ['leftforearm'], lower_arm_right: ['rightforearm'],
  hand_left: ['lefthand'], hand_right: ['righthand'],
  thumb_left: ['lefthandthumb'], thumb_right: ['righthandthumb'],
  index_left: ['lefthandindex'], index_right: ['righthandindex'],
  middle_left: ['lefthandmiddle'], middle_right: ['righthandmiddle'],
  ring_left: ['lefthandring'], ring_right: ['righthandring'],
  pinky_left: ['lefthandpinky'], pinky_right: ['righthandpinky'],
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
const mode = args.includes('--mode') ? args[args.indexOf('--mode') + 1] : 'body';
const lod = args.includes('--lod') ? Number(args[args.indexOf('--lod') + 1] ?? 0) : 0;

const KNOWN_MODES = ['body', 'arms', 'lowerbody'];
if (!file || (mode === 'body' && !(lod in LOD_BUDGETS)) || !KNOWN_MODES.includes(mode)) {
  console.error('usage: node tools/inspect-operator.mjs <file.glb> [--lod 0|1|2]');
  console.error('       node tools/inspect-operator.mjs <file.glb> --mode arms');
  console.error('       node tools/inspect-operator.mjs <file.glb> --mode lowerbody');
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

// ── Arms mode — separate, self-contained validation path ───────────────
if (mode === 'arms') {
  console.log(`\n═ Operator FP-Arms GLB Inspection: ${file}`);
  console.log(`  container glTF v${buffer.readUInt32LE(4)} · file ${mb(buffer.length)} MB`);
  console.log(`  generator: ${json.asset?.generator ?? 'unknown'}`);

  const skins = json.skins ?? [];
  console.log('\n─ Skeleton');
  if (skins.length !== 1) {
    errors.push(`expected exactly 1 skin, found ${skins.length}.`);
  }
  const jointCount = skins[0]?.joints?.length ?? 0;
  console.log(`  skins: ${skins.length} · joints: ${jointCount}`);
  if (jointCount === 0) errors.push('0 joints — not a rigged mesh.');

  const nodeNamesLower = new Set((json.nodes ?? []).map((n) => (n.name ?? '').toLowerCase()).filter(Boolean));
  console.log('\n─ Required arm/hand/finger bones (legs/head/torso intentionally absent — not checked)');
  const missingBoneChains = [];
  for (const [chain, fragments] of Object.entries(ARMS_REQUIRED_BONE_FRAGMENTS)) {
    const found = [...nodeNamesLower].some((n) => fragments.some((f) => n.includes(f)));
    if (!found) missingBoneChains.push(chain);
  }
  if (missingBoneChains.length > 0) {
    errors.push(`missing required arm/hand/finger bone chain(s): ${missingBoneChains.join(', ')}.`);
    console.log(`  MISSING: ${missingBoneChains.join(', ')}`);
  } else {
    console.log(`  all ${Object.keys(ARMS_REQUIRED_BONE_FRAGMENTS).length} required chains present.`);
  }

  console.log('\n─ Geometry');
  let totalTris = 0;
  let totalVerts = 0;
  let unskinnedPrims = 0;
  let boundsFinite = true;
  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives) {
      const position = json.accessors[prim.attributes.POSITION];
      const indices = prim.indices !== undefined ? json.accessors[prim.indices] : null;
      const tris = Math.round(indices ? indices.count / 3 : position.count / 3);
      totalTris += tris;
      totalVerts += position.count;
      if (!(prim.attributes.JOINTS_0 !== undefined && prim.attributes.WEIGHTS_0 !== undefined)) unskinnedPrims += 1;
      const allCoords = [...(position.min ?? []), ...(position.max ?? [])];
      if (allCoords.length === 0 || allCoords.some((v) => !Number.isFinite(v))) boundsFinite = false;
    }
  }
  console.log(`  verts: ${num(totalVerts)} · tris: ${num(totalTris)}`);
  if (totalVerts === 0 || totalTris === 0) errors.push('zero vertices/triangles.');
  if (unskinnedPrims > 0) errors.push(`${unskinnedPrims} primitive(s) missing JOINTS_0/WEIGHTS_0 — arms mesh must be fully skinned.`);
  if (!boundsFinite) errors.push('POSITION accessor bounds are missing or non-finite.');

  // Extreme edge-length check (Milestone 7, Phase F, Step 6C, 2026-07-22) —
  // catches exactly the defect class that shipped invisibly for one full
  // pass: a Decimate modifier applied next to this mesh's open shoulder/
  // torso cut boundary (no protection there — only hand/finger regions are
  // decimation-protected) can stretch individual triangles to ~0.12-0.16m
  // edges even though the pre-decimation source mesh never exceeds ~0.02m
  // anywhere (measured on the real asset — see docs/decisions.md's
  // "exploded geometry" entries). At a 75° first-person FOV and the small
  // (<1m) distances this rig renders at, a single such triangle can fill a
  // large fraction of the screen — "clean topology, budget-compliant tri
  // count" is not sufficient on its own to guarantee this doesn't happen;
  // this reads the RAW GLB buffer directly (no rendering, no bmesh) so it
  // catches the defect at import-gate time, before a human ever needs a
  // browser to notice it.
  const CHUNK0_START = 20 + jsonLength;
  const chunk0Length = buffer.readUInt32LE(CHUNK0_START);
  const binChunkStart = CHUNK0_START + 8; // skip this chunk's own 8-byte length+type header
  const COMPONENT_BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
  const TYPE_COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
  function readAccessor(accessorIndex) {
    const accessor = json.accessors[accessorIndex];
    const bufferView = json.bufferViews[accessor.bufferView];
    if (bufferView.buffer !== 0 || (json.buffers?.[0]?.uri !== undefined)) return null; // external/non-embedded buffer, skip (not this pipeline's convention)
    const compBytes = COMPONENT_BYTES[accessor.componentType];
    const numComponents = TYPE_COMPONENTS[accessor.type];
    if (!compBytes || !numComponents) return null;
    const stride = bufferView.byteStride ?? compBytes * numComponents;
    const base = binChunkStart + (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const out = new Array(accessor.count);
    for (let i = 0; i < accessor.count; i++) {
      const recordOffset = base + i * stride;
      const values = new Array(numComponents);
      for (let c = 0; c < numComponents; c++) {
        const byteOffset = recordOffset + c * compBytes;
        values[c] = accessor.componentType === 5126 ? buffer.readFloatLE(byteOffset)
          : accessor.componentType === 5123 ? buffer.readUInt16LE(byteOffset)
          : accessor.componentType === 5125 ? buffer.readUInt32LE(byteOffset)
          : accessor.componentType === 5121 ? buffer.readUInt8(byteOffset)
          : null;
      }
      out[i] = values;
    }
    return out;
  }
  const MAX_EDGE_LENGTH_M = 0.06; // generous margin above the 0.035m this pipeline's own scalpel cleanup targets — flags anything materially worse, not every last millimeter
  let maxEdgeFound = 0;
  let maxEdgeCheckSkipped = false;
  try {
    for (const mesh of json.meshes ?? []) {
      for (const prim of mesh.primitives) {
        const positions = readAccessor(prim.attributes.POSITION);
        const indices = prim.indices !== undefined ? readAccessor(prim.indices) : null;
        if (!positions) {
          maxEdgeCheckSkipped = true;
          continue;
        }
        const triIndices = indices ? indices.map((v) => v[0]) : positions.map((_, i) => i);
        for (let t = 0; t + 2 < triIndices.length; t += 3) {
          const [ax, ay, az] = positions[triIndices[t]];
          const [bx, by, bz] = positions[triIndices[t + 1]];
          const [cx, cy, cz] = positions[triIndices[t + 2]];
          const d1 = Math.hypot(ax - bx, ay - by, az - bz);
          const d2 = Math.hypot(bx - cx, by - cy, bz - cz);
          const d3 = Math.hypot(cx - ax, cy - ay, cz - az);
          const m = Math.max(d1, d2, d3);
          if (m > maxEdgeFound) maxEdgeFound = m;
        }
      }
    }
  } catch {
    maxEdgeCheckSkipped = true;
  }
  if (maxEdgeCheckSkipped) {
    warnings.push('extreme-edge-length check skipped (unsupported buffer/accessor layout — e.g. Draco/external buffer) — verify manually if this asset renders unexpectedly large geometry.');
  } else {
    console.log(`  max triangle edge length: ${maxEdgeFound.toFixed(4)}m (budget ${MAX_EDGE_LENGTH_M}m)`);
    if (maxEdgeFound > MAX_EDGE_LENGTH_M) {
      errors.push(`max triangle edge length ${maxEdgeFound.toFixed(4)}m exceeds ${MAX_EDGE_LENGTH_M}m — likely a decimation artifact at an open mesh boundary (see docs/decisions.md "exploded geometry"); re-run the arms builder's scalpel cleanup or raise MAX_EDGE_LENGTH_M there.`);
    }
  }

  console.log('\n─ Materials');
  const materials = json.materials ?? [];
  console.log(`  materials: ${materials.length}${materials.length ? ` (${materials.map((m) => m.name ?? 'unnamed').join(', ')})` : ''}`);
  const armsImages = json.images ?? [];
  console.log(`  embedded textures: ${armsImages.length}`);

  // Step 7A (materials pass) additions — this pipeline only ever emits a
  // plain metallicRoughness PBR material with baseColor/normal/ORM PNGs;
  // anything outside that shape is unexpected and worth failing loudly on.
  const KNOWN_SAFE_MATERIAL_EXTENSIONS = [];
  for (const material of materials) {
    const extKeys = Object.keys(material.extensions ?? {});
    const unsupported = extKeys.filter((k) => !KNOWN_SAFE_MATERIAL_EXTENSIONS.includes(k));
    if (unsupported.length > 0) {
      errors.push(`material "${material.name ?? 'unnamed'}" uses unsupported extension(s): ${unsupported.join(', ')} — the runtime GLTFLoader path is not verified for these.`);
    }
  }

  const ARMS_MAX_TEX_DIM = 2048; // "no accidental 4K" ceiling for this budget tier
  for (const [i, image] of armsImages.entries()) {
    if (image.bufferView === undefined) {
      warnings.push(`image ${i} ("${image.name ?? 'unnamed'}") has no bufferView — not embedded, breaking this pipeline's self-contained-GLB convention.`);
      continue;
    }
    const bv = json.bufferViews[image.bufferView];
    const base = binChunkStart + (bv.byteOffset ?? 0);
    const isPng = buffer.readUInt32BE(base) === 0x89504e47;
    if (!isPng) {
      warnings.push(`image ${i} ("${image.name ?? 'unnamed'}") is not a PNG (mimeType=${image.mimeType}) — dimension check skipped.`);
      continue;
    }
    const width = buffer.readUInt32BE(base + 16);
    const height = buffer.readUInt32BE(base + 20);
    console.log(`  image ${i} "${image.name ?? 'unnamed'}": ${width}x${height}px`);
    if (width > ARMS_MAX_TEX_DIM || height > ARMS_MAX_TEX_DIM) {
      errors.push(`image ${i} ("${image.name ?? 'unnamed'}") is ${width}x${height} — exceeds the ${ARMS_MAX_TEX_DIM}px accidental-4K ceiling.`);
    }
  }
  if (materials.length > 0 && armsImages.length === 0) {
    console.log('  (0 textures — expected only for a temporary neutral dev material)');
  }

  // UV/normal/tangent validity. glTF only requires min/max on POSITION —
  // Blender's exporter leaves TEXCOORD_0/NORMAL/TANGENT min/max unset by
  // design, so an earlier version of this check that read accessor.min/max
  // for these attributes always "failed" on a perfectly valid export. Read
  // the actual decoded values via readAccessor() instead.
  const hasTexturedMaterial = materials.some((m) => m.pbrMetallicRoughness?.baseColorTexture || m.normalTexture || m.pbrMetallicRoughness?.metallicRoughnessTexture || m.occlusionTexture);
  try {
    for (const mesh of json.meshes ?? []) {
      for (const prim of mesh.primitives) {
        if (hasTexturedMaterial && prim.attributes.TEXCOORD_0 === undefined) {
          errors.push('a textured material is used but a mesh primitive has no TEXCOORD_0 — UVs required.');
        }
        for (const attrName of ['TEXCOORD_0', 'NORMAL', 'TANGENT']) {
          const idx = prim.attributes[attrName];
          if (idx === undefined) continue;
          const values = readAccessor(idx);
          if (!values) continue;
          const nonFinite = values.some((v) => v.some((c) => !Number.isFinite(c)));
          if (nonFinite) errors.push(`${attrName} accessor contains non-finite (NaN/Infinity) values.`);
        }
      }
    }
  } catch {
    warnings.push('UV/normal/tangent finite-value check skipped (unsupported buffer/accessor layout).');
  }
  if (materials.some((m) => m.normalTexture) && !(json.meshes ?? []).every((mesh) => mesh.primitives.every((p) => p.attributes.TANGENT !== undefined))) {
    errors.push('a material uses a normal map but the mesh has no TANGENT attribute.');
  }

  // Unweighted vertices — every skinned vertex's WEIGHTS_0 must sum > 0.
  try {
    for (const mesh of json.meshes ?? []) {
      for (const prim of mesh.primitives) {
        if (prim.attributes.WEIGHTS_0 === undefined) continue;
        const weights = readAccessor(prim.attributes.WEIGHTS_0);
        if (!weights) continue;
        const unweighted = weights.filter((w) => w.reduce((a, b) => a + b, 0) <= 1e-6).length;
        if (unweighted > 0) {
          errors.push(`${unweighted} vertex(es) with WEIGHTS_0 summing to ~0 — unweighted geometry will not deform with the skeleton.`);
        }
      }
    }
  } catch {
    warnings.push('unweighted-vertex check skipped (unsupported buffer/accessor layout).');
  }

  const animations = json.animations ?? [];
  console.log(`\n─ Animation clips: ${animations.length} (none expected for this derivative yet)`);

  console.log('\n─ Budget');
  const gateArms = (ok, label, message) => {
    console.log(`  ${label}  ${ok ? 'PASS' : 'FAIL'}`);
    if (!ok) errors.push(message);
  };
  gateArms(totalTris <= ARMS_BUDGET.tris, `triangles: ${num(totalTris)} / ${num(ARMS_BUDGET.tris)}`, `${num(totalTris)} triangles exceeds the arms budget of ${num(ARMS_BUDGET.tris)}.`);
  gateArms(materials.length <= ARMS_BUDGET.materials, `materials: ${materials.length} / ${ARMS_BUDGET.materials}`, `${materials.length} materials exceeds the arms budget of ${ARMS_BUDGET.materials}.`);
  gateArms(buffer.length <= ARMS_BUDGET.fileMB * 1024 * 1024, `file size: ${mb(buffer.length)} / ${ARMS_BUDGET.fileMB} MB`, `file ${mb(buffer.length)} MB exceeds the arms budget of ${ARMS_BUDGET.fileMB} MB.`);

  console.log('\n─ Verdict');
  for (const message of errors) console.log(`  ✖ ERROR   ${message}`);
  for (const message of warnings) console.log(`  ▲ warning ${message}`);
  if (errors.length === 0 && warnings.length === 0) console.log('  clean — ship it.');
  console.log(`  ${errors.length} error(s), ${warnings.length} warning(s)\n`);
  process.exitCode = errors.length > 0 ? 1 : 0;
  process.exit(process.exitCode);
}

// ── Lower-body mode — separate, self-contained validation path (Milestone
// 8, Step 8B) ─────────────────────────────────────────────────────────────
// Mirrors --mode arms's structure exactly (same container/skeleton/geometry/
// materials/budget/verdict shape), with two lower-body-specific additions:
// a required-bone check for pelvis/leg/foot/toe chains (inverse of the arms
// check), and a WEIGHT-based (not name-based) contamination check that the
// derivative carries no real head/neck/shoulder/arm/hand influence — the
// exact failure mode Step 8B's brief calls out as the one that must never
// happen ("no weighted head/arm/finger contamination").
if (mode === 'lowerbody') {
  console.log(`\n═ Operator FP-LowerBody GLB Inspection: ${file}`);
  console.log(`  container glTF v${buffer.readUInt32LE(4)} · file ${mb(buffer.length)} MB`);
  console.log(`  generator: ${json.asset?.generator ?? 'unknown'}`);

  const skins = json.skins ?? [];
  console.log('\n─ Skeleton');
  if (skins.length !== 1) {
    errors.push(`expected exactly 1 skin, found ${skins.length}.`);
  }
  const skinJoints = skins[0]?.joints ?? [];
  const jointCount = skinJoints.length;
  console.log(`  skins: ${skins.length} · joints: ${jointCount}`);
  if (jointCount === 0) errors.push('0 joints — not a rigged mesh.');
  // Resolves a JOINTS_0 index (an index INTO skin.joints[]) to the actual node name.
  const jointIndexToNodeName = skinJoints.map((nodeIdx) => (json.nodes[nodeIdx]?.name ?? '').toLowerCase());

  const nodeNamesLower = new Set((json.nodes ?? []).map((n) => (n.name ?? '').toLowerCase()).filter(Boolean));
  console.log('\n─ Required pelvis/leg/foot/toe bones (head/arms/hands intentionally absent — not checked for presence)');
  const missingBoneChains = [];
  for (const [chain, fragments] of Object.entries(LOWERBODY_REQUIRED_BONE_FRAGMENTS)) {
    const found = [...nodeNamesLower].some((n) => fragments.some((f) => n.includes(f)));
    if (!found) missingBoneChains.push(chain);
  }
  if (missingBoneChains.length > 0) {
    errors.push(`missing required pelvis/leg/foot/toe bone chain(s): ${missingBoneChains.join(', ')}.`);
    console.log(`  MISSING: ${missingBoneChains.join(', ')}`);
  } else {
    console.log(`  all ${Object.keys(LOWERBODY_REQUIRED_BONE_FRAGMENTS).length} required chains present.`);
  }

  console.log('\n─ Geometry');
  let totalTris = 0;
  let totalVerts = 0;
  let unskinnedPrims = 0;
  let boundsFinite = true;
  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives) {
      const position = json.accessors[prim.attributes.POSITION];
      const indices = prim.indices !== undefined ? json.accessors[prim.indices] : null;
      const tris = Math.round(indices ? indices.count / 3 : position.count / 3);
      totalTris += tris;
      totalVerts += position.count;
      if (!(prim.attributes.JOINTS_0 !== undefined && prim.attributes.WEIGHTS_0 !== undefined)) unskinnedPrims += 1;
      const allCoords = [...(position.min ?? []), ...(position.max ?? [])];
      if (allCoords.length === 0 || allCoords.some((v) => !Number.isFinite(v))) boundsFinite = false;
    }
  }
  console.log(`  verts: ${num(totalVerts)} · tris: ${num(totalTris)}`);
  if (totalVerts === 0 || totalTris === 0) errors.push('zero vertices/triangles.');
  if (unskinnedPrims > 0) errors.push(`${unskinnedPrims} primitive(s) missing JOINTS_0/WEIGHTS_0 — lower-body mesh must be fully skinned.`);
  if (!boundsFinite) errors.push('POSITION accessor bounds are missing or non-finite.');
  if (json.meshes?.length !== 1 || json.meshes?.[0]?.primitives?.length !== 1) {
    errors.push(`expected exactly 1 mesh with 1 primitive (1 skinned mesh, 1 draw call per Step 8B section 5), found ${json.meshes?.length ?? 0} mesh(es).`);
  }

  // Raw-buffer accessor reader — identical mechanism to --mode arms's
  // readAccessor (see that block's comments for the embedded-buffer-only
  // caveat) — duplicated rather than factored out, since this file is
  // intentionally kept dependency-free/single-file per its own header.
  const CHUNK0_START = 20 + jsonLength;
  const chunk0Length = buffer.readUInt32LE(CHUNK0_START);
  const binChunkStart = CHUNK0_START + 8;
  const COMPONENT_BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
  const TYPE_COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
  function readAccessorLowerBody(accessorIndex) {
    const accessor = json.accessors[accessorIndex];
    const bufferView = json.bufferViews[accessor.bufferView];
    if (bufferView.buffer !== 0 || (json.buffers?.[0]?.uri !== undefined)) return null;
    const compBytes = COMPONENT_BYTES[accessor.componentType];
    const numComponents = TYPE_COMPONENTS[accessor.type];
    if (!compBytes || !numComponents) return null;
    const stride = bufferView.byteStride ?? compBytes * numComponents;
    const base = binChunkStart + (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const out = new Array(accessor.count);
    for (let i = 0; i < accessor.count; i++) {
      const recordOffset = base + i * stride;
      const values = new Array(numComponents);
      for (let c = 0; c < numComponents; c++) {
        const byteOffset = recordOffset + c * compBytes;
        values[c] = accessor.componentType === 5126 ? buffer.readFloatLE(byteOffset)
          : accessor.componentType === 5123 ? buffer.readUInt16LE(byteOffset)
          : accessor.componentType === 5125 ? buffer.readUInt32LE(byteOffset)
          : accessor.componentType === 5121 ? buffer.readUInt8(byteOffset)
          : accessor.componentType === 5122 ? buffer.readInt16LE(byteOffset)
          : accessor.componentType === 5120 ? buffer.readInt8(byteOffset)
          : null;
      }
      out[i] = values;
    }
    return out;
  }

  // ── Weight-based upper-body contamination check ──────────────────────
  // The actual "no weighted head/arm/finger contamination" gate — reads
  // real JOINTS_0/WEIGHTS_0 data, resolves each joint index to its bone
  // name, and sums how much weight lands on a forbidden bone per vertex.
  // Node-name presence (checked above via nodeNamesLower) is expected and
  // fine — the full 65-bone skeleton is kept per Step 8B section 6; only
  // real WEIGHT on those bones is contamination.
  let contaminatedVertexCount = 0;
  let maxContaminationFraction = 0;
  let contaminationCheckSkipped = false;
  let unweightedVertexCount = 0;
  let nonFiniteWeights = false;
  try {
    for (const mesh of json.meshes ?? []) {
      for (const prim of mesh.primitives) {
        if (prim.attributes.JOINTS_0 === undefined || prim.attributes.WEIGHTS_0 === undefined) continue;
        const joints = readAccessorLowerBody(prim.attributes.JOINTS_0);
        const weights = readAccessorLowerBody(prim.attributes.WEIGHTS_0);
        if (!joints || !weights) {
          contaminationCheckSkipped = true;
          continue;
        }
        for (let i = 0; i < weights.length; i++) {
          const w = weights[i];
          const j = joints[i];
          if (w.some((x) => !Number.isFinite(x))) {
            nonFiniteWeights = true;
            continue;
          }
          const total = w.reduce((a, b) => a + b, 0);
          if (total <= 1e-6) {
            unweightedVertexCount += 1;
            continue;
          }
          let forbiddenWeight = 0;
          for (let c = 0; c < 4; c++) {
            const jointName = jointIndexToNodeName[j[c]] ?? '';
            if (LOWERBODY_FORBIDDEN_WEIGHT_FRAGMENTS.some((frag) => jointName.includes(frag))) {
              forbiddenWeight += w[c];
            }
          }
          const fraction = forbiddenWeight / total;
          if (fraction > 0.01) contaminatedVertexCount += 1;
          if (fraction > maxContaminationFraction) maxContaminationFraction = fraction;
        }
      }
    }
  } catch {
    contaminationCheckSkipped = true;
  }
  console.log('\n─ Upper-body (head/neck/shoulder/arm/hand/finger) weight contamination check');
  if (contaminationCheckSkipped) {
    warnings.push('upper-body contamination check skipped (unsupported buffer/accessor layout, e.g. Draco/external buffer) — verify manually.');
  } else {
    console.log(`  contaminated vertices (>1% forbidden-bone weight): ${num(contaminatedVertexCount)} · max fraction: ${maxContaminationFraction.toFixed(4)}`);
    if (contaminatedVertexCount > 0) {
      errors.push(`${contaminatedVertexCount} vertex(es) carry real weighted influence from a head/neck/shoulder/arm/hand/finger bone (max fraction ${maxContaminationFraction.toFixed(4)}) — this derivative must contain zero upper-body weight influence.`);
    }
  }
  if (nonFiniteWeights) errors.push('WEIGHTS_0 accessor contains non-finite (NaN/Infinity) values.');
  console.log(`  unweighted vertices (WEIGHTS_0 sums to ~0): ${num(unweightedVertexCount)}`);
  if (unweightedVertexCount > 0) errors.push(`${unweightedVertexCount} vertex(es) with WEIGHTS_0 summing to ~0 — lower-body mesh must be 100% weighted (Step 8B section 5: 0 unweighted vertices).`);

  // ── Dangerous edge-length / face-area check ───────────────────────────
  // Same MAX_EDGE_LENGTH_M mechanism as --mode arms (see that block's
  // comment for the full "exploded geometry" investigation this guards
  // against), PLUS an explicit max-face-area companion check (Step 8B
  // section 4's own explicit ask, beyond what the arms gate checks).
  const MAX_EDGE_LENGTH_M = 0.06;
  const MAX_FACE_AREA_M2 = 0.001; // ~a 3cm x 3cm triangle -- generous margin above the arms pipeline's measured healthy range (max ~0.00042 m² post-scalpel-cleanup), flags anything materially worse
  let maxEdgeFound = 0;
  let maxFaceAreaFound = 0;
  let edgeFaceCheckSkipped = false;
  try {
    for (const mesh of json.meshes ?? []) {
      for (const prim of mesh.primitives) {
        const positions = readAccessorLowerBody(prim.attributes.POSITION);
        const indices = prim.indices !== undefined ? readAccessorLowerBody(prim.indices) : null;
        if (!positions) {
          edgeFaceCheckSkipped = true;
          continue;
        }
        const triIndices = indices ? indices.map((v) => v[0]) : positions.map((_, i) => i);
        for (let t = 0; t + 2 < triIndices.length; t += 3) {
          const [ax, ay, az] = positions[triIndices[t]];
          const [bx, by, bz] = positions[triIndices[t + 1]];
          const [cx, cy, cz] = positions[triIndices[t + 2]];
          const d1 = Math.hypot(ax - bx, ay - by, az - bz);
          const d2 = Math.hypot(bx - cx, by - cy, bz - cz);
          const d3 = Math.hypot(cx - ax, cy - ay, cz - az);
          const m = Math.max(d1, d2, d3);
          if (m > maxEdgeFound) maxEdgeFound = m;
          // Heron's formula for triangle area from three edge lengths.
          const s = (d1 + d2 + d3) / 2;
          const areaSq = s * (s - d1) * (s - d2) * (s - d3);
          const area = areaSq > 0 ? Math.sqrt(areaSq) : 0;
          if (area > maxFaceAreaFound) maxFaceAreaFound = area;
        }
      }
    }
  } catch {
    edgeFaceCheckSkipped = true;
  }
  if (edgeFaceCheckSkipped) {
    warnings.push('extreme-edge-length/face-area check skipped (unsupported buffer/accessor layout) — verify manually if this asset renders unexpectedly large geometry.');
  } else {
    console.log(`\n─ Topology safety`);
    console.log(`  max triangle edge length: ${maxEdgeFound.toFixed(4)}m (budget ${MAX_EDGE_LENGTH_M}m)`);
    console.log(`  max triangle area: ${maxFaceAreaFound.toFixed(6)}m² (budget ${MAX_FACE_AREA_M2}m²)`);
    if (maxEdgeFound > MAX_EDGE_LENGTH_M) {
      errors.push(`max triangle edge length ${maxEdgeFound.toFixed(4)}m exceeds ${MAX_EDGE_LENGTH_M}m — likely a decimation artifact at the open waist boundary; re-run the lower-body builder's scalpel cleanup.`);
    }
    if (maxFaceAreaFound > MAX_FACE_AREA_M2) {
      errors.push(`max triangle area ${maxFaceAreaFound.toFixed(6)}m² exceeds ${MAX_FACE_AREA_M2}m² — likely the same decimation-artifact class as the edge-length check.`);
    }
  }

  console.log('\n─ Materials');
  const materials = json.materials ?? [];
  console.log(`  materials: ${materials.length}${materials.length ? ` (${materials.map((m) => m.name ?? 'unnamed').join(', ')})` : ''}`);
  const lowerBodyImages = json.images ?? [];
  console.log(`  embedded textures: ${lowerBodyImages.length}`);

  const KNOWN_SAFE_MATERIAL_EXTENSIONS = [];
  for (const material of materials) {
    const extKeys = Object.keys(material.extensions ?? {});
    const unsupported = extKeys.filter((k) => !KNOWN_SAFE_MATERIAL_EXTENSIONS.includes(k));
    if (unsupported.length > 0) {
      errors.push(`material "${material.name ?? 'unnamed'}" uses unsupported extension(s): ${unsupported.join(', ')} — the runtime GLTFLoader path is not verified for these.`);
    }
  }

  const LOWERBODY_MAX_TEX_DIM = 2048;
  const foundMapNames = new Set();
  for (const material of materials) {
    const pbr = material.pbrMetallicRoughness ?? {};
    if (pbr.baseColorTexture) foundMapNames.add('baseColor');
    if (material.normalTexture) foundMapNames.add('normal');
    if (pbr.metallicRoughnessTexture) foundMapNames.add('metallicRoughness');
    if (material.occlusionTexture) foundMapNames.add('occlusion');
  }
  console.log(`  maps present: ${[...foundMapNames].join(', ') || 'none'}`);
  if (!foundMapNames.has('baseColor')) errors.push('no BaseColor (pbrMetallicRoughness.baseColorTexture) map found — Step 8B section 7 requires real PBR textures, not a neutral-grey material.');
  if (!foundMapNames.has('normal')) errors.push('no Normal map found — Step 8B section 7 requires a Normal map.');
  if (!foundMapNames.has('metallicRoughness') && !foundMapNames.has('occlusion')) errors.push('no packed ORM (metallicRoughness/occlusion) map found — Step 8B section 7 requires a packed ORM map.');

  for (const [i, image] of lowerBodyImages.entries()) {
    if (image.bufferView === undefined) {
      warnings.push(`image ${i} ("${image.name ?? 'unnamed'}") has no bufferView — not embedded, breaking this pipeline's self-contained-GLB convention.`);
      continue;
    }
    const bv = json.bufferViews[image.bufferView];
    const base = binChunkStart + (bv.byteOffset ?? 0);
    const isPng = buffer.readUInt32BE(base) === 0x89504e47;
    if (!isPng) {
      warnings.push(`image ${i} ("${image.name ?? 'unnamed'}") is not a PNG (mimeType=${image.mimeType}) — dimension check skipped.`);
      continue;
    }
    const width = buffer.readUInt32BE(base + 16);
    const height = buffer.readUInt32BE(base + 20);
    console.log(`  image ${i} "${image.name ?? 'unnamed'}": ${width}x${height}px`);
    if (width > LOWERBODY_MAX_TEX_DIM || height > LOWERBODY_MAX_TEX_DIM) {
      errors.push(`image ${i} ("${image.name ?? 'unnamed'}") is ${width}x${height} — exceeds the ${LOWERBODY_MAX_TEX_DIM}px ceiling.`);
    }
  }

  console.log('\n─ UV0');
  const hasUv0 = (json.meshes ?? []).every((mesh) => mesh.primitives.every((p) => p.attributes.TEXCOORD_0 !== undefined));
  console.log(`  TEXCOORD_0 present on every primitive: ${hasUv0 ? 'yes' : 'NO'}`);
  if (!hasUv0) errors.push('a primitive has no TEXCOORD_0 — UV0 is required (Step 8B section 7).');

  try {
    for (const mesh of json.meshes ?? []) {
      for (const prim of mesh.primitives) {
        for (const attrName of ['TEXCOORD_0', 'NORMAL', 'TANGENT']) {
          const idx = prim.attributes[attrName];
          if (idx === undefined) continue;
          const values = readAccessorLowerBody(idx);
          if (!values) continue;
          const nonFinite = values.some((v) => v.some((c) => !Number.isFinite(c)));
          if (nonFinite) errors.push(`${attrName} accessor contains non-finite (NaN/Infinity) values.`);
        }
      }
    }
  } catch {
    warnings.push('UV/normal/tangent finite-value check skipped (unsupported buffer/accessor layout).');
  }
  if (materials.some((m) => m.normalTexture) && !(json.meshes ?? []).every((mesh) => mesh.primitives.every((p) => p.attributes.TANGENT !== undefined))) {
    errors.push('a material uses a normal map but the mesh has no TANGENT attribute.');
  }

  console.log('\n─ Bounds');
  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives) {
      const position = json.accessors[prim.attributes.POSITION];
      if (position?.min && position?.max) {
        console.log(`  min: [${position.min.map((v) => v.toFixed(3)).join(', ')}]  max: [${position.max.map((v) => v.toFixed(3)).join(', ')}]`);
      }
    }
  }

  const animations = json.animations ?? [];
  console.log(`\n─ Animation clips: ${animations.length} (none expected for this derivative — flag if any exist unexpectedly)`);
  if (animations.length > 0) warnings.push(`${animations.length} animation clip(s) present — Step 8B did not intend to add clips; verify this is deliberate.`);

  console.log('\n─ Budget');
  const gateLowerBody = (ok, label, message) => {
    console.log(`  ${label}  ${ok ? 'PASS' : 'FAIL'}`);
    if (!ok) errors.push(message);
  };
  gateLowerBody(totalTris <= LOWERBODY_BUDGET.trisCeiling, `triangles: ${num(totalTris)} / ${num(LOWERBODY_BUDGET.trisCeiling)} ceiling (${num(LOWERBODY_BUDGET.trisTarget)} preferred)`, `${num(totalTris)} triangles exceeds the lower-body hard ceiling of ${num(LOWERBODY_BUDGET.trisCeiling)}.`);
  if (totalTris > LOWERBODY_BUDGET.trisTarget && totalTris <= LOWERBODY_BUDGET.trisCeiling) {
    warnings.push(`${num(totalTris)} triangles exceeds the preferred target of ${num(LOWERBODY_BUDGET.trisTarget)} (still within the ${num(LOWERBODY_BUDGET.trisCeiling)} hard ceiling).`);
  }
  gateLowerBody(materials.length <= LOWERBODY_BUDGET.materials, `materials: ${materials.length} / ${LOWERBODY_BUDGET.materials}`, `${materials.length} materials exceeds the lower-body budget of ${LOWERBODY_BUDGET.materials}.`);
  gateLowerBody(buffer.length <= LOWERBODY_BUDGET.fileMB * 1024 * 1024, `file size: ${mb(buffer.length)} / ${LOWERBODY_BUDGET.fileMB} MB`, `file ${mb(buffer.length)} MB exceeds the lower-body budget of ${LOWERBODY_BUDGET.fileMB} MB.`);

  console.log('\n─ Verdict');
  for (const message of errors) console.log(`  ✖ ERROR   ${message}`);
  for (const message of warnings) console.log(`  ▲ warning ${message}`);
  if (errors.length === 0 && warnings.length === 0) console.log('  clean — ship it.');
  console.log(`  ${errors.length} error(s), ${warnings.length} warning(s)\n`);
  process.exitCode = errors.length > 0 ? 1 : 0;
  process.exit(process.exitCode);
}

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
