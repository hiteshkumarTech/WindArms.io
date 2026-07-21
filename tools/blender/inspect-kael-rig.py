"""
WindArms — automated FBX rig inspector (Milestone 7, Kael v0.1 gate).

Runs headless inside Blender:
  "<BLENDER_EXE>" --background --python tools/blender/inspect-kael-rig.py -- <fbx_path> <json_out_path>

Structural gate (Phase B) + deformation smoke test (Phase C) in one pass —
the smoke test is meaningless to run if the structural gate already failed,
and both operate on the same freshly-imported, never-saved scene.

Bone-name resolution deliberately mirrors src/lib/v2/operators/sockets.ts's
DEFAULT_BONE_FALLBACKS (Mixamo / UE mannequin / Rigify families) rather than
inventing a parallel convention — this script and the TypeScript runtime
must agree on what counts as "the left hand bone" or the gate is validating
against rules the game itself doesn't use.

Writes a single machine-readable JSON report to json_out_path. Does not
save the .blend, does not modify the source FBX, does not commit anything.
"""

import sys
import json
import math

import bpy

try:
    import numpy as np
    HAVE_NUMPY = True
except ImportError:
    HAVE_NUMPY = False


# ---------------------------------------------------------------------------
# Args
# ---------------------------------------------------------------------------

def parse_args():
    argv = sys.argv
    if "--" not in argv:
        raise SystemExit("Usage: blender --background --python inspect-kael-rig.py -- <fbx_path> <json_out_path>")
    rest = argv[argv.index("--") + 1:]
    if len(rest) < 2:
        raise SystemExit("Usage: blender --background --python inspect-kael-rig.py -- <fbx_path> <json_out_path>")
    return rest[0], rest[1]


FBX_PATH, JSON_OUT_PATH = parse_args()

report = {
    "fbx_path": FBX_PATH,
    "objects": [],
    "armature": None,
    "meshes": [],
    "chains": {},
    "fingers": {},
    "weighting": {},
    "deformation_test": None,
    "rejection_reasons": [],
    "limitation_reasons": [],
    "classification": None,
}


def reject(reason):
    report["rejection_reasons"].append(reason)


def limit(reason):
    report["limitation_reasons"].append(reason)


# ---------------------------------------------------------------------------
# Bone-name resolution — mirrors sockets.ts's DEFAULT_BONE_FALLBACKS families
# (Mixamo, UE mannequin, Rigify deform bones), extended to the FULL chain
# (shoulder->upperArm->lowerArm->hand, upperLeg->lowerLeg->foot) rather than
# just the socket endpoints that file cares about.
# ---------------------------------------------------------------------------

PREFIX_STRIP = ["mixamorig:", "mixamorig_", "mixamorig", "def-", "def_", "armature_"]


def normalize_bone_name(name):
    n = name.strip().lower()
    for p in PREFIX_STRIP:
        if n.startswith(p):
            n = n[len(p):]
            break
    return n


# Each chain entry: canonical name -> list of normalized-name candidates.
CHAIN_CANDIDATES = {
    "pelvis": ["hips", "pelvis", "root"],
    "spine": ["spine", "spine1", "spine_01", "spine_02"],
    "chest": ["spine2", "chest", "spine_03", "upperchest"],
    "neck": ["neck", "neck_01"],
    "head": ["head"],
}

SIDE_CHAIN_CANDIDATES = {
    "shoulder": {"left": ["leftshoulder", "shoulder_l", "clavicle_l", "clavicle.l"],
                 "right": ["rightshoulder", "shoulder_r", "clavicle_r", "clavicle.r"]},
    "upper_arm": {"left": ["leftarm", "upperarm_l", "arm_l", "upperarm.l"],
                  "right": ["rightarm", "upperarm_r", "arm_r", "upperarm.r"]},
    "lower_arm": {"left": ["leftforearm", "lowerarm_l", "forearm_l", "lowerarm.l"],
                  "right": ["rightforearm", "lowerarm_r", "forearm_r", "lowerarm.r"]},
    "hand": {"left": ["lefthand", "hand_l", "hand.l"],
             "right": ["righthand", "hand_r", "hand.r"]},
    "upper_leg": {"left": ["leftupleg", "thigh_l", "upperleg_l", "thigh.l"],
                  "right": ["rightupleg", "thigh_r", "upperleg_r", "thigh.r"]},
    "lower_leg": {"left": ["leftleg", "calf_l", "lowerleg_l", "shin_l", "calf.l"],
                  "right": ["rightleg", "calf_r", "lowerleg_r", "shin_r", "calf.r"]},
    "foot": {"left": ["leftfoot", "foot_l", "foot.l"],
             "right": ["rightfoot", "foot_r", "foot.r"]},
}

