"""Align a raw dragon GLB into the canonical game frame and render measured views.

Canonical frame (Blender): facing -Y, up +Z, left wing +X, feet on z=0,
symmetry plane on x=0, body centred on y=0.

Usage: blender -b -P tools/align_dragon.py -- <raw.glb> <out.blend> <preview_prefix> [flip]
  flip : pass "flip" to turn the dragon 180 degrees if head detection was wrong.

Writes <preview_prefix>_side.png / _top.png / _front.png, each 1000px covering
2.4 units, centred on (0, 0, 0.6). Grid: thin line every 0.1, bold every 0.5,
red at 0.
"""
import sys
import math
import bpy
import numpy as np
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index("--") + 1:]
src, dst, prefix = argv[0], argv[1], argv[2]
flip = "flip" in argv[3:]
extra_yaw = 0.0
for a_ in argv[3:]:
    if a_.startswith("yaw="):
        extra_yaw = math.radians(float(a_[4:]))

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]

# join everything into one mesh object with applied transforms
bpy.ops.object.select_all(action="DESELECT")
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1:
    bpy.ops.object.join()
obj = bpy.context.view_layer.objects.active
bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for o in list(bpy.context.scene.objects):
    if o != obj:
        bpy.data.objects.remove(o, do_unlink=True)
obj.name = "Dragon"

n = len(obj.data.vertices)
co = np.empty(n * 3, dtype=np.float64)
obj.data.vertices.foreach_get("co", co)
co = co.reshape(n, 3)
pts = np.unique(np.round(co, 4), axis=0)


def sym_score(theta, offset, p):
    c, s = math.cos(theta), math.sin(theta)
    # across-plane coordinate a, along-plane coordinate t
    a = p[:, 0] * c + p[:, 1] * s - offset
    t = -p[:, 0] * s + p[:, 1] * c
    z = p[:, 2]
    bins = 24
    rng = [[0, 1.2], [-1.3, 1.3], [-1.3, 1.3]]
    hp, _ = np.histogramdd(np.stack([a[a > 0], t[a > 0], z[a > 0]], 1), bins=bins, range=rng)
    hn, _ = np.histogramdd(np.stack([-a[a < 0], t[a < 0], z[a < 0]], 1), bins=bins, range=rng)
    return np.minimum(hp, hn).sum() / max(np.maximum(hp, hn).sum(), 1)


centre = pts.mean(axis=0)
p0 = pts - centre
best = (-1, 0, 0)
for deg in range(0, 180, 2):
    th = math.radians(deg)
    for off in np.linspace(-0.3, 0.3, 31):
        sc = sym_score(th, off, p0)
        if sc > best[0]:
            best = (sc, th, off)
# refine
sc0, th0, off0 = best
for dth in np.linspace(-2, 2, 17):
    th = th0 + math.radians(dth)
    for off in np.linspace(off0 - 0.02, off0 + 0.02, 9):
        sc = sym_score(th, off, p0)
        if sc > best[0]:
            best = (sc, th, off)
score, theta, offset = best
theta += extra_yaw
print("SYMMETRY score=%.3f theta=%.1fdeg offset=%.3f" % (score, math.degrees(theta), offset))

# rotate so the across-plane axis becomes X
c, s = math.cos(theta), math.sin(theta)
a = p0[:, 0] * c + p0[:, 1] * s - offset
t = -p0[:, 0] * s + p0[:, 1] * c
z = p0[:, 2]
# head side = half (along t) with more points in the upper part
zmid = (z.min() + z.max()) / 2
tmid = (t.min() + t.max()) / 2
up_hi = np.sum((z > zmid) & (t > tmid))
up_lo = np.sum((z > zmid) & (t <= tmid))
head_positive_t = up_hi >= up_lo
print("HEAD upper counts +t=%d -t=%d" % (up_hi, up_lo))
# we want head at -Y. If head is at +t, rotate 180 about Z (x->-x, y->-y)
sign = -1.0 if head_positive_t else 1.0
if flip:
    sign = -sign

