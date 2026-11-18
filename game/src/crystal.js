// The Crystal Expanse: the second world, reached through the black hole after stage 10.
// Everything is generated in code (no extra download): snowy hills, ice cliffs, a frozen sea with cracks,
// glowing crystal spires and ice arches (all solid), northern-lights ribbons, falling snow and freezing-wind zones.
import * as THREE from "three";
import { fbm, hash, rng, sstep, setThemeHeight, setBuildGrid, addCyl, addSph, WORLD_RADIUS } from "./world.js";

const SIZE = 5800;

// ground height: rolling snow hills, sharp ice mesas, mountain walls at the edge and a frozen sea in the middle
function crystalHeight(x, z) {
  const r = Math.hypot(x, z);
  let h = fbm(x * 0.0019 + 71, z * 0.0019 + 71, 5) * 110 - 40;
  const mesa = fbm(x * 0.0011 + 9, z * 0.0011 + 9, 3);
  h += sstep(0.57, 0.61, mesa) * 130;                                       // flat-topped ice cliffs
  const ridge = 1 - Math.abs(2 * fbm(x * 0.0026 + 40, z * 0.0026 + 40, 4) - 1);
  h += sstep(1550, 2450, r) * (160 + ridge * 300);                          // mountains ring the world
  const sea = sstep(820, 420, Math.hypot(x - 200, z + 150));                // the frozen sea
  return h * (1 - sea) - 14 * sea;
}

function buildTerrain() {
  const seg = 260;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, crystalHeight(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();
  const nor = geo.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color(), t = new THREE.Color();
  const snow = new THREE.Color("#eef5fb"), snow2 = new THREE.Color("#d6e4f0"), rock = new THREE.Color("#7f93ab"), rock2 = new THREE.Color("#5d7190"),
    ice = new THREE.Color("#9fe0f2"), shore = new THREE.Color("#c2dff0");
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), ny = nor.getY(i);
    const n = fbm(x * 0.008 + 3, z * 0.008 + 3, 3);
    c.copy(snow).lerp(snow2, sstep(0.35, 0.7, n));
    c.lerp(shore, sstep(6, -2, y));
    c.lerp(t.copy(ice).lerp(rock, n * 0.6), sstep(0.82, 0.6, ny));           // steep faces: blue ice and rock
    c.lerp(t.copy(rock).lerp(rock2, n), sstep(0.62, 0.42, ny));
    c.multiplyScalar(0.93 + hash(x * 0.31, z * 0.37) * 0.1);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.matrixAutoUpdate = false;
  return mesh;
}

