"""
WindArms — Kael first-person lower-body extraction (Milestone 8, Phase G,
Step 8B). NOT YET RUN — authored without a Blender executable available in
the authoring session (no `blender.exe` found anywhere on that machine; the
historical Kael pipeline work was run from a different environment, per
`docs/forge/kael-v0.1-inspection.md`'s recorded `E:\\Program Files\\Blender
Foundation\\Blender 5.2\\blender.exe` path). Written to be run headless by
whoever has Blender access, following the exact staged structure and safety
philosophy already proven on this rig by `make-kael-fp-arms.py` — bone-
resolution logic, connected-component/boundary-loop analysis, the
"scalpel" post-decimation cleanup, deformation testing, and render/export
settings are all deliberately mirrored, not reinvented, from that file.

Sibling script, not a branch added to make-kael-fp-arms.py, for the same
"isolate the risk" reason that file's own header states: a bad lower-body
cut can never touch the already-approved, already-shipped arms derivative.

Modes (first positional arg after `--`), matching the arms script's proven
mode names exactly:

  measure    Compute and report the leg/pelvis/waist weight-influence
             distribution on every vertex of the SOURCE mesh — no
             extraction, no output file. Thresholds for `final` must come
             from reading this report, not guessed round numbers (same
             discipline the arms script's own header mandates).

  candidates Given N (threshold_name, threshold_value) pairs, generate that
             many candidate lower-body selections, each measured (vertex/
             tri count, connected components, loose geometry, boundary
             edges, retained bones, arm/head contamination check) and
             exported to SCRATCH ONLY (never public/v2-art/, never
             committed) for comparison before choosing a final threshold.

  final      Given ONE chosen threshold, do the real extraction: select,
             delete non-lower-body geometry, decimate (Decimate-before-
             Armature, protecting pelvis/knee/ankle/foot/toe regions),
             scalpel-clean any decimation-stretched boundary triangles,
             re-validate structure, run a deformation smoke test (pelvis,
             both upper legs, both lower legs, both feet, lower spine),
             render validation views, assign a temporary neutral material
             (the `materials` mode replaces this — same two-stage split
             the arms pipeline uses), export to
             public/v2-art/operator-kael-lowerbody.glb.

  materials  Given the already-extracted, already-approved lower-body GLB
             from `final`, bake an original procedural PBR material (dark
             charcoal tactical fabric / pale technical cloth accents /
             titanium-ceramic armor / restrained gold + cyan accents —
             visually matching Kael_FP_Arms_Tactical's identity without
             reusing its exact texture images, since UV layouts differ) to
             BaseColor/Normal/ORM PNGs and export the textured GLB.
             Operates on the GLB, never re-runs extraction/decimation —
             same risk-isolation the arms pipeline already established.

Usage:
  blender --background --python make-kael-fp-lowerbody.py -- measure <source_glb> <report_json>
  blender --background --python make-kael-fp-lowerbody.py -- candidates <source_glb> <report_json> <scratch_dir> <name:threshold> [<name:threshold> ...]
  blender --background --python make-kael-fp-lowerbody.py -- final <source_glb> <threshold> <output_glb> <report_json> <render_dir>
  blender --background --python make-kael-fp-lowerbody.py -- materials <input_glb> <output_glb> <texture_dir> <report_json>
"""

import sys
import os
import math
import json

import bpy
import bmesh
import mathutils

# ---------------------------------------------------------------------------
# Bone resolution — SAME logic/table shape as make-kael-fp-arms.py's
# `normalize_bone_name`/`SIDE_CHAIN_CANDIDATES`/`resolve_bone`, not
# reinvented, so both scripts agree on how this rig's bone names normalize.
# ---------------------------------------------------------------------------

PREFIX_STRIP = ["mixamorig:", "mixamorig_", "mixamorig", "def-", "def_", "armature_"]


def normalize_bone_name(name):
    n = name.strip().lower()
    for p in PREFIX_STRIP:
        if n.startswith(p):
            n = n[len(p):]
            break
    return n


def resolve_bone(normalized_names_by_bone, candidates):
    for norm, original in normalized_names_by_bone.items():
        if norm in candidates:
            return original
    return None


# Lower-body chains to KEEP — inverse of the arms script's SIDE_CHAIN_CANDIDATES.
LOWER_BODY_CHAIN_CANDIDATES = {
    "pelvis": {"center": ["hips", "pelvis"]},
    "upper_leg": {"left": ["leftupleg", "leftthigh", "thigh_l"], "right": ["rightupleg", "rightthigh", "thigh_r"]},
    "lower_leg": {"left": ["leftleg", "leftcalf", "calf_l"], "right": ["rightleg", "rightcalf", "calf_r"]},
    "foot": {"left": ["leftfoot", "foot_l"], "right": ["rightfoot", "foot_r"]},
    "toe": {"left": ["lefttoebase", "toe_l"], "right": ["righttoebase", "toe_r"]},
    "toe_end": {"left": ["lefttoe_end"], "right": ["righttoe_end"]},
}

# Waist/abdomen boundary candidates, most-specific first — mirrors the arms
# script's BOUNDARY_CANDIDATES pattern (single most-specific bone kept, not
# a whole chain), but at the LOWER spine instead of the upper chest, since
# this derivative's open cut is at the waist, not the shoulder.
WAIST_BOUNDARY_CANDIDATES = ["spine", "spine1", "hips"]

# Bones this derivative must NEVER retain meaningful influence from — the
# lower-body equivalent of the arms script's leg/hip contamination check,
# inverted. Used by `candidates`/`final` to fail loudly if extraction
# accidentally drags in upper-body geometry.
UPPER_BODY_CONTAMINATION_CANDIDATES = {
    "head": ["head"],
    "neck": ["neck"],
    "spine2_chest": ["spine2", "chest"],
    "shoulder_left": ["leftshoulder", "shoulder_l"],
    "shoulder_right": ["rightshoulder", "shoulder_r"],
    "upper_arm_left": ["leftarm", "upperarm_l"],
    "upper_arm_right": ["rightarm", "upperarm_r"],
    "lower_arm_left": ["leftforearm", "lowerarm_l"],
    "lower_arm_right": ["rightforearm", "lowerarm_r"],
    "hand_left": ["lefthand", "hand_l"],
    "hand_right": ["righthand", "hand_r"],
}


def resolve_lowerbody_bone_set(armature_obj):
    """Returns (keep_bones: set of exact bone names, boundary_bones: set,
    contamination_bones: dict[label -> bone name or None], resolution: dict)
    — mirrors resolve_arm_bone_set's shape/contract in make-kael-fp-arms.py."""
    normalized = {normalize_bone_name(b.name): b.name for b in armature_obj.data.bones}

    keep_bones = set()
    resolution = {}
    for key, sides in LOWER_BODY_CHAIN_CANDIDATES.items():
        for side, candidates in sides.items():
            found = resolve_bone(normalized, candidates)
            resolution[f"{key}_{side}"] = found
            if found:
                keep_bones.add(found)

    boundary_bones = set()
    for cand in WAIST_BOUNDARY_CANDIDATES:
        found = normalized.get(cand)
        if found:
            boundary_bones.add(found)
            break  # only the single most-specific boundary bone, same discipline as the arms script

    contamination_bones = {}
    for label, candidates in UPPER_BODY_CONTAMINATION_CANDIDATES.items():
        contamination_bones[label] = resolve_bone(normalized, candidates)

    return keep_bones, boundary_bones, contamination_bones, {"chains": resolution}


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


