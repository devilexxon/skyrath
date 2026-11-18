"""Make a recolour skin texture for a rigged dragon from an approved concept image.

The concept's colours (sampled from the dragon, not the white background) are sorted by brightness into a
colour ramp. Every texel of the dragon's own texture is mapped through that ramp by its brightness rank, so
all the painted detail and shading stay and only the colour scheme changes to match the concept.

Usage: blender -b -P tools/recolor_skin.py -- <dragon.glb> <concept.png> <out.jpg> [size=1024] [glow=0.0]
  glow: brightest share of texels that get pushed toward the hot accent colour (lava cracks, starlight)
"""
import sys
import bpy
import numpy as np

a = sys.argv[sys.argv.index("--") + 1:]
src, concept, out = a[0], a[1], a[2]
opt = dict(x.split("=") for x in a[3:] if "=" in x)
SIZE = int(opt.get("size", 1024))
GLOW = float(opt.get("glow", 0.0))

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
base = next(i for i in bpy.data.images if i.size[0] > 0 and i.name != "Render Result")
W, H = base.size
tex = np.array(base.pixels[:], dtype=np.float32).reshape(H, W, 4)

con = bpy.data.images.load(concept)
cw, ch = con.size
cp = np.array(con.pixels[:], dtype=np.float32).reshape(ch, cw, 4)[..., :3].reshape(-1, 3)
# drop the flat white background and near-white halo
keep = ~((cp.min(axis=1) > 0.93) & (cp.max(axis=1) - cp.min(axis=1) < 0.06))
cp = cp[keep]
lum = lambda c: c[..., 0] * 0.2126 + c[..., 1] * 0.7152 + c[..., 2] * 0.0722
order = np.argsort(lum(cp))
cp = cp[order]
# 256-step ramp: average colour of each brightness band of the concept
bands = np.array_split(cp, 256)
ramp = np.array([b.mean(axis=0) if len(b) else [0, 0, 0] for b in bands], dtype=np.float32)
# a hand-tuned ramp (ramps=<json> name=<skin>) overrides the sampled one
if "ramps" in opt:
    import json
    st = json.load(open(opt["ramps"]))[opt["name"]]["stops"]
    hx = lambda h: [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    pos = np.array([p for p, _ in st]); cols = np.array([hx(c) for _, c in st]) ** 2.2   # sRGB -> linear
    t = np.linspace(0, 1, 256)
    ramp = np.stack([np.interp(t, pos, cols[:, i]) for i in range(3)], axis=1).astype(np.float32)
# light smoothing of the ramp so neighbouring bands blend
k = np.ones(9) / 9
if "ramps" not in opt:
    ramp = np.stack([np.convolve(np.pad(ramp[:, i], 4, mode="edge"), k, mode="valid") for i in range(3)], axis=1)

L = lum(tex[..., :3])
# brightness rank (histogram equalisation) over the painted area only
valid = tex[..., 3] > 0.01
flat = L[valid]
ranks = np.searchsorted(np.sort(flat), L, side="right") / max(1, flat.size)
ranks = np.clip(ranks, 0, 0.999)
new = ramp[(ranks * 255).astype(np.int32)]
# keep a little of the original fine detail: local brightness relative to its rank colour
detail = (L / np.maximum(1e-3, np.quantile(flat, ranks)))
new *= np.clip(0.85 + 0.15 * detail, 0.7, 1.3)[..., None]
if GLOW > 0:
    hot = ramp[-12:].mean(axis=0)
    hot = hot / max(1e-3, hot.max())
    g = np.clip((ranks - (1 - GLOW)) / max(1e-3, GLOW), 0, 1)[..., None]
    new = new * (1 - g) + hot * g
new = np.clip(new, 0, 1)

img = bpy.data.images.new("skin", W, H, alpha=True)
img.pixels[:] = np.concatenate([new, tex[..., 3:4]], axis=2).ravel()
if SIZE != W:
    img.scale(SIZE, SIZE)
img.filepath_raw = out
img.file_format = "JPEG"
bpy.context.scene.render.image_settings.quality = 88
img.save_render(out)
print("SKIN", out, W, H, "->", SIZE)
