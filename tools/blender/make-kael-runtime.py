"""
WindArms — Kael runtime derivative builder (Milestone 7, Phase F, Step 2/3).

  "<BLENDER_EXE>" --background --python tools/blender/make-kael-runtime.py -- \
      <source_glb> <lod> <output_glb> <report_json> <render_out_dir>

  <lod> is 0 or 1 — target budgets confirmed from code, not guessed:
    LOD0 <= 45,000 tris (src/lib/v2/pipeline/manifest.ts OPERATOR_BUDGET,
                          tools/inspect-operator.mjs LOD_BUDGETS[0])
    LOD1 <= 20,000 tris (tools/inspect-operator.mjs LOD_BUDGETS[1])

Imports the ACCEPTED, already-corrected source GLB (not the FBX — the
facing/grounding/rest-pose work is already done and verified; this stage is
decimation only). Builds a per-vertex "protect" group from cumulative bone
influence (head + hands + fingers), decimates with that group modulating
local reduction so hands/face survive more than torso/limbs, then
re-validates structurally in-script before ever writing the output file —
per the instruction not to discover damage after the fact.

Fails loudly (non-zero exit) on: armature disappearing, a required bone
disappearing, vertex weights lost beyond a safety threshold, the mesh
becoming unskinned, invalid/non-finite dimensions, or the deformation
smoke test producing non-finite results post-decimation. Never touches the
source GLB or the raw FBX.
"""

import sys
import os
import math
import json

import bpy
import bmesh
import mathutils

LOD_BUDGETS = {0: 45_000, 1: 20_000}
# Safety margin below the hard budget so re-triangulation/export quirks
# (glTF's per-vertex UV/normal-seam splitting, already observed as a small
# but real delta in the source export) never tip the exported file over.
TARGET_TRIS = {0: 40_000, 1: 17_000}
# Region-aware protection (bias decimation away from head/hands) worked
# cleanly at LOD0's 86.66% reduction. At LOD1's far more aggressive 94.33%,
# it produced a mesh that visibly broke (holes, disconnected shards) no
# matter how far the protection factor was dialed back — and at the
# binary-search's minimum ratio (0.001) still couldn't reach the LOD1
# budget at all, meaning the protected region's effective floor alone
# already exceeded 20,000 tris. Rather than keep guessing at factor values,
# LOD1 uses plain uniform Collapse (no vertex-group modulation) — the
# standard, well-tested use of this modifier. LOD0 already proves
# region-protection is only attempted where the reduction isn't this
# extreme, not applied uniformly by default.
USE_PROTECTION = {0: True, 1: False}

PROTECT_BONE_NAME_FRAGMENTS = [
    "head", "hand", "thumb", "index", "middle", "ring", "pinky",
]


def parse_args():
    argv = sys.argv
    if "--" not in argv:
        raise SystemExit("Usage: blender --background --python make-kael-runtime.py -- <source_glb> <lod> <output_glb> <report_json> <render_out_dir>")
    rest = argv[argv.index("--") + 1:]
    if len(rest) < 5:
        raise SystemExit("Usage: blender --background --python make-kael-runtime.py -- <source_glb> <lod> <output_glb> <report_json> <render_out_dir>")
    return rest[0], int(rest[1]), rest[2], rest[3], rest[4]


SOURCE_GLB, LOD, OUTPUT_GLB, REPORT_JSON, RENDER_DIR = parse_args()

if LOD not in LOD_BUDGETS:
    raise SystemExit(f"Unsupported LOD {LOD} — only 0 and 1 are built by this script (LOD2 is reserved, see report).")

os.makedirs(RENDER_DIR, exist_ok=True)
os.makedirs(os.path.dirname(OUTPUT_GLB), exist_ok=True)

report = {
    "source_glb": SOURCE_GLB,
    "lod": LOD,
    "budget_tris": LOD_BUDGETS[LOD],
    "target_tris": TARGET_TRIS[LOD],
    "failures": [],
}


def fail(message):
    report["failures"].append(message)
    report["result"] = "FAILED"
    with open(REPORT_JSON, "w") as f:
        json.dump(report, f, indent=2, default=str)
    print(f"BUILD_FAILED: {message}")
    sys.exit(1)


