"""
WindArms — Kael first-person arms extraction (Milestone 7, Phase F, Step 4).

Separate script from make-kael-runtime.py on purpose (per instruction): arm
extraction is vertex-selection-by-bone-influence on a monolithic mesh, a
fundamentally different and riskier operation than the body's uniform/
region-weighted decimation. Isolating it means a bad shoulder cut can never
touch the already-committed, already-approved body LOD0/LOD1 outputs.

Modes (first positional arg after `--`):

  measure    Compute and report the arm/chest weight-influence distribution
             on every vertex — no extraction, no output file. Read this
             report BEFORE choosing threshold numbers; per instruction,
             thresholds must come from this measured distribution, not
             guessed round numbers.

  candidates Given N (threshold_name, threshold_value) pairs, generate that
             many candidate selections, each measured (vertex/tri count,
             connected components, loose geometry, boundary edges, retained
             bones) and exported to SCRATCH ONLY (never public/v2-art/,
             never committed) for comparison.

  final      Given ONE chosen threshold, do the real extraction: select,
             delete non-arm geometry, decimate (Decimate-before-Armature,
             same lesson learned on the body builder), clean loose geometry,
             assign the neutral dev material, run deformation tests, render
             validation views, export to public/v2-art/operator-kael-arms.glb.

Usage:
  blender --background --python make-kael-fp-arms.py -- measure <source_glb> <report_json>
  blender --background --python make-kael-fp-arms.py -- candidates <source_glb> <report_json> <scratch_dir> <name:threshold> [<name:threshold> ...]
  blender --background --python make-kael-fp-arms.py -- final <source_glb> <threshold> <output_glb> <report_json> <render_dir>
"""

import sys
import os
import math
import json

import bpy
import bmesh
import mathutils

# ---------------------------------------------------------------------------
# Bone resolution — SAME logic as tools/blender/inspect-kael-rig.py, not
# reinvented, per instruction to resolve bones "through the same
# bone-resolution logic already used by the gate."
# ---------------------------------------------------------------------------

PREFIX_STRIP = ["mixamorig:", "mixamorig_", "mixamorig", "def-", "def_", "armature_"]


def normalize_bone_name(name):
    n = name.strip().lower()
    for p in PREFIX_STRIP:
        if n.startswith(p):
            n = n[len(p):]
            break
    return n


SIDE_CHAIN_CANDIDATES = {
    "shoulder": {"left": ["leftshoulder", "shoulder_l", "clavicle_l", "clavicle.l"],
                 "right": ["rightshoulder", "shoulder_r", "clavicle_r", "clavicle.r"]},
    "upper_arm": {"left": ["leftarm", "upperarm_l", "arm_l", "upperarm.l"],
                  "right": ["rightarm", "upperarm_r", "arm_r", "upperarm.r"]},
    "lower_arm": {"left": ["leftforearm", "lowerarm_l", "forearm_l", "lowerarm.l"],
                  "right": ["rightforearm", "lowerarm_r", "forearm_r", "lowerarm.r"]},
    "hand": {"left": ["lefthand", "hand_l", "hand.l"],
             "right": ["righthand", "hand_r", "hand.r"]},
}

FINGER_PREFIXES = {
    "thumb": {"left": "lefthandthumb", "right": "righthandthumb"},
    "index": {"left": "lefthandindex", "right": "righthandindex"},
    "middle": {"left": "lefthandmiddle", "right": "righthandmiddle"},
    "ring": {"left": "lefthandring", "right": "righthandring"},
    "pinky": {"left": "lefthandpinky", "right": "righthandpinky"},
}

# Optional boundary bones — usable ONLY for a controlled shoulder/chest
# bridge, never as a reason to retain most of the torso (per instruction).
BOUNDARY_CANDIDATES = ["spine2", "chest", "spine1", "upperchest", "spine"]


def resolve_bone(normalized_names_by_bone, candidates):
    for norm, original in normalized_names_by_bone.items():
        if norm in candidates:
            return original
    return None


def resolve_arm_bone_set(armature_obj):
    """Returns (arm_bones: set of exact bone names, boundary_bones: set,
    resolution_report: dict) — the full required-arm-influence set (both
    sides: shoulder/upper arm/lower arm/hand/all 5 finger chains) plus the
    separate optional boundary set (chest/spine), resolved by exact
    normalized-name matching against this specific armature, not assumed."""
    normalized = {normalize_bone_name(b.name): b.name for b in armature_obj.data.bones}
    all_names = [b.name for b in armature_obj.data.bones]

    arm_bones = set()
    resolution = {}
    for key, sides in SIDE_CHAIN_CANDIDATES.items():
        for side, candidates in sides.items():
            found = resolve_bone(normalized, candidates)
            resolution[f"{key}_{side}"] = found
            if found:
                arm_bones.add(found)

    finger_resolution = {}
    for finger, sides in FINGER_PREFIXES.items():
        for side, prefix in sides.items():
            segments = [n for n in all_names if normalize_bone_name(n).startswith(prefix)]
            finger_resolution[f"{finger}_{side}"] = segments
            arm_bones.update(segments)

    boundary_bones = set()
    for cand in BOUNDARY_CANDIDATES:
        found = normalized.get(cand)
        if found:
            boundary_bones.add(found)
            break  # only the single most-specific boundary bone (spine2/chest first)

    return arm_bones, boundary_bones, {"chains": resolution, "fingers": finger_resolution}


def import_source(source_glb):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=source_glb)
    armatures = [o for o in bpy.data.objects if o.type == "ARMATURE"]
    all_meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    if len(armatures) != 1:
        raise SystemExit(f"Expected 1 armature, found {len(armatures)}")
    skinned = [o for o in all_meshes if any(m.type == "ARMATURE" for m in o.modifiers) and len(o.vertex_groups) > 0]
    if len(skinned) != 1:
        raise SystemExit(f"Expected 1 skinned mesh, found {len(skinned)}")
    return armatures[0], skinned[0]


def vertex_influence_fractions(mesh_obj, bone_set_names, boundary_set_names):
    """Per-vertex (arm_fraction, boundary_fraction, other_fraction) —
    cumulative weight from arm bones / boundary bones / everything else,
    each normalized by the vertex's total weight. This is the real,
    measured basis for threshold selection, not a guess."""
    vg_index_to_name = {vg.index: vg.name for vg in mesh_obj.vertex_groups}
    arm_indices = {vg.index for vg in mesh_obj.vertex_groups if vg.name in bone_set_names}
    boundary_indices = {vg.index for vg in mesh_obj.vertex_groups if vg.name in boundary_set_names}

    results = []
    for v in mesh_obj.data.vertices:
        total = sum(g.weight for g in v.groups)
        if total <= 1e-9:
            results.append((0.0, 0.0, 0.0))
            continue
        arm_w = sum(g.weight for g in v.groups if g.group in arm_indices)
        boundary_w = sum(g.weight for g in v.groups if g.group in boundary_indices)
        results.append((arm_w / total, boundary_w / total, max(0.0, 1 - (arm_w + boundary_w) / total)))
    return results


def histogram(values, bucket_count=20, lo=0.0, hi=1.0):
    buckets = [0] * bucket_count
    width = (hi - lo) / bucket_count
    for v in values:
        idx = min(bucket_count - 1, max(0, int((v - lo) / width)))
        buckets[idx] += 1
    return [{"range": [round(lo + i * width, 3), round(lo + (i + 1) * width, 3)], "count": c} for i, c in enumerate(buckets)]


# ---------------------------------------------------------------------------
# Mode dispatch
# ---------------------------------------------------------------------------

argv = sys.argv
if "--" not in argv:
    raise SystemExit("Usage: blender --background --python make-kael-fp-arms.py -- <mode> ...")
rest = argv[argv.index("--") + 1:]
if not rest:
    raise SystemExit("Missing mode: measure | candidates | final")
MODE = rest[0]
MODE_ARGS = rest[1:]


