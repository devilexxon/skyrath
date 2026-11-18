"""Rig, skin and animate an aligned dragon, export a game-ready GLB and a contact sheet.

Usage: blender -b <aligned.blend> -P tools/rig_dragon.py -- <rig.json> <out.glb> <sheet.png> [pose_only]

Frame: facing -Y, up +Z, dragon's left = +X. Bone names ending _L are on +X.
Rotations in the config / clips are world-axis rotations applied on top of the
parent's motion, in list order.
"""
import sys
import json
import math
import heapq
import struct
import bpy
import numpy as np
from mathutils import Vector, Quaternion, Matrix

argv = sys.argv[sys.argv.index("--") + 1:]
cfg_path, out_glb, sheet_path = argv[0], argv[1], argv[2]
pose_only = "pose_only" in argv[3:]
ONLY = None
SAVE_BLEND = None
for a_ in argv[3:]:
    if a_.startswith("only="):
        ONLY = a_[5:]
    if a_.startswith("save="):
        SAVE_BLEND = a_[5:]
cfg = json.load(open(cfg_path))
PIVOT = Vector(cfg["pivot"])
FPS = 30
JAW = cfg.get("jaw_open_scale", 1.0)
AX = {"X": Vector((1, 0, 0)), "Y": Vector((0, 1, 0)), "Z": Vector((0, 0, 1))}

obj = bpy.data.objects["Dragon"]
mesh = obj.data
mesh.transform(Matrix.Translation(-PIVOT))
mesh.update()

# ------------------------------------------------------------------ skeleton
arm_data = bpy.data.armatures.new("Rig")
arm = bpy.data.objects.new("Rig", arm_data)
bpy.context.scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="EDIT")
eb = {}
for name, head, tail, parent, deform in cfg["bones"]:
    b = arm_data.edit_bones.new(name)
    b.head = Vector(head) - PIVOT
    b.tail = Vector(tail) - PIVOT
    if parent:
        b.parent = eb[parent]
    b.use_deform = deform
    eb[name] = b
bpy.ops.object.mode_set(mode="OBJECT")
deform_bones = [b[0] for b in cfg["bones"] if b[4]]
segs = {b[0]: (np.array(b[1]) - np.array(cfg["pivot"]), np.array(b[2]) - np.array(cfg["pivot"]))
        for b in cfg["bones"] if b[4]}

# ------------------------------------------------------------------ weights
n = len(mesh.vertices)
co = np.empty(n * 3)
mesh.vertices.foreach_get("co", co)
co = co.reshape(n, 3)
keys = np.round(co, 4)
uniq, inv = np.unique(keys, axis=0, return_inverse=True)
inv = inv.reshape(-1)
m = len(uniq)
ne = len(mesh.edges)
ev = np.empty(ne * 2, dtype=np.int64)
mesh.edges.foreach_get("vertices", ev)
ev = inv[ev].reshape(ne, 2)
ev = ev[ev[:, 0] != ev[:, 1]]
elen = np.linalg.norm(uniq[ev[:, 0]] - uniq[ev[:, 1]], axis=1)
adj = [[] for _ in range(m)]
for (a, b), L in zip(ev.tolist(), elen.tolist()):
    adj[a].append((b, L))
    adj[b].append((a, L))


def geodesic(seeds):
    dist = [math.inf] * m
    heap = []
    for v, d in seeds:
        if d < dist[v]:
            dist[v] = d
            heapq.heappush(heap, (d, v))
    while heap:
        d, v = heapq.heappop(heap)
        if d > dist[v]:
            continue
        for w, L in adj[v]:
            nd = d + L
            if nd < dist[w]:
                dist[w] = nd
                heapq.heappush(heap, (nd, w))
    return np.array(dist)