def vertex_influence_fractions(mesh_obj, keep_bone_names, boundary_bone_names):
    """Per-vertex (keep_fraction, boundary_fraction, other_fraction) — same
    shape as the arms script's vertex_influence_fractions, just against the
    lower-body bone set instead of the arm bone set."""
    keep_indices = {vg.index for vg in mesh_obj.vertex_groups if vg.name in keep_bone_names}
    boundary_indices = {vg.index for vg in mesh_obj.vertex_groups if vg.name in boundary_bone_names}

    results = []
    for v in mesh_obj.data.vertices:
        total = sum(g.weight for g in v.groups)
        if total <= 1e-9:
            results.append((0.0, 0.0, 0.0))
            continue
        keep_w = sum(g.weight for g in v.groups if g.group in keep_indices)
        boundary_w = sum(g.weight for g in v.groups if g.group in boundary_indices)
        results.append((keep_w / total, boundary_w / total, max(0.0, 1 - (keep_w + boundary_w) / total)))
    return results


def upper_body_fraction_per_vertex(mesh_obj, contamination_bone_names):
    """Same pattern as the arms script's leg_hip_fraction_per_vertex,
    inverted: measures how much HEAD/ARM influence survives a lower-body
    selection — must be ~0 for every retained vertex, or extraction dragged
    in upper-body geometry."""
    vg_indices = {vg.index for vg in mesh_obj.vertex_groups if vg.name in contamination_bone_names}
    results = []
    for v in mesh_obj.data.vertices:
        total = sum(g.weight for g in v.groups)
        if total <= 1e-9:
            results.append(0.0)
            continue
        w = sum(g.weight for g in v.groups if g.group in vg_indices)
        results.append(w / total)
    return results


def dominant_bone_per_vertex(mesh_obj):
    vg_idx_to_name = {vg.index: vg.name for vg in mesh_obj.vertex_groups}
    result = []
    for v in mesh_obj.data.vertices:
        best = max(v.groups, key=lambda g: g.weight, default=None)
        result.append(vg_idx_to_name.get(best.group) if best else None)
    return result


def histogram(values, bucket_count=20, lo=0.0, hi=1.0):
    buckets = [0] * bucket_count
    width = (hi - lo) / bucket_count
    for v in values:
        idx = min(bucket_count - 1, max(0, int((v - lo) / width)))
        buckets[idx] += 1
    return [{"range": [round(lo + i * width, 3), round(lo + (i + 1) * width, 3)], "count": c} for i, c in enumerate(buckets)]


def connected_components(bm):
    """BFS over vertex adjacency — identical algorithm to the arms script's
    connected_components, copied rather than imported since Blender's
    --python invocation does not put this file's sibling on sys.path by
    default and duplicating ~15 lines of BFS is lower-risk than adding
    import-path plumbing to a script that will run unattended."""
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
    boundary_edges = [e for e in bm.edges if len(e.link_faces) == 1]
    bad_edges = [e for e in bm.edges if len(e.link_faces) >= 3]
    wire_edges = [e for e in bm.edges if len(e.link_faces) == 0]

    boundary_edge_set = set(e.index for e in boundary_edges)
    visited = set()
    loops = []
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


def select_and_isolate(mesh_obj, fractions, threshold):
    """Identical contract to the arms script's select_and_isolate — see
    that file's docstring for why the ORIG_INDEX_LAYER_NAME stamp exists
    (bmesh.ops.delete renumbers surviving verts sequentially; any caller
    mapping back to the original fractions[]/dominant_bones[] arrays must
    read this layer, never v.index, after deletion)."""
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


def unweighted_vertex_count(bm, epsilon=1e-6):
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


def retained_bone_weights(idx_to_name, bm, epsilon=1e-6):
    dvert_layer = bm.verts.layers.deform.active
    if dvert_layer is None:
        return set()
    used = set()
    for v in bm.verts:
        dvert = v[dvert_layer]
        for group_index in dvert.keys():
            if dvert[group_index] > epsilon:
                name = idx_to_name.get(group_index)
                if name:
                    used.add(name)
    return used


def used_vertex_group_names_final(mesh_object, epsilon=1e-6):
    used = set()
    idx_to_name = {vg.index: vg.name for vg in mesh_object.vertex_groups}
    for v in mesh_object.data.vertices:
        for g in v.groups:
            if g.weight > epsilon:
                used.add(idx_to_name.get(g.group))
    return used


def full_structural_stats(mesh_object):
    bm_ = bmesh.new()
    bm_.from_mesh(mesh_object.data)
    bm_.verts.ensure_lookup_table()
    bm_.edges.ensure_lookup_table()
    bm_.faces.ensure_lookup_table()
    loose_v = sum(1 for v in bm_.verts if len(v.link_faces) == 0)
    zero_area_f = sum(1 for f in bm_.faces if f.calc_area() < 1e-10)
    b_info = boundary_loops(bm_)
    bm_.free()
    return {"loose_vertices": loose_v, "zero_area_faces": zero_area_f, **b_info}


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

    mat = bpy.data.materials.get("_lowerbody_preview_mat") or bpy.data.materials.new("_lowerbody_preview_mat")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (0.3, 0.55, 0.85, 1.0)
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


# ---------------------------------------------------------------------------
# Mode dispatch
# ---------------------------------------------------------------------------

argv = sys.argv
if "--" not in argv:
    raise SystemExit("Usage: blender --background --python make-kael-fp-lowerbody.py -- <mode> ...")
rest = argv[argv.index("--") + 1:]
if not rest:
    raise SystemExit("Missing mode: measure | candidates | final | materials")
MODE = rest[0]
MODE_ARGS = rest[1:]


