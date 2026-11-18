// Glow particles, shock rings and beams. Everything is pooled so combat never allocates; all glow particles share one draw call.
import * as THREE from "three";

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,255,255,0.75)");
  grad.addColorStop(0.6, "rgba(255,255,255,0.18)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function starTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  g.translate(32, 32);
  g.fillStyle = "#fff";
  g.beginPath();
  for (let i = 0; i < 8; i++) { const r = i % 2 ? 5 : 31, a = (i / 8) * Math.PI * 2; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  g.closePath(); g.fill();
  const grad = g.createRadialGradient(0, 0, 0, 0, 0, 14);
  grad.addColorStop(0, "rgba(255,255,255,1)"); grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad; g.fillRect(-16, -16, 32, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// a long thin glowing streak (used for shards and speed lines, stretched along the direction of travel)
function streakTexture() {
  const c = document.createElement("canvas");
  c.width = 64; c.height = 16;
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 64, 0);
  grad.addColorStop(0, "rgba(255,255,255,0)"); grad.addColorStop(0.55, "rgba(255,255,255,0.9)"); grad.addColorStop(0.8, "rgba(255,255,255,1)"); grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.beginPath(); g.moveTo(0, 8); g.lineTo(48, 1); g.lineTo(64, 8); g.lineTo(48, 15); g.closePath(); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// a glowing rune circle (two rings, a star and tick marks) used to show where a boss attack will land
function runeTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  g.translate(128, 128); g.strokeStyle = "#fff"; g.lineCap = "round";
  g.lineWidth = 7; g.beginPath(); g.arc(0, 0, 118, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 100, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(0, 0, 46, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 4; g.beginPath();
  for (let i = 0; i <= 5; i++) { const a = (i * 2 / 5) * Math.PI * 2 - Math.PI / 2; g.lineTo(Math.cos(a) * 98, Math.sin(a) * 98); }
  g.stroke();
  for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; g.beginPath(); g.moveTo(Math.cos(a) * 104, Math.sin(a) * 104); g.lineTo(Math.cos(a) * 114, Math.sin(a) * 114); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export const ELEMENTS = {
  fire: { core: 0xfff1b0, glow: 0xff7a1e, trail: 0xff4a10, name: "Fire" },
  frost: { core: 0xffffff, glow: 0x7fe3ff, trail: 0x4fb4ff, name: "Frost" },
  storm: { core: 0xf3e8ff, glow: 0xb06bff, trail: 0x4fe8ff, name: "Storm" },
  forest: { core: 0xf4ffd0, glow: 0x7fe04a, trail: 0xffd24a, name: "Forest" },
  foe: { core: 0xffe0ea, glow: 0xff2e63, trail: 0xff2e63, name: "Foe" },
};

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Color();
const POOL = { high: 700, medium: 450, low: 280 };

// All glow particles are drawn in ONE draw call: an instanced camera-facing quad with per-particle position, size,
// rotation, colour, opacity and texture (glow / star / streak). (It used to be 700 separate sprites.)
const PART_VS = `
attribute vec3 iPos; attribute vec2 iSize; attribute float iRot; attribute vec4 iCol; attribute float iTex;
varying vec2 vUv; varying vec4 vCol; varying float vTex;
void main() {
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  vec2 q = position.xy * iSize;
  float c = cos(iRot), s = sin(iRot);
  mv.xy += vec2(c * q.x - s * q.y, s * q.x + c * q.y);
  vUv = uv; vCol = iCol; vTex = iTex;
  gl_Position = projectionMatrix * mv;
}`;
const PART_FS = `
uniform sampler2D tGlow; uniform sampler2D tStar; uniform sampler2D tStreak;
varying vec2 vUv; varying vec4 vCol; varying float vTex;
void main() {
  vec4 t = vTex < 0.5 ? texture2D(tGlow, vUv) : (vTex < 1.5 ? texture2D(tStar, vUv) : texture2D(tStreak, vUv));
  gl_FragColor = vec4(vCol.rgb * t.rgb, t.a * vCol.a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class FX {
  constructor(scene, count = 700) {
    this.tex = glowTexture();
    this.star = starTexture();
    this.streak = streakTexture();
    this.low = false;          // low graphics: fewer particles
    this.camera = null;        // set by the game so streaks can face along their motion on screen
    this.scene = scene;
    this.cap = count;          // how many particles may be alive at once (lowered on medium / low graphics)
    this.live = [];
    this.free = [];
    for (let i = 0; i < count; i++) this.free.push({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), col: new THREE.Color(), life: 0, max: 1, size: 1, grow: 0, drag: 0, streak: 0, rot: 0, tex: 0, sx: 1, sy: 1 });
    // the batch
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const attr = (n) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(count * n), n); a.setUsage(THREE.DynamicDrawUsage); return a; };
    this.aPos = attr(3); this.aSize = attr(2); this.aRot = attr(1); this.aCol = attr(4); this.aTex = attr(1);
    geo.setAttribute("iPos", this.aPos); geo.setAttribute("iSize", this.aSize); geo.setAttribute("iRot", this.aRot);
    geo.setAttribute("iCol", this.aCol); geo.setAttribute("iTex", this.aTex);
    geo.instanceCount = 0;
    this.geo = geo;
    const mat = new THREE.ShaderMaterial({
      uniforms: { tGlow: { value: this.tex }, tStar: { value: this.star }, tStreak: { value: this.streak } },
      vertexShader: PART_VS, fragmentShader: PART_FS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    // rings, runes and beams are few: their meshes and materials are reused instead of made and destroyed each time
    this.rings = []; this.runes = []; this.beams = [];
    this.ringFree = []; this.runeFree = []; this.beamFree = [];
    this.ringGeo = new THREE.RingGeometry(0.82, 1, 40);
    this.beamGeo = new THREE.CylinderGeometry(1, 1, 1, 14, 1, true);
    this.runeTex = runeTexture();
    this.planeGeo = new THREE.PlaneGeometry(2, 2);
  }

  // graphics level: "high" | "medium" | "low"
  setDetail(level) {
    this.cap = Math.min(this.free.length + this.live.length, POOL[level] || POOL.high);
    this.low = level === "low";
  }

  _take() {
    if (this.live.length >= this.cap) return null;
    const p = this.free.pop();
    if (p) this.live.push(p);
    return p || null;
  }

  puff(pos, color, size, life, vel, grow = 0, drag = 0, star = false) {
    if (this.low && Math.random() < 0.4) return;            // low graphics: skip some of the small puffs
    const p = this._take();
    if (!p) return;
    p.streak = 0; p.tex = star ? 1 : 0; p.rot = star ? Math.random() * 1.5 : 0;
    p.pos.copy(pos); p.col.setHex(color);
    if (vel) p.vel.copy(vel); else p.vel.set(0, 0, 0);
    p.life = p.max = life; p.size = size; p.grow = grow; p.drag = drag;
    p.sx = p.sy = size;
  }

  // spiky shards that fly outward along their motion: golden sparks for hits and kills
  shards(pos, colors, n, speed, size, life) {
    if (this.low) n = Math.ceil(n / 2);
    const v = _b;
    for (let i = 0; i < n; i++) {
      v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.5 + Math.random() * 0.8));
      this.streakPuff(pos, colors[i % colors.length], size * (0.6 + Math.random() * 0.7), life * (0.6 + Math.random() * 0.6), v, 3.2, 2.4);
    }
  }

  streakPuff(pos, color, size, life, vel, stretch = 3.2, drag = 0) {
    const p = this._take();
    if (!p) return;
    p.tex = 2; p.rot = 0;
    p.pos.copy(pos); p.col.setHex(color);
    p.vel.copy(vel);
    p.life = p.max = life; p.size = size; p.grow = 0; p.drag = drag; p.streak = stretch;
    p.sx = size * stretch; p.sy = size * 0.45;
  }

  burst(pos, el, n, speed, size, life) {
    if (this.low) n = Math.ceil(n / 2);
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.35 + Math.random()));
      this.puff(pos, i % 3 === 0 ? el.core : (i % 2 ? el.glow : el.trail), size * (0.5 + Math.random()), life * (0.6 + Math.random() * 0.7), v, size * 0.6, 2.2);
    }
  }

  stars(pos, color, n, speed, size, life) {
    if (this.low) n = Math.ceil(n / 2);
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random()));
      this.puff(pos, i % 2 ? color : 0xffffff, size * (0.6 + Math.random() * 0.8), life * (0.7 + Math.random() * 0.6), v, 0, 2.5, true);
    }
  }

  ring(pos, color, radius, life, camera) {
    let m = this.ringFree.pop();
    if (!m) m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    m.material.color.setHex(color); m.material.opacity = 1;
    m.position.copy(pos); m.scale.setScalar(1);
    if (camera) m.quaternion.copy(camera.quaternion); else m.quaternion.identity();
    this.scene.add(m);
    this.rings.push({ m, radius, life, max: life });
  }

  // rune circle facing the camera: grows in, spins, then fades (about 0.9 s by default)
  rune(pos, color, radius, life = 0.95) {
    let m = this.runeFree.pop();
    if (!m) {
      m = new THREE.Mesh(this.planeGeo, new THREE.MeshBasicMaterial({ map: this.runeTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, side: THREE.DoubleSide, fog: false }));
      m.renderOrder = 5;
    }
    m.material.color.setHex(color); m.material.opacity = 1;
    m.position.copy(pos); m.scale.setScalar(0.001);
    this.scene.add(m);
    this.runes.push({ m, radius, life, max: life, spin: Math.random() < 0.5 ? 1 : -1 });
  }

  beam(from, dir, length, radius, el, life) {
    const mk = (color, r, op) => {
      let m = this.beamFree.pop();
      if (!m) m = new THREE.Mesh(this.beamGeo, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      m.material.color.setHex(color); m.material.opacity = op;
      m.position.copy(from).addScaledVector(dir, length / 2);
      m.quaternion.setFromUnitVectors(THREE.Object3D.DEFAULT_UP, dir);
      m.scale.set(r, length, r);
      this.scene.add(m);
      this.beams.push({ m, r, life, max: life, op });
    };
    mk(el.glow, radius, 0.55); mk(el.core, radius * 0.45, 0.95);
  }

  update(dt) {
    const P = this.aPos.array, S = this.aSize.array, R = this.aRot.array, C = this.aCol.array, T = this.aTex.array;
    let j = 0;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.life -= dt;
      if (p.life <= 0) { this.live[i] = this.live[this.live.length - 1]; this.live.pop(); this.free.push(p); continue; }
      const k = p.life / p.max;
      p.pos.addScaledVector(p.vel, dt);
      if (p.drag) p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      if (p.streak) {
        // point the streak along its on-screen motion
        if (this.camera) {
          _a.copy(p.pos).project(this.camera); _b.copy(p.pos).addScaledVector(p.vel, 0.02).project(this.camera);
          p.rot = Math.atan2((_b.y - _a.y) / this.camera.aspect, _b.x - _a.x);
        }
        p.sx = p.size * p.streak * (0.5 + 0.5 * k); p.sy = p.size * 0.45;
      } else p.sx = p.sy = p.size + p.grow * (1 - k);
      P[j * 3] = p.pos.x; P[j * 3 + 1] = p.pos.y; P[j * 3 + 2] = p.pos.z;
      S[j * 2] = p.sx; S[j * 2 + 1] = p.sy;
      R[j] = p.rot; T[j] = p.tex;
      C[j * 4] = p.col.r; C[j * 4 + 1] = p.col.g; C[j * 4 + 2] = p.col.b; C[j * 4 + 3] = k * 0.85;
      j++;
    }
    this.geo.instanceCount = j;
    if (j) {
      for (const [a, n] of [[this.aPos, 3], [this.aSize, 2], [this.aRot, 1], [this.aCol, 4], [this.aTex, 1]]) {
        a.clearUpdateRanges(); a.addUpdateRange(0, j * n); a.needsUpdate = true;
      }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      const k = 1 - r.life / r.max;
      r.m.scale.setScalar(1 + r.radius * k);
      r.m.material.opacity = 1 - k;
      if (r.life <= 0) { this.scene.remove(r.m); this.ringFree.push(r.m); this.rings.splice(i, 1); }
    }
    for (let i = this.runes.length - 1; i >= 0; i--) {
      const r = this.runes[i];
      r.life -= dt;
      const k = 1 - r.life / r.max;
      if (this.camera) r.m.quaternion.copy(this.camera.quaternion);
      r.m.rotateZ(k * 3 * r.spin);
      r.m.scale.setScalar(r.radius * Math.min(1, k * 4));
      r.m.material.opacity = (k < 0.8 ? 1 : (1 - k) / 0.2) * (0.75 + 0.25 * Math.sin(k * 40));
      if (r.life <= 0) { this.scene.remove(r.m); this.runeFree.push(r.m); this.runes.splice(i, 1); }
    }
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.life -= dt;
      const k = Math.max(0, b.life / b.max);
      const w = b.r * (0.35 + 0.65 * Math.sin(Math.min(1, (1 - k) * 6) * Math.PI / 2)) * (0.3 + 0.7 * k);
      b.m.scale.x = b.m.scale.z = w;
      b.m.material.opacity = b.op * k;
      if (b.life <= 0) { this.scene.remove(b.m); this.beamFree.push(b.m); this.beams.splice(i, 1); }
    }
  }
}