FINGER_PREFIXES = {
    "thumb": {"left": "lefthandthumb", "right": "righthandthumb"},
    "index": {"left": "lefthandindex", "right": "righthandindex"},
    "middle": {"left": "lefthandmiddle", "right": "righthandmiddle"},
    "ring": {"left": "lefthandring", "right": "righthandring"},
    "pinky": {"left": "lefthandpinky", "right": "righthandpinky"},
}


def resolve_bone(normalized_names_by_bone, candidates):
    for norm, original in normalized_names_by_bone.items():
        if norm in candidates:
            return original
    return None


# ---------------------------------------------------------------------------
# Phase B — import + structural enumeration
# ---------------------------------------------------------------------------

bpy.ops.wm.read_factory_settings(use_empty=True)

try:
    bpy.ops.import_scene.fbx(filepath=FBX_PATH)
except Exception as e:
    reject(f"FBX import failed: {e}")
    report["classification"] = "REJECTED"
    with open(JSON_OUT_PATH, "w") as f:
        json.dump(report, f, indent=2)
    print("INSPECTION_RESULT:REJECTED (import failed)")
    sys.exit(0)

all_objects = list(bpy.data.objects)
armatures = [o for o in all_objects if o.type == "ARMATURE"]
meshes = [o for o in all_objects if o.type == "MESH"]
cameras = [o for o in all_objects if o.type == "CAMERA"]
lights = [o for o in all_objects if o.type == "LIGHT"]
empties = [o for o in all_objects if o.type == "EMPTY"]

for o in all_objects:
    report["objects"].append({
        "name": o.name,
        "type": o.type,
        "location": list(o.location),
        "rotation_euler": list(o.rotation_euler),
        "scale": list(o.scale),
    })

report["object_counts"] = {
    "total": len(all_objects),
    "armatures": len(armatures),
    "meshes": len(meshes),
    "cameras": len(cameras),
    "lights": len(lights),
    "empties": len(empties),
}

if cameras:
    limit(f"{len(cameras)} camera object(s) present in the import — expected to be stripped by the exporter, not the source.")
if lights:
    limit(f"{len(lights)} light object(s) present in the import — expected to be stripped by the exporter, not the source.")

# --- Armature ---

if len(armatures) == 0:
    reject("No armature found in the FBX.")
elif len(armatures) > 1:
    limit(f"{len(armatures)} armatures found — expected exactly one. Using the first for validation; extras are likely import artifacts.")

armature_obj = armatures[0] if armatures else None