D = np.empty((m, len(deform_bones)))
E = np.empty((m, len(deform_bones)))
for j, name in enumerate(deform_bones):
    a, b = segs[name]
    seeds = []
    for t in np.linspace(0.0, 1.0, 12):
        s = a + (b - a) * t
        d = np.linalg.norm(uniq - s, axis=1)
        for v in np.argsort(d)[:6]:
            seeds.append((int(v), float(d[v])))
    D[:, j] = geodesic(seeds)
    ab = b - a
    tt = np.clip(((uniq - a) @ ab) / max(ab @ ab, 1e-12), 0, 1)
    E[:, j] = np.linalg.norm(uniq - (a + np.outer(tt, ab)), axis=1)
unreach = ~np.isfinite(D).all(axis=1)
D[unreach] = E[unreach] * 1.5
print("WELDED verts=%d edges=%d unreachable=%d" % (m, len(ev), int(unreach.sum())))

W = 1.0 / np.power(D + 0.015, 2.5)
# keep 3 strongest
idx = np.argsort(-W, axis=1)
mask = np.zeros_like(W, dtype=bool)
np.put_along_axis(mask, idx[:, :3], True, axis=1)
W = np.where(mask, W, 0.0)
W /= W.sum(axis=1, keepdims=True)
for _ in range(3):
    acc = np.zeros_like(W)
    cnt = np.zeros(m)
    np.add.at(acc, ev[:, 0], W[ev[:, 1]])
    np.add.at(acc, ev[:, 1], W[ev[:, 0]])
    np.add.at(cnt, ev[:, 0], 1)
    np.add.at(cnt, ev[:, 1], 1)
    has = cnt > 0
    W[has] = 0.5 * W[has] + 0.5 * acc[has] / cnt[has, None]
idx = np.argsort(-W, axis=1)
mask = np.zeros_like(W, dtype=bool)
np.put_along_axis(mask, idx[:, :4], True, axis=1)
W = np.where(mask & (W > 0.02), W, 0.0)
W /= W.sum(axis=1, keepdims=True)

# optional hard regions: vertices inside a box belong fully to one bone, and that bone gets nothing outside it
for bname, box in cfg.get("weight_boxes", {}).items():
    j = deform_bones.index(bname)
    lo_b = np.array(box[0]) - np.array(cfg["pivot"])
    hi_b = np.array(box[1]) - np.array(cfg["pivot"])
    inside = np.all((uniq >= lo_b) & (uniq <= hi_b), axis=1)
    fb = deform_bones.index(cfg.get("weight_box_fallback", {}).get(bname, "head"))
    W[inside, :] = 0.0
    W[inside, j] = 1.0
    W[~inside, j] = 0.0
    dead = W.sum(axis=1) < 1e-6
    W[dead, fb] = 1.0
    W /= W.sum(axis=1, keepdims=True)
    print("BOX %s inside=%d" % (bname, int(inside.sum())))

for j, name in enumerate(deform_bones):
    g = obj.vertex_groups.new(name=name)
    col = W[inv, j]
    nz = np.nonzero(col)[0]
    for vi in nz.tolist():
        g.add([vi], float(col[vi]), "REPLACE")
    print("  %-9s verts=%d" % (name, len(nz)))
obj.parent = arm
mod = obj.modifiers.new("Armature", "ARMATURE")
mod.object = arm

# ------------------------------------------------------------------ posing
order = [b[0] for b in cfg["bones"]]
parent_of = {b[0]: b[3] for b in cfg["bones"]}
rest_q = {name: arm.data.bones[name].matrix_local.to_quaternion() for name in order}
BASE = cfg["flight_pose"]


def quat_of(rots):
    q = Quaternion()
    for axis, deg in rots:
        q = Quaternion(AX[axis], math.radians(deg)) @ q
    return q


