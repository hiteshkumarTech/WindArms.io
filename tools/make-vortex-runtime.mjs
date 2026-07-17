#!/usr/bin/env node
/**
 * WindArms — Vortex Rifle v0.2 runtime derivative builder.
 *
 *   npm i -D @gltf-transform/cli@4        (one-time; brings core/extensions/
 *                                          functions/meshoptimizer/draco3dgltf/sharp)
 *   node tools/make-vortex-runtime.mjs "WindArms Assets/Weapons/VortexRifle/vortex_v0.2_source.glb"
 *
 * Options:
 *   --muzzle +z|-z      which end of the SOURCE's long (Z) axis is the muzzle (default +z).
 *                       If the rifle renders backwards in-engine, re-run with the other value.
 *   --lod0-ratio 0.07   simplification ratio for the showpiece LOD0 (≈140k tris from 1.99M)
 *   --lod1-ratio 0.028  ratio for LOD1 (≈56k tris — first-person tier)
 *   --no-lod1           skip the LOD1 output
 *
 * What it does (DERIVATIVE ONLY — the source file is opened read-only and
 * never written): dedup → weld → meshopt-simplify → prune → bake a ±90° Y
 * rotation so the muzzle faces +X / top stays +Y (source is Z-long) →
 * rename temp nodes → strip generator extras → WebP textures capped at
 * 2048px → Draco-compressed .glb outputs:
 *
 *   public/v2-art/vortex-rifle.glb        (LOD0 — showpiece tier)
 *   public/v2-art/vortex-rifle.lod1.glb   (LOD1 — the pipeline's 'low'-quality tier)
 *
 * Any existing output is backed up to WindArms Assets/Weapons/VortexRifle/_backups/
 * first. Scale is NOT baked: the source's exporter-normalized 1.000 m long
 * axis is preserved so the already-tuned engine-side scales keep working
 * (visualConfigs.ts 0.68 showpiece / VortexViewmodel 0.42 FP — both derived
 * from the 1 m axis; see docs/design/weapons/vortex-rifle.md §5).
 *
 * HONESTY NOTE: meshopt simplification is automatic decimation. It is NOT
 * professional retopology — silhouette survives at these ratios, fine
 * detail lives or dies by the (absent) normal map. The real bake pass is
 * still the Blender checklist in docs/forge/vortex-rifle-v0.1.md §4.
 */

import { existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

// ── Dependency loading (all arrive via `npm i -D @gltf-transform/cli@4`) ──
let NodeIO, getBounds, ALL_EXTENSIONS, fns, MeshoptSimplifier, draco3d, sharp;
try {
  const core = await import('@gltf-transform/core');
  NodeIO = core.NodeIO;
  getBounds = core.getBounds ?? core.bounds;
  ({ ALL_EXTENSIONS } = await import('@gltf-transform/extensions'));
  fns = await import('@gltf-transform/functions');
  if (!getBounds) getBounds = fns.getBounds ?? fns.bounds;
  ({ MeshoptSimplifier } = await import('meshoptimizer'));
  const dracoModule = await import('draco3dgltf');
  draco3d = dracoModule.default ?? dracoModule;
  sharp = (await import('sharp')).default;
} catch (error) {
  console.error('\nMissing dependency:', error.message);
  console.error('Install the toolchain first:\n  npm i -D @gltf-transform/cli@4');
  console.error('If a single module still fails to resolve:\n  npm i -D meshoptimizer draco3dgltf sharp\n');
  process.exit(1);
}

// ── CLI ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const source = args.find((a) => !a.startsWith('--')) ?? 'WindArms Assets/Weapons/VortexRifle/vortex_v0.2_source.glb';
const flag = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const muzzle = flag('--muzzle', '+z');
const lod0Ratio = Number(flag('--lod0-ratio', '0.07'));
const lod1Ratio = Number(flag('--lod1-ratio', '0.028'));
const makeLod1 = !args.includes('--no-lod1');

if (!existsSync(source)) {
  console.error(`Source not found: ${source}\nCopy the accepted v0.2 upload there first (never overwrite it afterwards).`);
  process.exit(1);
}
if (muzzle !== '+z' && muzzle !== '-z') {
  console.error('--muzzle must be +z or -z');
  process.exit(1);
}

const OUT_DIR = 'public/v2-art';
const BACKUP_DIR = 'WindArms Assets/Weapons/VortexRifle/_backups';
const BUDGET = { lod0Tris: 150_000, lod1Tris: 60_000, fileHardMB: 8, filePreferredMB: 5 };

const mb = (bytes) => (bytes / 1024 / 1024).toFixed(2);
const num = (n) => Math.round(n).toLocaleString('en-US');

// Column-major 4x4 multiply: returns a×b (glTF matrices are column-major).
function mulMat4(a, b) {
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

// Ry(+90°) maps +Z→+X; Ry(-90°) maps -Z→+X. Top (+Y) is unaffected either way.
function muzzleRotationMatrix(direction) {
  const theta = direction === '+z' ? Math.PI / 2 : -Math.PI / 2;
  const c = Math.round(Math.cos(theta));
  const s = Math.round(Math.sin(theta));
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
}

function countGeometry(doc) {
  let tris = 0;
  let verts = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices();
      const position = prim.getAttribute('POSITION');
      tris += indices ? indices.getCount() / 3 : (position?.getCount() ?? 0) / 3;
      verts += position?.getCount() ?? 0;
    }
  }
  return { tris, verts };
}