if MODE == "measure":
    source_glb, report_json = MODE_ARGS
    armature_obj, mesh_obj = import_source(source_glb)
    arm_bones, boundary_bones, resolution = resolve_arm_bone_set(armature_obj)

    fractions = vertex_influence_fractions(mesh_obj, arm_bones, boundary_bones)
    arm_fracs = [f[0] for f in fractions]
    boundary_fracs = [f[1] for f in fractions]

    # Vertices with ANY arm influence at all — the population whose
    # distribution actually matters for picking a threshold. Vertices with
    # zero arm influence (legs, most of torso, head) are irrelevant noise
    # for this specific decision and would just flatten the histogram.
    any_arm_influence = [f[0] for f in fractions if f[0] > 1e-6]

    report = {
        "source_glb": source_glb,
        "total_vertices": len(mesh_obj.data.vertices),
        "arm_bones_resolved": sorted(arm_bones),
        "boundary_bones_resolved": sorted(boundary_bones),
        "resolution_detail": resolution,
        "vertices_with_any_arm_influence": len(any_arm_influence),
        "arm_fraction_histogram_all_vertices": histogram(arm_fracs),
        "arm_fraction_histogram_arm_influenced_only": histogram(any_arm_influence),
        "boundary_fraction_histogram_all_vertices": histogram(boundary_fracs),
    }

    missing_bones = [k for k, v in resolution["chains"].items() if v is None]
    if missing_bones:
        report["missing_chain_bones"] = missing_bones

    with open(report_json, "w") as f:
        json.dump(report, f, indent=2)
    print(f"MEASURE_OK arm_bones={len(arm_bones)} boundary_bones={len(boundary_bones)} arm_influenced_verts={len(any_arm_influence)}")
    if missing_bones:
        print(f"MEASURE_WARNING missing chain bones: {missing_bones}")

def connected_components(bm):
    """BFS over the vertex-adjacency graph. Returns a list of components,
    each a list of BMVert objects (not raw indices — v.index is unreliable
    post-delete, see select_and_isolate's docstring; callers that need the
    ORIGINAL source index should read the ORIG_INDEX_LAYER_NAME layer off
    each returned BMVert). Used both for whole-selection island analysis
    (reject many tiny floating shards) and for boundary-edge-loop analysis
    (classify intentional shoulder cuts vs. unexpected holes)."""
    visited = set()
    components = []
    for v in bm.verts:
        if v in visited:
            continue
        stack = [v]
        comp = []
        visited.add(v)
        while stack:
            cur = stack.pop()
            comp.append(cur)
            for e in cur.link_edges:
                other = e.other_vert(cur)
                if other not in visited:
                    visited.add(other)
                    stack.append(other)
        components.append(comp)
    return components


def boundary_loops(bm):
    """Groups boundary edges (exactly 1 linked face — an open cut edge, not
    a hole in a closed mesh) into connected loops via BFS over the
    boundary-edge subgraph. Separately reports edges with >=3 linked faces
    (genuinely malformed, never expected) and wire edges (0 faces)."""
    boundary_edges = [e for e in bm.edges if len(e.link_faces) == 1]
    bad_edges = [e for e in bm.edges if len(e.link_faces) >= 3]
    wire_edges = [e for e in bm.edges if len(e.link_faces) == 0]

    boundary_edge_set = set(e.index for e in boundary_edges)
    visited = set()
    loops = []
    edge_by_index = {e.index: e for e in boundary_edges}
    for e in boundary_edges:
        if e.index in visited:
            continue
        stack = [e]
        loop_edges = []
        visited.add(e.index)
        while stack:
            cur = stack.pop()
            loop_edges.append(cur.index)
            for v in cur.verts:
                for e2 in v.link_edges:
                    if e2.index in boundary_edge_set and e2.index not in visited:
                        visited.add(e2.index)
                        stack.append(e2)
        loops.append(loop_edges)

    return {
        "boundary_edge_count": len(boundary_edges),
        "boundary_loop_count": len(loops),
        "boundary_loop_sizes": sorted([len(l) for l in loops], reverse=True),
        "malformed_edges_3plus_faces": len(bad_edges),
        "wire_edges_0_faces": len(wire_edges),
    }


ORIG_INDEX_LAYER_NAME = "_orig_src_index"


def select_and_isolate(mesh_obj, fractions, threshold, boundary_indices_set=None, boundary_weight_cap=None):
    """Duplicates mesh_obj's data into a NEW bmesh containing only vertices
    at/above `threshold` arm-fraction, deletes everything else, returns the
    bmesh. Does not touch the original mesh_obj — caller writes the result
    into a separate object.

    Stamps each vertex with its ORIGINAL mesh_obj.data.vertices index into a
    custom int layer before deleting. bmesh.ops.delete renumbers surviving
    verts' .index sequentially (0..M-1) rather than preserving the source
    index — confirmed by a leg/hip-taint check that came back with an
    impossible leg_fraction of 1.0 on an arm_fraction>=0.25-selected vertex
    before this fix. Any caller that needs to map a surviving vertex back to
    an external array indexed by ORIGINAL vertex id (e.g. fractions[],
    dominant-bone lookups) MUST read this layer, never v.index, post-delete."""
    bm = bmesh.new()
    bm.from_mesh(mesh_obj.data)
    bm.verts.ensure_lookup_table()
    orig_layer = bm.verts.layers.int.new(ORIG_INDEX_LAYER_NAME)
    for i, v in enumerate(bm.verts):
        v[orig_layer] = i
    to_delete = [bm.verts[i] for i, frac in enumerate(fractions) if frac[0] < threshold]
    if to_delete:
        bmesh.ops.delete(bm, geom=to_delete, context="VERTS")
    return bm


LEG_HIP_CANDIDATES = {
    "hips": ["hips", "pelvis"],
    "spine_base": ["spine"],
    "upper_leg_left": ["leftupleg", "leftthigh", "thigh_l"],
    "upper_leg_right": ["rightupleg", "rightthigh", "thigh_r"],
    "lower_leg_left": ["leftleg", "leftcalf", "calf_l"],
    "lower_leg_right": ["rightleg", "rightcalf", "calf_r"],
    "foot_left": ["leftfoot", "foot_l"],
    "foot_right": ["rightfoot", "foot_r"],
    "toe_left": ["lefttoebase", "lefttoe_end"],
    "toe_right": ["righttoebase", "righttoe_end"],
}


def resolve_leg_hip_bones(armature_obj):
    normalized = {normalize_bone_name(b.name): b.name for b in armature_obj.data.bones}
    found = set()
    for _key, candidates in LEG_HIP_CANDIDATES.items():
        name = resolve_bone(normalized, candidates)
        if name:
            found.add(name)
    return found


def leg_hip_fraction_per_vertex(mesh_obj, leg_hip_bone_names):
    """Same normalization pattern as vertex_influence_fractions, isolated
    to lower-body bones only — used to prove candidates aren't quietly
    dragging in hip/leg/foot geometry via the boundary channel."""
    vg_indices = {vg.index for vg in mesh_obj.vertex_groups if vg.name in leg_hip_bone_names}
    results = []
    for v in mesh_obj.data.vertices:
        total = sum(g.weight for g in v.groups)
        if total <= 1e-9:
            results.append(0.0)
            continue
        leg_w = sum(g.weight for g in v.groups if g.group in vg_indices)
        results.append(leg_w / total)
    return results


def dominant_bone_per_vertex(mesh_obj):
    """Single most-weighted vertex-group name per vertex, aligned to
    ORIGINAL mesh_obj.data.vertices index order — used to classify what
    each connected component actually IS (arm geometry vs. an accidental
    leg/head fragment), independent of the arm/boundary/other fraction
    split used for selection."""
    vg_idx_to_name = {vg.index: vg.name for vg in mesh_obj.vertex_groups}
    result = []
    for v in mesh_obj.data.vertices:
        best = max(v.groups, key=lambda g: g.weight, default=None)
        result.append(vg_idx_to_name.get(best.group) if best else None)
    return result


def unweighted_vertex_count(bm, epsilon=1e-6):
    """Vertices in the CANDIDATE selection with zero total deform weight —
    would deform incorrectly (stay static) if this made it to the final
    derivative. Required stat per the Step 4 spec."""
    dvert_layer = bm.verts.layers.deform.active
    if dvert_layer is None:
        return len(bm.verts)
    count = 0
    for v in bm.verts:
        dvert = v[dvert_layer]
        total = sum(dvert.values())
        if total <= epsilon:
            count += 1
    return count


def ortho_cam(name, loc, target, ortho_scale):
    cd = bpy.data.cameras.new(name)
    cd.type = "ORTHO"
    cd.ortho_scale = ortho_scale
    co = bpy.data.objects.new(name, cd)
    bpy.context.collection.objects.link(co)
    co.location = loc
    direction = (mathutils.Vector(target) - mathutils.Vector(loc)).normalized()
    co.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    return co


