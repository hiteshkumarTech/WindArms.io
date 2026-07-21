"""
WindArms — normalized source GLB export for Kael v0.1 (Milestone 7 gate).

Runs headless inside Blender, only after inspect-kael-rig.py has classified
the FBX as ACCEPTED or ACCEPTED WITH LIMITATIONS:

  "<BLENDER_EXE>" --background --python tools/blender/make-kael-source-glb.py -- \
      <fbx_path> <glb_out_path> <render_out_dir>

What this does, in order:
  1. Fresh import (never touches the source FBX — read-only).
  2. Strips non-character objects (cameras/lights/empties) and any imported
     animation actions (Mixamo's default embedded clip is not one of this
     project's authored states — see kael-v0.1-source-brief.md).
  3. Forces rest pose on every pose bone before anything else touches scale.
  4. Applies rotation+scale to armature AND mesh TOGETHER (never mesh-only —
     that desyncs the armature modifier's bind reference from vertex data).
  4b. Applies a 180-degree yaw correction, armature+mesh together — Kael as
     originally rigged faces +Z; WindArms' convention is -Z. Empirically
     proven via tools/blender/verify-kael-facing.py's two-camera render,
     not inferred from axis-conversion math alone.
  5. Grounds the character (mesh min-Z -> 0) via armature object location,
     then applies that too, so the exported root sits at a clean origin.
  6. Renders a quick EEVEE front-view PNG of the normalized result BEFORE
     export — a real visual check of facing direction and pose sanity,
     not an assumption about Blender's Z-up -> glTF Y-up axis math.
  7. Exports GLB with skinning preserved, modifiers NOT applied (that would
     bake the current pose and destroy the skin), animations excluded
     (junk clip already removed).

Fails loudly (non-zero exit, clear message) if skinning is missing at
export time or the export call itself raises.
"""

import sys
import math

import bpy
import mathutils


def parse_args():
    argv = sys.argv
    if "--" not in argv:
        raise SystemExit("Usage: blender --background --python make-kael-source-glb.py -- <fbx> <glb_out> <render_out_dir>")
    rest = argv[argv.index("--") + 1:]
    if len(rest) < 3:
        raise SystemExit("Usage: blender --background --python make-kael-source-glb.py -- <fbx> <glb_out> <render_out_dir>")
    return rest[0], rest[1], rest[2]


FBX_PATH, GLB_OUT_PATH, RENDER_OUT_DIR = parse_args()


def fail(message):
    print(f"EXPORT_FAILED: {message}")
    sys.exit(1)


# ---------------------------------------------------------------------------
# Import (fresh scene, read-only against the FBX)
# ---------------------------------------------------------------------------

bpy.ops.wm.read_factory_settings(use_empty=True)

try:
    bpy.ops.import_scene.fbx(filepath=FBX_PATH)
except Exception as e:
    fail(f"FBX import failed: {e}")

# --- Strip non-character objects ---

for obj in list(bpy.data.objects):
    if obj.type in ("CAMERA", "LIGHT", "EMPTY"):
        bpy.data.objects.remove(obj, do_unlink=True)

armatures = [o for o in bpy.data.objects if o.type == "ARMATURE"]
meshes = [o for o in bpy.data.objects if o.type == "MESH"]

if len(armatures) != 1:
    fail(f"Expected exactly 1 armature after cleanup, found {len(armatures)}.")
if len(meshes) != 1:
    fail(f"Expected exactly 1 mesh after cleanup, found {len(meshes)}.")

armature_obj = armatures[0]
mesh_obj = meshes[0]

has_skin_modifier = any(m.type == "ARMATURE" for m in mesh_obj.modifiers)
has_vertex_groups = len(mesh_obj.vertex_groups) > 0
if not has_skin_modifier or not has_vertex_groups:
    fail("Mesh is missing an Armature modifier or vertex groups going into export — refusing to export an unskinned 'source' GLB.")

# --- Strip imported animation actions (no junk clips per the source brief) ---