if armature_obj:
    bones = list(armature_obj.data.bones)
    bone_names = [b.name for b in bones]
    normalized = {}
    duplicate_suffix_pattern_hits = []
    for name in bone_names:
        norm = normalize_bone_name(name)
        if norm in normalized:
            duplicate_suffix_pattern_hits.append(name)
        else:
            normalized[norm] = name
        if name.rsplit(".", 1)[-1].isdigit() and len(name.rsplit(".", 1)[-1]) == 3:
            duplicate_suffix_pattern_hits.append(name)

    root_bones = [b.name for b in bones if b.parent is None]

    def has_negative_scale(obj):
        return any(s < 0 for s in obj.scale)

    armature_negative_scale = has_negative_scale(armature_obj)
    armature_world_det = armature_obj.matrix_world.determinant()

    report["armature"] = {
        "name": armature_obj.name,
        "bone_count": len(bones),
        "root_bones": root_bones,
        "scale": list(armature_obj.scale),
        "negative_scale": armature_negative_scale,
        "world_matrix_determinant": armature_world_det,
        "duplicate_or_renamed_bones": sorted(set(duplicate_suffix_pattern_hits)),
        "animation_actions": [a.name for a in bpy.data.actions],
    }

    if armature_negative_scale or armature_world_det < 0:
        limit("Armature object has a negative scale component or negative world-matrix determinant — mirrored geometry risk; must be resolved (not just zeroed) during export normalization.")

    if len(root_bones) > 1:
        limit(f"Armature has {len(root_bones)} root bones ({root_bones}) — a single root is expected for a clean humanoid rig.")

    if duplicate_suffix_pattern_hits:
        limit(f"Bone names with numeric .NNN suffixes detected ({sorted(set(duplicate_suffix_pattern_hits))[:10]}) — Blender auto-disambiguates colliding import names; the source FBX likely had duplicate bone names.")

    # --- Chain resolution ---
    chains = {}
    for key, candidates in CHAIN_CANDIDATES.items():
        chains[key] = resolve_bone(normalized, candidates)
    for key, sides in SIDE_CHAIN_CANDIDATES.items():
        for side, candidates in sides.items():
            chains[f"{key}_{side}"] = resolve_bone(normalized, candidates)
    report["chains"] = chains

    required_core = ["pelvis", "head"]
    required_arm_chain = ["upper_arm_left", "lower_arm_left", "hand_left", "upper_arm_right", "lower_arm_right", "hand_right"]
    required_leg_chain = ["upper_leg_left", "lower_leg_left", "foot_left", "upper_leg_right", "lower_leg_right", "foot_right"]

    for key in required_core:
        if not chains.get(key):
            reject(f"Missing required core bone: {key}")
    if not chains.get("spine") and not chains.get("chest"):
        reject("Missing required spine chain (no spine or chest/upper-spine bone resolved).")
    for key in required_arm_chain:
        if not chains.get(key):
            reject(f"Missing required arm-chain bone: {key}")
    for key in required_leg_chain:
        if not chains.get(key):
            reject(f"Missing required leg-chain bone: {key}")
    if not chains.get("shoulder_left") or not chains.get("shoulder_right"):
        limit("Shoulder/clavicle bone missing on one or both sides — arm chain still usable, shoulder roll will be approximated.")

    # --- Fingers (preferred, not required) ---
    fingers = {}
    for finger, sides in FINGER_PREFIXES.items():
        for side, prefix in sides.items():
            found = any(normalize_bone_name(n).startswith(prefix) for n in bone_names)
            fingers[f"{finger}_{side}"] = found
    report["fingers"] = fingers
    missing_fingers = [k for k, v in fingers.items() if not v]
    if missing_fingers:
        limit(f"Finger bones absent: {missing_fingers}. Grip pose will use a neutral hand — documented limitation, not a rejection per the source brief.")
else:
    report["chains"] = {}

# --- Meshes ---

skinned_meshes = []
for m in meshes:
    armature_modifiers = [mod for mod in m.modifiers if mod.type == "ARMATURE"]
    vertex_group_names = [vg.name for vg in m.vertex_groups]
    mat_slots = [slot.material.name if slot.material else None for slot in m.material_slots]
    tex_refs = []
    for mat in m.data.materials:
        if not mat or not mat.use_nodes:
            continue
        for node in mat.node_tree.nodes:
            if node.type == "TEX_IMAGE" and node.image:
                tex_refs.append(node.image.filepath or node.image.name)

    is_skinned = bool(armature_modifiers) and bool(vertex_group_names)
    if is_skinned:
        skinned_meshes.append(m)

    mesh_negative_scale = any(s < 0 for s in m.scale)

    mesh_report = {
        "name": m.name,
        "vertex_count": len(m.data.vertices),
        "polygon_count": len(m.data.polygons),
        "triangle_estimate": sum(max(len(p.vertices) - 2, 1) for p in m.data.polygons),
        "material_count": len(m.material_slots),
        "materials": mat_slots,
        "texture_references": tex_refs,
        "dimensions_m": list(m.dimensions),
        "scale": list(m.scale),
        "negative_scale": mesh_negative_scale,
        "vertex_group_count": len(vertex_group_names),
        "vertex_groups": vertex_group_names,
        "has_armature_modifier": bool(armature_modifiers),
        "is_skinned": is_skinned,
    }
    report["meshes"].append(mesh_report)

    if mesh_negative_scale:
        limit(f"Mesh '{m.name}' has a negative scale component.")

if not skinned_meshes:
    reject("No mesh is both parented/modified by an Armature modifier AND has vertex groups — no skinned mesh found.")

report["object_counts"]["skinned_meshes"] = len(skinned_meshes)

# --- World height / dimensions from the largest skinned mesh ---