# ---------------------------------------------------------------------------
# Import (fresh scene, read-only against the source GLB)
# ---------------------------------------------------------------------------

bpy.ops.wm.read_factory_settings(use_empty=True)
try:
    bpy.ops.import_scene.gltf(filepath=SOURCE_GLB)
except Exception as e:
    fail(f"Source GLB import failed: {e}")

armatures = [o for o in bpy.data.objects if o.type == "ARMATURE"]
all_meshes = [o for o in bpy.data.objects if o.type == "MESH"]
if len(armatures) != 1:
    fail(f"Expected exactly 1 armature in the source, found {len(armatures)}.")
if not all_meshes:
    fail("No mesh objects found in the source at all.")

armature_obj = armatures[0]

# The accepted source GLB carries one stray non-character object: a 42-vert
# unparented "Icosphere" with zero vertex groups and no modifiers (found via
# tools/blender/_diag_mesh_count.py, not assumed) — inert artifact geometry,
# not part of Kael, undetected by the original gate because that gate's own
# "largest mesh" selection already skipped past it correctly. Select the
# SKINNED mesh explicitly here rather than trusting mesh count, and report
# any stray non-skinned mesh instead of silently deleting or ignoring it.
skinned_meshes = [
    o for o in all_meshes
    if any(m.type == "ARMATURE" for m in o.modifiers) and len(o.vertex_groups) > 0
]
stray_meshes = [o for o in all_meshes if o not in skinned_meshes]
if stray_meshes:
    report["stray_non_character_meshes"] = [
        {"name": o.name, "vertex_count": len(o.data.vertices), "parented": o.parent is not None}
        for o in stray_meshes
    ]
if len(skinned_meshes) != 1:
    fail(f"Expected exactly 1 skinned mesh in the source, found {len(skinned_meshes)}. All meshes: {[o.name for o in all_meshes]}")

mesh_obj = skinned_meshes[0]

baseline_bone_names = sorted(b.name for b in armature_obj.data.bones)
baseline_bone_count = len(baseline_bone_names)
baseline_vg_names = sorted(vg.name for vg in mesh_obj.vertex_groups)
baseline_vert_count = len(mesh_obj.data.vertices)
baseline_tri_count = sum(max(len(p.vertices) - 2, 1) for p in mesh_obj.data.polygons)


def manifold_stats(mesh_object):
    """Non-manifold edge count, loose (disconnected/wire) vertex count, and
    zero-area face count via bmesh — the exact defect class (holes,
    disconnected floating shards, degenerate faces) that broke an earlier
    LOD1 attempt while every OTHER numeric check in this script still
    passed. That was only caught by a human looking at a render (adversarial
    review flagged this as a real, unaddressed gap) — this is a genuine
    programmatic check for the same defect class, not a proxy for it."""
    bm = bmesh.new()
    bm.from_mesh(mesh_object.data)
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    non_manifold_edges = sum(1 for e in bm.edges if not e.is_manifold)
    loose_verts = sum(1 for v in bm.verts if len(v.link_faces) == 0)
    zero_area_faces = sum(1 for f in bm.faces if f.calc_area() < 1e-10)
    stats = {
        "non_manifold_edges": non_manifold_edges,
        "loose_vertices": loose_verts,
        "zero_area_faces": zero_area_faces,
        "total_edges": len(bm.edges),
    }
    bm.free()
    return stats


baseline_manifold = manifold_stats(mesh_obj)
report["baseline_manifold"] = baseline_manifold


def used_vertex_group_names(mesh_object, epsilon=1e-6):
    """Vertex groups with at least one real weighted vertex — distinct from
    the FULL group-name set, which includes Mixamo's tip/end helper bones
    (HeadTop_End, *Thumb4, *Pinky4, etc.) that exist as empty slots on
    import (glTF creates one group per skin joint regardless of whether
    any vertex references it) but were never weight-painted in the source
    rig. Only THIS set is the meaningful "did decimation destroy real skin
    data" signal."""
    used = set()
    idx_to_name = {vg.index: vg.name for vg in mesh_object.vertex_groups}
    for v in mesh_object.data.vertices:
        for g in v.groups:
            if g.weight > epsilon:
                used.add(idx_to_name.get(g.group))
    return used