def apply_pose(extra, root_offset=(0, 0, 0)):
    """extra: {bone: [(axis, deg), ...]} added after the flight base pose."""
    Dq = {}
    for name in order:
        rots = (list(BASE.get(name, [])) if (ONLY is None or name == ONLY) else []) + list(extra.get(name, []))
        par = parent_of[name]
        Dp = Dq[par] if par else Quaternion()
        Db = quat_of(rots) @ Dp
        Dq[name] = Db
        pb = arm.pose.bones[name]
        pb.rotation_mode = "QUATERNION"
        pb.rotation_quaternion = rest_q[name].inverted() @ Dp.inverted() @ Db @ rest_q[name]
    arm.pose.bones["root"].location = rest_q["root"].inverted() @ Vector(root_offset)


def S(t, phase=0.0):
    return math.sin(2 * math.pi * (t + phase))


def clip_fly(t):
    f1 = 6 + 30 * S(t)
    f2 = 24 * S(t, -0.18)
    p = {
        "wing_L_1": [("Y", -f1)], "wing_R_1": [("Y", f1)],
        "wing_L_2": [("Y", -f2)], "wing_R_2": [("Y", f2)],
        "chest": [("X", 2.5 * S(t, 0.5))],
        "neck": [("X", 3 * S(t, 0.3))],
        "head": [("X", -3 * S(t, 0.3))],
        "tail_1": [("X", 3 * S(t, 0.45))], "tail_2": [("X", 5 * S(t, 0.35))],
        "tail_3": [("X", 7 * S(t, 0.25))], "tail_4": [("X", 9 * S(t, 0.15))],
    }
    return p, (0, 0, -0.035 * S(t))


def clip_glide(t):
    f = 10 + 3 * S(t)
    p = {
        "wing_L_1": [("Y", -f)], "wing_R_1": [("Y", f)],
        "wing_L_2": [("Y", 2 * S(t, -0.2))], "wing_R_2": [("Y", -2 * S(t, -0.2))],
        "tail_1": [("Z", 3 * S(t))], "tail_2": [("Z", 5 * S(t, -0.12))],
        "tail_3": [("Z", 7 * S(t, -0.24))], "tail_4": [("Z", 9 * S(t, -0.36))],
        "neck": [("Z", 2 * S(t, 0.25))],
    }
    return p, (0, 0, 0.012 * S(t))


def clip_boost(t):
    f = 4 + 7 * S(t)
    p = {
        "wing_L_1": [("Y", -f), ("Z", 30)], "wing_R_1": [("Y", f), ("Z", -30)],
        "wing_L_2": [("Z", 25)], "wing_R_2": [("Z", -25)],
        "neck": [("X", 10)], "head": [("X", -6)],
        "tail_2": [("X", 3 * S(t, 0.3))], "tail_3": [("X", 5 * S(t, 0.2))], "tail_4": [("X", 7 * S(t, 0.1))],
    }
    return p, (0, 0, 0.008 * S(t))


def clip_attack(t):
    # wind up (0-0.3), strike (0.3-0.5), recover (0.5-1)
    if t < 0.3:
        k = -math.sin(t / 0.3 * math.pi / 2)
    elif t < 0.5:
        k = -1 + 2 * math.sin((t - 0.3) / 0.2 * math.pi / 2)
    else:
        k = math.cos((t - 0.5) / 0.5 * math.pi / 2)
    p = {
        "neck": [("X", 16 * k)], "head": [("X", 10 * k)], "chest": [("X", 5 * k)],
        "jaw": [("X", 62 * JAW * clamp01(k * 1.5))],
        "wing_L_1": [("Y", -(10 - 14 * k))], "wing_R_1": [("Y", 10 - 14 * k)],
        "wing_L_2": [("Y", 8 * k)], "wing_R_2": [("Y", -8 * k)],
        "tail_2": [("X", -6 * k)], "tail_3": [("X", -9 * k)], "tail_4": [("X", -12 * k)],
    }
    return p, (0, -0.05 * k, 0)


def clamp01(x):
    return max(0.0, min(1.0, x))