function backupIfExists(path) {
  if (!existsSync(path)) return null;
  mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = join(BACKUP_DIR, `${path.split(/[\\/]/).pop()}.${stamp}.bak.glb`);
  renameSync(path, target);
  return target;
}

async function buildDerivative(io, ratio, lodLabel, outPath) {
  console.log(`\n─ Building ${lodLabel} (ratio ${ratio}) → ${outPath}`);
  const doc = await io.read(source); // fresh read per LOD: never simplify a simplification

  const before = countGeometry(doc);

  await MeshoptSimplifier.ready;
  await doc.transform(
    fns.dedup(),
    fns.weld(),
    fns.simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.001 }),
    fns.prune(),
  );

  // Bake orientation on the scene roots (rotation about origin; the source's
  // own root matrix already re-centers the bbox at the origin, so centering
  // is preserved). Derivative-only — the source file is never written.
  const rotation = muzzleRotationMatrix(muzzle);
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  for (const child of scene.listChildren()) {
    child.setMatrix(mulMat4(rotation, child.getMatrix()));
  }

  // Readable names + no stray generator metadata in the shipped file.
  scene.setName('vortex-rifle');
  for (const node of doc.getRoot().listNodes()) {
    node.setExtras({});
    if (node.getMesh()) node.setName(`VortexRifle_${lodLabel}`);
  }
  doc.getRoot().listMeshes().forEach((mesh) => mesh.setName(`VortexRifle_${lodLabel}_mesh`));

  await doc.transform(
    fns.textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [2048, 2048] }),
    fns.draco(),
  );

  const after = countGeometry(doc);
  const bounds = getBounds(scene);
  const size = bounds.max.map((v, i) => v - bounds.min[i]);
  const center = bounds.max.map((v, i) => (v + bounds.min[i]) / 2);

  const backup = backupIfExists(outPath);
  if (backup) console.log(`  existing output backed up → ${backup}`);
  mkdirSync(dirname(outPath), { recursive: true });
  await io.write(outPath, doc);
  const fileBytes = statSync(outPath).size;

  console.log(`  triangles: ${num(before.tris)} → ${num(after.tris)}  ·  verts: ${num(before.verts)} → ${num(after.verts)}`);
  console.log(`  world size (X×Y×Z): ${size.map((v) => v.toFixed(3)).join(' × ')} m  ·  center offset: [${center.map((v) => v.toFixed(4)).join(', ')}]`);
  console.log(`  long axis: ${size[0] >= size[1] && size[0] >= size[2] ? 'X ✓ (muzzle convention)' : 'NOT X — re-check --muzzle / source orientation'}`);
  console.log(`  file: ${mb(fileBytes)} MB (draco + webp≤2048)`);

  return { lodLabel, outPath, before, after, size, center, fileBytes };
}

// ── Main ──────────────────────────────────────────────────────────────
console.log(`═ Vortex Rifle v0.2 → runtime derivative`);
console.log(`  source: ${source} (${mb(statSync(source).size)} MB, opened read-only)`);
console.log(`  muzzle assumed at ${muzzle} of the source — verify visually in-engine, re-run with the other value if backwards.`);

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule(),
});

const results = [];
results.push(await buildDerivative(io, lod0Ratio, 'LOD0', join(OUT_DIR, 'vortex-rifle.glb')));
if (makeLod1) results.push(await buildDerivative(io, lod1Ratio, 'LOD1', join(OUT_DIR, 'vortex-rifle.lod1.glb')));

// ── Gates ─────────────────────────────────────────────────────────────
let failed = false;
console.log('\n─ Gates');
const [lod0, lod1] = results;
const gate = (ok, message) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${message}`);
  if (!ok) failed = true;
};
gate(lod0.after.tris <= BUDGET.lod0Tris, `LOD0 triangles ${num(lod0.after.tris)} ≤ ${num(BUDGET.lod0Tris)}`);
gate(lod0.fileBytes <= BUDGET.fileHardMB * 1024 * 1024, `LOD0 file ${mb(lod0.fileBytes)} MB ≤ ${BUDGET.fileHardMB} MB hard cap`);
if (lod0.fileBytes > BUDGET.filePreferredMB * 1024 * 1024) {
  console.log(`  warn  LOD0 file ${mb(lod0.fileBytes)} MB over the ${BUDGET.filePreferredMB} MB preferred size — acceptable, watch load time.`);
}
if (lod1) {
  gate(lod1.after.tris <= BUDGET.lod1Tris * 1.15, `LOD1 triangles ${num(lod1.after.tris)} ≈≤ ${num(BUDGET.lod1Tris)} FP target (+15% tolerance)`);
}

console.log('\n─ Next');
console.log('  node tools/inspect-glb.mjs "public/v2-art/vortex-rifle.glb" --target showpiece');
if (lod1) console.log('  node tools/inspect-glb.mjs "public/v2-art/vortex-rifle.lod1.glb" --target viewmodel');
console.log('  npm run dev  → check the landing hero + /v2/range (dev console prints [asset-pipeline] resolve/load/validation lines automatically)\n');

process.exitCode = failed ? 1 : 0;