removed_actions = [a.name for a in bpy.data.actions]
for action in list(bpy.data.actions):
    bpy.data.actions.remove(action, do_unlink=True)

# --- Force rest pose on every pose bone, independent of whatever the
#     stripped action left the armature posed at. ---

bpy.context.view_layer.objects.active = armature_obj
for pbone in armature_obj.pose.bones:
    pbone.rotation_mode = "QUATERNION"
    pbone.location = (0.0, 0.0, 0.0)
    pbone.rotation_quaternion = (1.0, 0.0, 0.0, 0.0)
    pbone.scale = (1.0, 1.0, 1.0)

bpy.context.view_layer.update()

# ---------------------------------------------------------------------------
# Apply transforms — armature AND mesh together, in one operator call, so
# Blender reconciles the armature modifier's bind state with the applied
# mesh data instead of desyncing them.
# ---------------------------------------------------------------------------

bpy.ops.object.select_all(action="DESELECT")
armature_obj.select_set(True)
mesh_obj.select_set(True)
bpy.context.view_layer.objects.active = armature_obj

try:
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
except Exception as e:
    fail(f"transform_apply (rotation+scale) failed: {e}")

bpy.context.view_layer.update()

# ---------------------------------------------------------------------------
# Forward-axis correction — empirically proven, not assumed.
#
# tools/blender/verify-kael-facing.py rendered this exact export from two
# orthographic cameras positioned per Blender's own export_yup=True inverse
# axis mapping (gltf_Z = -blender_Y). The gltf +Z render showed Kael's face;
# the gltf -Z render showed the back of his head. WindArms' runtime
# convention is facing -Z (OperatorSilhouette, pipeline/sockets.ts). So this
# source, as originally rigged, faces backwards relative to that convention
# and needs a fixed 180 degree yaw around Blender's up axis (Z) — applied to
# the armature and mesh together, same transform_apply mechanism as the
# scale/rotation cleanup above, so weights/bind matrices stay intact.
# ---------------------------------------------------------------------------

armature_obj.rotation_euler.z += math.pi
bpy.context.view_layer.update()

bpy.ops.object.select_all(action="DESELECT")
armature_obj.select_set(True)
mesh_obj.select_set(True)
bpy.context.view_layer.objects.active = armature_obj
try:
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
except Exception as e:
    fail(f"transform_apply (180-degree facing correction) failed: {e}")

bpy.context.view_layer.update()

# ---------------------------------------------------------------------------
# Ground: feet (mesh min-Z in Blender's Z-up space -> Y=0 after glTF's
# Z-up -> Y-up export conversion) at the origin.
# ---------------------------------------------------------------------------

depsgraph = bpy.context.evaluated_depsgraph_get()
eval_obj = mesh_obj.evaluated_get(depsgraph)
corners = [eval_obj.matrix_world @ mathutils.Vector(c) for c in eval_obj.bound_box]
min_z = min(c.z for c in corners)
max_z = max(c.z for c in corners)
measured_height = max_z - min_z

armature_obj.location.z -= min_z
bpy.context.view_layer.update()

bpy.ops.object.select_all(action="DESELECT")
armature_obj.select_set(True)
mesh_obj.select_set(True)
bpy.context.view_layer.objects.active = armature_obj
try:
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
except Exception as e:
    fail(f"transform_apply (grounding location) failed: {e}")

bpy.context.view_layer.update()

# Re-measure post-grounding as a sanity check.
depsgraph = bpy.context.evaluated_depsgraph_get()
eval_obj = mesh_obj.evaluated_get(depsgraph)
corners = [eval_obj.matrix_world @ mathutils.Vector(c) for c in eval_obj.bound_box]
final_min_z = min(c.z for c in corners)
final_max_z = max(c.z for c in corners)
final_height = final_max_z - final_min_z

if abs(final_min_z) > 0.01:
    fail(f"Post-grounding min-Z is {final_min_z:.4f} m, expected ~0 — grounding did not apply cleanly.")