// frozen sea: shiny pale ice with a web of cracks
function buildIce() {
  const mat = new THREE.MeshPhongMaterial({ color: "#a9dcee", specular: "#ffffff", shininess: 140, transparent: true, opacity: 0.94 });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vIceP;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvIceP = (modelMatrix * vec4(position, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>
      varying vec3 vIceP;
      float ih(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float in2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(ih(i), ih(i + vec2(1.0, 0.0)), f.x), mix(ih(i + vec2(0.0, 1.0)), ih(i + vec2(1.0, 1.0)), f.x), f.y); }`)
      .replace("#include <color_fragment>", `#include <color_fragment>
      { vec2 q = vIceP.xz;
        float a = abs(in2(q * 0.012) - 0.5), b = abs(in2(q * 0.031 + 7.0) - 0.5);
        float crack = (1.0 - smoothstep(0.0, 0.018, a)) * 0.8 + (1.0 - smoothstep(0.0, 0.012, b)) * 0.5;
        float frost = in2(q * 0.08) * 0.25;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.99, 1.0), frost);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.30, 0.52, 0.66), clamp(crack, 0.0, 1.0) * 0.55); }`);
  };
  const m = new THREE.Mesh(new THREE.PlaneGeometry(SIZE * 1.6, SIZE * 1.6), mat);
  m.rotation.x = -Math.PI / 2; m.position.y = 0.4;
  return m;
}

// glowing crystal spires in clusters, and big ice arches; every one of them is solid
function buildCrystals(low) {
  const rand = rng(77);
  const g = new THREE.Group();
  const geo = new THREE.ConeGeometry(1, 1, 6); geo.translate(0, 0.5, 0);
  const max = low ? 160 : 300;
  const mat = new THREE.MeshPhongMaterial({ color: "#86e2ff", emissive: "#1d6c9c", emissiveIntensity: 0.55, specular: "#ffffff", shininess: 110, flatShading: true, transparent: true, opacity: 0.92 });
  const inst = new THREE.InstancedMesh(geo, mat, max);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler(), c = new THREE.Color();
  let n = 0;
  for (let cl = 0; cl < 42 && n < max; cl++) {
    const a = rand() * 6.28, rr = 300 + rand() * 1800;
    const cx = Math.cos(a) * rr, cz = Math.sin(a) * rr;
    for (let i = 0; i < 8 && n < max; i++) {
      const x = cx + (rand() - 0.5) * 120, z = cz + (rand() - 0.5) * 120;
      const y = Math.max(0, crystalHeight(x, z));
      const r = 6 + rand() * 14, h = 40 + rand() * 150 * (i === 0 ? 1.4 : 1);
      e.set((rand() - 0.5) * 0.35, rand() * 6.28, (rand() - 0.5) * 0.35);
      m.compose(p.set(x, y - 4, z), q.setFromEuler(e), s.set(r, h, r));
      inst.setMatrixAt(n, m);
      inst.setColorAt(n, c.setHSL(0.52 + rand() * 0.1, 0.75, 0.62 + rand() * 0.15));
      addCyl(x, z, y - 5, y + h * 0.82, r * 0.62, "ice");
      n++;
    }
  }
  inst.count = n; inst.instanceMatrix.needsUpdate = true; if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  inst.frustumCulled = false;
  g.add(inst);
  // ice arches: half rings standing on the snow
  const archMat = new THREE.MeshPhongMaterial({ color: "#bfeaff", emissive: "#2a6f96", emissiveIntensity: 0.35, specular: "#ffffff", shininess: 90, flatShading: true, transparent: true, opacity: 0.9 });
  for (let i = 0; i < 9; i++) {
    const a = rand() * 6.28, rr = 500 + rand() * 1500;
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr, y = Math.max(0, crystalHeight(x, z));
    const R = 60 + rand() * 70, tube = 9 + rand() * 6, ry = rand() * 3.14;
    const arch = new THREE.Mesh(new THREE.TorusGeometry(R, tube, 6, 28, Math.PI), archMat);
    arch.position.set(x, y - 6, z); arch.rotation.y = ry;
    g.add(arch);
    for (let k = 0; k <= 12; k++) {                     // collision: spheres along the arch
      const t = (k / 12) * Math.PI;
      const lx = Math.cos(t) * R, ly = Math.sin(t) * R;
      addSph(x + lx * Math.cos(ry), y - 6 + ly, z - lx * Math.sin(ry), tube + 2, "ice");
    }
  }
  return g;
}

// northern lights: wavy ribbons high in the sky, strongest in the night mood
function buildAurora() {
  const uni = { uT: { value: 0 }, uStrength: { value: 0.35 } };
  const mat = new THREE.ShaderMaterial({
    uniforms: uni, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    vertexShader: `uniform float uT; varying vec2 vUv;
      void main(){ vUv = uv; vec3 p = position; p.z += sin(uv.x * 9.0 + uT * 0.35) * 160.0 + sin(uv.x * 23.0 - uT * 0.2) * 50.0;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
    fragmentShader: `uniform float uT; uniform float uStrength; varying vec2 vUv;
      void main(){ float band = smoothstep(0.0, 0.25, vUv.y) * (1.0 - smoothstep(0.35, 1.0, vUv.y));
        float rays = 0.55 + 0.45 * sin(vUv.x * 160.0 + sin(vUv.x * 13.0 + uT * 0.6) * 4.0);
        float fade = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
        vec3 c = mix(vec3(0.2, 1.0, 0.65), vec3(0.65, 0.35, 1.0), smoothstep(0.2, 0.9, vUv.y));
        gl_FragColor = vec4(c * band * rays * fade * uStrength, 1.0); }`,
  });
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const rib = new THREE.Mesh(new THREE.PlaneGeometry(7000, 700, 96, 1), mat);
    rib.position.set((i - 1) * 900, 1500 + i * 220, -2600 + i * 1400);
    rib.rotation.y = 0.3 * (i - 1);
    g.add(rib);
  }
  return { group: g, uni };
}