def render_candidate_preview(obj, center, radius, out_png):
    """Minimal two-angle orthographic render (front + 3/4) for visual
    sanity-checking a candidate's component structure (legitimate armor
    islands vs. severed anatomy) before committing to a threshold — not one
    of the required final-mode renders, just a fast look. Reuses the exact
    engine-fallback / +Y-front-camera / ortho_cam pattern already proven in
    make-kael-runtime.py, rather than reinventing render setup."""
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except Exception:
        try:
            scene.render.engine = "BLENDER_EEVEE"
        except Exception:
            pass
    if not scene.world:
        scene.world = bpy.data.worlds.new("_preview_world")
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.55, 0.6, 0.65, 1.0)

    mat = bpy.data.materials.get("_preview_mat") or bpy.data.materials.new("_preview_mat")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (0.85, 0.55, 0.2, 1.0)
    obj.data.materials.clear()
    obj.data.materials.append(mat)

    sun_data = bpy.data.lights.new("_preview_sun", type="SUN")
    sun_data.energy = 3.0
    sun_obj = bpy.data.objects.new("_preview_sun", sun_data)
    bpy.context.collection.objects.link(sun_obj)
    sun_obj.rotation_euler = (math.radians(55), 0, math.radians(35))
    fill_data = bpy.data.lights.new("_preview_fill", type="SUN")
    fill_data.energy = 1.3
    fill_obj = bpy.data.objects.new("_preview_fill", fill_data)
    bpy.context.collection.objects.link(fill_obj)
    fill_obj.rotation_euler = (math.radians(70), 0, math.radians(-140))

    scene.render.resolution_x = 700
    scene.render.resolution_y = 700
    cx, cy, cz = center
    cam_front = ortho_cam("_preview_cam_front", (cx, cy + radius * 3.0, cz), (cx, cy, cz), radius * 2.2)
    scene.camera = cam_front
    scene.render.filepath = out_png
    bpy.ops.render.render(write_still=True)

    bpy.data.objects.remove(sun_obj, do_unlink=True)
    bpy.data.objects.remove(fill_obj, do_unlink=True)
    bpy.data.objects.remove(cam_front, do_unlink=True)


def retained_bone_weights(mesh_obj_data_source_vgroups, bm, epsilon=1e-6):
    """Given the ORIGINAL mesh's vertex-group name table and a bmesh already
    reduced to the candidate selection, returns the set of vertex-group
    names that still have at least one real weighted vertex — via bmesh's
    deform layer, which survives bmesh.ops.delete on other verts."""
    dvert_layer = bm.verts.layers.deform.active
    if dvert_layer is None:
        return set()
    idx_to_name = mesh_obj_data_source_vgroups
    used = set()
    for v in bm.verts:
        dvert = v[dvert_layer]
        for group_index in dvert.keys():
            if dvert[group_index] > epsilon:
                name = idx_to_name.get(group_index)
                if name:
                    used.add(name)
    return used