# --- Texture data sanity (report, don't guess) ---

texture_status = []
for mat in mesh_obj.data.materials:
    if not mat or not mat.use_nodes:
        continue
    for node in mat.node_tree.nodes:
        if node.type == "TEX_IMAGE" and node.image:
            img = node.image
            texture_status.append({
                "material": mat.name,
                "image": img.name,
                "filepath": img.filepath,
                "packed": img.packed_file is not None,
                "has_data": bool(img.has_data),
                "size": list(img.size) if img.has_data else None,
            })

# ---------------------------------------------------------------------------
# Visual verification render — front view, EEVEE, before export.
# ---------------------------------------------------------------------------

import os

os.makedirs(RENDER_OUT_DIR, exist_ok=True)

scene = bpy.context.scene
try:
    scene.render.engine = "BLENDER_EEVEE_NEXT"
except Exception:
    try:
        scene.render.engine = "BLENDER_EEVEE"
    except Exception:
        pass

sun_data = bpy.data.lights.new(name="_verify_sun", type="SUN")
sun_data.energy = 3.0
sun_obj = bpy.data.objects.new("_verify_sun", sun_data)
bpy.context.collection.objects.link(sun_obj)
sun_obj.rotation_euler = (math.radians(55), 0, math.radians(35))

fill_data = bpy.data.lights.new(name="_verify_fill", type="SUN")
fill_data.energy = 1.2
fill_obj = bpy.data.objects.new("_verify_fill", fill_data)
bpy.context.collection.objects.link(fill_obj)
fill_obj.rotation_euler = (math.radians(70), 0, math.radians(-140))

height = final_height if final_height > 0 else 1.83
cam_data = bpy.data.cameras.new("_verify_cam")
cam_data.lens = 50
cam_obj = bpy.data.objects.new("_verify_cam", cam_data)
bpy.context.collection.objects.link(cam_obj)

views = {
    "front": ((0, -height * 2.2, height * 0.95), (math.radians(88), 0, 0)),
    "side": ((height * 2.2, 0, height * 0.95), (math.radians(88), 0, math.radians(90))),
}

scene.render.resolution_x = 640
scene.render.resolution_y = 900
scene.render.film_transparent = False
scene.world = bpy.data.worlds.new("_verify_world")
scene.world.use_nodes = True
bg = scene.world.node_tree.nodes.get("Background")
if bg:
    bg.inputs[0].default_value = (0.5, 0.55, 0.6, 1.0)

render_paths = {}
for label, (loc, rot) in views.items():
    cam_obj.location = loc
    cam_obj.rotation_euler = rot
    scene.camera = cam_obj
    out_path = os.path.join(RENDER_OUT_DIR, f"kael-verify-{label}.png")
    scene.render.filepath = out_path
    try:
        bpy.ops.render.render(write_still=True)
        render_paths[label] = out_path
    except Exception as e:
        render_paths[label] = f"RENDER_FAILED: {e}"

for obj in (sun_obj, fill_obj, cam_obj):
    bpy.data.objects.remove(obj, do_unlink=True)

# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------

bpy.ops.object.select_all(action="DESELECT")
armature_obj.select_set(True)
mesh_obj.select_set(True)
bpy.context.view_layer.objects.active = armature_obj

os.makedirs(os.path.dirname(GLB_OUT_PATH), exist_ok=True)

try:
    bpy.ops.export_scene.gltf(
        filepath=GLB_OUT_PATH,
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

print("EXPORT_OK")
print(f"EXPORT_GLB:{GLB_OUT_PATH}")
print(f"EXPORT_HEIGHT_M:{final_height:.4f}")
print(f"EXPORT_MIN_Z:{final_min_z:.6f}")
print(f"EXPORT_REMOVED_ACTIONS:{removed_actions}")
print(f"EXPORT_TEXTURE_STATUS:{texture_status}")
print(f"EXPORT_RENDER_PATHS:{render_paths}")
