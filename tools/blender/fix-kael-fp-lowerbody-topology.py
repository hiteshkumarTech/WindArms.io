"""
WindArms — Kael FP lower-body targeted topology cleanup (Milestone 8,
Step 8B.1). Post-process ONLY on the already-extracted, already-approved
public/v2-art/operator-kael-lowerbody.glb — never re-runs extraction,
decimation, bone resolution, or the materials bake from
make-kael-fp-lowerbody.py. This script's entire job is: find the isolated
patches of anomalously dense/irregular triangulation the round-2 wireframe
render surfaced on the thighs/shins, and fix ONLY those patches with the
smallest safe local operation (dissolve + retriangulate), leaving the waist
boundary, skeleton, extraction region, materials, and everything else
byte-for-byte the same as the currently-approved mesh.

Detection method (deterministic, not eyeballed):
  First attempt was a local-vs-regional face-area density ratio. That
  over-triggered badly (398 clusters, 1/3 of the whole mesh, including the
  boot and hip/pelvis regions) because those regions are DELIBERATELY
  denser than mid-leg fabric — make-kael-fp-lowerbody.py's own decimation
  protects foot/toe/leg/upleg/hips/pelvis fragments from aggressive
  reduction. Density alone can't tell "deliberately denser by design" from
  "actually messy," and the user had already approved the boot/waist
  renders as clean — density-based flagging would have "fixed" things
  that were never broken.

  Real signal: triangle SHAPE quality, not density. For every candidate
  face, Q = (4*sqrt(3)*area) / (e1^2+e2^2+e3^2) — 1.0 for an equilateral
  triangle, near 0 for a degenerate sliver. A contiguous blob of low-Q
  faces embedded in otherwise well-shaped surrounding triangles is what
  actually reads as "denser/disordered" under shading — not merely small,
  but irregularly shaped. Candidates are restricted up front to the
  thigh/shin height band only (16%-70% of total derivative height), which
  structurally excludes the boot and hip/pelvis protected regions from
  ever being touched, matching the brief's explicit "boots unchanged,
  waist boundary unchanged" constraint. Faces are grouped into connected
  clusters (BFS over face adjacency) and small clusters (a handful of
  faces near a legitimate panel-line groove) are dropped as noise, not
  treated as defects.

Repair method:
  Per flagged cluster: bmesh.ops.dissolve_limit with a small angle limit,
  scoped ONLY to that cluster's vertices/edges and with
  use_dissolve_boundaries=False so the cluster's outer boundary (its seam
  with untouched, good mesh) is never touched — then
  bmesh.ops.triangulate + bmesh.ops.beautify_fill to turn the simplified
  region back into clean, evenly-shaped triangles. No vertices are added;
  some redundant interior vertices are removed. Surviving vertices keep
  their original skin weights and UVs untouched — this is exactly why
  dissolve+retriangulate (not a fresh remesh) was chosen.

Modes (first positional arg after `--`):
  detect   Read-only. Finds and reports flagged clusters, renders a debug
           view with flagged faces highlighted red on a throwaway
           duplicate mesh (never touches the real object/material), for
           visual confirmation against the round-2 wireframe render before
           any repair is attempted.
  repair   Re-runs the same detection, applies the fix to each flagged
           cluster on the REAL mesh, re-validates (deformation smoke test,
           rest-pose drift), re-exports to the same output path, and
           renders the required before/after validation views.

Usage:
  blender --background --python fix-kael-fp-lowerbody-topology.py -- detect <input_glb> <render_dir> <report_json>
  blender --background --python fix-kael-fp-lowerbody-topology.py -- repair <input_glb> <output_glb> <render_dir> <report_json>
"""

import sys
import os
import math
import json
from collections import defaultdict, deque

import bpy
import bmesh
import mathutils


def fail(msg):
    print(f"FAIL: {msg}")
    sys.exit(1)


def log(msg):
    print(msg)


QUALITY_THRESHOLD = 0.55   # triangle shape quality (1.0=equilateral, ->0=sliver) below this is a candidate
DISSOLVE_ANGLE_DEG = float(os.environ.get("FIX_DISSOLVE_ANGLE_DEG", "4.0"))
MIN_CLUSTER_FACES = 8      # drop tiny clusters as legitimate detail/noise, not defects
THIGH_SHIN_MIN_FRAC = 0.16  # top of boot band — never consider boot geometry
THIGH_SHIN_MAX_FRAC = 0.70  # below hip/pelvis protected-region density — never consider hip/waist geometry


