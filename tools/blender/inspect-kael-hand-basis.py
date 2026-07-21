"""
WindArms — Kael hand-bone rest-orientation inspection (Milestone 7, Phase F,
Step 5, "Vortex Grip-Anchor Authoring System").

The grip-target quaternions authored for the Vortex Rifle's weapon-owned
runtime anchors must be expressed in a basis that is actually compatible
with Kael's real hand bones — not a generic/assumed hand convention. This
script reads the ACCEPTED source GLB's rest pose (never modified) and
reports, per hand:

  - bone name, parent lower-arm bone
  - head/tail position (armature space)
  - rest matrix (bone.matrix_local, armature space)
  - local X/Y/Z axes in armature space, read directly off that matrix
    (NOT re-derived from head/tail+roll — matrix_local is authoritative)
  - finger-chain direction (Hand -> Index1 head, normalized)
  - thumb direction (Hand -> Thumb1 head, normalized)
  - palm-normal inference: plane normal of (Hand, Thumb1, Pinky1), sign
    resolved against the finger-forward direction so it consistently
    points to the same anatomical side on both hands before mirroring
  - mirrored L/R differences (dot products between corresponding axes)
  - a recommended runtime target basis for the grip-anchor system

Read-only: the source GLB is imported and never modified or re-exported.

Usage:
  blender --background --python tools/blender/inspect-kael-hand-basis.py -- <source_glb> <report_json> [<render_dir>]

The optional render_dir gets a scratch-only axis-visualization PNG per hand
(hand-bone axis / finger-forward / palm-normal / thumb direction) — never
committed, per instruction.
"""

import sys
import os
import json
import math

import bpy
import mathutils


def parse_args():
    argv = sys.argv
    if "--" not in argv:
        raise SystemExit("Usage: blender --background --python inspect-kael-hand-basis.py -- <source_glb> <report_json> [<render_dir>]")
    rest = argv[argv.index("--") + 1:]
    if len(rest) < 2:
        raise SystemExit("Usage: blender --background --python inspect-kael-hand-basis.py -- <source_glb> <report_json> [<render_dir>]")
    return rest[0], rest[1], (rest[2] if len(rest) > 2 else None)


SOURCE_GLB, REPORT_JSON, RENDER_DIR = parse_args()

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SOURCE_GLB)

armatures = [o for o in bpy.data.objects if o.type == "ARMATURE"]
if len(armatures) != 1:
    raise SystemExit(f"Expected 1 armature, found {len(armatures)}")
armature_obj = armatures[0]
bones = armature_obj.data.bones


def v3(v):
    return [round(v.x, 6), round(v.y, 6), round(v.z, 6)]


def mat4(m):
    return [[round(m[r][c], 6) for c in range(4)] for r in range(4)]


def bone_axes(bone):
    """Columns 0/1/2 of matrix_local's 3x3 rotation part, in ARMATURE space
    — the authoritative rest-pose local axes (Blender's bone +Y always
    points head->tail by construction; X/Z follow roll)."""
    m = bone.matrix_local
    x_axis = mathutils.Vector((m[0][0], m[1][0], m[2][0])).normalized()
    y_axis = mathutils.Vector((m[0][1], m[1][1], m[2][1])).normalized()
    z_axis = mathutils.Vector((m[0][2], m[1][2], m[2][2])).normalized()
    return x_axis, y_axis, z_axis


def get_bone(name):
    b = bones.get(name)
    if b is None:
        raise SystemExit(f"Required bone not found: {name}")
    return b


report = {"source_glb": SOURCE_GLB, "hands": {}}