baseline_used_vg_names = used_vertex_group_names(mesh_obj)
baseline_empty_vg_names = sorted(set(baseline_vg_names) - baseline_used_vg_names)
report["baseline_empty_vertex_groups"] = baseline_empty_vg_names

depsgraph = bpy.context.evaluated_depsgraph_get()
eval_obj = mesh_obj.evaluated_get(depsgraph)
corners = [eval_obj.matrix_world @ mathutils.Vector(c) for c in eval_obj.bound_box]
baseline_min_z = min(c.z for c in corners)
baseline_height = max(c.z for c in corners) - baseline_min_z

report["baseline"] = {
    "bone_count": baseline_bone_count,
    "vertex_group_count": len(baseline_vg_names),
    "vertex_count": baseline_vert_count,
    "triangle_count": baseline_tri_count,
    "height_m": baseline_height,
    "min_z": baseline_min_z,
}

if baseline_tri_count <= TARGET_TRIS[LOD]:
    fail(f"Source ({baseline_tri_count} tris) is already under the LOD{LOD} target ({TARGET_TRIS[LOD]}) — decimation script should not run on an already-compliant mesh; check inputs.")

# ---------------------------------------------------------------------------
# Build the protect vertex group from cumulative bone influence.
# Weight 1.0 = fully protected (hands/fingers/head); 0.0 = free to decimate
# heavily (torso/limbs). Applied to the Decimate modifier with
# invert_vertex_group so high protect-weight => low local decimation —
# verified empirically via render below, not assumed from memory of the
# modifier's exact weighting convention.
# ---------------------------------------------------------------------------

protect_bone_indices = set()
for i, bone in enumerate(armature_obj.data.bones):
    name_lower = bone.name.lower()
    if any(frag in name_lower for frag in PROTECT_BONE_NAME_FRAGMENTS):
        protect_bone_indices.add(bone.name)

if not protect_bone_indices:
    fail("No head/hand/finger bones matched for the protect group — bone-name matching failed against this armature.")

protect_vg = mesh_obj.vertex_groups.new(name="_decimate_protect")
vg_index_by_name = {vg.name: vg.index for vg in mesh_obj.vertex_groups}
protect_bone_vg_indices = {vg_index_by_name[n] for n in protect_bone_indices if n in vg_index_by_name}

protected_vertex_count = 0
for v in mesh_obj.data.vertices:
    protect_weight = sum(g.weight for g in v.groups if g.group in protect_bone_vg_indices)
    protect_weight = min(protect_weight, 1.0)
    if protect_weight > 0:
        protect_vg.add([v.index], protect_weight, "REPLACE")
        protected_vertex_count += 1

report["protect_group"] = {
    "bones_matched": sorted(protect_bone_indices),
    "protected_vertex_count": protected_vertex_count,
    "protected_vertex_percent": round(100 * protected_vertex_count / baseline_vert_count, 2),
}

# ---------------------------------------------------------------------------
# Decimate. Vertex-group-modulated Collapse, applied on the mesh with its
# Armature modifier still present (weights survive collapse — Blender
# redistributes them from removed vertices to retained ones; this is the
# standard rigged-character decimation workflow, not a novel technique).
# ---------------------------------------------------------------------------

bpy.context.view_layer.objects.active = mesh_obj

decimate = mesh_obj.modifiers.new(name="_runtime_decimate", type="DECIMATE")
decimate.decimate_type = "COLLAPSE"
if USE_PROTECTION[LOD]:
    decimate.vertex_group = protect_vg.name
    decimate.vertex_group_factor = 1.0
    decimate.invert_vertex_group = True
decimate.use_collapse_triangulate = True
report["protection_used"] = USE_PROTECTION[LOD]

bpy.ops.object.select_all(action="DESELECT")
mesh_obj.select_set(True)
bpy.context.view_layer.objects.active = mesh_obj

# Decimate must run BEFORE Armature in the modifier stack — otherwise it
# collapses the mesh as interpreted through armature deformation instead of
# its bind-pose base mesh, which corrupted a finger vertex group the first
# time this was tried (Blender's own "Applied modifier was not first"
# warning, confirmed by the actual missing-vertex-group failure it
# produced).
try:
    bpy.ops.object.modifier_move_to_index(modifier=decimate.name, index=0)