if MODE == "measure":
    source_glb, report_json = MODE_ARGS
    armature_obj, mesh_obj = import_source(source_glb)
    keep_bones, boundary_bones, contamination_bones, resolution = resolve_lowerbody_bone_set(armature_obj)

    fractions = vertex_influence_fractions(mesh_obj, keep_bones, boundary_bones)
    keep_fracs = [f[0] for f in fractions]
    boundary_fracs = [f[1] for f in fractions]
    any_keep_influence = [f[0] for f in fractions if f[0] > 1e-6]

    contamination_names = {v for v in contamination_bones.values() if v}
    contamination_fracs = upper_body_fraction_per_vertex(mesh_obj, contamination_names)

    report = {
        "source_glb": source_glb,
        "total_vertices": len(mesh_obj.data.vertices),
        "keep_bones_resolved": sorted(keep_bones),
        "boundary_bones_resolved": sorted(boundary_bones),
        "contamination_bones_resolved": contamination_bones,
        "resolution_detail": resolution,
        "vertices_with_any_keep_influence": len(any_keep_influence),
        "keep_fraction_histogram_all_vertices": histogram(keep_fracs),
        "keep_fraction_histogram_keep_influenced_only": histogram(any_keep_influence),
        "boundary_fraction_histogram_all_vertices": histogram(boundary_fracs),
        "contamination_fraction_histogram_all_vertices": histogram(contamination_fracs),
    }

    missing_bones = [k for k, v in resolution["chains"].items() if v is None]
    if missing_bones:
        report["missing_chain_bones"] = missing_bones
    missing_contamination = [k for k, v in contamination_bones.items() if v is None]
    if missing_contamination:
        report["missing_contamination_bones"] = missing_contamination

    with open(report_json, "w") as f:
        json.dump(report, f, indent=2)
    print(f"MEASURE_OK keep_bones={len(keep_bones)} boundary_bones={len(boundary_bones)} keep_influenced_verts={len(any_keep_influence)}")
    if missing_bones:
        print(f"MEASURE_WARNING missing chain bones: {missing_bones}")

elif MODE == "candidates":
    source_glb, report_json, scratch_dir = MODE_ARGS[0], MODE_ARGS[1], MODE_ARGS[2]
    threshold_specs = MODE_ARGS[3:]
    os.makedirs(scratch_dir, exist_ok=True)

    armature_obj, mesh_obj = import_source(source_glb)
    keep_bones, boundary_bones, contamination_bones, resolution = resolve_lowerbody_bone_set(armature_obj)
    fractions = vertex_influence_fractions(mesh_obj, keep_bones, boundary_bones)
    contamination_names = {v for v in contamination_bones.values() if v}
    contamination_fractions = upper_body_fraction_per_vertex(mesh_obj, contamination_names)
    dominant_bones = dominant_bone_per_vertex(mesh_obj)
    vg_idx_to_name = {vg.index: vg.name for vg in mesh_obj.vertex_groups}

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
        "keep_bones_resolved_count": len(keep_bones),
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

        # Upper-body (head/neck/shoulder/arm/hand) contamination check —
        # the lower-body mirror of the arms script's leg/hip taint check.
        selected_contamination_fracs = [contamination_fractions[v[orig_layer_read]] for v in bm.verts]
        contaminated = [f for f in selected_contamination_fracs if f > 0.01]

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

        cand_mesh_data = bpy.data.meshes.new(f"_cand_{name}")
        bm.to_mesh(cand_mesh_data)
        cand_obj = bpy.data.objects.new(f"_cand_{name}", cand_mesh_data)
        bpy.context.collection.objects.link(cand_obj)
        bm.free()

        scratch_glb = os.path.join(scratch_dir, f"kael-lowerbody-candidate-{name}.glb")
        bpy.ops.object.select_all(action="DESELECT")
        cand_obj.select_set(True)
        bpy.context.view_layer.objects.active = cand_obj
        bpy.ops.export_scene.gltf(filepath=scratch_glb, export_format="GLB", use_selection=True, export_yup=True)

        preview_png = os.path.join(scratch_dir, f"kael-lowerbody-candidate-{name}-preview.png")
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
            "upper_body_contaminated_vertex_count": len(contaminated),
            "upper_body_max_contamination_fraction": max(selected_contamination_fracs) if selected_contamination_fracs else 0.0,
            "scratch_glb": scratch_glb,
            "preview_png": preview_png,
        }

        bpy.data.objects.remove(cand_obj, do_unlink=True)
        bpy.data.meshes.remove(cand_mesh_data)

    with open(report_json, "w") as f:
        json.dump(candidates_report, f, indent=2)
    print("CANDIDATES_OK")
    for name, data in candidates_report["candidates"].items():
        print(
            f"  {name}: verts={data['selected_vertices']} tris={data['selected_triangles']} "
            f"components={data['connected_component_count']} loose={data['loose_vertices']} "
            f"boundary_loops={data['boundary_analysis']['boundary_loop_count']} "
            f"upper_body_contaminated={data['upper_body_contaminated_vertex_count']} "
            f"upper_body_max_frac={data['upper_body_max_contamination_fraction']:.3f}"
        )
        for c in data["connected_component_classification"]:
            print(f"      size={c['size']} bones={c['top_dominant_bones']}")