for side, hand_name, lower_arm_name, thumb1_name, index1_name, pinky1_name, middle1_name in [
    ("left", "mixamorig:LeftHand", "mixamorig:LeftForeArm", "mixamorig:LeftHandThumb1", "mixamorig:LeftHandIndex1", "mixamorig:LeftHandPinky1", "mixamorig:LeftHandMiddle1"),
    ("right", "mixamorig:RightHand", "mixamorig:RightForeArm", "mixamorig:RightHandThumb1", "mixamorig:RightHandIndex1", "mixamorig:RightHandPinky1", "mixamorig:RightHandMiddle1"),
]:
    hand = get_bone(hand_name)
    lower_arm = get_bone(lower_arm_name)
    thumb1 = get_bone(thumb1_name)
    index1 = get_bone(index1_name)
    pinky1 = get_bone(pinky1_name)
    middle1 = get_bone(middle1_name)

    hand_head = hand.head_local.copy()
    hand_tail = hand.tail_local.copy()
    x_axis, y_axis, z_axis = bone_axes(hand)

    finger_forward = (index1.head_local - hand_tail)
    if finger_forward.length < 1e-6:
        finger_forward = (middle1.head_local - hand_tail)
    finger_forward.normalize()

    thumb_dir = (thumb1.head_local - hand_head).normalized()

    # Palm-plane normal from three real landmarks (Hand, Thumb1, Pinky1) —
    # independent of the bone's own roll, so it's a genuine anatomical
    # cross-check against x_axis/y_axis/z_axis rather than circular with
    # them.
    p_hand = hand_head
    p_thumb = thumb1.head_local
    p_pinky = pinky1.head_local
    edge1 = (p_thumb - p_hand)
    edge2 = (p_pinky - p_hand)
    palm_normal_raw = edge1.cross(edge2)
    if palm_normal_raw.length < 1e-9:
        palm_normal_raw = z_axis.copy()
    palm_normal_raw.normalize()

    report["hands"][side] = {
        "hand_bone": hand_name,
        "parent_lower_arm_bone": lower_arm_name,
        "head_local": v3(hand_head),
        "tail_local": v3(hand_tail),
        "length": round((hand_tail - hand_head).length, 6),
        "rest_matrix_local_armature_space": mat4(hand.matrix_local),
        "local_axes_armature_space": {
            "x": v3(x_axis),
            "y_bone_direction": v3(y_axis),
            "z": v3(z_axis),
        },
        "finger_forward_direction": v3(finger_forward),
        "thumb_direction": v3(thumb_dir),
        "palm_normal_raw": v3(palm_normal_raw),
        "landmark_positions": {
            "thumb1_head": v3(p_thumb),
            "index1_head": v3(index1.head_local),
            "middle1_head": v3(middle1.head_local),
            "pinky1_head": v3(p_pinky),
        },
        "dot_bone_y_vs_finger_forward": round(y_axis.dot(finger_forward), 4),
        "dot_bone_x_vs_thumb": round(x_axis.dot(thumb_dir), 4),
        "dot_bone_z_vs_palm_normal": round(z_axis.dot(palm_normal_raw), 4),
    }

# Mirrored L/R comparison — dot products between corresponding armature-
# space axes. For a standard mirrored biped rig, X axes typically oppose
# (dot ~ -1) while Y (bone direction, both hands' fingers point the same
# general forward direction in a T/A-pose) and Z relationships depend on
# the specific rig's roll convention — report raw numbers, don't assume.
L = report["hands"]["left"]["local_axes_armature_space"]
R = report["hands"]["right"]["local_axes_armature_space"]
Lv = {k: mathutils.Vector(v) for k, v in L.items()}
Rv = {k: mathutils.Vector(v) for k, v in R.items()}
report["mirrored_axis_dot_products"] = {
    "x_left_dot_x_right": round(Lv["x"].dot(Rv["x"]), 4),
    "y_left_dot_y_right": round(Lv["y_bone_direction"].dot(Rv["y_bone_direction"]), 4),
    "z_left_dot_z_right": round(Lv["z"].dot(Rv["z"]), 4),
    "finger_forward_left_dot_right": round(
        mathutils.Vector(report["hands"]["left"]["finger_forward_direction"]).dot(
            mathutils.Vector(report["hands"]["right"]["finger_forward_direction"])
        ), 4
    ),
}

# Recommended runtime target basis: express what a consumer (the future
# grip-anchor authoring system) should treat as "hand-forward" (finger
# direction), "palm-normal" and "thumb-direction" per side, in the
# ARMATURE's own rest-pose world space — this is the basis the Vortex
# grip-anchor system's world-quaternion output should be compatible with.
report["recommended_target_basis"] = {
    "note": (
        "Grip-anchor world quaternions published by the Vortex weapon should orient "
        "their local +X toward finger_forward_direction, their local +Z toward "
        "palm_normal_raw (sign per hand, see per-hand entries above), consistent with "
        "these measured rest-pose directions — NOT a generic/assumed hand basis. "
        "Left/right mirroring is NOT a simple negate-one-axis operation unless the "
        "mirrored_axis_dot_products above confirm it; use the actual per-hand vectors."
    ),
}

