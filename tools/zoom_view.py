"""Zoomed, measured orthographic view of an aligned dragon.

Usage: blender -b <aligned.blend> -P tools/zoom_view.py -- <out.png> <side|front|top> <centre_h> <centre_v> <width>
side: h=+Y v=+Z ; front: h=+X v=+Z ; top: h=+X v=+Y.
Grid: thin line every 0.05, bold every 0.1 (labelled by position: the red lines mark centre_h / centre_v).
"""
import sys
import math
import bpy
import numpy as np
from mathutils import Vector

a = sys.argv[sys.argv.index("--") + 1:]
out, view, W = a[0], a[1], float(a[4])
if a[2].startswith("bone:"):
    bpy.context.view_layer.update()
    rig = [o for o in bpy.data.objects if o.type == "ARMATURE"][0]
    pb = rig.pose.bones[a[2][5:]]
    mid = rig.matrix_world @ ((pb.head + pb.tail) / 2)
    ch = mid.y if view == "side" else mid.x
    cv = mid.y if view == "top" else mid.z
    print("CENTRE", round(mid.x, 3), round(mid.y, 3), round(mid.z, 3))
else:
    ch, cv = float(a[2]), float(a[3])
scene = bpy.context.scene
scene.render.engine = "BLENDER_WORKBENCH"
scene.display.shading.light = "STUDIO"
scene.display.shading.color_type = "TEXTURE"
scene.view_settings.view_transform = "Standard"
RES = 1000
scene.render.resolution_x = RES
scene.render.resolution_y = RES
w = bpy.data.worlds.new("w")
scene.world = w
w.color = (0.75, 0.78, 0.82)
cd = bpy.data.cameras.new("zc")
cd.type = "ORTHO"
cd.ortho_scale = W
cam = bpy.data.objects.new("zc", cd)
scene.collection.objects.link(cam)
scene.camera = cam
if view == "side":
    cam.location = Vector((5, ch, cv))
    cam.rotation_euler = (math.radians(90), 0, math.radians(90))
elif view == "front":
    cam.location = Vector((ch, -5, cv))
    cam.rotation_euler = (math.radians(90), 0, 0)
else:
    cam.location = Vector((ch, cv, 5))
    cam.rotation_euler = (0, 0, 0)
scene.render.filepath = out
bpy.ops.render.render(write_still=True)
img = bpy.data.images.load(out)
px = np.array(img.pixels[:], dtype=np.float32).reshape(RES, RES, 4)
for axis, c in ((0, ch), (1, cv)):
    k0 = int(math.floor((c - W / 2) * 20))
    k1 = int(math.ceil((c + W / 2) * 20))
    for k in range(k0, k1 + 1):
        p = int(round(RES / 2 + (k / 20 - c) / W * RES))
        if not (0 <= p < RES):
            continue
        bold = k % 2 == 0
        col = np.array((0.1, 0.1, 0.5)) if bold else np.array((0.35, 0.35, 0.35))
        if axis == 0:
            px[:, p, :3] = px[:, p, :3] * (0.3 if bold else 0.7) + col * (0.7 if bold else 0.3)
        else:
            px[p, :, :3] = px[p, :, :3] * (0.3 if bold else 0.7) + col * (0.7 if bold else 0.3)
px[:, RES // 2 - 1:RES // 2 + 1, :3] = (1, 0, 0)
px[RES // 2 - 1:RES // 2 + 1, :, :3] = (1, 0, 0)
img.pixels = px.ravel().tolist()
img.filepath_raw = out
img.file_format = "PNG"
img.save()
print("DONE")