// falling snow: a box of flakes that always surrounds the camera (moved on the GPU, no per-frame work)
function buildSnow(low) {
  const N = low ? 900 : 1800, B = 700;
  const pos = new Float32Array(N * 3);
  const rand = rng(5);
  for (let i = 0; i < N; i++) { pos[i * 3] = rand() * B; pos[i * 3 + 1] = rand() * B; pos[i * 3 + 2] = rand() * B; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const uni = { uT: { value: 0 }, uCam: { value: new THREE.Vector3() } };
  const mat = new THREE.ShaderMaterial({
    uniforms: uni, transparent: true, depthWrite: false, fog: false,
    vertexShader: `uniform float uT; uniform vec3 uCam; varying float vA;
      void main(){ vec3 p = position;
        p.x += uT * 14.0 + sin(uT * 0.7 + position.y) * 8.0; p.y -= uT * 38.0; p.z += uT * 6.0;
        p = mod(p - uCam, ${B.toFixed(1)}) + uCam - ${(B / 2).toFixed(1)};
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vA = clamp(1.0 - (-mv.z) / ${(B * 0.55).toFixed(1)}, 0.0, 1.0);
        gl_PointSize = clamp(260.0 / -mv.z, 1.5, 7.0);
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vA;
      void main(){ vec2 d = gl_PointCoord - 0.5; if (dot(d, d) > 0.25) discard; gl_FragColor = vec4(1.0, 1.0, 1.0, vA * 0.85); }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return { pts, uni };
}

// freezing-wind zones: inside them the dragon slows and the screen frosts over (main.js applies the effect)
function makeWindZones() {
  const rand = rng(31), zones = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * 6.28 + rand() * 0.6, r = 600 + rand() * 1100;
    let x = Math.cos(a) * r, z = Math.sin(a) * r;
    const ds = Math.hypot(x, z + 1500);                    // keep the arrival point clear
    if (ds < 650) { x *= 1 + (650 - ds) / Math.max(1, Math.hypot(x, z)); z = z < -1500 ? z - (650 - ds) : z + (650 - ds); }
    zones.push({ x, z, r: 150 + rand() * 60 });
  }
  return zones;
}

export function buildCrystalWorld(low) {
  setThemeHeight("crystal", crystalHeight);
  setBuildGrid("crystal");
  const group = new THREE.Group();
  group.add(buildTerrain(), buildIce(), buildCrystals(low));
  setBuildGrid("kingdom");
  const aurora = buildAurora();
  const snow = buildSnow(low);
  group.add(aurora.group, snow.pts);
  const winds = makeWindZones();
  const snowN = snow.pts.geometry.attributes.position.count;
  return {
    group,
    winds,
    spawn: new THREE.Vector3(0, 460, -1500),
    // lower graphics: less snow and fainter, fewer aurora ribbons
    setDetail(level) {
      snow.pts.geometry.setDrawRange(0, Math.floor(snowN * (level === "low" ? 0.4 : level === "medium" ? 0.65 : 1)));
      aurora.group.children.forEach((r, i) => { r.visible = level !== "low" || i === 0; });
    },
    update(dt, camPos, time, mood) {
      aurora.uni.uT.value = time;
      // northern lights glow brighter as the sky darkens
      const dark = mood && mood.sunI !== undefined ? Math.max(0, 1.6 - mood.sunI) : 0.4;
      aurora.uni.uStrength.value += (0.25 + dark * 0.9 - aurora.uni.uStrength.value) * Math.min(1, dt);
      aurora.group.position.set(camPos.x * 0.6, 0, camPos.z * 0.6);
      snow.uni.uT.value = time; snow.uni.uCam.value.copy(camPos);
    },
  };
}
export const CRYSTAL_RADIUS = WORLD_RADIUS;