def triangle_quality(face):
    verts = face.verts
    if len(verts) != 3:
        return 1.0  # non-triangle (shouldn't occur in this all-triangle mesh); don't flag
    a = (verts[0].co - verts[1].co).length
    b = (verts[1].co - verts[2].co).length
    c = (verts[2].co - verts[0].co).length
    denom = a * a + b * b + c * c
    if denom <= 0:
        return 0.0
    area = face.calc_area()
    return (4.0 * math.sqrt(3.0) * area) / denom


def find_objects():
    mesh_obj = None
    best_verts = -1
    armature_obj = None
    for obj in bpy.data.objects:
        if obj.type == "MESH" and len(obj.data.vertices) > best_verts:
            best_verts = len(obj.data.vertices)
            mesh_obj = obj
        if obj.type == "ARMATURE":
            armature_obj = obj
    if mesh_obj is None:
        fail("no mesh object found in imported GLB")
    if armature_obj is None:
        fail("no armature object found in imported GLB")
    log(f"resolved mesh_obj={mesh_obj.name!r} ({best_verts} verts), armature_obj={armature_obj.name!r}")
    return mesh_obj, armature_obj


def detect_anomalous_clusters(bm, matrix_world, mesh_min_z, mesh_max_z):
    bm.faces.ensure_lookup_table()
    bm.verts.ensure_lookup_table()

    n_faces = len(bm.faces)
    centroids = [None] * n_faces
    dim_z = mesh_max_z - mesh_min_z

    candidate_flagged = set()
    for f in bm.faces:
        c = matrix_world @ f.calc_center_median()
        centroids[f.index] = c
        height_frac = (c.z - mesh_min_z) / dim_z if dim_z > 0 else 0.0
        if height_frac < THIGH_SHIN_MIN_FRAC or height_frac > THIGH_SHIN_MAX_FRAC:
            continue  # never touch boot or hip/pelvis regions
        q = triangle_quality(f)
        if q < QUALITY_THRESHOLD:
            candidate_flagged.add(f.index)

    # Group flagged faces into connected clusters via BFS over face adjacency.
    face_by_index = {f.index: f for f in bm.faces}
    visited = set()
    clusters = []
    for start in candidate_flagged:
        if start in visited:
            continue
        cluster = []
        q = deque([start])
        visited.add(start)
        while q:
            fi = q.popleft()
            cluster.append(fi)
            f = face_by_index[fi]
            for e in f.edges:
                for lf in e.link_faces:
                    if lf.index in candidate_flagged and lf.index not in visited:
                        visited.add(lf.index)
                        q.append(lf.index)
        clusters.append(cluster)

    clusters = [c for c in clusters if len(c) >= MIN_CLUSTER_FACES]
    areas = [f.calc_area() for f in bm.faces]
    return clusters, centroids, areas


def label_cluster(cluster_face_indices, centroids, mesh_min_z, mesh_max_z, mesh_center_x):
    xs = [centroids[i].x for i in cluster_face_indices]
    zs = [centroids[i].z for i in cluster_face_indices]
    mean_x = sum(xs) / len(xs)
    mean_z = sum(zs) / len(zs)
    dim_z = mesh_max_z - mesh_min_z
    height_frac = (mean_z - mesh_min_z) / dim_z if dim_z > 0 else 0.0
    side = "left" if mean_x < mesh_center_x else "right"
    if height_frac < 0.16:
        region = "boot"
    elif height_frac < 0.34:
        region = "shin/knee"
    elif height_frac < 0.70:
        region = "thigh"
    else:
        region = "hip/waist"
    return f"{side} {region}", height_frac, mean_x, mean_z


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


