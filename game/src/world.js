// The kingdom seen from high above: painted terrain, farmland, villages, castle, islets, cartoon clouds and a sky that changes mood.
import * as THREE from "three";

const S = 2.1;                       // horizontal stretch of the base map
const V = 1.35;                      // vertical stretch
export const WORLD_RADIUS = 2250;    // dragons are turned back beyond this
export const CEILING = 1150;
export const WATER_Y = 0;
const SIZE = 5800;

export function hash(x, y) { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, oct = 5) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}
export const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

const CASTLE0 = { x: -300, y: 62, z: 260 };
const LAKE = { x: 180, z: -60 };
function baseHeight(x, z) {
  const r = Math.hypot(x, z);
  let h = fbm(x * 0.004, z * 0.004) * 44 - 8;
  const ridge = 1 - Math.abs(2 * fbm(x * 0.0055 + 50, z * 0.0055 + 50, 4) - 1);
  h += sstep(700, 1150, r) * (110 + ridge * 230);
  const d = Math.hypot(x + 430, z + 470);
  h += Math.exp(-(d * d) / (2 * 175 * 175)) * 215 * (0.55 + 0.45 * ridge);
  const plateau = sstep(200, 95, Math.hypot(x - CASTLE0.x, z - CASTLE0.z));
  h = h * (1 - plateau) + CASTLE0.y * plateau;
  if (z > 110) {
    const cx = LAKE.x + Math.sin(z * 0.005) * 150 - (z - 110) * 0.12;
    const w = 26 + (z - 110) * 0.05;                               // the river widens into a delta
    const riv = sstep(w * 2.6, w * 0.6, Math.abs(x - cx)) * sstep(110, 190, z);
    h = h * (1 - riv) + -6 * riv;
  }
  const lake = sstep(310, 175, Math.hypot(x - LAKE.x, z - LAKE.z));
  return h * (1 - lake) + -14 * lake;
}
// Worlds: "kingdom" (built at start) and others such as "crystal" (built later by their own module).
// The ground height and the collision shapes always follow the active world.
let THEME = "kingdom";
const THEME_HEIGHT = {};
export function setThemeHeight(name, fn) { THEME_HEIGHT[name] = fn; }
export const activeTheme = () => THEME;
const kingdomHeight = (x, z) => baseHeight(x / S, z / S) * V;
export function heightAt(x, z) { const f = THEME_HEIGHT[THEME]; return f ? f(x, z) : kingdomHeight(x, z); }
export const CASTLE = new THREE.Vector3(CASTLE0.x * S, CASTLE0.y * V, CASTLE0.z * S);
export const VILLAGES = [];          // filled when the world is built: [{x, y, z}]

const farmMask = (x, z) => fbm(x * 0.0011 + 3, z * 0.0011 + 3, 3);
const FIELD = ["#c9b46a", "#9aae5c", "#7f9a4e", "#b8b27a", "#6e8c48", "#a48a5c", "#a7ad66", "#879f56"].map((c) => new THREE.Color(c));