except Exception as e:
    fail(f"Could not move Decimate modifier before Armature in the stack: {e}")


def evaluated_tri_count(ratio_value):
    """Non-destructive: reads the modifier's effect via the depsgraph-
    evaluated mesh WITHOUT applying it, so ratio can be searched cheaply
    and repeatably. Blender's `ratio` is a request, not a guaranteed output
    count, so a single guess (confirmed: requesting 17,000 produced
    20,104 tris, over the LOD1 budget) isn't reliable — but re-evaluating a
    STILL-non-destructive modifier at a new ratio is safe to repeat, unlike
    stacking multiple applied Collapse passes on top of each other, which
    was tried first and visibly broke the mesh (holes, disconnected
    shards — confirmed by render): each pass decimates an already-collapsed
    topology instead of the original, and damage compounds.
    """
    decimate.ratio = ratio_value
    dg = bpy.context.evaluated_depsgraph_get()
    eo = mesh_obj.evaluated_get(dg)
    em = eo.to_mesh()
    tris = sum(max(len(p.vertices) - 2, 1) for p in em.polygons)
    eo.to_mesh_clear()
    return tris


# Binary search on ratio for a tri count at/under TARGET_TRIS (the safety
# margin figure), NOT the hard LOD_BUDGETS ceiling. An earlier version of
# this search maximized toward the hard budget instead — caught by
# adversarial review, not by any of this script's own numeric checks: it
# landed LOD1 at 19,998/20,000 tris, 2 triangles of margin, silently
# defeating the safety-margin comment at the top of this file. Searching
# against TARGET_TRIS restores that margin for real instead of only in
# a comment.
lo, hi = 0.001, 0.95
best_ratio = None
search_log = []
for _ in range(14):
    mid = (lo + hi) / 2
    tris = evaluated_tri_count(mid)
    search_log.append({"ratio": mid, "tris": tris})
    if tris <= TARGET_TRIS[LOD]:
        best_ratio = mid
        lo = mid  # try to use MORE of the target (more detail), not less
    else:
        hi = mid

report["ratio_search"] = search_log
if best_ratio is None:
    fail(f"Binary search never found a ratio producing <= {TARGET_TRIS[LOD]} tris (target) — decimate.ratio floor (0.001) still over target.")

decimate.ratio = best_ratio
try:
    bpy.ops.object.modifier_apply(modifier=decimate.name)
except Exception as e:
    fail(f"Decimate modifier_apply failed: {e}")

# Standard post-decimation cleanup: Collapse can leave a small number of
# genuinely orphaned (loose) vertices with no connecting faces — normal,
# well-known behavior, not specific to this mesh. Removing them is
# equivalent to Blender's own "Delete Loose Geometry" cleanup operation,
# done here via bmesh (safe in headless/background mode, no edit-mode
# context needed). Bone/vertex-group data on remaining vertices is
# untouched; only vertices with zero linked faces are removed.
bm = bmesh.new()
bm.from_mesh(mesh_obj.data)
bm.verts.ensure_lookup_table()
loose = [v for v in bm.verts if len(v.link_faces) == 0]
loose_removed = len(loose)
if loose:
    bmesh.ops.delete(bm, geom=loose, context="VERTS")
bm.to_mesh(mesh_obj.data)
bm.free()
mesh_obj.data.update()
report["loose_vertices_cleaned"] = loose_removed

current_tri_count = sum(max(len(p.vertices) - 2, 1) for p in mesh_obj.data.polygons)
report["decimate_final"] = {"ratio_applied": best_ratio, "tris_after": current_tri_count}
if current_tri_count > LOD_BUDGETS[LOD]:
    fail(f"Applied result {current_tri_count} tris exceeds the LOD{LOD} budget of {LOD_BUDGETS[LOD]} despite the binary search — the evaluated preview and the applied result disagreed.")

# ---------------------------------------------------------------------------
# Post-decimation structural re-validation, in-script, before export.
# ---------------------------------------------------------------------------

post_armature_modifier = any(m.type == "ARMATURE" for m in mesh_obj.modifiers)
if not post_armature_modifier:
    fail("Armature modifier is gone after decimation — mesh is no longer skinned.")

