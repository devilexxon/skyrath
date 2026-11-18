"""Render preview views of a GLB with headless Blender.

Usage: blender -b -P tools/render_views.py -- <model.glb> <out_prefix>
Writes <out_prefix>_front34.png, _side.png, _top.png, _back34.png and prints mesh stats.
"""
import sys
import math
import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
src, out_prefix = argv[0], argv[1]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
# optional: tex=<image> swaps the model's texture (to preview a skin)
for x in argv[2:]:
    if x.startswith("tex="):
        im = bpy.data.images.load(x[4:])
        for m in bpy.data.materials:
            if m.use_nodes:
                for n in m.node_tree.nodes:
                    if n.type == "TEX_IMAGE": n.image = im

meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
lo = Vector((1e9, 1e9, 1e9))
hi = Vector((-1e9, -1e9, -1e9))
tris = 0
for o in meshes:
    o.data.calc_loop_triangles()
    tris += len(o.data.loop_triangles)
    for c in o.bound_box:
        w = o.matrix_world @ Vector(c)
        lo = Vector((min(lo.x, w.x), min(lo.y, w.y), min(lo.z, w.z)))
        hi = Vector((max(hi.x, w.x), max(hi.y, w.y), max(hi.z, w.z)))
center = (lo + hi) / 2
size = hi - lo
radius = max(size) * 0.5
print("STATS meshes=%d tris=%d size=(%.3f, %.3f, %.3f) materials=%d images=%d" % (
    len(meshes), tris, size.x, size.y, size.z, len(bpy.data.materials), len(bpy.data.images)))

scene = bpy.context.scene
scene.render.engine = "BLENDER_WORKBENCH"
scene.display.shading.light = "STUDIO"
scene.display.shading.color_type = "TEXTURE"
scene.render.resolution_x = 720
scene.render.resolution_y = 720
scene.render.film_transparent = False
world = bpy.data.worlds.new("w")
scene.world = world
world.color = (0.55, 0.6, 0.68)

cam_data = bpy.data.cameras.new("cam")
cam = bpy.data.objects.new("cam", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
cam_data.lens = 50

views = {
    "front34": (math.radians(35), math.radians(20)),
    "side": (math.radians(90), math.radians(5)),
    "top": (math.radians(35), math.radians(80)),
    "back34": (math.radians(215), math.radians(20)),
}
scene.view_settings.view_transform = "Standard"
scene.display.shading.light = "FLAT"
dist = radius * 2.7
for name, (az, el) in views.items():
    pos = center + Vector((math.cos(az) * math.cos(el), math.sin(az) * math.cos(el), math.sin(el))) * dist
    cam.location = pos
    cam.rotation_euler = (center - pos).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = "%s_%s.png" % (out_prefix, name)
    bpy.ops.render.render(write_still=True)
print("DONE")