const TERRAIN_UNI = { uVillages: { value: Array.from({ length: 9 }, () => new THREE.Vector3(0, -1000, 0)) } };
function buildTerrain() {
  const seg = 300;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();
  const nor = geo.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  const farmA = new Float32Array(pos.count);
  const c = new THREE.Color(), t = new THREE.Color();
  const sand = new THREE.Color("#d8c99a"), g1 = new THREE.Color("#86a956"), g2 = new THREE.Color("#5f8a42"), g3 = new THREE.Color("#46703a"),
    rock = new THREE.Color("#9a9184"), rock2 = new THREE.Color("#77706a"), snow = new THREE.Color("#f2f5f8"), bed = new THREE.Color("#4f9c9a"), deep = new THREE.Color("#2a5f78"),
    hedge = new THREE.Color("#4f7a3c"), forest = new THREE.Color("#3d5f33");
  const ca = Math.cos(0.42), sa = Math.sin(0.42);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), ny = nor.getY(i);
    const n = fbm(x * 0.006 + 9, z * 0.006 + 9, 3);
    if (y < -3) c.copy(deep).lerp(bed, sstep(-19, -3, y));
    else if (y < 3.5) c.copy(bed).lerp(sand, sstep(-3, 2.5, y));
    else {
      c.copy(g1).lerp(g2, sstep(0.35, 0.65, n)).lerp(g3, sstep(80, 200, y) * 0.8);
      c.lerp(forest, sstep(0.44, 0.56, fbm(x * 0.003 + 31, z * 0.003 + 31, 3)) * sstep(190, 120, y) * 0.7);   // darker floor under woods
      const farm = sstep(0.5, 0.56, farmMask(x, z)) * sstep(4, 9, y) * sstep(75, 55, y) * sstep(0.9, 0.96, ny);
      if (farm > 0) {
        const fx = (x * ca - z * sa) / 135, fz = (x * sa + z * ca) / 95;
        const id = hash(Math.floor(fx), Math.floor(fz));
        const ex = Math.abs(fx - Math.floor(fx) - 0.5), ez = Math.abs(fz - Math.floor(fz) - 0.5);
        t.copy(FIELD[Math.floor(id * FIELD.length) % FIELD.length]);
        if (ex > 0.44 || ez > 0.44) t.copy(hedge);
        c.lerp(t, farm);
      }
      farmA[i] = farm;
      c.lerp(t.copy(rock).lerp(rock2, n), sstep(0.86, 0.66, ny));
      c.lerp(t.copy(rock).lerp(rock2, n), sstep(205, 280, y) * 0.85);
      c.lerp(snow, sstep(290, 340, y + n * 50));
      c.multiplyScalar(0.9 + hash(x * 0.37, z * 0.41) * 0.14 + (fbm(x * 0.02, z * 0.02, 2) - 0.5) * 0.16);   // break up flat colour
    }
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.setAttribute("aFarm", new THREE.BufferAttribute(farmA, 1));
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  // close-up detail: ground speckle, rock strata on slopes, crop rows in fields and dirt around villages.
  // It fades out with distance so the land stays clean and painterly from high up.
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uVillages = TERRAIN_UNI.uVillages;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aFarm; varying float vFarm; varying vec3 vWP; varying vec3 vWN;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvFarm = aFarm; vWP = (modelMatrix * vec4(position, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * normal);");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>
        varying float vFarm; varying vec3 vWP; varying vec3 vWN; uniform vec3 uVillages[9];
        float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }`)
      .replace("#include <color_fragment>", `#include <color_fragment>
        {
          float dist = length(vWP - cameraPosition);
          float near = 1.0 - smoothstep(350.0, 1700.0, dist);
          float slope = 1.0 - clamp(vWN.y, 0.0, 1.0);
          float speck = vn(vWP.xz * 0.11) * 0.6 + vn(vWP.xz * 0.45) * 0.4;
          float d = mix(1.0, 0.86 + speck * 0.26, near);
          float strata = 0.5 + 0.5 * sin(vWP.y * 0.32 + vn(vWP.xz * 0.02) * 6.0);
          d *= mix(1.0, 0.84 + strata * 0.24, smoothstep(0.25, 0.55, slope) * near);
          float rows = 0.5 + 0.5 * sin(dot(vWP.xz, vec2(0.38, 0.92)) * 0.55);
          d *= mix(1.0, 0.9 + rows * 0.16, vFarm * near);
          float vd = 1e9;
          for (int i = 0; i < 9; i++) vd = min(vd, length(vWP.xz - uVillages[i].xz) + (uVillages[i].y < -900.0 ? 1e9 : 0.0));
          float dirt = smoothstep(190.0, 70.0, vd) * smoothstep(0.55, 0.7, vn(vWP.xz * 0.035));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.33, 0.22), dirt * 0.55);
          diffuseColor.rgb *= d;
          diffuseColor.rgb *= mix(0.92, 1.06, smoothstep(0.0, 0.6, vWN.y));
        }`);
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.matrixAutoUpdate = false;
  return mesh;
}

// ---------------------------------------------------------------- collision shapes
// Every solid thing gets a simple invisible shape, stored in a 100 m grid so a lookup only checks what is nearby.
//   cyl: vertical cylinder {x,z,y0,y1,r}   sph: sphere {x,y,z,r}   box: Y-rotated box {x,y,z,hx,hy,hz,c,s}
const CELL = 100;
const GRIDS = { kingdom: new Map() };
let GRID = GRIDS.kingdom;                 // the grid shapes are added to while a world is being built
export function setBuildGrid(name) { GRID = GRIDS[name] || (GRIDS[name] = new Map()); }
const cellKey = (ix, iz) => ix * 4096 + iz;
function addShape(sh, minX, maxX, minZ, maxZ) {
  for (let ix = Math.floor(minX / CELL); ix <= Math.floor(maxX / CELL); ix++)
    for (let iz = Math.floor(minZ / CELL); iz <= Math.floor(maxZ / CELL); iz++) {
      const k = cellKey(ix, iz);
      let a = GRID.get(k); if (!a) GRID.set(k, (a = []));
      a.push(sh);
    }
}
export function addCyl(x, z, y0, y1, r, kind) { addShape({ t: 0, x, z, y0, y1, r, kind }, x - r, x + r, z - r, z + r); }
export function addSph(x, y, z, r, kind) { addShape({ t: 1, x, y, z, r, kind }, x - r, x + r, z - r, z + r); }
export function addBox(x, y, z, hx, hy, hz, ry, kind) {
  const e = Math.hypot(hx, hz);
  addShape({ t: 2, x, y, z, hx, hy, hz, c: Math.cos(ry), s: Math.sin(ry), kind }, x - e, x + e, z - e, z + e);
}
// push-out for one shape: returns how deep the sphere is inside and writes the push direction into _o
const _o = { x: 0, y: 0, z: 0 };
function hitShape(sh, px, py, pz, rad, dy) {
  if (sh.t === 0) {
    const y0 = sh.y0 + dy, y1 = sh.y1 + dy;
    if (py < y0 - rad || py > y1 + rad) return 0;
    const dx = px - sh.x, dz = pz - sh.z, d = Math.hypot(dx, dz) || 1e-3;
    const side = sh.r + rad - d;
    if (side <= 0) return 0;
    const top = y1 + rad - py, bottom = py - (y0 - rad);
    if (top < side && top < bottom) { _o.x = 0; _o.y = 1; _o.z = 0; return top; }
    if (bottom < side) { _o.x = 0; _o.y = -1; _o.z = 0; return bottom; }
    _o.x = dx / d; _o.y = 0; _o.z = dz / d; return side;
  }
  if (sh.t === 1) {
    const dx = px - sh.x, dyy = py - (sh.y + dy), dz = pz - sh.z, d = Math.hypot(dx, dyy, dz) || 1e-3;
    const pen = sh.r + rad - d;
    if (pen <= 0) return 0;
    _o.x = dx / d; _o.y = dyy / d; _o.z = dz / d; return pen;
  }
  // rotated box: work in the box's own frame
  const dx = px - sh.x, dz = pz - sh.z, dyy = py - (sh.y + dy);
  const lx = dx * sh.c - dz * sh.s, lz = dx * sh.s + dz * sh.c;
  const cx = Math.max(-sh.hx, Math.min(sh.hx, lx)), cy = Math.max(-sh.hy, Math.min(sh.hy, dyy)), cz = Math.max(-sh.hz, Math.min(sh.hz, lz));
  let ox = lx - cx, oy = dyy - cy, oz = lz - cz;
  const d = Math.hypot(ox, oy, oz);
  let pen;
  if (d > 1e-4) { if (d >= rad) return 0; pen = rad - d; ox /= d; oy /= d; oz /= d; }
  else {                                      // centre inside the box: leave by the nearest face
    const fx = sh.hx - Math.abs(lx), fy = sh.hy - Math.abs(dyy), fz = sh.hz - Math.abs(lz);
    if (fy <= fx && fy <= fz) { ox = 0; oy = Math.sign(dyy) || 1; oz = 0; pen = fy + rad; }
    else if (fx <= fz) { ox = Math.sign(lx) || 1; oy = 0; oz = 0; pen = fx + rad; }
    else { ox = 0; oy = 0; oz = Math.sign(lz) || 1; pen = fz + rad; }
  }
  _o.x = ox * sh.c + oz * sh.s; _o.y = oy; _o.z = -ox * sh.s + oz * sh.c;   // back to the world frame
  return pen;
}
const ISLETS = [];               // floating islands bob up and down, so they are checked on their own
export const WATERFALLS = [];
const NO_FALLS = [];    // {x, z, top, bottom, half, obj}: for mist, splashes and fly-through checks

// null, or { x, y, z: push to apply, kind: "tree" | "house" | "castle" | "rock" } for a sphere at (px,py,pz)
const _res = { x: 0, y: 0, z: 0, kind: "" };
export function collide(px, py, pz, rad) {
  let found = false; _res.x = _res.y = _res.z = 0;
  const visit = (sh, dy) => {
    const pen = hitShape(sh, px + _res.x, py + _res.y, pz + _res.z, rad, dy);
    if (pen > 0) { _res.x += _o.x * pen; _res.y += _o.y * pen; _res.z += _o.z * pen; if (!found) _res.kind = sh.kind; found = true; }
  };
  const ix0 = Math.floor((px - rad) / CELL), ix1 = Math.floor((px + rad) / CELL), iz0 = Math.floor((pz - rad) / CELL), iz1 = Math.floor((pz + rad) / CELL);
  const grid = GRIDS[THEME] || GRIDS.kingdom;
  for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) {
    const a = grid.get(cellKey(ix, iz));
    if (a) for (const sh of a) visit(sh, 0);
  }
  if (THEME === "kingdom") for (const isl of ISLETS) {
    if (Math.abs(px - isl.x) > isl.ext + rad || Math.abs(pz - isl.z) > isl.ext + rad) continue;
    const dy = isl.obj.position.y - isl.baseY;
    for (const sh of isl.shapes) visit(sh, dy);
  }
  return found ? _res : null;
}

function flatSpot(x, z, y) {
  return Math.abs(heightAt(x + 12, z) - y) < 6 && Math.abs(heightAt(x, z + 12) - y) < 6;
}

function buildTrees(low) {
  const rand = rng(7);
  const cone = new THREE.ConeGeometry(9, 30, 7); cone.translate(0, 18, 0);
  const max = low ? 4400 : 8800;
  const inst = new THREE.InstancedMesh(cone, new THREE.MeshLambertMaterial({ flatShading: true }), max);
  // round broadleaf trees: a lumpy canopy on a short trunk, merged into one geometry
  const canopy = new THREE.IcosahedronGeometry(11, 1); canopy.translate(0, 21, 0);
  const cp = canopy.attributes.position;
  for (let i = 0; i < cp.count; i++) { const k = 0.85 + hash(cp.getX(i) * 3.1, cp.getZ(i) * 2.7 + cp.getY(i)) * 0.3; cp.setXYZ(i, cp.getX(i) * k, 21 + (cp.getY(i) - 21) * k * 0.85, cp.getZ(i) * k); }
  canopy.computeVertexNormals();
  const broad = new THREE.InstancedMesh(canopy, new THREE.MeshLambertMaterial({ flatShading: true }), max);
  const trunkGeo = new THREE.CylinderGeometry(1.6, 2.2, 12, 5); trunkGeo.translate(0, 6, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: "#5a4632" }), max);
  let nb = 0;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
  let n = 0;
  for (let tries = 0; tries < 160000 && n + nb < max; tries++) {
    const x = (rand() - 0.5) * 4500, z = (rand() - 0.5) * 4500;
    const y = heightAt(x, z);
    if (y < 5 || y > 190) continue;
    if (Math.hypot(x - CASTLE.x, z - CASTLE.z) < 330) continue;
    const lone = rand() < 0.04;                                   // the odd lone tree out in the fields
    if (!lone && farmMask(x, z) > 0.49) continue;
    if (!lone && fbm(x * 0.003 + 31, z * 0.003 + 31, 3) < 0.44) continue;
    if (!flatSpot(x, z, y)) continue;
    const k = 0.75 + rand() * 0.9;
    m.compose(p.set(x, y - 2, z), q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rand() * 6.28), s.set(k, k * (0.85 + rand() * 0.5), k));
    // conifers up high, broadleaf trees in the lowlands, mixed in between
    if (rand() < sstep(140, 40, y) * 0.75) {
      broad.setMatrixAt(nb, m); trunks.setMatrixAt(nb, m);
      addSph(x, y - 2 + 21 * s.y, z, 9.5 * k, "tree"); addCyl(x, z, y - 3, y - 2 + 12 * s.y, 2.2 * k, "tree");
      broad.setColorAt(nb, c.setHSL(0.2 + rand() * 0.08, 0.32 + rand() * 0.15, 0.24 + rand() * 0.1));
      nb++;
    } else {
      inst.setMatrixAt(n, m);
      addCyl(x, z, y - 3, y - 2 + 31 * s.y, 5.5 * k, "tree");
      inst.setColorAt(n, c.setHSL(0.27 + rand() * 0.07, 0.3 + rand() * 0.15, 0.17 + rand() * 0.08));
      n++;
    }
  }
  inst.count = n; broad.count = trunks.count = nb;
  const g = new THREE.Group();
  for (const im of [inst, broad, trunks]) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; im.frustumCulled = false; g.add(im); }
  return g;
}

function buildVillages() {
  const g = new THREE.Group();
  const rand = rng(404);
  const spots = [];
  for (let tries = 0; tries < 6000 && spots.length < 9; tries++) {
    const x = (rand() - 0.5) * 3400, z = (rand() - 0.5) * 3400;
    const y = heightAt(x, z);
    if (y < 7 || y > 55 || farmMask(x, z) < 0.53 || !flatSpot(x, z, y)) continue;
    if (spots.some((s) => Math.hypot(s.x - x, s.z - z) < 520)) continue;
    spots.push({ x, z });
  }
  for (const s of spots) VILLAGES.push({ x: s.x, y: heightAt(s.x, s.z), z: s.z });
  spots.forEach((s, i) => { if (i < 9) TERRAIN_UNI.uVillages.value[i].set(s.x, 0, s.z); });
  const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: "#f6efe2", flatShading: true }), 420);
  const roofGeo = new THREE.ConeGeometry(0.8, 1, 4); roofGeo.rotateY(Math.PI / 4);
  const roofs = new THREE.InstancedMesh(roofGeo, new THREE.MeshLambertMaterial({ flatShading: true }), 420);
  const bloomGeo = new THREE.IcosahedronGeometry(1, 0);
  const blossoms = new THREE.InstancedMesh(bloomGeo, new THREE.MeshLambertMaterial({ flatShading: true }), 520);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
  const roofCols = ["#e2633f", "#d9764a", "#2fa39a", "#c94f3a", "#e89a4a"];
  let n = 0, b = 0;
  for (const sp of spots) {
    for (let i = 0; i < 44 && n < 420; i++) {
      const a = rand() * 6.28, r = 20 + rand() * 150;
      const x = sp.x + Math.cos(a) * r, z = sp.z + Math.sin(a) * r, y = heightAt(x, z);
      if (y < 5 || !flatSpot(x, z, y)) continue;
      const w = 16 + rand() * 12, h = 12 + rand() * 9, d = 16 + rand() * 12, ry = rand() * 3.14;
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, ry);
      walls.setMatrixAt(n, m.compose(p.set(x, y + h / 2 - 1, z), q, s.set(w, h, d)));
      addBox(x, y + (h + 9) / 2 - 1, z, w / 2, (h + 9) / 2, d / 2, ry, "house");     // walls plus the roof
      roofs.setMatrixAt(n, m.compose(p.set(x, y + h + 5, z), q, s.set(Math.max(w, d) * 0.95, 12, Math.max(w, d) * 0.95)));
      roofs.setColorAt(n, c.set(roofCols[Math.floor(rand() * roofCols.length)]));
      n++;
    }
    for (let i = 0; i < 46 && b < 520; i++) {
      const a = rand() * 6.28, r = 60 + rand() * 260;
      const x = sp.x + Math.cos(a) * r, z = sp.z + Math.sin(a) * r, y = heightAt(x, z);
      if (y < 5) continue;
      const k = 9 + rand() * 8;
      blossoms.setMatrixAt(b, m.compose(p.set(x, y + k * 0.9, z), q.identity(), s.set(k, k * 0.85, k)));
      addSph(x, y + k * 0.9, z, k * 0.85, "tree");
      blossoms.setColorAt(b, c.setHSL(0.92 + rand() * 0.05, 0.75, 0.74 + rand() * 0.1));
      b++;
    }
  }
  walls.count = roofs.count = n; blossoms.count = b;
  for (const im of [walls, roofs, blossoms]) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; im.frustumCulled = false; g.add(im); }
  return g;
}

function buildCastle() {
  const g = new THREE.Group();
  const stone = new THREE.MeshLambertMaterial({ color: "#f6f0e4", flatShading: true });
  const stone2 = new THREE.MeshLambertMaterial({ color: "#e4dac8", flatShading: true });
  const teal = new THREE.MeshLambertMaterial({ color: "#2fa39a", flatShading: true });
  const terra = new THREE.MeshLambertMaterial({ color: "#de7c4c", flatShading: true });
  const rand = rng(21);
  const add = (geo, mat, x, y, z, ry = 0) => { const me = new THREE.Mesh(geo, mat); me.position.set(x, y, z); me.rotation.y = ry; g.add(me); return me; };
  const K = 2.3, W = (lx, lz) => [CASTLE.x + lx * K, CASTLE.z + lz * K];
  const box = (lx, ly, lz, w, h, d, ry) => { const [x, z] = W(lx, lz); addBox(x, CASTLE.y + ly * K, z, w * K / 2, h * K / 2, d * K / 2, ry, "castle"); };
  const tower = (x, z, r, h) => {
    { const [wx, wz] = W(x, z); addCyl(wx, wz, CASTLE.y - 5, CASTLE.y + (h + r * 2.4) * K, r * 1.1 * K, "castle"); }
    add(new THREE.CylinderGeometry(r, r * 1.08, h, 10), stone, x, h / 2, z);
    add(new THREE.ConeGeometry(r * 1.35, r * 2.6, 10), teal, x, h + r * 1.3, z);
  };
  const R = 82, N = 10;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2, b = ((i + 1) / N) * Math.PI * 2;
    const x1 = Math.cos(a) * R, z1 = Math.sin(a) * R, x2 = Math.cos(b) * R, z2 = Math.sin(b) * R;
    tower(x1, z1, 6, 26);
    if (i === 2) continue;
    add(new THREE.BoxGeometry(Math.hypot(x2 - x1, z2 - z1), 15, 4), stone2, (x1 + x2) / 2, 7.5, (z1 + z2) / 2, -Math.atan2(z2 - z1, x2 - x1));
    box((x1 + x2) / 2, 7.5, (z1 + z2) / 2, Math.hypot(x2 - x1, z2 - z1), 15, 4, -Math.atan2(z2 - z1, x2 - x1));
  }
  add(new THREE.BoxGeometry(34, 44, 30), stone, 0, 22, -8);
  box(0, 30, -8, 34, 60, 30, 0);                       // the keep and its roof
  add(new THREE.ConeGeometry(27, 20, 4), teal, 0, 54, -8, Math.PI / 4);
  tower(0, -8, 9, 82);
  for (const [x, z] of [[-17, 7], [17, 7], [-17, -23], [17, -23]]) tower(x, z, 5, 54);
  for (let i = 0; i < 46; i++) {
    const a = rand() * 6.28, r = 30 + rand() * 42, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.abs(x) < 24 && z < 12 && z > -30) continue;
    const w = 7 + rand() * 6, h = 6 + rand() * 6, dpt = 7 + rand() * 6, ry = rand() * 3.1;
    add(new THREE.BoxGeometry(w, h, dpt), stone2, x, h / 2, z, ry);
    box(x, (h + 4) / 2, z, w, h + 4, dpt, ry);
    add(new THREE.ConeGeometry(Math.max(w, dpt) * 0.78, 5 + rand() * 3, 4), rand() < 0.6 ? terra : teal, x, h + 3, z, ry + Math.PI / 4);
  }
  g.position.copy(CASTLE); g.scale.setScalar(2.3);
  return g;
}

// falling water: streaks scroll down, edges fade and foam, the bottom churns white; shared by all waterfalls
const WATER_T = { value: 0 };
function waterfallMaterial() {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uT: { value: 0 } }]),
    vertexShader: `varying vec2 vUv;
      #include <fog_pars_vertex>
      void main(){ vUv = uv; vec3 transformed = position;
        vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0); gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform float uT; varying vec2 vUv;
      #include <fog_pars_fragment>
      float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 45758.5); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1.0, 0.0)), f.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), f.x), f.y); }
      void main(){
        float y = vUv.y, x = vUv.x;
        float fall = uT * 1.6;
        float streak = n(vec2(x * 14.0, y * 3.0 + fall)) * 0.6 + n(vec2(x * 33.0, y * 7.0 + fall * 1.9)) * 0.4;
        float edge = smoothstep(0.0, 0.18, x) * smoothstep(1.0, 0.82, x);
        float foamTop = smoothstep(0.93, 1.0, y);
        float foamBottom = smoothstep(0.1, 0.0, y);
        vec3 deep = vec3(0.55, 0.78, 0.88), bright = vec3(0.92, 0.98, 1.0);
        vec3 c = mix(deep, bright, smoothstep(0.35, 0.8, streak));
        c = mix(c, vec3(1.0), max(foamTop, foamBottom) * 0.8);
        float a = edge * (0.45 + streak * 0.45) + foamBottom * 0.4;
        a *= mix(0.55, 1.0, edge);
        gl_FragColor = vec4(c, clamp(a, 0.0, 0.92));
        #include <fog_fragment>
      }`,
  });
  mat.uniforms.uT = WATER_T;
  return mat;
}

function buildIslets(list) {
  const g = new THREE.Group();
  const grass = new THREE.MeshLambertMaterial({ color: "#7c9e52", flatShading: true });
  const rock = new THREE.MeshLambertMaterial({ color: "#8e857a", flatShading: true });
  const leaf = new THREE.MeshLambertMaterial({ color: "#3e6534", flatShading: true });
  const fall = waterfallMaterial();
  const rand = rng(99);
  for (const it of list) {
    const isl = new THREE.Group();
    const shapes = [
      { t: 0, x: it.x, z: it.z, y0: it.y - 7, y1: it.y + 7, r: it.r, kind: "rock" },
      { t: 0, x: it.x, z: it.z, y0: it.y - 7 - it.r * 0.55, y1: it.y - 7, r: it.r * 0.72, kind: "rock" },
      { t: 0, x: it.x, z: it.z, y0: it.y - 7 - it.r * 1.1, y1: it.y - 7 - it.r * 0.55, r: it.r * 0.42, kind: "rock" },
      { t: 1, x: it.x, y: it.y - 7 - it.r * 1.32, z: it.z, r: it.r * 0.16, kind: "rock" },
    ];
    const top = new THREE.Mesh(new THREE.CylinderGeometry(it.r, it.r * 0.86, 14, 10), grass);
    const under = new THREE.Mesh(new THREE.ConeGeometry(it.r * 0.88, it.r * 1.5, 10), rock);
    under.rotation.x = Math.PI; under.position.y = -7 - it.r * 0.75;
    isl.add(top, under);
    for (let i = 0; i < 8; i++) {
      const a = rand() * 6.28, r = rand() * it.r * 0.7;
      const tr = new THREE.Mesh(new THREE.ConeGeometry(9, 28, 6), leaf);
      const sc = 0.7 + rand() * 0.7;
      tr.position.set(Math.cos(a) * r, 20, Math.sin(a) * r); tr.scale.setScalar(sc);
      isl.add(tr);
      shapes.push({ t: 0, x: it.x + Math.cos(a) * r, z: it.z + Math.sin(a) * r, y0: it.y + 6, y1: it.y + 20 + 14 * sc, r: 5.5 * sc, kind: "tree" });
    }
    // waterfall: a curtain of falling water from the island's edge down to the land below
    const fx = it.x + it.r * 0.82, fz = it.z;
    const ground = Math.max(heightAt(fx, fz), 0);
    const len = it.y + 4 - ground;
    const ww = it.r * 0.34;
    const wgeo = new THREE.PlaneGeometry(ww, len, 1, 24);
    const w = new THREE.Mesh(wgeo, fall);
    w.position.set(it.r * 0.82, 4 - len / 2, 0); w.rotation.y = Math.PI / 2;
    w.renderOrder = 2;
    isl.add(w);
    WATERFALLS.push({ x: fx, z: fz, top: it.y + 4, bottom: ground, half: ww / 2, obj: isl, baseY: it.y });
    isl.position.set(it.x, it.y, it.z);
    ISLETS.push({ x: it.x, z: it.z, ext: it.r + 10, baseY: it.y, obj: isl, shapes });
    isl.userData.baseY = it.y; isl.userData.phase = rand() * 6.28;
    g.add(isl);
  }
  return g;
}

// ---- cartoon clouds: thousands of crisp billboard puffs in one draw call ----
function buildClouds(uni) {
  const rand = rng(5);
  const pos = [], ss = [], cl = [], hz = [];
  let haze = 0.55, puffK = 1;
  const cluster = (cx, cy, cz, w, h, d, n) => {
    for (let i = 0; i < n; i++) {
      const u = (rand() + rand() + rand()) / 3 * 2 - 1, v = (rand() + rand() + rand()) / 3 * 2 - 1;
      const edge = 1 - Math.min(1, u * u + v * v);
      const y = Math.pow(rand(), 1.4) * h * (0.25 + 0.75 * edge);
      const size = (0.16 + 0.2 * rand()) * w * (0.55 + 0.6 * edge) * (1 - 0.35 * (y / h)) * puffK;
      pos.push(cx + u * w, cy + y, cz + v * d);
      ss.push(size, rand() * 6.28);
      cl.push(cy - size * 0.3, h + size);
      hz.push(haze);
    }
  };
  for (let i = 0; i < 14; i++) {                       // a few soft clouds far off on the horizon
    const a = (i / 14) * 6.28 + rand() * 0.3, r = 4300 + rand() * 1200;
    const w = 500 + rand() * 600;
    cluster(Math.cos(a) * r, 160 + rand() * 220, Math.sin(a) * r, w, w * (0.3 + rand() * 0.3), w * 0.5, 14);
  }
  // giant sunlit cloud towers just outside the flying area: big and soft, never in your way
  haze = 0.08; puffK = 1.55;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * 6.28 + 0.4 + rand() * 0.4, r = 2750 + rand() * 450;
    const w = 520 + rand() * 260, h = 1400 + rand() * 700;
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
    cluster(cx, 200, cz, w, h * 0.4, w * 0.8, 110);               // wide base
    cluster(cx + (rand() - 0.5) * 200, 200 + h * 0.28, cz + (rand() - 0.5) * 200, w * 0.78, h * 0.42, w * 0.65, 95);   // middle
    cluster(cx + (rand() - 0.5) * 260, 200 + h * 0.58, cz + (rand() - 0.5) * 260, w * 0.6, h * 0.42, w * 0.5, 75);    // billowing top
  }
  // a sea of clouds beyond the land, so the kingdom seems to float above it
  haze = 0.4; puffK = 1;
  for (let i = 0; i < 70; i++) {
    const a = (i / 70) * 6.28 + rand() * 0.08, r = 3150 + rand() * 2300;
    const w = 380 + rand() * 420;
    cluster(Math.cos(a) * r, 30 + rand() * 60, Math.sin(a) * r, w, w * 0.18, w * 0.6, 9);
  }
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  geo.setAttribute("iPos", new THREE.InstancedBufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute("iSS", new THREE.InstancedBufferAttribute(new Float32Array(ss), 2));
  geo.setAttribute("iCl", new THREE.InstancedBufferAttribute(new Float32Array(cl), 2));
  geo.setAttribute("iHz", new THREE.InstancedBufferAttribute(new Float32Array(hz), 1));
  geo.instanceCount = ss.length / 2;
  const mat = new THREE.ShaderMaterial({
    uniforms: uni, fog: false, transparent: true, depthWrite: false,
    vertexShader: `attribute vec3 iPos; attribute vec2 iSS; attribute vec2 iCl; attribute float iHz; varying float vHz; varying vec2 vUv; varying float vH; varying float vSeed; varying float vDist;
      void main(){ vec4 mv = modelViewMatrix * vec4(iPos, 1.0); mv.xy += position.xy * iSS.x; vUv = position.xy; vSeed = iSS.y;
        vH = (iPos.y + position.y * iSS.x * 0.8 - iCl.x) / iCl.y; vDist = -mv.z; vHz = iHz; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uLight; uniform vec3 uShade; uniform vec3 uRim; uniform vec3 uHaze; varying float vHz; varying vec2 vUv; varying float vH; varying float vSeed; varying float vDist;
      void main(){ float a = atan(vUv.y, vUv.x); float d = length(vUv);
        float r = 0.80 + 0.09 * sin(a * 5.0 + vSeed) + 0.06 * sin(a * 9.0 + vSeed * 2.3) + 0.04 * sin(a * 14.0 - vSeed);
        if (d > r) discard;
        float t = clamp(vH + vUv.y * 0.3, 0.0, 1.0);
        vec3 c = mix(uShade, uLight, smoothstep(0.05, 0.85, t));
        c = mix(c, uRim, smoothstep(0.55, 0.95, d / r) * smoothstep(0.1, 0.7, vUv.y + 0.3) * 0.35);
        c = mix(c, uRim, smoothstep(0.75, 1.0, t) * 0.4);          // sunlit tops
        c = mix(c, uHaze, vHz);
        float alpha = (1.0 - smoothstep(r * 0.4, r, d)) * mix(0.9, 0.7, vHz);
        gl_FragColor = vec4(c, alpha); }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return mesh;
}