def ease(x):
    x = clamp01(x)
    return x * x * (3 - 2 * x)


def clip_ultimate(t):
    """Wind up, spin twice, flare the wings, then lunge forward for the big breath."""
    a = ease(t / 0.18) * (1 - ease((t - 0.62) / 0.1))          # tucked while spinning
    spin = 720 * ease((t - 0.14) / 0.5)
    f = ease((t - 0.62) / 0.1) * (1 - ease((t - 0.92) / 0.08))  # wings flared
    if t < 0.64:
        k = 0.0
    elif t < 0.74:
        k = -ease((t - 0.64) / 0.1)                              # rear back
    elif t < 0.80:
        k = -1 + 2 * ease((t - 0.74) / 0.06)                     # strike
    elif t < 0.92:
        k = 1.0
    else:
        k = 1 - ease((t - 0.92) / 0.08)
    p = {
        "root": [("Y", spin)],
        "wing_L_1": [("Z", 40 * a), ("Y", -28 * f)], "wing_R_1": [("Z", -40 * a), ("Y", 28 * f)],
        "wing_L_2": [("Z", 32 * a), ("Y", -10 * f)], "wing_R_2": [("Z", -32 * a), ("Y", 10 * f)],
        "chest": [("X", 7 * k)],
        "jaw": [("X", 68 * JAW * clamp01(k * 2))],
        "neck": [("X", -12 * a + 20 * k)],
        "head": [("X", 6 * a + 12 * k)],
        "tail_1": [("X", -5 * k)], "tail_2": [("X", -8 * k)],
        "tail_3": [("X", -11 * k)], "tail_4": [("X", -14 * k)],
    }
    lift = 0.14 * math.sin(math.pi * clamp01((t - 0.1) / 0.65))
    return p, (0, 0.07 * max(k, 0.0) - 0.05 * max(-k, 0.0), lift)


def clip_hit(t):
    k = math.sin(math.pi * t)
    p = {
        "root": [("Z", 7 * k)],
        "chest": [("X", -10 * k)], "neck": [("X", -14 * k)], "head": [("X", -8 * k)],
        "wing_L_1": [("Y", -20 * k)], "wing_R_1": [("Y", 12 * k)],
        "tail_2": [("X", 8 * k)], "tail_3": [("X", 12 * k)], "tail_4": [("X", 16 * k)],
    }
    return p, (0, 0.07 * k, 0.02 * k)


def clip_death(t):
    e = ease(t)
    p = {
        "root": [("X", 55 * e), ("Y", 150 * e)],
        "wing_L_1": [("Y", -55 * e), ("Z", 20 * e)], "wing_R_1": [("Y", 55 * e), ("Z", -20 * e)],
        "wing_L_2": [("Y", -20 * e)], "wing_R_2": [("Y", 20 * e)],
        "neck": [("X", -25 * e)], "head": [("X", -10 * e)], "jaw": [("X", 40 * JAW * e)],
        "tail_1": [("X", -10 * e)], "tail_2": [("X", -14 * e)],
        "tail_3": [("X", -18 * e)], "tail_4": [("X", -22 * e)],
    }
    return p, (0, 0, -0.55 * e * e)


def clip_roar(t):
    u = ease(t / 0.25) * ease((1 - t) / 0.2)
    shake = 8 * math.sin(2 * math.pi * 6 * t) * u
    p = {
        "root": [("X", -32 * u)],
        "wing_L_1": [("Y", -22 * u)], "wing_R_1": [("Y", 22 * u)],
        "wing_L_2": [("Y", -8 * u)], "wing_R_2": [("Y", 8 * u)],
        "neck": [("X", -22 * u)], "head": [("X", 18 * u), ("Z", shake)],
        "jaw": [("X", 65 * JAW * u)],
        "tail_2": [("X", 8 * u)], "tail_3": [("X", 10 * u)], "tail_4": [("X", 12 * u)],
    }
    return p, (0, 0, 0.05 * u)


