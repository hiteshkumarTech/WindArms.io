"""
WindArms — empirical forward-axis proof for Kael's exported source GLB
(Milestone 7 gate-finalization pass).

  "<BLENDER_EXE>" --background --python tools/blender/verify-kael-facing.py -- \
      <glb_path> <render_out_dir>

Imports the ALREADY-EXPORTED GLB (not the FBX) via Blender's standard glTF
importer, so this proves what actually ships, not what the pre-export
working scene looked like.

Axis mapping — derived, not assumed, and spelled out so it's auditable:
Blender's glTF exporter (export_yup=True, the default this project's own
make-kael-source-glb.py uses) maps Blender -> glTF as:
    gltf_X = blender_X,  gltf_Y = blender_Z,  gltf_Z = -blender_Y
The importer is the exact inverse:
    blender_X = gltf_X,  blender_Z = gltf_Y,  blender_Y = -gltf_Z
So: gltf_Z = -blender_Y. A camera parked at "gltf world +Z" therefore sits
at blender_Y = -gltf_Z = -(+D) = -D, i.e. on Blender's -Y axis. A camera at
"gltf world -Z" sits at Blender +Y. Both cameras look toward the origin
(the character), elevated to roughly chest height, orthographic.

This script does NOT decide which view shows the face — it renders two
clearly labeled images and leaves that determination to an actual look at
the pixels (by Claude or a human), per "the answer must be based on the
rendered result, not assumption." Does not modify the source GLB.
"""

import sys
import os
import math

import bpy
import mathutils


def parse_args():
    argv = sys.argv
    if "--" not in argv:
        raise SystemExit("Usage: blender --background --python verify-kael-facing.py -- <glb_path> <render_out_dir>")
    rest = argv[argv.index("--") + 1:]
    if len(rest) < 2:
        raise SystemExit("Usage: blender --background --python verify-kael-facing.py -- <glb_path> <render_out_dir>")
    return rest[0], rest[1]


GLB_PATH, RENDER_DIR = parse_args()
os.makedirs(RENDER_DIR, exist_ok=True)

# ---------------------------------------------------------------------------
# Import the shipped GLB, fresh scene, read-only.
# ---------------------------------------------------------------------------

bpy.ops.wm.read_factory_settings(use_empty=True)
try:
    bpy.ops.import_scene.gltf(filepath=GLB_PATH)
except Exception as e:
    print(f"IMPORT_FAILED: {e}")
    sys.exit(1)

meshes = [o for o in bpy.data.objects if o.type == "MESH"]
armatures = [o for o in bpy.data.objects if o.type == "ARMATURE"]
if not meshes:
    print("VERIFY_FAILED: no mesh found in imported GLB")
    sys.exit(1)

primary_mesh = max(meshes, key=lambda m: len(m.data.vertices))

depsgraph = bpy.context.evaluated_depsgraph_get()
eval_obj = primary_mesh.evaluated_get(depsgraph)
corners = [eval_obj.matrix_world @ mathutils.Vector(c) for c in eval_obj.bound_box]
min_z = min(c.z for c in corners)
max_z = max(c.z for c in corners)
height = max_z - min_z
center_x = sum(c.x for c in corners) / 8
center_y = sum(c.y for c in corners) / 8

print(f"IMPORTED_HEIGHT_M:{height:.4f}")
print(f"IMPORTED_MIN_Z:{min_z:.6f}")

# ---------------------------------------------------------------------------
# Floor grid — procedural checker, no external texture dependency.
# ---------------------------------------------------------------------------

bpy.ops.mesh.primitive_plane_add(size=height * 6, location=(center_x, center_y, min_z))
floor = bpy.context.active_object
floor.name = "_verify_floor"