def setup_render_scene():
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except Exception:
        try:
            scene.render.engine = "BLENDER_EEVEE"
        except Exception:
            pass
    scene.world = bpy.data.worlds.new("_fix_world")
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.55, 0.6, 0.65, 1.0)
    sun = bpy.data.lights.new("_fix_sun", "SUN"); sun.energy = 6.5
    sun_obj = bpy.data.objects.new("_fix_sun", sun); bpy.context.collection.objects.link(sun_obj)
    sun_obj.rotation_euler = (math.radians(55), 0, math.radians(35))
    fill = bpy.data.lights.new("_fix_fill", "SUN"); fill.energy = 3.0
    fill_obj = bpy.data.objects.new("_fix_fill", fill); bpy.context.collection.objects.link(fill_obj)
    fill_obj.rotation_euler = (math.radians(70), 0, math.radians(-140))
    try:
        scene.view_settings.view_transform = "Standard"
    except Exception:
        pass
    scene.view_settings.exposure = 0.6
    return scene


def do_render(scene, cam_name, loc, target, ortho_scale, out_path, res_x=900, res_y=600):
    cam = ortho_cam(cam_name, loc, target, ortho_scale)
    scene.camera = cam
    scene.render.resolution_x = res_x
    scene.render.resolution_y = res_y
    scene.render.filepath = out_path
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam, do_unlink=True)
    log(f"rendered -> {out_path}")


def get_world_bounds(obj):
    dg = bpy.context.evaluated_depsgraph_get()
    eo = obj.evaluated_get(dg)
    em = eo.to_mesh()
    pts = [obj.matrix_world @ v.co for v in em.vertices]
    eo.to_mesh_clear()
    min_x = min(p.x for p in pts); max_x = max(p.x for p in pts)
    min_y = min(p.y for p in pts); max_y = max(p.y for p in pts)
    min_z = min(p.z for p in pts); max_z = max(p.z for p in pts)
    return min_x, max_x, min_y, max_y, min_z, max_z


argv = sys.argv
if "--" not in argv:
    fail("no `--` separator found; run via `blender --background --python fix-kael-fp-lowerbody-topology.py -- <mode> ...`")
rest = argv[argv.index("--") + 1:]
if not rest:
    fail("no mode given")
mode = rest[0]

if mode == "detect":
    input_glb, render_dir, report_path = rest[1], rest[2], rest[3]
    os.makedirs(render_dir, exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=input_glb)
    mesh_obj, armature_obj = find_objects()

    min_x, max_x, min_y, max_y, min_z, max_z = get_world_bounds(mesh_obj)
    center_x = (min_x + max_x) / 2
    cx = center_x
    cy = (min_y + max_y) / 2
    cz = (min_z + max_z) / 2
    dim_z = max_z - min_z
    radius = max(max_x - min_x, max_y - min_y, dim_z) / 2

    bm = bmesh.new()
    bm.from_mesh(mesh_obj.data)
    clusters, centroids, areas = detect_anomalous_clusters(bm, mesh_obj.matrix_world, min_z, max_z)

    total_flagged = sum(len(c) for c in clusters)
    log(f"found {len(clusters)} clusters, {total_flagged} flagged faces total (of {len(bm.faces)})")

    report = {"clusters": []}
    for cluster in clusters:
        label, height_frac, mean_x, mean_z = label_cluster(cluster, centroids, min_z, max_z, center_x)
        report["clusters"].append({
            "label": label,
            "face_count": len(cluster),
            "height_fraction": height_frac,
            "mean_x": mean_x,
            "mean_z": mean_z,
        })
        log(f"  cluster: {label}  faces={len(cluster)}  height_frac={height_frac:.3f}")

    # Debug visualization on a THROWAWAY duplicate — never touches the real
    # mesh object or its real baked material.
    dup = mesh_obj.copy()
    dup.data = mesh_obj.data.copy()
    bpy.context.collection.objects.link(dup)

    grey = bpy.data.materials.new("_fix_grey")
    grey.use_nodes = True
    b = grey.node_tree.nodes.get("Principled BSDF")
    if b:
        b.inputs["Base Color"].default_value = (0.62, 0.62, 0.65, 1.0)
        if "Roughness" in b.inputs:
            b.inputs["Roughness"].default_value = 0.55
    red = bpy.data.materials.new("_fix_red_flag")
    red.use_nodes = True
    rb = red.node_tree.nodes.get("Principled BSDF")
    if rb:
        rb.inputs["Base Color"].default_value = (0.95, 0.08, 0.05, 1.0)
        if "Roughness" in rb.inputs:
            rb.inputs["Roughness"].default_value = 0.4

    dup.data.materials.clear()
    dup.data.materials.append(grey)
    dup.data.materials.append(red)

    flagged_set = set()
    for c in clusters:
        flagged_set.update(c)
    dup.data.polygons.foreach_set(
        "material_index",
        [1 if i in flagged_set else 0 for i in range(len(dup.data.polygons))],
    )
    dup.data.update()

    mesh_obj.hide_render = True
    scene = setup_render_scene()

    fp_origin = (cx, cy - radius * 0.1, cz + dim_z * 0.30)
    do_render(
        scene, "_fix_cam_detect",
        (fp_origin[0], fp_origin[1] - radius * 0.6, fp_origin[2] + 0.05),
        (fp_origin[0], fp_origin[1] + radius * 1.5, fp_origin[2] - dim_z * 0.6),
        radius * 1.4,
        os.path.join(render_dir, "kael-lowerbody-detect-highlight.png"),
    )

    with open(report_path, "w") as fh:
        json.dump(report, fh, indent=2)
    bm.free()
    log("DONE (detect)")