def make_roll(sign):
    def clip_roll(t):
        w = math.sin(math.pi * t)
        p = {
            "root": [("Y", sign * 360 * ease(t))],
            "wing_L_1": [("Z", 30 * w)], "wing_R_1": [("Z", -30 * w)],
            "wing_L_2": [("Z", 25 * w)], "wing_R_2": [("Z", -25 * w)],
        }
        return p, (0, 0, 0)
    return clip_roll


CLIPS = [("fly", clip_fly, 0.9, True), ("glide", clip_glide, 3.0, True),
         ("boost", clip_boost, 0.5, True), ("attack", clip_attack, 0.7, False),
         ("ultimate", clip_ultimate, 2.4, False), ("hit", clip_hit, 0.4, False),
         ("death", clip_death, 1.6, False), ("roar", clip_roar, 1.6, False),
         ("roll_L", make_roll(1), 0.55, False), ("roll_R", make_roll(-1), 0.55, False)]
SHEET_FRACS = {"fly": (0.0, 0.27, 0.52, 0.77), "attack": (0.0, 0.27, 0.52, 0.77),
               "ultimate": (0.12, 0.4, 0.72, 0.85), "death": (0.3, 0.6, 0.85, 1.0),
               "roar": (0.5,), "hit": (0.5,), "roll_L": (0.35,), "roll_R": (0.35,)}

# ------------------------------------------------------------------ bake
arm.animation_data_create()
actions = []
if not pose_only:
    for cname, fn, seconds, loop in CLIPS:
        act = bpy.data.actions.new(cname)
        act.use_fake_user = True
        arm.animation_data.action = act
        frames = max(int(round(seconds * FPS)), 2)
        prev = {}
        for f in range(frames + 1):
            t = f / frames
            p, off = fn(t if (loop or f < frames) else 1.0)
            apply_pose(p, off)
            for name in order:
                pb = arm.pose.bones[name]
                q = pb.rotation_quaternion.copy()
                if name in prev and prev[name].dot(q) < 0:
                    q.negate()
                    pb.rotation_quaternion = q
                prev[name] = q
                pb.keyframe_insert("rotation_quaternion", frame=f + 1)
            arm.pose.bones["root"].keyframe_insert("location", frame=f + 1)
        actions.append(act)
        print("BAKED %s frames=%d" % (cname, frames))