primary_mesh = max(skinned_meshes, key=lambda m: len(m.data.vertices)) if skinned_meshes else (meshes[0] if meshes else None)

if primary_mesh:
    depsgraph = bpy.context.evaluated_depsgraph_get()
    eval_obj = primary_mesh.evaluated_get(depsgraph)
    import mathutils
    corners = [eval_obj.matrix_world @ mathutils.Vector(c) for c in eval_obj.bound_box]
    zs = [c.z for c in corners]
    world_height = max(zs) - min(zs)
    report["primary_mesh"] = primary_mesh.name
    report["world_height_m_z_axis"] = world_height
    if world_height <= 0 or not math.isfinite(world_height) or world_height > 10:
        limit(f"World-space height read as {world_height:.3f} m on the Z axis — sanity-check against the Y axis too; FBX up-axis convention may differ (Blender's FBX importer normally rotates Y-up sources to Z-up, but this should still be verified manually if this number looks wrong).")
        if world_height <= 0 or not math.isfinite(world_height):
            reject(f"World-space height is non-finite or non-positive ({world_height}) — cannot evaluate character scale.")
else:
    reject("No mesh object found at all — cannot evaluate character presence.")

# --- Weighting sanity check (approximate — see report note) ---

if primary_mesh and primary_mesh.data.vertices:
    total_verts = len(primary_mesh.data.vertices)
    unweighted = 0
    zero_total_weight = 0
    for v in primary_mesh.data.vertices:
        if len(v.groups) == 0:
            unweighted += 1
        else:
            total_w = sum(g.weight for g in v.groups)
            if total_w <= 1e-6:
                zero_total_weight += 1
    fully_unweighted = unweighted + zero_total_weight
    pct_unweighted = (fully_unweighted / total_verts) * 100 if total_verts else 100

    report["weighting"] = {
        "total_vertices": total_verts,
        "vertices_with_no_groups": unweighted,
        "vertices_with_zero_total_weight": zero_total_weight,
        "percent_effectively_unweighted": pct_unweighted,
        "note": "Approximate: flags vertices with no vertex-group membership or zero total weight. Cannot geometrically localize 'a major unweighted region' — a human visual pass in Blender remains the authority for weight-painting quality, this only proves weights exist and are broadly distributed.",
    }

    if pct_unweighted > 15:
        reject(f"{pct_unweighted:.1f}% of vertices on the primary mesh have no effective weight — deformation cannot be evaluated as a fully-rigged character.")
    elif pct_unweighted > 2:
        limit(f"{pct_unweighted:.1f}% of vertices on the primary mesh have no effective weight — likely small regions (e.g. eyes, accessories); worth a manual look before FP arm extraction.")

    # Deform-bone count: bones with use_deform=True vs bones actually
    # referenced by a same-named vertex group with any non-zero weight.
    if armature_obj:
        vg_names_lower = {vg.name.lower(): vg.name for vg in primary_mesh.vertex_groups}
        deform_flagged = [b.name for b in armature_obj.data.bones if b.use_deform]
        actually_weighted_bones = set()
        vg_index_to_name = {vg.index: vg.name for vg in primary_mesh.vertex_groups}
        for v in primary_mesh.data.vertices:
            for g in v.groups:
                if g.weight > 1e-6:
                    name = vg_index_to_name.get(g.group)
                    if name:
                        actually_weighted_bones.add(name)
        report["armature"]["deform_bone_count_flagged"] = len(deform_flagged)
        report["armature"]["bones_with_actual_nonzero_weight"] = len(actually_weighted_bones)


# ---------------------------------------------------------------------------
# Phase C — deformation smoke test
#
# Structural proof only: "bone moves -> mesh deforms". Rotates a handful of
# resolved pose bones by a small, safe angle, re-evaluates the depsgraph,
# and counts how many evaluated-mesh vertices actually moved. Runs in the
# same never-saved scene; pose is restored before the process exits, and
# nothing is ever written back to the FBX or saved as a .blend.
# ---------------------------------------------------------------------------

def sample_local_positions(obj, depsgraph):
    eval_obj = obj.evaluated_get(depsgraph)
    eval_mesh = eval_obj.to_mesh()
    n = len(eval_mesh.vertices)
    if HAVE_NUMPY:
        flat = np.empty(n * 3, dtype=np.float32)
        eval_mesh.vertices.foreach_get("co", flat)
        positions = flat.reshape(n, 3)
    else:
        positions = [tuple(v.co) for v in eval_mesh.vertices]
    eval_obj.to_mesh_clear()
    return positions