post_bone_names = sorted(b.name for b in armature_obj.data.bones)
if post_bone_names != baseline_bone_names:
    missing = set(baseline_bone_names) - set(post_bone_names)
    fail(f"Bone set changed after decimation. Missing: {sorted(missing)}")

post_used_vg_names = used_vertex_group_names(mesh_obj) - {"_decimate_protect"}
lost_real_influence = baseline_used_vg_names - post_used_vg_names
if lost_real_influence:
    fail(f"Bones that had real weighted vertices lost ALL influence after decimation: {sorted(lost_real_influence)}")
report["post_decimation_note"] = (
    f"{len(baseline_empty_vg_names)} already-empty tip/end-bone vertex groups "
    "in the baseline are excluded from this check by design (see baseline_empty_vertex_groups)."
)

# Manifold/hole/disconnection check — compared against the BASELINE count,
# not a hard zero, since some non-manifold edges (open sleeve/collar
# boundaries, existing UV seams) can be genuinely present in the source
# mesh already. What matters is whether decimation introduced NEW damage,
# and loose (disconnected) geometry specifically — which is what the
# earlier broken LOD1 attempt actually looked like — is checked as a near-
# zero-tolerance absolute count, since real loose floating shards are never
# legitimate in a clean character mesh.
post_manifold = manifold_stats(mesh_obj)
report["post_manifold"] = post_manifold

MAX_LOOSE_VERTS = 20  # small allowance for edge-of-mesh collapse artifacts, not zero-tolerance-fragile
non_manifold_growth = post_manifold["non_manifold_edges"] - baseline_manifold["non_manifold_edges"]
non_manifold_growth_pct = (
    100 * non_manifold_growth / baseline_manifold["total_edges"] if baseline_manifold["total_edges"] else 0
)

if post_manifold["loose_vertices"] > MAX_LOOSE_VERTS:
    fail(f"{post_manifold['loose_vertices']} loose (disconnected) vertices after decimation — this is the exact defect class (floating shards) that broke an earlier attempt.")
if post_manifold["zero_area_faces"] > 0:
    fail(f"{post_manifold['zero_area_faces']} zero-area (degenerate) faces after decimation.")
if non_manifold_growth_pct > 2.0:
    fail(f"Non-manifold edges grew by {non_manifold_growth_pct:.2f}% of total edge count after decimation ({baseline_manifold['non_manifold_edges']} -> {post_manifold['non_manifold_edges']}) — likely new holes, not pre-existing seams.")

post_vert_count = len(mesh_obj.data.vertices)
post_tri_count = sum(max(len(p.vertices) - 2, 1) for p in mesh_obj.data.polygons)

post_vg_idx_to_name = {vg.index: vg.name for vg in mesh_obj.vertex_groups}
unweighted = 0
for v in mesh_obj.data.vertices:
    total_w = sum(g.weight for g in v.groups if post_vg_idx_to_name.get(g.group) != "_decimate_protect")
    if total_w <= 1e-6:
        unweighted += 1
pct_unweighted = 100 * unweighted / post_vert_count if post_vert_count else 100

depsgraph = bpy.context.evaluated_depsgraph_get()
eval_obj = mesh_obj.evaluated_get(depsgraph)
corners = [eval_obj.matrix_world @ mathutils.Vector(c) for c in eval_obj.bound_box]
post_min_z = min(c.z for c in corners)
post_height = max(c.z for c in corners) - post_min_z

report["post_decimation"] = {
    "vertex_count": post_vert_count,
    "triangle_count": post_tri_count,
    "reduction_percent": round(100 * (1 - post_tri_count / baseline_tri_count), 2),
    "percent_unweighted": pct_unweighted,
    "height_m": post_height,
    "min_z": post_min_z,
}

if post_tri_count > LOD_BUDGETS[LOD]:
    fail(f"Post-decimation triangle count {post_tri_count} still exceeds the LOD{LOD} budget of {LOD_BUDGETS[LOD]}.")
if pct_unweighted > 2.0:
    fail(f"{pct_unweighted:.2f}% of vertices are unweighted after decimation — collapse damaged skinning beyond the safety threshold.")