# ------------------------------------------------------------------ contact sheet
scene = bpy.context.scene
scene.render.engine = "BLENDER_WORKBENCH"
scene.display.shading.light = "FLAT"
scene.display.shading.color_type = "TEXTURE"
scene.view_settings.view_transform = "Standard"
RES = 560
scene.render.resolution_x = RES
scene.render.resolution_y = RES
world = bpy.data.worlds.new("w")
scene.world = world
world.color = (0.62, 0.74, 0.88)
cam_data = bpy.data.cameras.new("cam")
cam = bpy.data.objects.new("cam", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
cam_data.lens = 40
VIEWS = [("chase", Vector((0.0, 2.3, 1.0))), ("side", Vector((2.7, 0.0, 0.15))),
         ("top", Vector((0.0, 0.01, 2.9))), ("front", Vector((1.0, -2.2, 0.6)))]
tmp = sheet_path[:-4]
rows = []
row_tags = []


def shot(tag):
    row = []
    for vname, pos in VIEWS:
        cam.location = pos
        cam.rotation_euler = (Vector((0, 0, 0)) - pos).to_track_quat("-Z", "Y" if vname != "top" else "Y").to_euler()
        path = "%s_%s_%s.png" % (tmp, tag, vname)
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        img = bpy.data.images.load(path)
        row.append(np.array(img.pixels[:], dtype=np.float32).reshape(RES, RES, 4))
        bpy.data.images.remove(img)
        import os
        os.remove(path)
    rows.append(np.concatenate(row, axis=1))
    row_tags.append(tag)


if pose_only:
    arm.animation_data.action = None
    for name in order:
        arm.pose.bones[name].rotation_mode = "QUATERNION"
        arm.pose.bones[name].rotation_quaternion = Quaternion()
    bpy.context.view_layer.update()
    shot("rest")
    apply_pose({}, (0, 0, 0))
    bpy.context.view_layer.update()
    shot("flight")
    if SAVE_BLEND:
        bpy.ops.wm.save_as_mainfile(filepath=SAVE_BLEND)
else:
    for act, (cname, fn, seconds, loop) in zip(actions, CLIPS):
        arm.animation_data.action = act
        frames = int(act.frame_range[1] - act.frame_range[0])
        fracs = SHEET_FRACS.get(cname, (0.0, 0.5))
        for fr in fracs:
            scene.frame_set(1 + int(round(fr * frames)))
            shot("%s%02d" % (cname, int(fr * 100)))
sheet = np.concatenate(rows[::-1], axis=0)  # image rows are bottom-up
out = bpy.data.images.new("sheet", width=sheet.shape[1], height=sheet.shape[0])
out.pixels = sheet.ravel().tolist()
out.filepath_raw = sheet_path
out.file_format = "PNG"
out.save()
print("SHEET %s rows=%d" % (sheet_path, len(rows)))
for cname in sorted(set(t.rstrip("0123456789") for t in row_tags)):
    sub = [r for r, t in zip(rows, row_tags) if t.rstrip("0123456789") == cname]
    arr = np.concatenate(sub[::-1], axis=0)
    im = bpy.data.images.new("s_" + cname, width=arr.shape[1], height=arr.shape[0])
    im.pixels = arr.ravel().tolist()
    im.filepath_raw = "%s_%s.png" % (tmp, cname)
    im.file_format = "PNG"
    im.save()

# ------------------------------------------------------------------ export
if not pose_only:
    ad = arm.animation_data
    ad.action = None
    for name in order:
        arm.pose.bones[name].rotation_quaternion = Quaternion()
        arm.pose.bones[name].location = (0, 0, 0)
    for act in actions:
        tr = ad.nla_tracks.new()
        tr.name = act.name
        tr.strips.new(act.name, 1, act)
    cam_obj = bpy.data.objects.get("cam")
    if cam_obj:
        bpy.data.objects.remove(cam_obj, do_unlink=True)
    bpy.ops.export_scene.gltf(filepath=out_glb, export_format="GLB", export_animations=True,
                              export_animation_mode="NLA_TRACKS", export_skins=True,
                              export_yup=True, export_apply=False)
    data = open(out_glb, "rb").read()
    chunks, off = [], 12
    while off < len(data):
        clen, ctype = struct.unpack_from("<II", data, off)
        chunks.append((ctype, data[off + 8: off + 8 + clen]))
        off += 8 + clen
    body = b""
    for ctype, payload in chunks:
        if ctype == 0x4E4F534A:
            g = json.loads(payload.decode("utf-8"))
            for mat in g.get("materials", []):
                mat["alphaMode"] = "OPAQUE"
                mat.pop("alphaCutoff", None)
                mat["doubleSided"] = True
            print("GLB skins=%d animations=%s nodes=%d" % (
                len(g.get("skins", [])), [a.get("name") for a in g.get("animations", [])], len(g.get("nodes", []))))
            payload = json.dumps(g, separators=(",", ":")).encode("utf-8")
        pad = (4 - len(payload) % 4) % 4
        payload += (b" " if ctype == 0x4E4F534A else b"\x00") * pad
        body += struct.pack("<II", len(payload), ctype) + payload
    open(out_glb, "wb").write(struct.pack("<III", 0x46546C67, 2, 12 + len(body)) + body)
    print("EXPORTED %s" % out_glb)
print("DONE")