with open(REPORT_JSON, "w") as f:
    json.dump(report, f, indent=2)

print("INSPECT_OK")
for side in ("left", "right"):
    h = report["hands"][side]
    print(f"  {side}: head={h['head_local']} finger_fwd={h['finger_forward_direction']} thumb={h['thumb_direction']} palm_normal={h['palm_normal_raw']}")
print(f"  mirrored dots: {report['mirrored_axis_dot_products']}")

# ---------------------------------------------------------------------------
# Optional scratch-only axis-visualization render (never committed).
# ---------------------------------------------------------------------------
if RENDER_DIR:
    os.makedirs(RENDER_DIR, exist_ok=True)

    def make_axis_line(name, origin, direction, length, color):
        curve_data = bpy.data.curves.new(name, type="CURVE")
        curve_data.dimensions = "3D"
        curve_data.bevel_depth = 0.004
        spline = curve_data.splines.new("POLY")
        spline.points.add(1)
        spline.points[0].co = (origin.x, origin.y, origin.z, 1.0)
        end = origin + direction * length
        spline.points[1].co = (end.x, end.y, end.z, 1.0)
        obj = bpy.data.objects.new(name, curve_data)
        bpy.context.collection.objects.link(obj)
        mat = bpy.data.materials.new(f"_mat_{name}")
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            bsdf.inputs["Base Color"].default_value = (*color, 1.0)
            if "Emission Color" in bsdf.inputs:
                bsdf.inputs["Emission Color"].default_value = (*color, 1.0)
                bsdf.inputs["Emission Strength"].default_value = 1.5
        curve_data.materials.append(mat)
        return obj

    sun = bpy.data.lights.new("_sun", "SUN")
    sun.energy = 3.0
    sun_obj = bpy.data.objects.new("_sun", sun)
    bpy.context.collection.objects.link(sun_obj)
    sun_obj.rotation_euler = (math.radians(55), 0, math.radians(35))

    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except Exception:
        try:
            scene.render.engine = "BLENDER_EEVEE"
        except Exception:
            pass
    scene.world = bpy.data.worlds.new("_world")
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.06, 0.06, 0.08, 1.0)

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

    L = 0.08
    axis_objs = []
    for side in ("left", "right"):
        h = report["hands"][side]
        origin = mathutils.Vector(h["head_local"])
        axis_objs.append(make_axis_line(f"_fwd_{side}", origin, mathutils.Vector(h["finger_forward_direction"]), L, (1.0, 0.2, 0.2)))
        axis_objs.append(make_axis_line(f"_palm_{side}", origin, mathutils.Vector(h["palm_normal_raw"]), L, (0.2, 0.4, 1.0)))
        axis_objs.append(make_axis_line(f"_thumb_{side}", origin, mathutils.Vector(h["thumb_direction"]), L * 0.7, (0.2, 1.0, 0.3)))

    center = (mathutils.Vector(report["hands"]["left"]["head_local"]) + mathutils.Vector(report["hands"]["right"]["head_local"])) / 2
    hand_span = (mathutils.Vector(report["hands"]["left"]["head_local"]) - mathutils.Vector(report["hands"]["right"]["head_local"])).length
    scene.render.resolution_x = 1000
    scene.render.resolution_y = 800
    # Pull back far enough to fit both hands + their 0.08m axis lines with
    # margin, camera at -Y (front, per the established +Y-facing convention
    # already used throughout this pipeline) and slightly above hand height
    # to avoid a pure edge-on view of the axis lines.
    cam_distance = hand_span * 1.8 + 0.3
    cam = ortho_cam("_cam", center + mathutils.Vector((0, -cam_distance, 0.15)), center, hand_span * 1.6)
    scene.camera = cam
    scene.render.filepath = os.path.join(RENDER_DIR, "kael-hand-basis-axes.png")
    bpy.ops.render.render(write_still=True)
    print(f"RENDERED {scene.render.filepath}")