def count_moved(before, after, epsilon=1e-5):
    if HAVE_NUMPY:
        finite = bool(np.all(np.isfinite(after)))
        if not finite:
            return None, False
        delta = np.linalg.norm(after - before, axis=1)
        moved = int(np.sum(delta > epsilon))
        return moved, True
    else:
        moved = 0
        for (bx, by, bz), (ax, ay, az) in zip(before, after):
            if not all(math.isfinite(x) for x in (ax, ay, az)):
                return None, False
            d = math.sqrt((ax - bx) ** 2 + (ay - by) ** 2 + (az - bz) ** 2)
            if d > epsilon:
                moved += 1
        return moved, True


deformation_results = []

if armature_obj and primary_mesh and not report["rejection_reasons"]:
    test_targets = [
        ("lower_arm_left", chains.get("lower_arm_left")),
        ("lower_arm_right", chains.get("lower_arm_right")),
        ("upper_leg_left", chains.get("upper_leg_left") or chains.get("upper_leg_right")),
        ("head", chains.get("head") or chains.get("neck")),
    ]

    dg = bpy.context.evaluated_depsgraph_get()
    dg.update()
    rest_positions = sample_local_positions(primary_mesh, dg)

    for label, bone_name in test_targets:
        if not bone_name:
            deformation_results.append({"target": label, "bone": None, "skipped": True, "reason": "chain unresolved"})
            continue

        pbone = armature_obj.pose.bones.get(bone_name)
        if pbone is None:
            deformation_results.append({"target": label, "bone": bone_name, "skipped": True, "reason": "pose bone not found"})
            continue

        original_mode = pbone.rotation_mode
        original_euler = tuple(pbone.rotation_euler)
        original_quat = tuple(pbone.rotation_quaternion)

        pbone.rotation_mode = "XYZ"
        # Small, safe angle — enough to move vertices measurably, far short
        # of anything anatomically extreme.
        angle = math.radians(15)
        pbone.rotation_euler = (angle, 0.0, 0.0)

        dg = bpy.context.evaluated_depsgraph_get()
        dg.update()
        after_positions = sample_local_positions(primary_mesh, dg)

        moved_count, is_finite = count_moved(rest_positions, after_positions)

        # Restore rest pose before moving to the next bone.
        pbone.rotation_mode = original_mode
        pbone.rotation_euler = original_euler
        pbone.rotation_quaternion = original_quat
        dg = bpy.context.evaluated_depsgraph_get()
        dg.update()

        deformation_results.append({
            "target": label,
            "bone": bone_name,
            "skipped": False,
            "moved_vertex_count": moved_count,
            "total_vertices": len(rest_positions),
            "finite": is_finite,
        })

        if not is_finite:
            reject(f"Deformation test on bone '{bone_name}' ({label}) produced non-finite vertex positions.")
        elif moved_count is not None and moved_count < 10:
            limit(f"Deformation test on bone '{bone_name}' ({label}) moved only {moved_count} vertices — weighting in that region may be very sparse or the chain resolution may be wrong.")

    # Final restore pass + depsgraph settle, belt-and-suspenders.
    dg = bpy.context.evaluated_depsgraph_get()
    dg.update()

    report["deformation_test"] = {
        "epsilon_m": 1e-5,
        "rotation_applied_deg": 15,
        "results": deformation_results,
        "used_numpy": HAVE_NUMPY,
    }
elif not armature_obj or not primary_mesh:
    report["deformation_test"] = {"skipped": True, "reason": "no armature or no primary mesh"}
else:
    report["deformation_test"] = {"skipped": True, "reason": "structural gate already failed — see rejection_reasons"}


# ---------------------------------------------------------------------------
# Classification
# ---------------------------------------------------------------------------

if report["rejection_reasons"]:
    report["classification"] = "REJECTED"
elif report["limitation_reasons"]:
    report["classification"] = "ACCEPTED WITH LIMITATIONS"
else:
    report["classification"] = "ACCEPTED"

with open(JSON_OUT_PATH, "w") as f:
    json.dump(report, f, indent=2, default=str)

print(f"INSPECTION_RESULT:{report['classification']}")
print(f"INSPECTION_JSON:{JSON_OUT_PATH}")
