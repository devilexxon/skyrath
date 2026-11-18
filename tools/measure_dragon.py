# Print key measurements of an aligned dragon (frame: facing -Y, up +Z, left = +X).
import bpy, numpy as np
o = bpy.data.objects["Dragon"]
v = np.array([o.matrix_world @ p.co for p in o.data.vertices])
x, y, z = v[:, 0], v[:, 1], v[:, 2]
core = np.abs(x) < 0.16
print("SNOUT", v[core][np.argmin(y[core])].round(3))
for y0 in np.arange(-0.7, 0.71, 0.1):
    m = core & (np.abs(y - y0) < 0.05)
    if m.sum() > 20: print(f"BODY y={y0:+.1f} n={m.sum():5d} z[{z[m].min():.2f},{z[m].max():.2f}] zc={np.median(z[m]):.2f}")
for s, name in ((1, "L(+X)"), (-1, "R(-X)")):
    m = (s * x) > 0.3
    w = v[m]
    print("WING", name, "n", m.sum(), "tipX", w[np.argmax(s * w[:, 0])].round(2), "tipZ", w[np.argmax(w[:, 2])].round(2), "cent", w.mean(0).round(2))
    r = ((s * x) > 0.16) & ((s * x) < 0.3) & (z > 0.6)
    if r.sum(): print("  ROOT", name, v[r].mean(0).round(2))
low = z < 0.45
for s in (1, -1):
    m = low & ((s * x) > 0.05)
    if m.sum(): print("LOW", s, "front", v[m][np.argmin(y[m])].round(2), "back", v[m][np.argmax(y[m])].round(2))