function buildSky(uni) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: uni,
    vertexShader: "varying vec3 d; void main(){ d = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: `varying vec3 d; uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uLow; uniform vec3 uSunDir; uniform vec3 uSunCol;
      void main(){ float h = clamp(d.y, -0.3, 1.0);
        vec3 c = mix(uLow, uMid, smoothstep(-0.06, 0.24, h)); c = mix(c, uTop, smoothstep(0.2, 0.85, h));
        float s = max(dot(normalize(d), uSunDir), 0.0); c += uSunCol * (pow(s, 700.0) * 2.5 + pow(s, 14.0) * 0.28 + pow(s, 3.0) * 0.08);
        gl_FragColor = vec4(c, 1.0); }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(6400, 24, 14), mat);
  sky.frustumCulled = false;
  return sky;
}

const col = (h) => new THREE.Color(h);
const MOODS = {
  day: { top: col("#3a78c8"), mid: col("#86b9e2"), low: col("#d6e4ec"), sun: col("#fff1d8"), fog: col("#bfd2de"), light: col("#ffffff"), shade: col("#a9bccf"), rim: col("#f6f2e6"),
    hemiS: col("#ffffff"), hemiG: col("#8fb37a"), dir: new THREE.Vector3(0.45, 0.72, 0.35), sunI: 2.1, hemiI: 1.25 },
  gold: { top: col("#3a78d8"), mid: col("#ffd49a"), low: col("#ffe8c2"), sun: col("#ffc978"), fog: col("#ffdcae"), light: col("#fff0d2"), shade: col("#d59c8e"), rim: col("#fff6c0"),
    hemiS: col("#ffe9c8"), hemiG: col("#a39a6a"), dir: new THREE.Vector3(0.72, 0.36, 0.3), sunI: 2.0, hemiI: 1.15 },
  sunset: { top: col("#5446b4"), mid: col("#f08cae"), low: col("#ffc29c"), sun: col("#ff9462"), fog: col("#f0b0c2"), light: col("#ffd6cc"), shade: col("#9472c8"), rim: col("#ffe2a8"),
    hemiS: col("#ffc8d8"), hemiG: col("#8a7a8a"), dir: new THREE.Vector3(0.82, 0.2, 0.2), sunI: 1.8, hemiI: 1.1 },
  dusk: { top: col("#24305e"), mid: col("#5f6496"), low: col("#b49fb8"), sun: col("#e0c0d0"), fog: col("#8a86a4"), light: col("#d8d2e8"), shade: col("#5e6088"), rim: col("#ecdcea"),
    hemiS: col("#c8c0ff"), hemiG: col("#6a6a90"), dir: new THREE.Vector3(0.3, 0.5, -0.6), sunI: 1.5, hemiI: 1.1 },
};
MOODS.fire = { top: col("#3a0f1e"), mid: col("#c8422a"), low: col("#ffb060"), sun: col("#ff7a3a"), fog: col("#b8553a"), light: col("#ffb48a"), shade: col("#7a2f3a"), rim: col("#ffd08a"),
  hemiS: col("#ff9a6a"), hemiG: col("#5a3028"), dir: new THREE.Vector3(0.6, 0.25, -0.3), sunI: 1.6, hemiI: 1.0 };