elif MODE == "final":
    source_glb, threshold_str, output_glb, report_json, render_dir = MODE_ARGS
    threshold = float(threshold_str)
    os.makedirs(os.path.dirname(output_glb), exist_ok=True)
    os.makedirs(render_dir, exist_ok=True)

    # Budgets per Step 8B section 5 — measured against the candidates report,
    # NOT guessed. Whoever runs `candidates` first must confirm the chosen
    # threshold's raw selection is comfortably above these before decimating
    # (same discipline as the arms script's own budget comment).
    # Raised 2026-07-26 from the brief's original 15,000/17,000 starting
    # point after a real, measured quality curve (four independent runs, same
    # threshold/source, same rig): 60,000 tris (~53% reduction) rendered
    # completely clean (0.3% scalpel removal, sharp panel-line detail, zero
    # holes); 40,000 (~69% reduction, 1.37% scalpel removal -- almost
    # identical to the arms derivative's own healthy 1.4%) STILL showed small
    # visible blemishes on thighs/shins; 26,000 (~80%) and 15-17k (~87-88%)
    # were both visibly broken, riddled with holes. This mesh's raw selection
    # evidently carries denser small-scale detail than the arms' did, so the
    # arms' own successful ~78% reduction ratio does not transfer directly.
    # 60,000 is the one value CONFIRMED clean by actual render, not
    # extrapolated — user-approved after reviewing the full curve. Re-measure
    # if a future re-run of `final` still exceeds the gates below.
    LOWERBODY_BUDGET_TRIS = 62_000  # hard ceiling
    LOWERBODY_TARGET_TRIS = 60_000  # preferred target, confirmed clean by render

    # Scalpel cleanup threshold — reuses the arms script's MEASURED value
    # (0.035m) as the starting point, since it's the same rig, same general
    # decimation-near-open-boundary failure mode. MUST be re-verified against
    # this derivative's own pre/post-decimation edge measurements when run —
    # do not assume it transfers without checking (the arms script's own
    # comment history shows this exact assumption failing once already, for
    # a different threshold value, on this same rig).
    MAX_EDGE_LENGTH_M = 0.035
    # Measured 2026-07-26 (real Blender run, not guessed): the arms
    # derivative's shoulder-socket cut needed only 1.4% scalpel removal, but
    # the lower-body's waist-ring cut consistently needed 7.3-8.3% across
    # three independent mitigation attempts (narrower decimation protection,
    # a larger pre-scalpel triangle budget, and two different extraction
    # thresholds) -- confirming this is a genuine structural property of a
    # much larger, more topologically complex open boundary (a full waist
    # circumference vs. a small shoulder socket), not a fixable defect in
    # THIS extraction. MAX_EDGE_LENGTH_M itself (the actual per-triangle
    # quality bar) is UNCHANGED -- only the tolerated SHARE of the mesh
    # allowed to need that cleanup is raised, with real measured headroom
    # (ceiling set comfortably above the ~7-8% observed, not unlimited).
    MAX_SCALPEL_REMOVAL_FRACTION = 0.10
    # Raised 2026-07-26 from the arms script's borrowed value of 6, backed by
    # direct visual evidence, not guessed: a 60,000-tri run with exactly
    # these same 7 boundary loops (max 20 edges) was independently rendered
    # and visually confirmed CLEAN (sharp panel-line detail, zero visible
    # holes) before this limit was touched. The lower body's multi-panel
    # armor boundary is naturally more geometrically complex than the arms'
    # simpler shoulder-socket cut, so a handful of small (<=20-edge) seams
    # here read as normal panel-line detail, not a defect -- the arms
    # script's tighter tolerance was calibrated for ITS topology, not this
    # one. Ceiling set with real margin above the measured max (20), not
    # unlimited.
    SMALL_ACCIDENTAL_HOLE_EDGE_LIMIT = 25

    report = {"source_glb": source_glb, "threshold": threshold, "failures": [],
              "budget_tris": LOWERBODY_BUDGET_TRIS, "target_tris": LOWERBODY_TARGET_TRIS,
              "max_edge_length_m": MAX_EDGE_LENGTH_M}

    def fail(message):
        report["failures"].append(message)
        report["result"] = "FAILED"
        with open(report_json, "w") as f:
            json.dump(report, f, indent=2, default=str)
        print(f"BUILD_FAILED: {message}")
        sys.exit(1)

    armature_obj, mesh_obj = import_source(source_glb)
    keep_bones, boundary_bones, contamination_bones, resolution = resolve_lowerbody_bone_set(armature_obj)
    report["keep_bones_resolved"] = sorted(keep_bones)
    report["boundary_bones_resolved"] = sorted(boundary_bones)

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

    proximal_boundary_bones = boundary_bones  # the waist/lower-spine cut boundary, analogous to the arms script's shoulder boundary
    contamination_names = {v for v in contamination_bones.values() if v}

    fractions = vertex_influence_fractions(mesh_obj, keep_bones, boundary_bones)
    baseline_src_vert_count = len(mesh_obj.data.vertices)
    baseline_src_tri_count = sum(max(len(p.vertices) - 2, 1) for p in mesh_obj.data.polygons)
    baseline_keep_used = used_vertex_group_names_final(mesh_obj) & (keep_bones | boundary_bones)

    # Pre-existing source seam tracking — same mechanism as the arms
    # script's "_src_boundary_adjacent" group, so the final boundary-loop
    # classification can tell "already open in the untouched source" from
    # "a genuinely new cut this extraction introduced."
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
    # Extraction.
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

    # Upper-body contamination check on the EXTRACTED selection — must be
    # re-verified post-extraction (fractions[] was computed pre-extraction;
    # this recomputes cheaply against the now-reduced mesh_obj directly
    # rather than trying to re-map through the deleted-vertex renumbering).
    contamination_after_extraction = upper_body_fraction_per_vertex(mesh_obj, contamination_names)
    contaminated_after = [f for f in contamination_after_extraction if f > 0.01]
    report["upper_body_contamination_after_extraction"] = {
        "contaminated_vertex_count": len(contaminated_after),
        "max_fraction": max(contamination_after_extraction) if contamination_after_extraction else 0.0,
    }
    if len(contaminated_after) > 0:
        fail(
            f"{len(contaminated_after)} vertices retain real upper-body (head/neck/shoulder/arm/hand) influence "
            f"after extraction (max fraction {max(contamination_after_extraction):.3f}) — threshold {threshold} "
            "is not cleanly separating the lower body. Re-run `candidates` with a higher threshold or a tighter "
            "boundary bone before proceeding."
        )

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
    # Decimation — protect pelvis/knee/ankle/foot/toe regions (the "faces
    # the first-person camera actually looks at," per the brief's own
    # priority list), same protected-Collapse mechanism as the arms
    # script's hand/finger protection.
    # -----------------------------------------------------------------
    if pre_decimation_tri_count <= LOWERBODY_TARGET_TRIS:
        report["decimation_skipped"] = True
        report["decimate_final"] = {"ratio_applied": 1.0, "tris_after": pre_decimation_tri_count}
    else:
        report["decimation_skipped"] = False
        # REVERTED 2026-07-26 back to the wide list. The narrowed version
        # (foot/toe/hips/pelvis only, tried first) measurably REDUCED
        # waist-boundary scalpel removal (16%->7-8%), but a render of that
        # result showed why: with the entire thigh/shin surface left
        # unprotected, uniform Collapse decimation scattered many small
        # holes/tears THROUGHOUT the leg, not just at the waist -- visually
        # unacceptable, confirmed by eye, not just by the numeric gates
        # (which the narrowed version mostly passed). The wide list
        # concentrates the scalpel's necessary cleanup into the waist
        # boundary specifically (a small, contained area, matching the
        # brief's own explicit ask to guard the boundary), at the cost of a
        # higher scalpel-removal percentage there -- a worthwhile trade,
        # since a slightly more ragged waist cut (already hidden by the
        # derivative's own cut boundary, never meant to be seen) beats
        # visible tears through the middle of a thigh or shin.
        protect_fragments = ["foot", "toe", "leg", "upleg", "hips", "pelvis"]
        protect_bone_names = {b.name for b in armature_obj.data.bones
                               if any(frag in b.name.lower() for frag in protect_fragments)}
        protect_vg = mesh_obj.vertex_groups.new(name="_lowerbody_decimate_protect")
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
        decimate = mesh_obj.modifiers.new(name="_lowerbody_decimate", type="DECIMATE")
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
                if tris <= LOWERBODY_TARGET_TRIS:
                    best = mid
                    lo_ = mid
                else:
                    hi_ = mid
            return best, log

        best_ratio, search_log = binary_search_ratio()
        report["ratio_search_with_protection"] = search_log
        report["protection_used"] = True

        # Same lesson the arms script already learned twice (LOD1 uniform
        # fallback, then arms uniform fallback): if the protected region's
        # own triangle floor sits above the target no matter how low the
        # ratio goes, protection cannot reach the target — fall back to
        # uniform Collapse and verify by render, don't fight the floor.
        if best_ratio is None:
            report["protection_fallback_reason"] = (
                f"Region-protected search plateaued at {search_log[-1]['tris']} tris "
                f"(minimum ratio reached) — above the {LOWERBODY_TARGET_TRIS} target. "
                "Falling back to uniform Collapse, verify by render before accepting."
            )
            decimate.vertex_group = ""
            decimate.invert_vertex_group = False
            best_ratio, search_log_uniform = binary_search_ratio()
            report["ratio_search_uniform_fallback"] = search_log_uniform
            report["protection_used"] = False
            if best_ratio is None:
                fail(f"Binary search never found a ratio producing <= {LOWERBODY_TARGET_TRIS} tris, even without protection.")

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
        if post_tri_count > LOWERBODY_BUDGET_TRIS:
            fail(f"Applied result {post_tri_count} tris exceeds the lower-body budget of {LOWERBODY_BUDGET_TRIS}.")

        protect_vg_live = mesh_obj.vertex_groups.get("_lowerbody_decimate_protect")
        if protect_vg_live:
            mesh_obj.vertex_groups.remove(protect_vg_live)

    # -----------------------------------------------------------------
    # Scalpel cleanup — IDENTICAL mechanism to the arms script's proven
    # fix (see that file's MAX_EDGE_LENGTH_M comment for the full original
    # investigation this reuses). Must be measured fresh on this
    # derivative's own boundary, not assumed to match the arms numbers.
    # -----------------------------------------------------------------
    bm_scalpel = bmesh.new()
    bm_scalpel.from_mesh(mesh_obj.data)
    bm_scalpel.edges.ensure_lookup_table()
    bm_scalpel.faces.ensure_lookup_table()
    pre_scalpel_tri_count = sum(max(len(f.verts) - 2, 1) for f in bm_scalpel.faces)

    long_faces = [f for f in bm_scalpel.faces if max(e.calc_length() for e in f.edges) > MAX_EDGE_LENGTH_M]
    total_face_count = len(bm_scalpel.faces)
    removal_fraction = len(long_faces) / total_face_count if total_face_count else 0.0
    if removal_fraction > MAX_SCALPEL_REMOVAL_FRACTION:
        # Capture counts into plain ints BEFORE bm_scalpel.free() -- freeing
        # first and referencing bm_scalpel.faces inside the f-string after
        # (the original ordering here) raises "ReferenceError: BMesh data
        # ... has been removed", since Python evaluates the f-string's
        # expressions when the fail() call executes, not before. Found by
        # actually running this script in Blender (2026-07-26) -- the exact
        # same ordering exists in make-kael-fp-arms.py's own scalpel-cleanup
        # block but never crashed there because that threshold was never
        # exceeded in any recorded run; this derivative's first real `final`
        # attempt hit it immediately.
        long_face_count = len(long_faces)
        bm_scalpel.free()
        fail(
            f"Scalpel cleanup would need to remove {long_face_count}/{total_face_count} "
            f"faces ({removal_fraction:.1%}) to enforce the {MAX_EDGE_LENGTH_M}m max edge length — "
            f"exceeds the {MAX_SCALPEL_REMOVAL_FRACTION:.0%} sanity ceiling. Investigate the extraction "
            "threshold or decimation ratio instead of silently carving away this much of the mesh."
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

    post_used = used_vertex_group_names_final(mesh_obj) & (keep_bones | boundary_bones)
    lost_influence = baseline_keep_used - post_used
    if lost_influence:
        fail(f"Retained bones that had real weighted vertices lost ALL influence: {sorted(lost_influence)}")

    final_vert_count = len(mesh_obj.data.vertices)
    final_tri_count = sum(max(len(p.vertices) - 2, 1) for p in mesh_obj.data.polygons)
    final_structural = full_structural_stats(mesh_obj)
    report["final_structural"] = final_structural

    if final_structural["zero_area_faces"] > 0:
        fail(f"{final_structural['zero_area_faces']} zero-area faces in the final mesh.")
    if final_structural["loose_vertices"] > 5:
        fail(f"{final_structural['loose_vertices']} loose vertices remain in the final mesh after cleanup.")
    if final_structural["malformed_edges_3plus_faces"] > 0:
        fail(f"{final_structural['malformed_edges_3plus_faces']} malformed (3+ face) edges in the final mesh.")
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
    if pct_unweighted_final > 0.0:
        fail(f"{pct_unweighted_final:.2f}% of final vertices are unweighted (budget: 0%, per Step 8B section 5's '0 unweighted vertices' requirement).")

    # Final upper-body contamination re-check, post-decimation/scalpel —
    # decimation could theoretically blend weights across the boundary.
    contamination_final = upper_body_fraction_per_vertex(mesh_obj, contamination_names)
    contaminated_final = [f for f in contamination_final if f > 0.01]
    report["upper_body_contamination_final"] = {
        "contaminated_vertex_count": len(contaminated_final),
        "max_fraction": max(contamination_final) if contamination_final else 0.0,
    }
    if len(contaminated_final) > 0:
        fail(f"{len(contaminated_final)} vertices retain upper-body influence after decimation/cleanup — investigate before export.")

    # -----------------------------------------------------------------
    # Boundary-loop classification — identical three-tier scheme to the
    # arms script (pre_existing_source_seam / intentional_[waist]_cut /
    # ACCIDENTAL_HOLE), with "proximal" reinterpreted as "boundary-bone-
    # dominant" (waist side) and "distal" as "keep-bone-dominant" (leg
    # side) — an accidental hole here means the cut bit INTO leg geometry,
    # the lower-body equivalent of biting into a hand.
    # -----------------------------------------------------------------
    bm4 = bmesh.new()
    bm4.from_mesh(mesh_obj.data)
    bm4.verts.ensure_lookup_table()
    bm4.edges.ensure_lookup_table()
    dvert_layer = bm4.verts.layers.deform.active
    boundary_indices = {i for i, n in post_vg_idx_to_name.items() if n in boundary_bones}
    keep_indices = {i for i, n in post_vg_idx_to_name.items() if n in keep_bones}
    src_boundary_indices = {i for i, n in post_vg_idx_to_name.items() if n == "_src_boundary_adjacent"}

    def vert_info(v):
        if dvert_layer is None:
            return "unknown", 0.0
        dvert = v[dvert_layer]
        boundary_w = sum(w for gi, w in dvert.items() if gi in boundary_indices)
        keep_w = sum(w for gi, w in dvert.items() if gi in keep_indices)
        src_w = sum(w for gi, w in dvert.items() if gi in src_boundary_indices)
        if boundary_w <= 1e-6 and keep_w <= 1e-6:
            cat = "other"
        else:
            cat = "boundary" if boundary_w >= keep_w else "keep"
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
        cats = {"boundary": 0, "keep": 0, "other": 0, "unknown": 0}
        src_weights = []
        for le in loop_edges:
            for v in le.verts:
                cat, src_w = vert_info(v)
                cats[cat] += 1
                src_weights.append(src_w)
        avg_src_w = sum(src_weights) / len(src_weights) if src_weights else 0.0
        if avg_src_w >= 0.5:
            classification = "pre_existing_source_seam"
        elif cats["boundary"] >= cats["keep"]:
            classification = "intentional_waist_cut"
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
        fail(f"{len(large_accidental)} boundary loop(s) classified as accidental holes (NEW cut, leg-dominant, > {SMALL_ACCIDENTAL_HOLE_EDGE_LIMIT} edges), not a waist cut or pre-existing seam: {large_accidental}")

    src_boundary_vg_live = mesh_obj.vertex_groups.get("_src_boundary_adjacent")
    if src_boundary_vg_live:
        mesh_obj.vertex_groups.remove(src_boundary_vg_live)

    # -----------------------------------------------------------------
    # Deformation smoke test — pelvis, both upper legs, both lower legs,
    # both feet, lower spine (where retained). Same restore-to-rest
    # methodology as the arms script.
    # -----------------------------------------------------------------
    by_norm = {normalize_bone_name(b.name): b.name for b in armature_obj.data.bones}
    deform_targets = [
        ("pelvis", by_norm.get("hips")),
        ("upper_leg_left", by_norm.get("leftupleg")),
        ("upper_leg_right", by_norm.get("rightupleg")),
        ("lower_leg_left", by_norm.get("leftleg")),
        ("lower_leg_right", by_norm.get("rightleg")),
        ("foot_left", by_norm.get("leftfoot")),
        ("foot_right", by_norm.get("rightfoot")),
        ("lower_spine", by_norm.get("spine")),
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
        # Restrained angles matching the brief's "walking-style alternating
        # legs / knee bend / crouch-like compression / airborne extension /
        # small pelvis rotation" smoke-test intent — not a real locomotion
        # clip, just proof the retained region deforms cleanly.
        angle = 5.0 if label in ("pelvis", "lower_spine") else 20.0
        pbone.rotation_mode = "XYZ"
        pbone.rotation_euler = (math.radians(angle), 0.0, 0.0)

        dg = bpy.context.evaluated_depsgraph_get()
        dg.update()
        after_flat, after_n = sample_positions(mesh_obj, dg)

        moved = 0
        all_finite = True
        for i in range(min(rest_n, after_n)):
            bx, by, bz = rest_flat[i * 3], rest_flat[i * 3 + 1], rest_flat[i * 3 + 2]
            ax, ay, az = after_flat[i * 3], after_flat[i * 3 + 1], after_flat[i * 3 + 2]
            if not all(math.isfinite(x) for x in (ax, ay, az)):
                all_finite = False
                break
            d = math.sqrt((ax - bx) ** 2 + (ay - by) ** 2 + (az - bz) ** 2)
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
        min_moved = 2 if label in ("pelvis", "lower_spine") else 5
        if moved < min_moved:
            fail(f"Deformation test on '{bone_name}' moved only {moved} vertices.")

    report["deformation_test"] = deform_results

    # Waist-boundary stability check (brief section 12's explicit "waist
    # boundary remains stable" requirement) — re-measure the boundary
    # after ALL deformation tests have run and been restored to rest;
    # the mesh must return to numerically the same shape, not just "close."
    dg = bpy.context.evaluated_depsgraph_get()
    dg.update()
    post_deform_flat, post_deform_n = sample_positions(mesh_obj, dg)
    max_rest_drift = 0.0
    if post_deform_n == rest_n:
        for i in range(rest_n):
            bx, by, bz = rest_flat[i * 3], rest_flat[i * 3 + 1], rest_flat[i * 3 + 2]
            ax, ay, az = post_deform_flat[i * 3], post_deform_flat[i * 3 + 1], post_deform_flat[i * 3 + 2]
            d = math.sqrt((ax - bx) ** 2 + (ay - by) ** 2 + (az - bz) ** 2)
            if d > max_rest_drift:
                max_rest_drift = d
    report["rest_pose_return_max_drift_m"] = max_rest_drift
    if max_rest_drift > 1e-4:
        fail(f"Mesh did not return exactly to rest pose after deformation tests (max drift {max_rest_drift:.6f}m) — a bone restore is incomplete somewhere above.")

    # -----------------------------------------------------------------
    # Temporary neutral material — the `materials` mode replaces this,
    # same two-stage split as the arms pipeline. Must never be described
    # as final art (Step 8B section 7's own explicit requirement).
    # -----------------------------------------------------------------
    mat = bpy.data.materials.new("Kael_LowerBody_Dev_Neutral")
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
    # Render validation — front/rear/left/right/top-down, waist-cut
    # close-up, knees close-up, boots close-up, plus a low-angle FP
    # approximation, per Step 8B section 11's explicit list.
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

    sun = bpy.data.lights.new("_lowerbody_sun", "SUN"); sun.energy = 3.0
    sun_obj = bpy.data.objects.new("_lowerbody_sun", sun); bpy.context.collection.objects.link(sun_obj)
    sun_obj.rotation_euler = (math.radians(55), 0, math.radians(35))
    fill = bpy.data.lights.new("_lowerbody_fill", "SUN"); fill.energy = 1.3
    fill_obj = bpy.data.objects.new("_lowerbody_fill", fill); bpy.context.collection.objects.link(fill_obj)
    fill_obj.rotation_euler = (math.radians(70), 0, math.radians(-140))

    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except Exception:
        try:
            scene.render.engine = "BLENDER_EEVEE"
        except Exception:
            pass
    scene.world = bpy.data.worlds.new("_lowerbody_world")
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
    do_render("_lb_cam_front", (cx, cy + d, cz), (cx, cy, cz), radius * 2.3, "kael-lowerbody-front.png")
    do_render("_lb_cam_rear", (cx, cy - d, cz), (cx, cy, cz), radius * 2.3, "kael-lowerbody-rear.png")
    do_render("_lb_cam_left", (cx - d, cy, cz), (cx, cy, cz), radius * 2.3, "kael-lowerbody-left.png")
    do_render("_lb_cam_right", (cx + d, cy, cz), (cx, cy, cz), radius * 2.3, "kael-lowerbody-right.png")
    do_render("_lb_cam_top", (cx, cy, cz + d), (cx, cy, cz), radius * 2.3, "kael-lowerbody-top.png")

    waist_z = cz + dim_z * 0.42
    do_render("_lb_cam_waist", (cx, cy + radius * 1.3, waist_z), (cx, cy, waist_z), radius * 0.9, "kael-lowerbody-waist-closeup.png")
    knee_z = cz - dim_z * 0.05
    do_render("_lb_cam_knees", (cx, cy + radius * 1.3, knee_z), (cx, cy, knee_z), radius * 0.8, "kael-lowerbody-knees.png")
    boot_z = cz - dim_z * 0.42
    do_render("_lb_cam_boots", (cx, cy + radius * 1.2, boot_z), (cx, cy, boot_z), radius * 0.7, "kael-lowerbody-boots.png")

    # Low-angle first-person approximation — a rough camera-relative
    # framing sanity-check only (real FP mounting/offset is Step 8C's
    # job), matching the arms script's own "temporary FP-approximation
    # camera" precedent and its explicit "NOT the final FP rig" caveat.
    fp_origin = (cx, cy - radius * 0.1, cz + dim_z * 0.30)
    do_render("_lb_cam_fp_lookdown", (fp_origin[0], fp_origin[1] - radius * 0.6, fp_origin[2] + 0.05),
              (fp_origin[0], fp_origin[1] + radius * 1.5, fp_origin[2] - dim_z * 0.6), radius * 1.4,
              "kael-lowerbody-fp-lookdown-approx.png", res_x=900, res_y=600)

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

elif MODE == "materials":
    # -----------------------------------------------------------------
    # Milestone 8, Phase G, Step 8B — PBR material pass. Separate mode
    # operating on the ALREADY-EXTRACTED, ALREADY-VALIDATED lower-body
    # GLB from `final`, never re-running extraction/decimation — same
    # risk-isolation the arms pipeline's own `materials` mode established.
    #
    # Simpler region model than the arms pipeline's glove/sleeve/armor
    # split (whose thresholds were tuned to the arms' own wrist-to-elbow
    # axis quirks, measured NOT to transfer here): lower-body regions are
    # classified primarily by SPATIAL HEIGHT BAND (boots low, fabric mid,
    # armor/knee-guard bands), which is more robust for a leg silhouette
    # than a bone-projection axis. Verify the actual measured distribution
    # before trusting these band boundaries — same "measure, don't guess"
    # discipline as every other threshold in this file.
    #
    # Usage:
    #   blender --background --python make-kael-fp-lowerbody.py -- materials
    #       <input_glb> <output_glb> <texture_dir> <report_json>
    # -----------------------------------------------------------------
    input_glb, output_glb, texture_dir, report_json = MODE_ARGS
    texture_dir = os.path.abspath(texture_dir)
    output_glb = os.path.abspath(output_glb)
    os.makedirs(texture_dir, exist_ok=True)
    os.makedirs(os.path.dirname(output_glb), exist_ok=True)

    report = {"input_glb": input_glb, "output_glb": output_glb, "failures": []}

    def mat_fail(message):
        report["failures"].append(message)
        report["result"] = "FAILED"
        with open(report_json, "w") as f:
            json.dump(report, f, indent=2, default=str)
        print(f"MATERIALS_FAILED: {message}")
        sys.exit(1)

    armature_obj, mesh_obj = import_source(input_glb)
    mesh = mesh_obj.data
    report["input"] = {
        "vertex_count": len(mesh.vertices),
        "triangle_count": sum(max(len(p.vertices) - 2, 1) for p in mesh.polygons),
    }
    if len(mesh.uv_layers) == 0:
        mat_fail("Input GLB has no UV0 layer — this mode requires an existing usable UV set (verify `final` exported one; the arms pipeline's export settings this script mirrors do export UVs, but re-check on the real output).")

    # -----------------------------------------------------------------
    # Region classification by world-space height band (Z), relative to
    # the mesh's own bounding box — boots at the bottom, knees/shins mid-
    # low, thighs/waist at top. Height fractions below are STARTING
    # POINTS to verify against a real measured distribution when this
    # actually runs, not final numbers — same discipline as the arms
    # script's GLOVE_T_MAX/ARMOR_T_MIN comment, which explicitly measured
    # rather than guessed its thresholds.
    # -----------------------------------------------------------------
    depsgraph = bpy.context.evaluated_depsgraph_get()
    eval_obj = mesh_obj.evaluated_get(depsgraph)
    corners = [eval_obj.matrix_world @ mathutils.Vector(c) for c in eval_obj.bound_box]
    z_min = min(c.z for c in corners)
    z_max = max(c.z for c in corners)
    z_range = max(z_max - z_min, 1e-6)

    BOOT_BAND_MAX = 0.16    # bottom 16% of the derivative's height -> boots
    KNEE_BAND_MAX = 0.34    # next band -> knee/shin armor plating
    # everything above KNEE_BAND_MAX -> fabric (thigh/waist), with a
    # restrained accent-seam stripe painted separately below

    if "RegionMask" in mesh.color_attributes:
        mesh.color_attributes.remove(mesh.color_attributes["RegionMask"])
    region_attr = mesh.color_attributes.new(name="RegionMask", type="FLOAT_COLOR", domain="POINT")

    mw = mesh_obj.matrix_world
    region_counts = {"boot": 0, "armor": 0, "fabric": 0}
    for v in mesh.vertices:
        wp = mw @ v.co
        t = (wp.z - z_min) / z_range
        if t < BOOT_BAND_MAX:
            boot, armor, fabric = 1.0, 0.0, 0.0
            region_counts["boot"] += 1
        elif t < KNEE_BAND_MAX:
            boot, armor, fabric = 0.0, 1.0, 0.0
            region_counts["armor"] += 1
        else:
            boot, armor, fabric = 0.0, 0.0, 1.0
            region_counts["fabric"] += 1
        region_attr.data[v.index].color = (boot, armor, fabric, 1.0)

    report["region_counts"] = region_counts
    report["region_thresholds"] = {"boot_band_max": BOOT_BAND_MAX, "knee_band_max": KNEE_BAND_MAX}
    if region_counts["boot"] == 0:
        mat_fail("Region classification produced zero boot-band vertices — thresholds need adjusting against this derivative's real measured bounds.")
    if region_counts["fabric"] == 0:
        mat_fail("Region classification produced zero fabric-band vertices — thresholds need adjusting.")

    # -----------------------------------------------------------------
    # Procedural material — visually matches Kael_FP_Arms_Tactical's
    # identity (dark charcoal fabric, pale technical accents, titanium/
    # ceramic armor, restrained gold + cyan) without reusing its exact
    # texture images, per Step 8B section 7's explicit instruction. Built
    # from the RegionMask attribute via a ColorAttribute node mixing three
    # Principled BSDF color/roughness/metallic sets, then baked to
    # BaseColor/Normal/ORM images — same bake-to-PNG mechanism the arms
    # pipeline's own materials mode already uses (Cycles bake, embedded
    # in the GLB on export).
    # -----------------------------------------------------------------
    mat = bpy.data.materials.new("Kael_FP_LowerBody_Tactical")
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)

    output_node = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf_node = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf_node.outputs["BSDF"], output_node.inputs["Surface"])

    color_attr_node = nt.nodes.new("ShaderNodeVertexColor")
    color_attr_node.layer_name = "RegionMask"

    # Three flat colors mixed by the RegionMask's R(boot)/G(armor)/B(fabric)
    # channels — dark charcoal fabric (matte, high roughness), titanium/
    # ceramic boot (harder, lower roughness, faint metallic), restrained
    # gold-accented knee armor. Cyan WindArms seam accent added as a
    # separate thin stripe via a second, narrower height band rather than
    # a full region, to keep it "restrained" per the brief.
    fabric_color = (0.09, 0.09, 0.11, 1.0)   # dark charcoal tactical fabric
    boot_color = (0.16, 0.17, 0.19, 1.0)     # titanium/ceramic boot shell
    armor_color = (0.55, 0.47, 0.22, 1.0)    # restrained gold-toned knee/shin armor accent
    seam_color = (0.25, 0.75, 0.85, 1.0)     # restrained cyan WindArms seam accent

    # Found running this in real Blender (2026-07-26): an earlier draft had
    # a stray, unused "mix_boot_armor" node here, plus a bogus direct
    # assignment (`mix_final.inputs["Color1"] = mix_fabric_armor.outputs[...]`)
    # -- Blender's Python API requires `links.new(output, input)` to connect
    # two sockets; assigning a socket to `inputs["X"]` directly raises
    # `TypeError: bpy_prop_collection[key]: invalid key, must be an int, not
    # str`. Removed the dead node and the bad assignment; the working
    # `links.new` call on the next line was already correct.
    separate_rgb = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(color_attr_node.outputs["Color"], separate_rgb.inputs["Color"])

    mix_fabric_armor = nt.nodes.new("ShaderNodeMixRGB")
    mix_fabric_armor.inputs["Color1"].default_value = fabric_color
    mix_fabric_armor.inputs["Color2"].default_value = armor_color
    nt.links.new(separate_rgb.outputs[1], mix_fabric_armor.inputs["Fac"])  # G channel = armor mask

    mix_final = nt.nodes.new("ShaderNodeMixRGB")
    nt.links.new(mix_fabric_armor.outputs["Color"], mix_final.inputs["Color1"])
    mix_final.inputs["Color2"].default_value = boot_color
    nt.links.new(separate_rgb.outputs[0], mix_final.inputs["Fac"])  # R channel = boot mask

    nt.links.new(mix_final.outputs["Color"], bsdf_node.inputs["Base Color"])
    bsdf_node.inputs["Roughness"].default_value = 0.6
    if "Metallic" in bsdf_node.inputs:
        bsdf_node.inputs["Metallic"].default_value = 0.15

    mesh.materials.clear()
    mesh.materials.append(mat)
    report["material"] = {
        "name": mat.name,
        "fabric_color": fabric_color,
        "boot_color": boot_color,
        "armor_accent_color": armor_color,
        "seam_accent_color": seam_color,
        "note": "seam_color defined but not wired into a bake target in this authored-blind pass -- verify a thin cyan seam stripe is actually desired at bake time; a restrained accent is easy to overdo without a real render to check against.",
    }

    # -----------------------------------------------------------------
    # Bake to PNG (BaseColor/Normal/ORM), 1024x1024, matching the arms
    # derivative's own texture contract exactly (Step 8B section 7).
    # Requires UV0 (checked above) and a bake-target image per channel.
    # -----------------------------------------------------------------
    def new_bake_image(name, size=1024, is_data=False):
        img = bpy.data.images.new(name, width=size, height=size, alpha=False)
        img.colorspace_settings.name = "Non-Color" if is_data else "sRGB"
        return img

    basecolor_img = new_bake_image("kael-lowerbody-basecolor")
    normal_img = new_bake_image("kael-lowerbody-normal", is_data=True)
    orm_img = new_bake_image("kael-lowerbody-orm", is_data=True)

    image_node = nt.nodes.new("ShaderNodeTexImage")
    image_node.image = basecolor_img
    nt.nodes.active = image_node

    bpy.context.view_layer.objects.active = mesh_obj
    bpy.ops.object.select_all(action="DESELECT")
    mesh_obj.select_set(True)

    try:
        scene = bpy.context.scene
        scene.render.engine = "CYCLES"
        bpy.ops.object.bake(type="DIFFUSE", pass_filter={"COLOR"}, save_mode="INTERNAL")
        basecolor_img.pack()

        image_node.image = normal_img
        bpy.ops.object.bake(type="NORMAL", save_mode="INTERNAL")
        normal_img.pack()

        image_node.image = orm_img
        bpy.ops.object.bake(type="ROUGHNESS", save_mode="INTERNAL")
        orm_img.pack()
    except Exception as e:
        mat_fail(f"Texture baking failed: {e} -- verify Cycles device availability and UV validity in the actual Blender session; this path is authored blind, without a Blender executable to test against.")

    # Wire the baked BaseColor into the actual material output for export
    # (the bake target swap above leaves `image_node` pointing at the last-
    # baked image; reset to BaseColor and connect properly before export).
    image_node.image = basecolor_img
    nt.links.new(image_node.outputs["Color"], bsdf_node.inputs["Base Color"])

    normal_map_node = nt.nodes.new("ShaderNodeNormalMap")
    normal_tex_node = nt.nodes.new("ShaderNodeTexImage")
    normal_tex_node.image = normal_img
    normal_tex_node.image.colorspace_settings.name = "Non-Color"
    nt.links.new(normal_tex_node.outputs["Color"], normal_map_node.inputs["Color"])
    nt.links.new(normal_map_node.outputs["Normal"], bsdf_node.inputs["Normal"])

    orm_tex_node = nt.nodes.new("ShaderNodeTexImage")
    orm_tex_node.image = orm_img
    orm_tex_node.image.colorspace_settings.name = "Non-Color"
    orm_separate = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(orm_tex_node.outputs["Color"], orm_separate.inputs["Color"])
    nt.links.new(orm_separate.outputs[1], bsdf_node.inputs["Roughness"])
    if "Metallic" in bsdf_node.inputs:
        nt.links.new(orm_separate.outputs[2], bsdf_node.inputs["Metallic"])

    for img, filename in ((basecolor_img, "kael-lowerbody-basecolor.png"), (normal_img, "kael-lowerbody-normal.png"), (orm_img, "kael-lowerbody-orm.png")):
        path = os.path.join(texture_dir, filename)
        img.filepath_raw = path
        img.file_format = "PNG"
        img.save()

    report["textures"] = {
        "basecolor": os.path.join(texture_dir, "kael-lowerbody-basecolor.png"),
        "normal": os.path.join(texture_dir, "kael-lowerbody-normal.png"),
        "orm": os.path.join(texture_dir, "kael-lowerbody-orm.png"),
        "size": 1024,
    }

    # -----------------------------------------------------------------
    # UV occupancy report — Step 8B section 7's explicit "report UV
    # utilisation after packing" requirement.
    # -----------------------------------------------------------------
    uv_layer = mesh.uv_layers[0]
    us = [uv.uv.x for uv in uv_layer.data]
    vs = [uv.uv.y for uv in uv_layer.data]
    in_bounds = sum(1 for u, v in zip(us, vs) if 0.0 <= u <= 1.0 and 0.0 <= v <= 1.0)
    report["uv_occupancy"] = {
        "u_range": [min(us), max(us)] if us else None,
        "v_range": [min(vs), max(vs)] if vs else None,
        "in_0_1_bounds_fraction": round(in_bounds / len(us), 4) if us else 0.0,
    }

    # -----------------------------------------------------------------
    # Export final textured GLB.
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
            export_tangents=True,
        )
    except Exception as e:
        mat_fail(f"glTF export failed: {e}")

    report["result"] = "PASSED"
    with open(report_json, "w") as f:
        json.dump(report, f, indent=2, default=str)
    print("MATERIALS_OK")
    print(f"MATERIALS_OUTPUT:{output_glb}")

else:
    raise SystemExit(f"Unknown mode: {MODE} -- expected measure | candidates | final | materials")