elif mode == "repair":
    input_glb, output_glb, render_dir, report_path = rest[1], rest[2], rest[3], rest[4]
    os.makedirs(render_dir, exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=input_glb)
    mesh_obj, armature_obj = find_objects()

    min_x, max_x, min_y, max_y, min_z, max_z = get_world_bounds(mesh_obj)
    center_x = (min_x + max_x) / 2

    bm = bmesh.new()
    bm.from_mesh(mesh_obj.data)
    bm.verts.ensure_lookup_table()
    bm.faces.ensure_lookup_table()

    before_vert_count = len(bm.verts)
    before_face_count = len(bm.faces)

    clusters, centroids, areas = detect_anomalous_clusters(bm, mesh_obj.matrix_world, min_z, max_z)
    total_flagged = sum(len(c) for c in clusters)
    log(f"repair: found {len(clusters)} clusters, {total_flagged} flagged faces (of {before_face_count})")

    # Process every flagged cluster in ONE combined operation rather than
    # looping per cluster. Sequential per-cluster calls corrupted later
    # clusters' cached BMFace references once an earlier cluster's
    # operation touched a shared boundary vertex (crashed with "BMesh data
    # of type BMFace has been removed" on the 3rd cluster in the first
    # attempt) — dissolve_faces naturally handles disjoint face groups in
    # one call, so a single combined call sidesteps that entirely.
    #
    # dissolve_limit (angle-based coplanarity merge) was tried first and
    # barely touched these patches (verified by render: visually identical
    # to the un-repaired mesh even at 15 degrees) — these patches are
    # genuinely CHAOTIC, not "finely subdivided but locally flat," so an
    # angle-based tool is the wrong instrument. dissolve_faces merges the
    # given faces into one opening regardless of angle, use_verts=True
    # drops the now-redundant interior vertices, and the boundary loop
    # (the seam with untouched good mesh) is left completely alone since
    # it isn't part of the flagged face set — then a clean retriangulation
    # spans the same opening using only the SAME boundary vertices, so no
    # new vertices are created and no weight/UV interpolation is needed.
    face_by_index = {f.index: f for f in bm.faces}
    cluster_reports = []
    all_flagged_faces = []
    for cluster in clusters:
        label, height_frac, mean_x, mean_z = label_cluster(cluster, centroids, min_z, max_z, center_x)
        cluster_faces = [face_by_index[i] for i in cluster if i in face_by_index]
        all_flagged_faces.extend(cluster_faces)
        cluster_verts = set()
        for f in cluster_faces:
            for v in f.verts:
                cluster_verts.add(v)

        # Cache a TIGHT bounding box (from real, un-mutated vertex
        # coordinates, minimal padding) per cluster, purely for the
        # before/after reporting below — the repair itself operates on the
        # combined set, not per-cluster.
        pts = [v.co.copy() for v in cluster_verts]
        pad = 0.0015
        bb_min = mathutils.Vector((min(p.x for p in pts) - pad, min(p.y for p in pts) - pad, min(p.z for p in pts) - pad))
        bb_max = mathutils.Vector((max(p.x for p in pts) + pad, max(p.y for p in pts) + pad, max(p.z for p in pts) + pad))
        cluster_reports.append({
            "label": label,
            "height_fraction": height_frac,
            "faces_before": len(cluster_faces),
            "verts_before": len(cluster_verts),
            "bb_min": (bb_min.x, bb_min.y, bb_min.z),
            "bb_max": (bb_max.x, bb_max.y, bb_max.z),
        })

    bmesh.ops.dissolve_faces(bm, faces=all_flagged_faces, use_verts=True)
    bm.faces.ensure_lookup_table()
    bm.verts.ensure_lookup_table()

    def in_bb(c, bb_min, bb_max):
        return bb_min[0] <= c.x <= bb_max[0] and bb_min[1] <= c.y <= bb_max[1] and bb_min[2] <= c.z <= bb_max[2]

    def union_of_tight_boxes(bm_faces):
        # Union of each cluster's OWN small bbox — NOT one bbox spanning
        # every cluster (patches are scattered across the whole thigh/shin,
        # so a single spanning box would needlessly sweep in all the clean
        # mesh between them).
        out = {}
        for f in bm_faces:
            c = f.calc_center_median()
            for r in cluster_reports:
                if in_bb(c, r["bb_min"], r["bb_max"]):
                    out[f.index] = f
                    break
        return list(out.values())

    region_faces = union_of_tight_boxes(bm.faces)
    bmesh.ops.triangulate(bm, faces=region_faces, quad_method="BEAUTY", ngon_method="BEAUTY")
    bm.faces.ensure_lookup_table()
    region_faces = union_of_tight_boxes(bm.faces)
    region_edges = set()
    for f in region_faces:
        for e in f.edges:
            region_edges.add(e)
    bmesh.ops.beautify_fill(bm, faces=region_faces, edges=list(region_edges))
    bm.faces.ensure_lookup_table()
    bm.verts.ensure_lookup_table()

    for r in cluster_reports:
        after_faces = [f for f in bm.faces if in_bb(f.calc_center_median(), r["bb_min"], r["bb_max"])]
        r["faces_after"] = len(after_faces)
        del r["bb_min"]
        del r["bb_max"]
        log(f"  repaired cluster: {r['label']}  faces {r['faces_before']} -> {r['faces_after']}")

    after_vert_count = len(bm.verts)
    after_face_count = len(bm.faces)

    bm.to_mesh(mesh_obj.data)
    mesh_obj.data.update()
    bm.free()

    # ------------------------------------------------------------------
    # Re-validate: deformation smoke test + exact rest-pose return, same
    # method/targets as make-kael-fp-lowerbody.py's `final` mode.
    # ------------------------------------------------------------------
    by_norm = {}
    for bone in armature_obj.data.bones:
        n = bone.name.strip().lower()
        for p in ["mixamorig:", "mixamorig_", "mixamorig", "def-", "def_", "armature_"]:
            if n.startswith(p):
                n = n[len(p):]
                break
        by_norm[n] = bone.name

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
            fail(f"Deformation test on '{bone_name}' produced non-finite positions after repair.")
        min_moved = 2 if label in ("pelvis", "lower_spine") else 5
        if moved < min_moved:
            fail(f"Deformation test on '{bone_name}' moved only {moved} vertices after repair.")

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
    if max_rest_drift > 1e-4:
        fail(f"Mesh did not return exactly to rest pose after repair deformation tests (max drift {max_rest_drift:.6f}m).")

    # ------------------------------------------------------------------
    # Export — same settings as make-kael-fp-lowerbody.py's `materials`
    # mode, material/skins untouched throughout this whole script.
    # ------------------------------------------------------------------
    bpy.ops.object.select_all(action="DESELECT")
    armature_obj.select_set(True)
    mesh_obj.select_set(True)
    bpy.context.view_layer.objects.active = armature_obj
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

    # ------------------------------------------------------------------
    # Post-repair renders — reusing the same real (non-flat) material now
    # on the mesh, since we never replaced it.
    # ------------------------------------------------------------------
    min_x, max_x, min_y, max_y, min_z, max_z = get_world_bounds(mesh_obj)
    cx = (min_x + max_x) / 2
    cy = (min_y + max_y) / 2
    cz = (min_z + max_z) / 2
    dim_z = max_z - min_z
    radius = max(max_x - min_x, max_y - min_y, dim_z) / 2

    # Flat grey (textureless) copy for the "bright" + "wireframe" comparison
    # renders, matching round 2's methodology exactly, PLUS thigh/shin/boots
    # close-ups, all on the throwaway duplicate so the real material/export
    # is never touched by these diagnostic passes.
    dup = mesh_obj.copy()
    dup.data = mesh_obj.data.copy()
    bpy.context.collection.objects.link(dup)
    grey = bpy.data.materials.new("_fix_final_grey")
    grey.use_nodes = True
    b = grey.node_tree.nodes.get("Principled BSDF")
    if b:
        b.inputs["Base Color"].default_value = (0.62, 0.62, 0.65, 1.0)
        if "Roughness" in b.inputs:
            b.inputs["Roughness"].default_value = 0.55
    dup.data.materials.clear()
    dup.data.materials.append(grey)
    mesh_obj.hide_render = True

    scene = setup_render_scene()
    fp_origin = (cx, cy - radius * 0.1, cz + dim_z * 0.30)
    fp_loc = (fp_origin[0], fp_origin[1] - radius * 0.6, fp_origin[2] + 0.05)
    fp_target = (fp_origin[0], fp_origin[1] + radius * 1.5, fp_origin[2] - dim_z * 0.6)

    do_render(scene, "_fix_cam_bright", fp_loc, fp_target, radius * 1.4,
               os.path.join(render_dir, "kael-lowerbody-fp-lookdown-BRIGHT-AFTER.png"))

    nt = grey.node_tree
    wire = nt.nodes.new("ShaderNodeWireframe")
    wire.inputs["Size"].default_value = 0.0006
    blk = nt.nodes.new("ShaderNodeEmission")
    blk.inputs["Color"].default_value = (0, 0, 0, 1)
    mix = nt.nodes.new("ShaderNodeMixShader")
    mat_out = nt.nodes.get("Material Output")
    nt.links.new(b.outputs["BSDF"], mix.inputs[1])
    nt.links.new(blk.outputs["Emission"], mix.inputs[2])
    nt.links.new(wire.outputs["Fac"], mix.inputs["Fac"])
    nt.links.new(mix.outputs["Shader"], mat_out.inputs["Surface"])

    do_render(scene, "_fix_cam_wire", fp_loc, fp_target, radius * 1.4,
               os.path.join(render_dir, "kael-lowerbody-fp-lookdown-WIREFRAME-AFTER.png"))

    left_thigh_z = min_z + dim_z * 0.5
    do_render(scene, "_fix_cam_thigh_l",
              (cx - radius * 0.55, cy + radius * 1.1, left_thigh_z),
              (cx - radius * 0.3, cy, left_thigh_z), radius * 0.6,
              os.path.join(render_dir, "kael-lowerbody-left-thigh-closeup.png"))
    do_render(scene, "_fix_cam_thigh_r",
              (cx + radius * 0.55, cy + radius * 1.1, left_thigh_z),
              (cx + radius * 0.3, cy, left_thigh_z), radius * 0.6,
              os.path.join(render_dir, "kael-lowerbody-right-thigh-closeup.png"))

    shin_z = min_z + dim_z * 0.25
    do_render(scene, "_fix_cam_shin",
              (cx, cy + radius * 1.2, shin_z),
              (cx, cy, shin_z), radius * 0.8,
              os.path.join(render_dir, "kael-lowerbody-shin-closeup.png"))

    boot_target_z = min_z + dim_z * 0.10
    do_render(scene, "_fix_cam_boots",
              (cx, cy + radius * 1.4, boot_target_z),
              (cx, cy, boot_target_z), dim_z * 0.42,
              os.path.join(render_dir, "kael-lowerbody-boots-closeup.png"))

    report = {
        "before": {"verts": before_vert_count, "faces": before_face_count},
        "after": {"verts": after_vert_count, "faces": after_face_count},
        "clusters_repaired": cluster_reports,
        "deformation_test": deform_results,
        "rest_pose_return_max_drift_m": max_rest_drift,
    }
    with open(report_path, "w") as fh:
        json.dump(report, fh, indent=2)
    log("DONE (repair)")

else:
    fail(f"unknown mode {mode!r}")