MOODS.ash = { top: col("#1c1f33"), mid: col("#4a4660"), low: col("#8a7a80"), sun: col("#c9a890"), fog: col("#5d5868"), light: col("#a09aa8"), shade: col("#45435a"), rim: col("#d0b0a0"),
  hemiS: col("#8a88a0"), hemiG: col("#3a3838"), dir: new THREE.Vector3(0.2, 0.3, -0.7), sunI: 0.9, hemiI: 0.85 };
MOODS.frost = { top: col("#3f78c4"), mid: col("#a6cbea"), low: col("#e6f1f9"), sun: col("#fff6ea"), fog: col("#c4d9e9"), light: col("#ffffff"), shade: col("#a6bed6"), rim: col("#f2f8ff"),
  hemiS: col("#e8f4ff"), hemiG: col("#8aa4c0"), dir: new THREE.Vector3(0.4, 0.62, 0.4), sunI: 2.0, hemiI: 1.3 };
MOODS.iceGold = { top: col("#3a68b6"), mid: col("#eec6b0"), low: col("#f6e2d6"), sun: col("#ffd0a0"), fog: col("#e4d0cc"), light: col("#fff2e8"), shade: col("#b6a6c6"), rim: col("#ffe8c8"),
  hemiS: col("#ffe8e0"), hemiG: col("#8a90a8"), dir: new THREE.Vector3(0.75, 0.3, 0.3), sunI: 1.8, hemiI: 1.15 };