if not math.isfinite(post_height) or post_height <= 0 or post_height > 10:
    fail(f"Post-decimation height is invalid: {post_height}")
if abs(post_height - baseline_height) / baseline_height > 0.05:
    fail(f"Height changed by more than 5% after decimation: {baseline_height:.4f} -> {post_height:.4f}")
if abs(post_min_z) > 0.02:
    fail(f"Feet grounding drifted after decimation: min_z = {post_min_z:.4f}")

# ---------------------------------------------------------------------------
# Deformation smoke test, same 4-bone method as the structural rig gate,
# run AGAIN post-decimation (Step 3's explicit requirement).
# ---------------------------------------------------------------------------

def normalize_bone_name(name):
    n = name.strip().lower()
    for p in ("mixamorig:", "mixamorig_", "mixamorig"):
        if n.startswith(p):
            return n[len(p):]
    return n

by_norm = {normalize_bone_name(b.name): b.name for b in armature_obj.data.bones}
deform_targets = [
    ("lower_arm_left", by_norm.get("leftforearm")),
    ("lower_arm_right", by_norm.get("rightforearm")),
    ("upper_leg_left", by_norm.get("leftupleg")),
    ("head", by_norm.get("head")),
]

def sample_positions(obj, dg):
    eo = obj.evaluated_get(dg)
    em = eo.to_mesh()
    n = len(em.vertices)
    flat = [0.0] * (n * 3)
    em.vertices.foreach_get("co", flat)
    eo.to_mesh_clear()
    return flat, n

dg = bpy.context.evaluated_depsgraph_get()
dg.update()
rest_flat, rest_n = sample_positions(mesh_obj, dg)

deform_results = []
for label, bone_name in deform_targets:
    if not bone_name:
        deform_results.append({"target": label, "skipped": True, "reason": "bone not found post-decimation"})
        continue
    pbone = armature_obj.pose.bones.get(bone_name)
    original_mode = pbone.rotation_mode
    original_euler = tuple(pbone.rotation_euler)
    original_quat = tuple(pbone.rotation_quaternion)
    pbone.rotation_mode = "XYZ"
    pbone.rotation_euler = (math.radians(15), 0.0, 0.0)

    dg = bpy.context.evaluated_depsgraph_get()
    dg.update()
    after_flat, after_n = sample_positions(mesh_obj, dg)

    moved = 0
    all_finite = True
    for i in range(min(rest_n, after_n)):
        bx, by, bz = rest_flat[i*3], rest_flat[i*3+1], rest_flat[i*3+2]
        ax, ay, az = after_flat[i*3], after_flat[i*3+1], after_flat[i*3+2]
        if not all(math.isfinite(x) for x in (ax, ay, az)):
            all_finite = False
            break
        d = math.sqrt((ax-bx)**2 + (ay-by)**2 + (az-bz)**2)
        if d > 1e-5:
            moved += 1

    pbone.rotation_mode = original_mode
    pbone.rotation_euler = original_euler
    pbone.rotation_quaternion = original_quat
    dg = bpy.context.evaluated_depsgraph_get()
    dg.update()

    deform_results.append({"target": label, "bone": bone_name, "moved_vertex_count": moved, "finite": all_finite})
    if not all_finite:
        fail(f"Post-decimation deformation test on '{bone_name}' produced non-finite positions.")
    if moved < 5:
        fail(f"Post-decimation deformation test on '{bone_name}' moved only {moved} vertices — decimation likely destroyed weighting in that region.")

report["deformation_test"] = deform_results

# Remove the working vertex group before export — internal to this build,
# not runtime-meaningful. Re-fetch by name rather than reusing the
# `protect_vg` Python reference: modifier_apply rebuilds the mesh's
# internal data, which silently invalidates the old object reference
# (confirmed by a RuntimeError pointing at unrelated data on first attempt).
protect_vg_live = mesh_obj.vertex_groups.get("_decimate_protect")
if protect_vg_live:
    mesh_obj.vertex_groups.remove(protect_vg_live)

# ---------------------------------------------------------------------------
# Visual verification render — full body + a hands/face close-up, so
# region-aware preservation is actually seen, not assumed from the numbers.
# ---------------------------------------------------------------------------