grid_mat = bpy.data.materials.new(name="_verify_grid")
grid_mat.use_nodes = True
nt = grid_mat.node_tree
nt.nodes.clear()
out = nt.nodes.new("ShaderNodeOutputMaterial")
diffuse = nt.nodes.new("ShaderNodeBsdfDiffuse")
checker = nt.nodes.new("ShaderNodeTexChecker")
checker.inputs["Scale"].default_value = 10.0
checker.inputs["Color1"].default_value = (0.72, 0.74, 0.78, 1.0)
checker.inputs["Color2"].default_value = (0.45, 0.47, 0.52, 1.0)
nt.links.new(checker.outputs["Color"], diffuse.inputs["Color"])
nt.links.new(diffuse.outputs["BSDF"], out.inputs["Surface"])
floor.data.materials.append(grid_mat)

# ---------------------------------------------------------------------------
# Lighting — neutral, flat, matches the earlier verification-render setup.
# ---------------------------------------------------------------------------

sun_data = bpy.data.lights.new(name="_verify_sun", type="SUN")
sun_data.energy = 3.0
sun_obj = bpy.data.objects.new("_verify_sun", sun_data)
bpy.context.collection.objects.link(sun_obj)
sun_obj.rotation_euler = (math.radians(55), 0, math.radians(35))

fill_data = bpy.data.lights.new(name="_verify_fill", type="SUN")
fill_data.energy = 1.4
fill_obj = bpy.data.objects.new("_verify_fill", fill_data)
bpy.context.collection.objects.link(fill_obj)
fill_obj.rotation_euler = (math.radians(70), 0, math.radians(-140))

scene = bpy.context.scene
try:
    scene.render.engine = "BLENDER_EEVEE_NEXT"
except Exception:
    try:
        scene.render.engine = "BLENDER_EEVEE"
    except Exception:
        pass
scene.render.resolution_x = 720
scene.render.resolution_y = 960
scene.world = bpy.data.worlds.new("_verify_world")
scene.world.use_nodes = True
bg = scene.world.node_tree.nodes.get("Background")
if bg:
    bg.inputs[0].default_value = (0.55, 0.6, 0.65, 1.0)

# ---------------------------------------------------------------------------
# Two orthographic cameras, positioned per the derived axis mapping above.
# Both look toward the character (origin-ish), elevated to chest height.
# ---------------------------------------------------------------------------

eye_z = min_z + height * 0.55
dist = height * 2.6

def make_ortho_camera(name, location, target):
    cam_data = bpy.data.cameras.new(name)
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = height * 1.7
    cam_obj = bpy.data.objects.new(name, cam_data)
    bpy.context.collection.objects.link(cam_obj)
    cam_obj.location = location
    direction = (mathutils.Vector(target) - mathutils.Vector(location)).normalized()
    cam_obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    return cam_obj

target = (center_x, center_y, eye_z)

# gltf_Z = -blender_Y  =>  camera at gltf +Z sits at blender_Y = -dist
cam_plus_z = make_ortho_camera("_verify_cam_plus_z", (center_x, center_y - dist, eye_z), target)
# camera at gltf -Z sits at blender_Y = +dist
cam_minus_z = make_ortho_camera("_verify_cam_minus_z", (center_x, center_y + dist, eye_z), target)

renders = {}
for label, cam in (("plus-z", cam_plus_z), ("minus-z", cam_minus_z)):
    scene.camera = cam
    out_path = os.path.join(RENDER_DIR, f"kael-view-from-{label}.png")
    scene.render.filepath = out_path
    try:
        bpy.ops.render.render(write_still=True)
        renders[label] = out_path
        print(f"RENDERED_{label.upper().replace('-', '_')}:{out_path}")
    except Exception as e:
        print(f"RENDER_FAILED_{label}: {e}")

print("VERIFY_OK")
print(f"VERIFY_HEIGHT_M:{height:.4f}")
print(f"VERIFY_RENDERS:{renders}")
print("AXIS_MAPPING_NOTE: Blender -Y camera == gltf +Z viewpoint (kael-view-from-plus-z.png); Blender +Y camera == gltf -Z viewpoint (kael-view-from-minus-z.png). Derived from Blender's own export_yup=True inverse mapping, not assumed.")