MOODS.aurora = { top: col("#0c1532"), mid: col("#1e3c6c"), low: col("#5a7ca6"), sun: col("#bfe6ff"), fog: col("#466084"), light: col("#cfe4ff"), shade: col("#4a5f88"), rim: col("#9fffe0"),
  hemiS: col("#a6ccff"), hemiG: col("#3a4a6a"), dir: new THREE.Vector3(0.2, 0.45, -0.7), sunI: 1.15, hemiI: 1.15 };
const MOOD_ORDER = ["day", "day", "gold", "sunset", "dusk"];
const THEME_MOODS = { kingdom: MOOD_ORDER, crystal: ["frost", "frost", "iceGold", "aurora", "aurora"] };

export function createWorld(scene, opts = {}) {
  const now = {};
  for (const k of Object.keys(MOODS.day)) now[k] = MOODS.day[k].clone ? MOODS.day[k].clone() : MOODS.day[k];
  let target = MOODS.day;
  let rate = 0.55;
  const skyUni = { uTop: { value: now.top }, uMid: { value: now.mid }, uLow: { value: now.low }, uSunDir: { value: now.dir.clone().normalize() }, uSunCol: { value: now.sun } };
  const cloudUni = { uLight: { value: now.light }, uShade: { value: now.shade }, uRim: { value: now.rim }, uHaze: { value: now.fog } };
  scene.fog = new THREE.Fog(now.fog, 900, 6200);     // aerial perspective: distant land fades into the sky
  const hemi = new THREE.HemisphereLight(now.hemiS, now.hemiG, now.hemiI);
  const sun = new THREE.DirectionalLight(now.sun, now.sunI);
  scene.add(hemi, sun);

  const terrain = buildTerrain();
  const waterT = { value: 0 };
  const water = new THREE.Mesh(new THREE.PlaneGeometry(SIZE * 1.6, SIZE * 1.6),
    new THREE.MeshPhongMaterial({ color: "#2f7d8c", specular: "#9fbcc6", shininess: 70, transparent: true, opacity: 0.86 }));
  // gentle moving ripples: wobble the surface normal so the sun's glint sparkles and drifts
  water.material.onBeforeCompile = (sh) => {
    sh.uniforms.uT = waterT;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vWPw;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvWPw = (modelMatrix * vec4(position, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vWPw; uniform float uT;")
      .replace("#include <normal_fragment_begin>", `#include <normal_fragment_begin>
        { vec2 q = vWPw.xz * 0.045;
          float wx = sin(q.x * 3.1 + q.y * 1.7 + uT * 1.3) * 0.5 + sin(q.y * 5.3 - uT * 1.1 + q.x * 2.2) * 0.3 + sin(q.x * 9.1 + q.y * 7.3 + uT * 2.0) * 0.2;
          float wz = cos(q.y * 2.9 - q.x * 1.3 + uT * 1.2) * 0.5 + cos(q.x * 4.7 + uT * 0.9 - q.y * 2.6) * 0.3 + cos(q.y * 8.3 - q.x * 6.1 + uT * 1.7) * 0.2;
          normal = normalize(normal + (viewMatrix * vec4(wx * 0.025, 0.0, wz * 0.025, 0.0)).xyz); }`);
  };
  water.rotation.x = -Math.PI / 2; water.position.y = WATER_Y;
  const islets = buildIslets([
    { x: 90, y: 330, z: 700, r: 96 }, { x: -1090, y: 420, z: -90, r: 80 }, { x: 900, y: 380, z: -800, r: 110 },
    { x: 1180, y: 300, z: 630, r: 72 }, { x: -250, y: 480, z: -1100, r: 88 }, { x: -1350, y: 350, z: 1090, r: 76 },
  ]);
  const clouds = buildClouds(cloudUni);
  const glareTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d");
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.15, "rgba(255,246,220,.8)"); gr.addColorStop(0.45, "rgba(255,230,180,.18)"); gr.addColorStop(1, "rgba(255,220,170,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const glare = new THREE.Sprite(new THREE.SpriteMaterial({ map: glareTex, color: now.sun, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true, opacity: 0.85 }));
  glare.scale.setScalar(2600);
  const sky = buildSky(skyUni);
  const villages = buildVillages();
  const kingdom = new THREE.Group();
  kingdom.add(terrain, water, buildTrees(opts.low), villages, buildCastle(), islets);
  scene.add(sky, kingdom, clouds, glare);
  const themes = { kingdom: { group: kingdom } };

  let time = 0;
  return {
    heightAt,
    collide,
    get waterfalls() { return THEME === "kingdom" ? WATERFALLS : NO_FALLS; },
    get theme() { return THEME; },
    get moodName() { return Object.keys(MOODS).find((k) => MOODS[k] === target) || "day"; },
    // add a world built by another module: { group, update?(dt, camPos, time, mood) }
    addTheme(name, t) { themes[name] = t; t.group.visible = false; scene.add(t.group); },
    hasTheme(name) { return !!themes[name]; },
    setTheme(name) {
      if (!themes[name]) name = "kingdom";
      THEME = name;
      for (const k in themes) themes[k].group.visible = k === name;
    },
    setStage(stage) { const order = THEME_MOODS[THEME] || MOOD_ORDER; target = MOODS[order[(stage - 1) % order.length]]; rate = 0.55; },
    setMood(name, speed = 0.55, snap = false) {
      target = MOODS[name] || MOODS.day; rate = speed;
      if (snap) { for (const key of ["top", "mid", "low", "sun", "fog", "light", "shade", "rim", "hemiS", "hemiG", "dir"]) now[key].copy(target[key]); now.sunI = target.sunI; now.hemiI = target.hemiI; }
    },
    update(dt, camPos) {
      time += dt;
      const k = Math.min(1, dt * rate);
      for (const key of ["top", "mid", "low", "sun", "fog", "light", "shade", "rim", "hemiS", "hemiG"]) now[key].lerp(target[key], k);
      now.dir.lerp(target.dir, k);
      now.sunI += (target.sunI - now.sunI) * k; now.hemiI += (target.hemiI - now.hemiI) * k;
      skyUni.uSunDir.value.copy(now.dir).normalize();
      sun.position.copy(skyUni.uSunDir.value).multiplyScalar(1000); sun.intensity = now.sunI;
      hemi.color.copy(now.hemiS); hemi.groundColor.copy(now.hemiG); hemi.intensity = now.hemiI;
      scene.fog.color.copy(now.fog);
      sky.position.copy(camPos);
      glare.position.copy(camPos).addScaledVector(skyUni.uSunDir.value, 5600); glare.material.color.copy(now.sun);
      waterT.value = time;
      clouds.position.x = Math.sin(time * 0.01) * 60;
      WATER_T.value = time;
      for (const i of islets.children) i.position.y = i.userData.baseY + Math.sin(time * 0.5 + i.userData.phase) * 6;
      const th = themes[THEME];
      if (th && th.update) th.update(dt, camPos, time, target);
    },
  };
}