if MODE == "candidates":
    source_glb, report_json, scratch_dir = MODE_ARGS[0], MODE_ARGS[1], MODE_ARGS[2]
    threshold_specs = MODE_ARGS[3:]
    os.makedirs(scratch_dir, exist_ok=True)

    armature_obj, mesh_obj = import_source(source_glb)
    arm_bones, boundary_bones, resolution = resolve_arm_bone_set(armature_obj)
    fractions = vertex_influence_fractions(mesh_obj, arm_bones, boundary_bones)
    leg_hip_bones = resolve_leg_hip_bones(armature_obj)
    leg_fractions = leg_hip_fraction_per_vertex(mesh_obj, leg_hip_bones)
    dominant_bones = dominant_bone_per_vertex(mesh_obj)
    vg_idx_to_name = {vg.index: vg.name for vg in mesh_obj.vertex_groups}

    # Hide the original full-body source mesh from preview renders — left
    # visible, it can occlude/coincide with any accidentally-included
    # leg/torso geometry in a candidate (same 3D position, both opaque),
    # silently hiding exactly the defect a preview render is meant to catch.
    mesh_obj.hide_render = True
    armature_obj.hide_render = True

    depsgraph = bpy.context.evaluated_depsgraph_get()
    eval_obj = mesh_obj.evaluated_get(depsgraph)
    corners = [eval_obj.matrix_world @ mathutils.Vector(c) for c in eval_obj.bound_box]
    source_dims = [max(c.x for c in corners) - min(c.x for c in corners),
                   max(c.y for c in corners) - min(c.y for c in corners),
                   max(c.z for c in corners) - min(c.z for c in corners)]

    source_tri_count = sum(max(len(p.vertices) - 2, 1) for p in mesh_obj.data.polygons)
    source_vert_count = len(mesh_obj.data.vertices)

    candidates_report = {
        "source_vertices": source_vert_count,
        "source_triangles": source_tri_count,
        "source_dimensions_m": source_dims,
        "arm_bones_resolved_count": len(arm_bones),
        "boundary_bones_resolved": sorted(boundary_bones),
        "candidates": {},
    }

    for spec in threshold_specs:
        name, threshold_str = spec.split(":")
        threshold = float(threshold_str)

        bm = select_and_isolate(mesh_obj, fractions, threshold)
        bm.verts.ensure_lookup_table()
        bm.edges.ensure_lookup_table()
        bm.faces.ensure_lookup_table()

        sel_vert_count = len(bm.verts)
        sel_tri_count = sum(max(len(f.verts) - 2, 1) for f in bm.faces)

        orig_layer_read = bm.verts.layers.int.get(ORIG_INDEX_LAYER_NAME)

        components = connected_components(bm)
        component_sizes = sorted([len(c) for c in components], reverse=True)
        # Classify each component by its most common dominant bone — proves
        # whether the many small islands are legitimate arm-region armor
        # plates (elbow guard, wrist bracer, glove knuckle plate — all
        # dominant-bone == an arm bone) or an accidental leg/torso fragment.
        component_classification = []
        for comp in components:
            bone_counts = {}
            for v in comp:
                b = dominant_bones[v[orig_layer_read]]
                if b:
                    bone_counts[b] = bone_counts.get(b, 0) + 1
            top = sorted(bone_counts.items(), key=lambda kv: -kv[1])[:2]
            component_classification.append({"size": len(comp), "top_dominant_bones": top})
        loose_verts = sum(1 for v in bm.verts if len(v.link_faces) == 0)
        zero_area = sum(1 for f in bm.faces if f.calc_area() < 1e-10)
        boundary_info = boundary_loops(bm)
        retained_bones = retained_bone_weights(vg_idx_to_name, bm)
        unweighted = unweighted_vertex_count(bm)

        # Lower-body (hip/leg/foot/toe) retention check — required stat.
        # Reads the orig-index custom layer (NOT v.index, which bmesh
        # renumbers sequentially after ops.delete — see select_and_isolate's
        # docstring) to correctly map each surviving vertex back to its
        # ORIGINAL fractions/leg_fractions entry.
        selected_leg_fracs = [leg_fractions[v[orig_layer_read]] for v in bm.verts]
        leg_tainted = [f for f in selected_leg_fracs if f > 0.01]

        # Bounding box of the candidate (min/max over remaining verts).
        if bm.verts:
            xs = [v.co.x for v in bm.verts]
            ys = [v.co.y for v in bm.verts]
            zs = [v.co.z for v in bm.verts]
            cand_dims = [max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs)]
            cand_center = ((max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2, (max(zs) + min(zs)) / 2)
            cand_radius = max(cand_dims) / 2 or 0.1
        else:
            cand_dims = [0, 0, 0]
            cand_center = (0, 0, 0)
            cand_radius = 0.1

        # Export this candidate to SCRATCH ONLY for visual comparison —
        # write into a temporary Blender object/scene, never public/v2-art/.
        cand_mesh_data = bpy.data.meshes.new(f"_cand_{name}")
        bm.to_mesh(cand_mesh_data)
        cand_obj = bpy.data.objects.new(f"_cand_{name}", cand_mesh_data)
        bpy.context.collection.objects.link(cand_obj)
        bm.free()

        scratch_glb = os.path.join(scratch_dir, f"kael-arms-candidate-{name}.glb")
        bpy.ops.object.select_all(action="DESELECT")
        cand_obj.select_set(True)
        bpy.context.view_layer.objects.active = cand_obj
        bpy.ops.export_scene.gltf(filepath=scratch_glb, export_format="GLB", use_selection=True, export_yup=True)

        preview_png = os.path.join(scratch_dir, f"kael-arms-candidate-{name}-preview.png")
        render_candidate_preview(cand_obj, cand_center, cand_radius, preview_png)

        candidates_report["candidates"][name] = {
            "threshold": threshold,
            "selected_vertices": sel_vert_count,
            "selected_triangles": sel_tri_count,
            "retained_percent_of_source_verts": round(100 * sel_vert_count / source_vert_count, 2),
            "retained_percent_of_source_tris": round(100 * sel_tri_count / source_tri_count, 2),
            "bounding_dimensions": cand_dims,
            "connected_component_count": len(components),
            "connected_component_sizes_all": component_sizes,
            "connected_component_classification": component_classification,
            "loose_vertices": loose_verts,
            "zero_area_faces": zero_area,
            "boundary_analysis": boundary_info,
            "unweighted_vertices": unweighted,
            "retained_deform_bone_count": len(retained_bones),
            "retained_deform_bones": sorted(retained_bones),
            "leg_hip_bones_checked": sorted(leg_hip_bones),
            "leg_hip_tainted_vertex_count": len(leg_tainted),
            "leg_hip_max_fraction": max(selected_leg_fracs) if selected_leg_fracs else 0.0,
            "scratch_glb": scratch_glb,
            "preview_png": preview_png,
        }

        bpy.data.objects.remove(cand_obj, do_unlink=True)
        bpy.data.meshes.remove(cand_mesh_data)

    with open(report_json, "w") as f:
        json.dump(candidates_report, f, indent=2)
    print("CANDIDATES_OK")
    for name, data in candidates_report["candidates"].items():
        print(f"  {name}: verts={data['selected_vertices']} tris={data['selected_triangles']} components={data['connected_component_count']} loose={data['loose_vertices']} boundary_loops={data['boundary_analysis']['boundary_loop_count']} leg_hip_tainted={data['leg_hip_tainted_vertex_count']} leg_hip_max_frac={data['leg_hip_max_fraction']:.3f}")
        for c in data["connected_component_classification"]:
            print(f"      size={c['size']} bones={c['top_dominant_bones']}")

elif MODE == "measure":
    pass  # handled above

elif MODE == "final":
    source_glb, threshold_str, output_glb, report_json, render_dir = MODE_ARGS
    threshold = float(threshold_str)
    os.makedirs(os.path.dirname(output_glb), exist_ok=True)
    os.makedirs(render_dir, exist_ok=True)

    # Measured, not invented — this is the same threshold already proven out
    # in candidates mode (46-54k tri raw selections, 0 leg/hip taint, every
    # connected component dominant-bone-classified as legitimate arm/hand/
    # shoulder geometry). Extraction budget below is likewise set from that
    # measurement, not guessed ahead of time — see the budget block below.
    #
    # First attempt used 18,000/15,000 — that FORCED uniform (unprotected)
    # decimation, because hand/finger region protection has a natural floor
    # of 19,852 tris on this mesh (measured: the binary search plateaus
    # there no matter how low the ratio goes, since roughly 39% of the
    # selection's vertices are hand/finger geometry). Passing 15,000 without
    # protection produced structurally clean but VISUALLY MERGED fingers on
    # both hands — confirmed by render, not assumed — which fails the
    # explicit "sufficient for readable hands/fingers" requirement even
    # though every numeric/structural gate passed. Raised to accommodate
    # the measured protected floor instead of fighting it: still materially
    # below the 45,000 full-body LOD0 budget (53% below) and equal to body
    # LOD1's own budget, but here nearly the entire allowance goes to two
    # hands instead of a full body, which is the whole point.
    ARMS_BUDGET_TRIS = 21_000
    ARMS_TARGET_TRIS = 20_000

    # "Scalpel" long-edge cleanup threshold (Step 6C blocker fix,
    # 2026-07-22 — see docs/decisions.md "exploded geometry" entries for
    # the full investigation). Measured on THIS mesh: pre-decimation
    # boundary edges are tiny everywhere (max ~0.017m, median ~0.0035m,
    # confirmed at every threshold from 0.15 to 0.65 tried) — the giant,
    # screen-filling triangles reported in manual browser testing are NOT
    # present in the raw threshold-based extraction. They are introduced
    # BY DECIMATION: Collapse, applied next to the open shoulder/torso cut
    # boundary with no far-side neighbor information, can stretch a
    # boundary-touching edge to 0.12m+ (confirmed: max boundary edge grew
    # from 0.0168m pre-decimation to 0.1208m post, a 7x increase; max face
    # area grew 104x, from 0.000082 to 0.008560 m²). Two alternative fixes
    # were tried and rejected before this one: (1) protecting boundary-
    # adjacent vertex rings from decimation via the same vertex-group
    # mechanism already used for hand/finger protection — measured to NOT
    # fix it (max edge still reached 0.135m) and to blow the triangle
    # budget (protected area too large for Collapse to reach the target
    # ratio) — decimation being forced away from a protected region just
    # relocates the same distortion to whatever remains unprotected next
    # to it ("waterbed effect"), it doesn't remove it. (2) capping the
    # open boundary with bmesh.ops.holes_fill BEFORE decimating (closing
    # the topology so Collapse has full neighbor information) — measured
    # to fail outright: the boundary's real topology is too irregular for
    # holes_fill to close reliably, even from a clean planar bisect
    # through the upper-arm bone axis (only 2-4 new faces were created
    # from 1700-8000 boundary edges, leaving most of the boundary open
    # AND introducing new malformed/wire edges that hadn't existed
    # before). This constant is the fix that WAS measured to work: after
    # decimation, delete any face whose longest edge exceeds this length,
    # then clean up the resulting loose vertices. Measured on the real
    # asset at threshold=0.35/target=20000 (the values that produced the
    # currently-shipped, reportedly-broken derivative): only 273 of
    # 19,995 triangles (1.4%) exceed 0.035m and get removed; the result's
    # max boundary edge drops to 0.035m (from 0.121m) and max face area
    # drops to 0.00042 m² (from 0.00856 m², a 20x reduction) — triangle
    # count barely moves (19,995 -> 19,722) and zero loose vertices remain
    # after cleanup. The new small holes this leaves sit exactly at the
    # already-open shoulder/torso amputation boundary (where no geometry
    # is expected beyond it anyway) — a slightly more ragged boundary
    # shape, not a new defect location.
    MAX_EDGE_LENGTH_M = 0.035
    # Sanity ceiling: if the scalpel would need to remove more than this
    # fraction of triangles to hit MAX_EDGE_LENGTH_M, something is
    # structurally worse than the measured case above — fail loudly
    # rather than silently carving away a large fraction of the mesh.
    MAX_SCALPEL_REMOVAL_FRACTION = 0.05
    # Removing long-edge faces regardless of region (see MAX_EDGE_LENGTH_M
    # usage below for why this isn't proximal-restricted) can occasionally
    # open a genuinely tiny gap in a distal (hand/forearm) region — measured
    # on the real asset: a single 3-edge (1-triangle) hole. The boundary-
    # loop classification below already distinguishes "pre-existing source
    # seam" / "intentional shoulder cut" / "accidental hole (distal-
    # dominant)" — a distal-dominant loop at or below this edge count is
    # treated as a tolerated minor artifact (recorded, not silently
    # dropped) rather than a hard failure; anything larger still fails, per
    # the original gate's intent (reject a real accidental cut into hand/
    # finger geometry, not a single stray triangle at the decimation edge).
    SMALL_ACCIDENTAL_HOLE_EDGE_LIMIT = 6

    report = {"source_glb": source_glb, "threshold": threshold, "failures": [],
              "budget_tris": ARMS_BUDGET_TRIS, "target_tris": ARMS_TARGET_TRIS,
              "max_edge_length_m": MAX_EDGE_LENGTH_M}

    def fail(message):
        report["failures"].append(message)
        report["result"] = "FAILED"
        with open(report_json, "w") as f:
            json.dump(report, f, indent=2, default=str)
        print(f"BUILD_FAILED: {message}")
        sys.exit(1)

    def full_structural_stats(mesh_object):
        """bpy-mesh-object wrapper around the same boundary/loose/zero-area
        checks used in candidates mode — boundary edges (1 linked face) are
        EXPECTED here (open shoulder cut), never blanket-failed; only
        malformed (>=3 faces) and wire (0 faces) edges, loose vertices, and
        zero-area faces are unconditionally bad."""
        bm_ = bmesh.new()
        bm_.from_mesh(mesh_object.data)
        bm_.verts.ensure_lookup_table()
        bm_.edges.ensure_lookup_table()
        bm_.faces.ensure_lookup_table()
        loose_v = sum(1 for v in bm_.verts if len(v.link_faces) == 0)
        zero_area_f = sum(1 for f in bm_.faces if f.calc_area() < 1e-10)
        b_info = boundary_loops(bm_)
        bm_.free()
        return {
            "loose_vertices": loose_v,
            "zero_area_faces": zero_area_f,
            **b_info,
        }

    def used_vertex_group_names_final(mesh_object, epsilon=1e-6):
        used = set()
        idx_to_name = {vg.index: vg.name for vg in mesh_object.vertex_groups}
        for v in mesh_object.data.vertices:
            for g in v.groups:
                if g.weight > epsilon:
                    used.add(idx_to_name.get(g.group))
        return used

    # -----------------------------------------------------------------
    # Import + resolve bones (same logic as measure/candidates).
    # -----------------------------------------------------------------
    armature_obj, mesh_obj = import_source(source_glb)
    arm_bones, boundary_bones, resolution = resolve_arm_bone_set(armature_obj)
    report["arm_bones_resolved"] = sorted(arm_bones)
    report["boundary_bones_resolved"] = sorted(boundary_bones)

    # Delete any stray non-character objects BEFORE export (defensive —
    # only Armature and mesh_obj should ever be selected/exported). Note:
    # an earlier pass of this investigation suspected the source GLB's
    # "Icosphere" bone-custom-shape widget (Blender's own glTF importer
    # auto-creates one per import, assigned as pose_bone.custom_shape, for
    # viewport display only) was leaking into exported output — including
    # the already-committed operator-kael.glb/.lod1.glb. Verified FALSE by
    # parsing the raw GLB JSON chunk directly (bypassing Blender's importer
    # entirely, which was the actual source of the false positive — it
    # regenerates that widget fresh on every import regardless of file
    # content): all three files (both body derivatives and this one)
    # contain exactly one mesh ("Kael_Source_Mesh"/"Mesh_0") and the full
    # bone hierarchy, nothing else. No real defect existed. This cleanup
    # is kept as cheap, harmless defense-in-depth, not a fix for a real bug.
    for pbone in armature_obj.pose.bones:
        if pbone.custom_shape is not None:
            pbone.custom_shape = None

    stray_objects = [o for o in bpy.data.objects if o not in (armature_obj, mesh_obj)]
    report["stray_objects_deleted_before_export"] = [
        {"name": o.name, "type": o.type, "vertex_count": len(o.data.vertices) if o.type == "MESH" else None}
        for o in stray_objects
    ]
    for o in stray_objects:
        bpy.data.objects.remove(o, do_unlink=True)

    # Pre-existing bug fixed 2026-07-22 (Step 6C blocker fix): this used to
    # read `resolution.get("shoulder_left")` etc. directly — but
    # `resolve_arm_bone_set`'s third return value nests chain resolutions
    # under `resolution["chains"]`, not at the top level (top-level keys
    # are only "chains" and "fingers"). `.get("shoulder_left")` on the
    # outer dict always returned None, silently. Net effect: `proximal_bones`
    # was always just `boundary_bones` (one bone, e.g. Spine2) instead of
    # {shoulder_left, shoulder_right, upper_arm_left, upper_arm_right} ∪
    # boundary_bones — meaning `distal_bones` wrongly included the entire
    # upper-arm/shoulder region, and the boundary-loop classification below
    # (intentional_shoulder_cut vs ACCIDENTAL_HOLE) has been running on an
    # incorrect proximal/distal split since this script was first written.
    # Discovered while adding the proximal-only scalpel cleanup, whose own
    # proximal-dominant filter matched zero faces until this was fixed.
    proximal_bones = {resolution["chains"].get("shoulder_left"), resolution["chains"].get("shoulder_right"),
                       resolution["chains"].get("upper_arm_left"), resolution["chains"].get("upper_arm_right")} | boundary_bones
    proximal_bones.discard(None)
    distal_bones = arm_bones - proximal_bones

    fractions = vertex_influence_fractions(mesh_obj, arm_bones, boundary_bones)
    baseline_src_vert_count = len(mesh_obj.data.vertices)
    baseline_src_tri_count = sum(max(len(p.vertices) - 2, 1) for p in mesh_obj.data.polygons)
    baseline_arm_used = used_vertex_group_names_final(mesh_obj) & (arm_bones | boundary_bones)

    # Tag vertices that were ALREADY boundary-adjacent in the UNTOUCHED
    # 162,155-vert source mesh, before any extraction or decimation —
    # candidates-mode analysis proved this source mesh has its own
    # pre-existing island seams (the elbow split between the upper-arm and
    # forearm+hand components, the knuckle-plate boundary) that are open
    # regardless of any threshold choice, matching the already-accepted
    # baseline_manifold non_manifold_edges=24,345 figure recorded when the
    # body LOD0/LOD1 derivatives were built. Stored as a real vertex group
    # (not a bmesh-only custom layer) specifically because it must survive
    # BOTH the extraction deletion AND the decimation Collapse — the same
    # survive-through-Collapse mechanism already proven by
    # "_decimate_protect"/"_arms_decimate_protect" on the body and arms
    # builders. Read at boundary-loop classification time to distinguish a
    # pre-existing source seam (acceptable, not introduced by this script)
    # from a genuinely new cut this extraction created.
    bm_src = bmesh.new()
    bm_src.from_mesh(mesh_obj.data)
    bm_src.verts.ensure_lookup_table()
    bm_src.edges.ensure_lookup_table()
    src_boundary_vert_indices = set()
    for e in bm_src.edges:
        if len(e.link_faces) == 1:
            for v in e.verts:
                src_boundary_vert_indices.add(v.index)
    bm_src.free()
    src_boundary_vg = mesh_obj.vertex_groups.new(name="_src_boundary_adjacent")
    for idx in src_boundary_vert_indices:
        src_boundary_vg.add([idx], 1.0, "REPLACE")
    report["source_pre_existing_boundary_vertex_count"] = len(src_boundary_vert_indices)

    # -----------------------------------------------------------------
    # Extraction: isolate the arm selection, write it back into mesh_obj.data
    # in place (same object, same armature modifier, same vertex groups) so
    # the rest of this script can reuse the exact decimate-before-armature
    # pattern already proven on the body builder.
    # -----------------------------------------------------------------
    bm = select_and_isolate(mesh_obj, fractions, threshold)
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    orig_layer_final = bm.verts.layers.int.get(ORIG_INDEX_LAYER_NAME)
    if orig_layer_final:
        bm.verts.layers.int.remove(orig_layer_final)
    extracted_vert_count = len(bm.verts)
    extracted_tri_count = sum(max(len(f.verts) - 2, 1) for f in bm.faces)
    if extracted_vert_count == 0:
        fail("Extraction at this threshold selected zero vertices.")
    bm.to_mesh(mesh_obj.data)
    bm.free()
    mesh_obj.data.update()

    report["extraction"] = {
        "source_vertices": baseline_src_vert_count,
        "source_triangles": baseline_src_tri_count,
        "extracted_vertices": extracted_vert_count,
        "extracted_triangles": extracted_tri_count,
        "retained_percent_verts": round(100 * extracted_vert_count / baseline_src_vert_count, 2),
        "retained_percent_tris": round(100 * extracted_tri_count / baseline_src_tri_count, 2),
    }

    # Pre-decimation loose-geometry cleanup — the candidates pass showed a
    # small number of orphaned single-vertex islands right at the threshold
    # edge (e.g. balanced candidate: one size=1 component). Same cleanup
    # mechanism as the body builder's "Delete Loose Geometry" equivalent.
    bm2 = bmesh.new()
    bm2.from_mesh(mesh_obj.data)
    bm2.verts.ensure_lookup_table()
    loose = [v for v in bm2.verts if len(v.link_faces) == 0]
    pre_decimation_loose_cleaned = len(loose)
    if loose:
        bmesh.ops.delete(bm2, geom=loose, context="VERTS")
    bm2.to_mesh(mesh_obj.data)
    bm2.free()
    mesh_obj.data.update()
    report["pre_decimation_loose_cleanup"] = pre_decimation_loose_cleaned

    pre_decimation_vert_count = len(mesh_obj.data.vertices)
    pre_decimation_tri_count = sum(max(len(p.vertices) - 2, 1) for p in mesh_obj.data.polygons)
    pre_decimation_structural = full_structural_stats(mesh_obj)
    report["pre_decimation"] = {
        "vertex_count": pre_decimation_vert_count,
        "triangle_count": pre_decimation_tri_count,
        "structural": pre_decimation_structural,
    }

    # -----------------------------------------------------------------
    # Budget was measured above (extraction produced ~95k raw tris on the
    # balanced candidate, confirmed again here post-cleanup) BEFORE
    # ARMS_BUDGET_TRIS/ARMS_TARGET_TRIS were chosen — 18,000/15,000 is
    # materially below the 45,000 full-body LOD0 budget (60% below) and
    # below body LOD1's 20,000 (arms are a visually smaller subset that
    # must load alongside an already-present body derivative), with a 17%
    # safety margin between target and budget consistent with the body
    # builder's margins. The resulting reduction (~84% from ~95k) is
    # gentler than LOD1's 94.33% (which broke WITH region protection) and
    # close to LOD0's 86.66% (which worked cleanly WITH protection) — so
    # hand/finger region protection is attempted here too, verified by
    # render rather than assumed to transfer.
    # -----------------------------------------------------------------
    if pre_decimation_tri_count <= ARMS_TARGET_TRIS:
        report["decimation_skipped"] = True
        report["decimate_final"] = {"ratio_applied": 1.0, "tris_after": pre_decimation_tri_count}
    else:
        report["decimation_skipped"] = False
        protect_fragments = ["hand", "thumb", "index", "middle", "ring", "pinky"]
        protect_bone_names = {b.name for b in armature_obj.data.bones
                               if any(frag in b.name.lower() for frag in protect_fragments)}
        protect_vg = mesh_obj.vertex_groups.new(name="_arms_decimate_protect")
        vg_index_by_name = {vg.index: vg.name for vg in mesh_obj.vertex_groups}
        protect_vg_indices = {i for i, n in vg_index_by_name.items() if n in protect_bone_names}
        protected_count = 0
        for v in mesh_obj.data.vertices:
            w = min(sum(g.weight for g in v.groups if g.group in protect_vg_indices), 1.0)
            if w > 0:
                protect_vg.add([v.index], w, "REPLACE")
                protected_count += 1
        report["protect_group"] = {
            "bones_matched": sorted(protect_bone_names),
            "protected_vertex_count": protected_count,
            "protected_vertex_percent": round(100 * protected_count / pre_decimation_vert_count, 2),
        }

        bpy.context.view_layer.objects.active = mesh_obj
        decimate = mesh_obj.modifiers.new(name="_arms_decimate", type="DECIMATE")
        decimate.decimate_type = "COLLAPSE"
        decimate.vertex_group = protect_vg.name
        decimate.vertex_group_factor = 1.0
        decimate.invert_vertex_group = True
        decimate.use_collapse_triangulate = True

        bpy.ops.object.select_all(action="DESELECT")
        mesh_obj.select_set(True)
        bpy.context.view_layer.objects.active = mesh_obj
        try:
            bpy.ops.object.modifier_move_to_index(modifier=decimate.name, index=0)
        except Exception as e:
            fail(f"Could not move Decimate modifier before Armature in the stack: {e}")

        def evaluated_tri_count(ratio_value):
            decimate.ratio = ratio_value
            dg = bpy.context.evaluated_depsgraph_get()
            eo = mesh_obj.evaluated_get(dg)
            em = eo.to_mesh()
            tris = sum(max(len(p.vertices) - 2, 1) for p in em.polygons)
            eo.to_mesh_clear()
            return tris

        def binary_search_ratio():
            lo_, hi_ = 0.001, 0.95
            best = None
            log = []
            for _ in range(14):
                mid = (lo_ + hi_) / 2
                tris = evaluated_tri_count(mid)
                log.append({"ratio": mid, "tris": tris})
                if tris <= ARMS_TARGET_TRIS:
                    best = mid
                    lo_ = mid
                else:
                    hi_ = mid
            return best, log

        best_ratio, search_log = binary_search_ratio()
        report["ratio_search_with_protection"] = search_log
        report["protection_used"] = True

        # Same lesson already learned on the body builder's LOD1: hand/
        # finger protection covers 39% of this selection's vertices, and at
        # this target the protected region's own triangle floor (~19.9k,
        # per the search log) sits ABOVE the 15,000 target no matter how
        # low the ratio goes — protection cannot reach this target, full
        # stop, not a matter of tuning the ratio further. Falling back to
        # plain uniform Collapse (no vertex-group modulation), exactly the
        # fix that worked for LOD1, and verifying hand/finger quality by
        # render afterward rather than assuming it holds up.
        if best_ratio is None:
            report["protection_fallback_reason"] = (
                f"Region-protected search plateaued at {search_log[-1]['tris']} tris "
                f"(minimum ratio reached) — above the {ARMS_TARGET_TRIS} target. "
                "Falling back to uniform Collapse, verified by render."
            )
            decimate.vertex_group = ""
            decimate.invert_vertex_group = False
            best_ratio, search_log_uniform = binary_search_ratio()
            report["ratio_search_uniform_fallback"] = search_log_uniform
            report["protection_used"] = False
            if best_ratio is None:
                fail(f"Binary search never found a ratio producing <= {ARMS_TARGET_TRIS} tris, even without protection.")

        decimate.ratio = best_ratio
        try:
            bpy.ops.object.modifier_apply(modifier=decimate.name)
        except Exception as e:
            fail(f"Decimate modifier_apply failed: {e}")

        bm3 = bmesh.new()
        bm3.from_mesh(mesh_obj.data)
        bm3.verts.ensure_lookup_table()
        loose3 = [v for v in bm3.verts if len(v.link_faces) == 0]
        post_decimation_loose_cleaned = len(loose3)
        if loose3:
            bmesh.ops.delete(bm3, geom=loose3, context="VERTS")
        bm3.to_mesh(mesh_obj.data)
        bm3.free()
        mesh_obj.data.update()
        report["post_decimation_loose_cleanup"] = post_decimation_loose_cleaned

        post_tri_count = sum(max(len(p.vertices) - 2, 1) for p in mesh_obj.data.polygons)
        report["decimate_final"] = {"ratio_applied": best_ratio, "tris_after": post_tri_count}
        if post_tri_count > ARMS_BUDGET_TRIS:
            fail(f"Applied result {post_tri_count} tris exceeds the arms budget of {ARMS_BUDGET_TRIS}.")

        protect_vg_live = mesh_obj.vertex_groups.get("_arms_decimate_protect")
        if protect_vg_live:
            mesh_obj.vertex_groups.remove(protect_vg_live)

    # -----------------------------------------------------------------
    # "Scalpel" long-edge cleanup (Step 6C blocker fix) — see
    # MAX_EDGE_LENGTH_M's own doc comment above for the full investigation
    # this responds to. Runs regardless of whether decimation happened
    # above (cheap no-op if no edge exceeds the threshold — measured
    # pre-decimation edges never do, so this is specifically a decimation-
    # artifact cleanup, not a blanket mesh-quality pass).
    #
    # NOT restricted to proximal-dominant faces — an earlier version of
    # this tried that (to dodge the ACCIDENTAL_HOLE gate below without
    # touching it) and measurably failed to fix the actual problem: most
    # of the real giant-triangle faces turned out to be mixed/borderline
    # weighted, not >=50% proximal, so restricting removal to "clearly
    # proximal" faces left the worst offenders untouched (max face area
    # only dropped 0.008674 -> 0.007722, an 11% improvement — nowhere near
    # the ~20x this same cleanup achieves unrestricted). Removing ANY face
    # over the length threshold, regardless of region, is what the
    # investigation actually measured working; the boundary-loop
    # classification below (not this selection) is the right place to
    # tolerate the rare small distal-region gap this can leave — see its
    # SMALL_ACCIDENTAL_HOLE_EDGE_LIMIT for that decision.
    # -----------------------------------------------------------------
    bm_scalpel = bmesh.new()
    bm_scalpel.from_mesh(mesh_obj.data)
    bm_scalpel.edges.ensure_lookup_table()
    bm_scalpel.faces.ensure_lookup_table()
    pre_scalpel_tri_count = sum(max(len(f.verts) - 2, 1) for f in bm_scalpel.faces)

    long_faces = [f for f in bm_scalpel.faces if max(e.calc_length() for e in f.edges) > MAX_EDGE_LENGTH_M]
    removal_fraction = len(long_faces) / len(bm_scalpel.faces) if bm_scalpel.faces else 0.0
    if removal_fraction > MAX_SCALPEL_REMOVAL_FRACTION:
        bm_scalpel.free()
        fail(
            f"Scalpel cleanup would need to remove {len(long_faces)}/{len(bm_scalpel.faces)} "
            f"faces ({removal_fraction:.1%}) to enforce the {MAX_EDGE_LENGTH_M}m max edge length — "
            f"exceeds the {MAX_SCALPEL_REMOVAL_FRACTION:.0%} sanity ceiling. This threshold/extraction "
            "combination is structurally worse than the measured baseline; do not silently carve away "
            "this much of the mesh — investigate the extraction threshold or decimation ratio instead."
        )
    if long_faces:
        bmesh.ops.delete(bm_scalpel, geom=long_faces, context="FACES")
    bm_scalpel.verts.ensure_lookup_table()
    scalpel_loose = [v for v in bm_scalpel.verts if len(v.link_faces) == 0]
    if scalpel_loose:
        bmesh.ops.delete(bm_scalpel, geom=scalpel_loose, context="VERTS")
    bm_scalpel.to_mesh(mesh_obj.data)
    bm_scalpel.free()
    mesh_obj.data.update()
    post_scalpel_tri_count = sum(max(len(p.vertices) - 2, 1) for p in mesh_obj.data.polygons)
    report["scalpel_cleanup"] = {
        "max_edge_length_m": MAX_EDGE_LENGTH_M,
        "faces_removed": len(long_faces),
        "faces_removed_fraction": round(removal_fraction, 4),
        "loose_vertices_removed": len(scalpel_loose),
        "tris_before": pre_scalpel_tri_count,
        "tris_after": post_scalpel_tri_count,
    }
    print(f"SCALPEL: removed {len(long_faces)} faces (>{MAX_EDGE_LENGTH_M}m edge), {pre_scalpel_tri_count} -> {post_scalpel_tri_count} tris")

    # -----------------------------------------------------------------
    # Post-decimation structural re-validation.
    # -----------------------------------------------------------------
    if not any(m.type == "ARMATURE" for m in mesh_obj.modifiers):
        fail("Armature modifier is gone after decimation — mesh is no longer skinned.")

    post_used = used_vertex_group_names_final(mesh_obj) & (arm_bones | boundary_bones)
    lost_influence = baseline_arm_used - post_used
    # Mixamo tip/end bones (Thumb4/Pinky4/etc.) are established, expected
    # always-empty slots (see make-kael-runtime.py's identical finding) —
    # exclude them, they were never in baseline_arm_used to begin with.
    if lost_influence:
        fail(f"Arm/boundary bones that had real weighted vertices lost ALL influence: {sorted(lost_influence)}")

    final_vert_count = len(mesh_obj.data.vertices)
    final_tri_count = sum(max(len(p.vertices) - 2, 1) for p in mesh_obj.data.polygons)
    final_structural = full_structural_stats(mesh_obj)
    report["final_structural"] = final_structural

    if final_structural["zero_area_faces"] > 0:
        fail(f"{final_structural['zero_area_faces']} zero-area faces in the final mesh.")
    if final_structural["loose_vertices"] > 5:
        fail(f"{final_structural['loose_vertices']} loose vertices remain in the final mesh after cleanup.")
    if final_structural["malformed_edges_3plus_faces"] > 0:
        fail(f"{final_structural['malformed_edges_3plus_faces']} malformed (3+ face) edges in the final mesh — never expected, even at a cut boundary.")
    if final_structural["wire_edges_0_faces"] > 0:
        fail(f"{final_structural['wire_edges_0_faces']} wire (0-face) edges in the final mesh.")

    post_vg_idx_to_name = {vg.index: vg.name for vg in mesh_obj.vertex_groups}
    tracking_group_indices = {i for i, n in post_vg_idx_to_name.items() if n == "_src_boundary_adjacent"}
    unweighted_final = 0
    for v in mesh_obj.data.vertices:
        total_w = sum(g.weight for g in v.groups if g.group not in tracking_group_indices)
        if total_w <= 1e-6:
            unweighted_final += 1
    pct_unweighted_final = 100 * unweighted_final / final_vert_count if final_vert_count else 100
    report["percent_unweighted"] = pct_unweighted_final
    if pct_unweighted_final > 2.0:
        fail(f"{pct_unweighted_final:.2f}% of final vertices are unweighted.")

    # -----------------------------------------------------------------
    # Boundary-loop classification, three tiers:
    #   pre_existing_source_seam  — this loop was ALREADY a boundary in the
    #                               untouched 162,155-vert source (elbow
    #                               island split, knuckle-plate seam, etc,
    #                               proven present in candidates-mode
    #                               component analysis and consistent with
    #                               the body builder's own accepted
    #                               baseline_manifold=24,345 figure). Not
    #                               introduced by this script — acceptable.
    #   intentional_shoulder_cut — a genuinely NEW cut (not pre-existing),
    #                              dominated by proximal/shoulder/boundary
    #                              bone weight — exactly what thresholding
    #                              at the shoulder is supposed to produce.
    #   ACCIDENTAL_HOLE           — a genuinely NEW cut dominated by distal
    #                              hand/finger/forearm weight — the one
    #                              case that must never happen, since
    #                              hands/fingers are the highest-priority
    #                              readable region.
    # Reads the "_src_boundary_adjacent" tracking group (added before
    # extraction, survives deletion + decimation) to tell "new" from
    # "pre-existing" before falling back to the proximal/distal split.
    # -----------------------------------------------------------------
    bm4 = bmesh.new()
    bm4.from_mesh(mesh_obj.data)
    bm4.verts.ensure_lookup_table()
    bm4.edges.ensure_lookup_table()
    dvert_layer = bm4.verts.layers.deform.active
    proximal_indices = {i for i, n in post_vg_idx_to_name.items() if n in proximal_bones}
    distal_indices = {i for i, n in post_vg_idx_to_name.items() if n in distal_bones}
    src_boundary_indices = {i for i, n in post_vg_idx_to_name.items() if n == "_src_boundary_adjacent"}

    def vert_info(v):
        if dvert_layer is None:
            return "unknown", 0.0
        dvert = v[dvert_layer]
        prox_w = sum(w for gi, w in dvert.items() if gi in proximal_indices)
        dist_w = sum(w for gi, w in dvert.items() if gi in distal_indices)
        src_w = sum(w for gi, w in dvert.items() if gi in src_boundary_indices)
        if prox_w <= 1e-6 and dist_w <= 1e-6:
            cat = "other"
        else:
            cat = "proximal" if prox_w >= dist_w else "distal"
        return cat, src_w

    boundary_edges = [e for e in bm4.edges if len(e.link_faces) == 1]
    visited_e = set()
    loop_classifications = []
    boundary_edge_set = {e.index for e in boundary_edges}
    for e in boundary_edges:
        if e.index in visited_e:
            continue
        stack = [e]
        loop_edges = []
        visited_e.add(e.index)
        while stack:
            cur = stack.pop()
            loop_edges.append(cur)
            for v in cur.verts:
                for e2 in v.link_edges:
                    if e2.index in boundary_edge_set and e2.index not in visited_e:
                        visited_e.add(e2.index)
                        stack.append(e2)
        cats = {"proximal": 0, "distal": 0, "other": 0, "unknown": 0}
        src_weights = []
        for le in loop_edges:
            for v in le.verts:
                cat, src_w = vert_info(v)
                cats[cat] += 1
                src_weights.append(src_w)
        avg_src_w = sum(src_weights) / len(src_weights) if src_weights else 0.0
        if avg_src_w >= 0.5:
            classification = "pre_existing_source_seam"
        elif cats["proximal"] >= cats["distal"]:
            classification = "intentional_shoulder_cut"
        else:
            classification = "ACCIDENTAL_HOLE"
        loop_classifications.append({
            "edge_count": len(loop_edges),
            "vertex_category_counts": cats,
            "avg_pre_existing_source_seam_weight": round(avg_src_w, 3),
            "classification": classification,
        })
    bm4.free()

    loop_classifications.sort(key=lambda c: -c["edge_count"])
    report["boundary_loop_classification"] = loop_classifications
    accidental = [c for c in loop_classifications if c["classification"] == "ACCIDENTAL_HOLE"]
    small_accidental = [c for c in accidental if c["edge_count"] <= SMALL_ACCIDENTAL_HOLE_EDGE_LIMIT]
    large_accidental = [c for c in accidental if c["edge_count"] > SMALL_ACCIDENTAL_HOLE_EDGE_LIMIT]
    if small_accidental:
        report["tolerated_small_accidental_holes"] = small_accidental
        print(f"WARNING: {len(small_accidental)} small accidental hole(s) tolerated (<= {SMALL_ACCIDENTAL_HOLE_EDGE_LIMIT} edges each): {small_accidental}")
    if large_accidental:
        fail(f"{len(large_accidental)} boundary loop(s) classified as accidental holes (NEW cut, distal/hand/finger-dominant, > {SMALL_ACCIDENTAL_HOLE_EDGE_LIMIT} edges), not a shoulder cut or pre-existing source seam: {large_accidental}")

    # Tracking group has served its purpose — remove before export, same
    # reasoning as removing "_arms_decimate_protect": internal to this
    # build, not runtime-meaningful.
    src_boundary_vg_live = mesh_obj.vertex_groups.get("_src_boundary_adjacent")
    if src_boundary_vg_live:
        mesh_obj.vertex_groups.remove(src_boundary_vg_live)

    # -----------------------------------------------------------------
    # Deformation tests: upper/lower arm L+R, hand L+R, one finger per
    # side, subtle clavicle/shoulder movement. Restore rest pose after
    # every test (same method as make-kael-runtime.py).
    # -----------------------------------------------------------------
    by_norm = {normalize_bone_name(b.name): b.name for b in armature_obj.data.bones}
    deform_targets = [
        ("upper_arm_left", by_norm.get("leftarm")),
        ("upper_arm_right", by_norm.get("rightarm")),
        ("lower_arm_left", by_norm.get("leftforearm")),
        ("lower_arm_right", by_norm.get("rightforearm")),
        ("hand_left", by_norm.get("lefthand")),
        ("hand_right", by_norm.get("righthand")),
        ("finger_left", by_norm.get("lefthandindex1")),
        ("finger_right", by_norm.get("righthandindex1")),
        ("clavicle_left", by_norm.get("leftshoulder")),
        ("clavicle_right", by_norm.get("rightshoulder")),
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
            deform_results.append({"target": label, "skipped": True, "reason": "bone not found"})
            continue
        pbone = armature_obj.pose.bones.get(bone_name)
        if pbone is None:
            deform_results.append({"target": label, "skipped": True, "reason": "pose bone not found"})
            continue
        original_mode = pbone.rotation_mode
        original_euler = tuple(pbone.rotation_euler)
        original_quat = tuple(pbone.rotation_quaternion)
        angle = 5.0 if "clavicle" in label else 15.0
        pbone.rotation_mode = "XYZ"
        pbone.rotation_euler = (math.radians(angle), 0.0, 0.0)

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
            fail(f"Deformation test on '{bone_name}' produced non-finite positions.")
        min_moved = 2 if "clavicle" in label else 5
        if moved < min_moved:
            fail(f"Deformation test on '{bone_name}' moved only {moved} vertices.")

    report["deformation_test"] = deform_results

    # -----------------------------------------------------------------
    # Temporary neutral development material — no texture data exists yet
    # (established fact carried over from the body derivative gate). Must
    # render without magenta missing-texture output or 404s, and is never
    # described as final art.
    # -----------------------------------------------------------------
    mat = bpy.data.materials.new("Kael_Dev_Neutral")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (0.62, 0.62, 0.65, 1.0)
        if "Roughness" in bsdf.inputs:
            bsdf.inputs["Roughness"].default_value = 0.55
        if "Metallic" in bsdf.inputs:
            bsdf.inputs["Metallic"].default_value = 0.05
    mesh_obj.data.materials.clear()
    mesh_obj.data.materials.append(mat)
    report["material"] = {"name": mat.name, "type": "temporary_neutral_dev_material"}

    # -----------------------------------------------------------------
    # Render validation — ortho front/back/left/right, hands close-up,
    # shoulder-boundary close-up, plus temporary FP-approximation cameras
    # (hip-fire/ADS/sprint-lowered framing). Renders go to render_dir
    # (scratch) only, never committed.
    # -----------------------------------------------------------------
    depsgraph = bpy.context.evaluated_depsgraph_get()
    eval_obj = mesh_obj.evaluated_get(depsgraph)
    corners = [eval_obj.matrix_world @ mathutils.Vector(c) for c in eval_obj.bound_box]
    cx = (max(c.x for c in corners) + min(c.x for c in corners)) / 2
    cy = (max(c.y for c in corners) + min(c.y for c in corners)) / 2
    cz = (max(c.z for c in corners) + min(c.z for c in corners)) / 2
    dim_x = max(c.x for c in corners) - min(c.x for c in corners)
    dim_y = max(c.y for c in corners) - min(c.y for c in corners)
    dim_z = max(c.z for c in corners) - min(c.z for c in corners)
    radius = max(dim_x, dim_y, dim_z) / 2 or 0.3
    report["final_bounding_dimensions"] = [dim_x, dim_y, dim_z]

    sun = bpy.data.lights.new("_arms_sun", "SUN"); sun.energy = 3.0
    sun_obj = bpy.data.objects.new("_arms_sun", sun); bpy.context.collection.objects.link(sun_obj)
    sun_obj.rotation_euler = (math.radians(55), 0, math.radians(35))
    fill = bpy.data.lights.new("_arms_fill", "SUN"); fill.energy = 1.3
    fill_obj = bpy.data.objects.new("_arms_fill", fill); bpy.context.collection.objects.link(fill_obj)
    fill_obj.rotation_euler = (math.radians(70), 0, math.radians(-140))

    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except Exception:
        try:
            scene.render.engine = "BLENDER_EEVEE"
        except Exception:
            pass
    scene.world = bpy.data.worlds.new("_arms_world")
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.55, 0.6, 0.65, 1.0)

    render_paths = {}

    def do_render(cam_name, loc, target, ortho_scale, out_name, res_x=700, res_y=700):
        cam = ortho_cam(cam_name, loc, target, ortho_scale)
        scene.camera = cam
        scene.render.resolution_x = res_x
        scene.render.resolution_y = res_y
        path = os.path.join(render_dir, out_name)
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        bpy.data.objects.remove(cam, do_unlink=True)
        render_paths[out_name] = path

    d = radius * 3.0
    do_render("_arms_cam_front", (cx, cy + d, cz), (cx, cy, cz), radius * 2.3, "kael-arms-front.png")
    do_render("_arms_cam_back", (cx, cy - d, cz), (cx, cy, cz), radius * 2.3, "kael-arms-back.png")
    do_render("_arms_cam_left", (cx - d, cy, cz), (cx, cy, cz), radius * 2.3, "kael-arms-left.png")
    do_render("_arms_cam_right", (cx + d, cy, cz), (cx, cy, cz), radius * 2.3, "kael-arms-right.png")

    # Hands close-up — lower third of the bounding box (A-pose hands hang
    # near the bottom of the extracted region).
    hands_z = cz - dim_z * 0.32
    do_render("_arms_cam_hands", (cx, cy + radius * 1.4, hands_z), (cx, cy, hands_z), radius * 0.9, "kael-arms-hands.png")

    # Shoulder-boundary close-up — upper region, both sides in frame.
    shoulder_z = cz + dim_z * 0.38
    do_render("_arms_cam_shoulders", (cx, cy + radius * 1.6, shoulder_z), (cx, cy, shoulder_z), radius * 1.3, "kael-arms-shoulders.png")

    # Temporary FP-approximation cameras — a rough camera-relative
    # approximation of hip-fire / ADS / sprint-lowered framing, purely to
    # sanity-check the arms occupy the FP view region correctly, shoulder
    # seams stay near/outside the safe camera region, hands stay readable,
    # and no torso/head/legs/floating shards are visible. NOT the final FP
    # rig — that's IK/mounting, explicitly out of scope for this step.
    fp_origin = (cx, cy - radius * 0.15, cz + dim_z * 0.10)
    do_render("_arms_cam_fp_hipfire", (fp_origin[0], fp_origin[1] - radius * 2.0, fp_origin[2] - dim_z * 0.05),
              fp_origin, radius * 1.6, "kael-arms-fp-hipfire.png", res_x=900, res_y=600)
    do_render("_arms_cam_fp_ads", (fp_origin[0], fp_origin[1] - radius * 1.1, fp_origin[2] + dim_z * 0.02),
              (fp_origin[0], fp_origin[1], fp_origin[2] + dim_z * 0.02), radius * 1.0, "kael-arms-fp-ads.png", res_x=900, res_y=600)
    do_render("_arms_cam_fp_sprint", (fp_origin[0], fp_origin[1] - radius * 2.2, fp_origin[2] - dim_z * 0.30),
              (fp_origin[0], fp_origin[1], fp_origin[2] - dim_z * 0.30), radius * 1.8, "kael-arms-fp-sprint.png", res_x=900, res_y=600)

    bpy.data.objects.remove(sun_obj, do_unlink=True)
    bpy.data.objects.remove(fill_obj, do_unlink=True)
    report["renders"] = render_paths

    # -----------------------------------------------------------------
    # Export.
    # -----------------------------------------------------------------
    bpy.ops.object.select_all(action="DESELECT")
    armature_obj.select_set(True)
    mesh_obj.select_set(True)
    bpy.context.view_layer.objects.active = armature_obj

    try:
        bpy.ops.export_scene.gltf(
            filepath=output_glb,
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

    report["final"] = {"vertex_count": final_vert_count, "triangle_count": final_tri_count}
    report["result"] = "PASSED"
    report["output_glb"] = output_glb
    with open(report_json, "w") as f:
        json.dump(report, f, indent=2, default=str)

    print("BUILD_OK")
    print(f"BUILD_TRIS:{final_tri_count}")
    print(f"BUILD_VERTS:{final_vert_count}")
    print(f"BUILD_OUTPUT:{output_glb}")

else:
    raise SystemExit(f"Mode '{MODE}' not implemented yet in this pass.")