M = Matrix((
    (c * sign, s * sign, 0, 0),
    (-s * sign, c * sign, 0, 0),
    (0, 0, 1, 0),
    (0, 0, 0, 1),
))
T0 = Matrix.Translation(Vector((-centre[0], -centre[1], -centre[2])))
Toff = Matrix.Translation(Vector((-offset * sign, 0, 0)))
obj.data.transform(Toff @ M @ T0)
obj.data.update()

co = np.empty(n * 3, dtype=np.float64)
obj.data.vertices.foreach_get("co", co)
co = co.reshape(n, 3)
ymid = (co[:, 1].min() + co[:, 1].max()) / 2
zmin = co[:, 2].min()
obj.data.transform(Matrix.Translation(Vector((0, -ymid, -zmin))))
obj.data.update()
obj.data.vertices.foreach_get("co", co.ravel())
co = co.reshape(n, 3)
print("BBOX x[%.3f %.3f] y[%.3f %.3f] z[%.3f %.3f]" % (
    co[:, 0].min(), co[:, 0].max(), co[:, 1].min(), co[:, 1].max(), co[:, 2].min(), co[:, 2].max()))

bpy.ops.wm.save_as_mainfile(filepath=dst)

# ---------- measured orthographic previews ----------
scene = bpy.context.scene
scene.render.engine = "BLENDER_WORKBENCH"
scene.display.shading.light = "FLAT"
scene.display.shading.color_type = "TEXTURE"
scene.view_settings.view_transform = "Standard"
RES, W = 1000, 2.4
scene.render.resolution_x = RES
scene.render.resolution_y = RES
world = bpy.data.worlds.new("w")
scene.world = world
world.color = (0.75, 0.78, 0.82)
cam_data = bpy.data.cameras.new("cam")
cam_data.type = "ORTHO"
cam_data.ortho_scale = W
cam = bpy.data.objects.new("cam", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
C = Vector((0, 0, 0.6))
views = {
    # name: (camera position offset, euler, horizontal centre, vertical centre)
    "side": (Vector((5, 0, 0)), (math.radians(90), 0, math.radians(90)), 0.0, 0.6),   # h=+Y, v=+Z
    "top": (Vector((0, 0, 5)), (0, 0, 0), 0.0, 0.0),                                   # h=+X, v=+Y
    "front": (Vector((0, -5, 0)), (math.radians(90), 0, 0), 0.0, 0.6),                 # h=+X, v=+Z
}


def draw_grid(path, hc, vc):
    img = bpy.data.images.load(path)
    px = np.array(img.pixels[:], dtype=np.float32).reshape(RES, RES, 4)
    k0 = int(math.floor((hc - W / 2) * 10))
    k1 = int(math.ceil((hc + W / 2) * 10))
    for k in range(k0, k1 + 1):
        u = int(round(RES / 2 + (k / 10 - hc) / W * RES))
        if 0 <= u < RES:
            if k == 0:
                px[:, max(u - 1, 0):u + 2, :3] = (1, 0, 0)
            elif k % 5 == 0:
                px[:, u:u + 2, :3] = (0.1, 0.1, 0.5)
            else:
                px[:, u, :3] = px[:, u, :3] * 0.6 + 0.4 * np.array((0.3, 0.3, 0.3))
    k0 = int(math.floor((vc - W / 2) * 10))
    k1 = int(math.ceil((vc + W / 2) * 10))
    for k in range(k0, k1 + 1):
        v = int(round(RES / 2 + (k / 10 - vc) / W * RES))  # pixel rows are bottom-up
        if 0 <= v < RES:
            if k == 0:
                px[max(v - 1, 0):v + 2, :, :3] = (1, 0, 0)
            elif k % 5 == 0:
                px[v:v + 2, :, :3] = (0.1, 0.1, 0.5)
            else:
                px[v, :, :3] = px[v, :, :3] * 0.6 + 0.4 * np.array((0.3, 0.3, 0.3))
    img.pixels = px.ravel().tolist()
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()


for name, (off, eul, hc, vc) in views.items():
    centre_pt = Vector((0, 0, 0.6)) if name != "top" else Vector((0, 0, 0))
    cam.location = centre_pt + off
    cam.rotation_euler = eul
    path = "%s_%s.png" % (prefix, name)
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    draw_grid(path, hc, vc)
print("DONE")