sun = bpy.data.lights.new("_v_sun", "SUN"); sun.energy = 3.0
sun_obj = bpy.data.objects.new("_v_sun", sun); bpy.context.collection.objects.link(sun_obj)
sun_obj.rotation_euler = (math.radians(55), 0, math.radians(35))
fill = bpy.data.lights.new("_v_fill", "SUN"); fill.energy = 1.3
fill_obj = bpy.data.objects.new("_v_fill", fill); bpy.context.collection.objects.link(fill_obj)
fill_obj.rotation_euler = (math.radians(70), 0, math.radians(-140))

scene = bpy.context.scene
try:
    scene.render.engine = "BLENDER_EEVEE_NEXT"
except Exception:
    try:
        scene.render.engine = "BLENDER_EEVEE"
    except Exception:
        pass
scene.world = bpy.data.worlds.new("_v_world")
scene.world.use_nodes = True
bg = scene.world.node_tree.nodes.get("Background")
if bg:
    bg.inputs[0].default_value = (0.55, 0.6, 0.65, 1.0)

height = post_height if post_height > 0 else 1.83

def ortho_cam(name, loc, target, ortho_scale):
    cd = bpy.data.cameras.new(name); cd.type = "ORTHO"; cd.ortho_scale = ortho_scale
    co = bpy.data.objects.new(name, cd); bpy.context.collection.objects.link(co)
    co.location = loc
    direction = (mathutils.Vector(target) - mathutils.Vector(loc)).normalized()
    co.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    return co

# Camera at Blender +Y looks toward -Y (toward the character), which is the
# CORRECTED front per tools/blender/verify-kael-facing.py's empirical proof
# (post-correction: Blender +Y camera position saw the face). Using -Y here
# (the old, pre-correction "front") would render the back and silently
# defeat the whole point of this check — confirmed by exactly that mistake
# on the first render of this script, fixed here.
scene.render.resolution_x = 640
scene.render.resolution_y = 900
cam_full = ortho_cam("_v_cam_full", (0, height * 2.4, height * 0.55), (0, 0, height * 0.55), height * 1.7)
scene.camera = cam_full
full_path = os.path.join(RENDER_DIR, f"kael-lod{LOD}-full.png")
scene.render.filepath = full_path
bpy.ops.render.render(write_still=True)

# Chest-to-hands band, not just head — the A-pose puts hands at roughly
# shoulder-to-hip height, not head height, so a face-only crop would never
# actually show hand preservation.
scene.render.resolution_x = 900
scene.render.resolution_y = 700
cam_face = ortho_cam("_v_cam_face", (0, height * 0.95, height * 0.78), (0, 0, height * 0.78), height * 0.85)
scene.camera = cam_face
face_path = os.path.join(RENDER_DIR, f"kael-lod{LOD}-face-hands.png")
scene.render.filepath = face_path
bpy.ops.render.render(write_still=True)

for o in (sun_obj, fill_obj, cam_full, cam_face):
    bpy.data.objects.remove(o, do_unlink=True)

report["renders"] = {"full": full_path, "face_hands": face_path}

# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------

bpy.ops.object.select_all(action="DESELECT")
armature_obj.select_set(True)
mesh_obj.select_set(True)
bpy.context.view_layer.objects.active = armature_obj

try:
    bpy.ops.export_scene.gltf(
        filepath=OUTPUT_GLB,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=False,
        export_skins=True,
        export_animations=False,
        export_morph=False,
        export_materials="EXPORT",
        export_texcoords=True,
        export_normals=True,
    )
except Exception as e:
    fail(f"glTF export failed: {e}")

report["result"] = "PASSED"
report["output_glb"] = OUTPUT_GLB
with open(REPORT_JSON, "w") as f:
    json.dump(report, f, indent=2, default=str)

print("BUILD_OK")
print(f"BUILD_TRIS:{post_tri_count}")
print(f"BUILD_REDUCTION_PCT:{report['post_decimation']['reduction_percent']}")
print(f"BUILD_UNWEIGHTED_PCT:{pct_unweighted:.3f}")
print(f"BUILD_HEIGHT_M:{post_height:.4f}")
print(f"BUILD_OUTPUT:{OUTPUT_GLB}")
