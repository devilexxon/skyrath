// Glow particles, shock rings and beams. Everything is pooled so combat never allocates.
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

const _a = new THREE.Vector3(), _b = new THREE.Vector3();

export class FX {
  constructor(scene, count = 700) {
    this.tex = glowTexture();
    this.star = starTexture();
    this.streak = streakTexture();
    this.low = false;          // low graphics: half the particles
    this.camera = null;        // set by the game so streaks can face along their motion on screen
    this.parts = [];
    this.free = [];
    for (let i = 0; i < count; i++) {
      const m = new THREE.SpriteMaterial({ map: this.tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
      const s = new THREE.Sprite(m);
      s.visible = false;
      scene.add(s);
      const p = { s, vel: new THREE.Vector3(), life: 0, max: 1, size: 1, grow: 0, drag: 0, streak: 0 };
      this.parts.push(p); this.free.push(p);
    }
    this.rings = [];
    this.beams = [];
    this.scene = scene;
    this.ringGeo = new THREE.RingGeometry(0.82, 1, 40);
    this.beamGeo = new THREE.CylinderGeometry(1, 1, 1, 14, 1, true);
    this.runeTex = runeTexture();
    this.planeGeo = new THREE.PlaneGeometry(2, 2);
    this.runes = [];
  }

  puff(pos, color, size, life, vel, grow = 0, drag = 0, star = false) {
    const p = this.free.pop();
    if (!p) return;
    p.streak = 0;
    p.s.material.map = star ? this.star : this.tex;
    p.s.material.rotation = star ? Math.random() * 1.5 : 0;
    p.s.position.copy(pos);
    p.s.material.color.setHex(color);
    p.s.material.opacity = 1;
    p.s.scale.setScalar(size);
    p.s.visible = true;
    if (vel) p.vel.copy(vel); else p.vel.set(0, 0, 0);
    p.life = p.max = life; p.size = size; p.grow = grow; p.drag = drag;
  }

  // spiky shards that fly outward along their motion: golden sparks for hits and kills
  shards(pos, colors, n, speed, size, life) {
    if (this.low) n = Math.ceil(n / 2);
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.5 + Math.random() * 0.8));
      this.streakPuff(pos, colors[i % colors.length], size * (0.6 + Math.random() * 0.7), life * (0.6 + Math.random() * 0.6), v, 3.2, 2.4);
    }
  }

  streakPuff(pos, color, size, life, vel, stretch = 3.2, drag = 0) {
    const p = this.free.pop();
    if (!p) return;
    p.s.material.map = this.streak;
    p.s.position.copy(pos);
    p.s.material.color.setHex(color);
    p.s.material.opacity = 1;
    p.s.visible = true;
    p.vel.copy(vel);
    p.life = p.max = life; p.size = size; p.grow = 0; p.drag = drag; p.streak = stretch;
    p.s.scale.set(size * stretch, size * 0.45, 1);
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
    const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    m.position.copy(pos);
    if (camera) m.quaternion.copy(camera.quaternion);
    this.scene.add(m);
    this.rings.push({ m, radius, life, max: life });
  }

  // rune circle facing the camera: grows in, spins, then fades (about 0.9 s by default)
  rune(pos, color, radius, life = 0.95) {
    const m = new THREE.Mesh(this.planeGeo, new THREE.MeshBasicMaterial({ map: this.runeTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, side: THREE.DoubleSide, fog: false }));
    m.position.copy(pos);
    m.renderOrder = 5;
    this.scene.add(m);
    this.runes.push({ m, radius, life, max: life, spin: Math.random() < 0.5 ? 1 : -1 });
  }

  beam(from, dir, length, radius, el, life) {
    const mk = (color, r, op) => {
      const m = new THREE.Mesh(this.beamGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      m.position.copy(from).addScaledVector(dir, length / 2);
      m.quaternion.setFromUnitVectors(THREE.Object3D.DEFAULT_UP, dir);
      m.scale.set(r, length, r);
      this.scene.add(m);
      this.beams.push({ m, r, life, max: life, op });
    };
    mk(el.glow, radius, 0.55); mk(el.core, radius * 0.45, 0.95);
  }

  update(dt) {
    for (const p of this.parts) {
      if (!p.s.visible) continue;
      p.life -= dt;
      if (p.life <= 0) { p.s.visible = false; this.free.push(p); continue; }
      const k = p.life / p.max;
      p.s.position.addScaledVector(p.vel, dt);
      if (p.drag) p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      p.s.material.opacity = k * 0.85;
      if (p.streak) {
        // point the streak along its on-screen motion
        if (this.camera) {
          _a.copy(p.s.position).project(this.camera); _b.copy(p.s.position).addScaledVector(p.vel, 0.02).project(this.camera);
          p.s.material.rotation = Math.atan2((_b.y - _a.y) / this.camera.aspect * 1, _b.x - _a.x);
        }
        p.s.scale.set(p.size * p.streak * (0.5 + 0.5 * k), p.size * 0.45, 1);
      } else p.s.scale.setScalar(p.size + p.grow * (1 - k));
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      const k = 1 - r.life / r.max;
      r.m.scale.setScalar(1 + r.radius * k);
      r.m.material.opacity = 1 - k;
      if (r.life <= 0) { this.scene.remove(r.m); r.m.material.dispose(); this.rings.splice(i, 1); }
    }
    for (let i = this.runes.length - 1; i >= 0; i--) {
      const r = this.runes[i];
      r.life -= dt;
      const k = 1 - r.life / r.max;
      if (this.camera) r.m.quaternion.copy(this.camera.quaternion);
      r.m.rotateZ(k * 3 * r.spin);
      r.m.scale.setScalar(r.radius * Math.min(1, k * 4));
      r.m.material.opacity = (k < 0.8 ? 1 : (1 - k) / 0.2) * (0.75 + 0.25 * Math.sin(k * 40));
      if (r.life <= 0) { this.scene.remove(r.m); r.m.material.dispose(); this.runes.splice(i, 1); }
    }
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.life -= dt;
      const k = Math.max(0, b.life / b.max);
      const w = b.r * (0.35 + 0.65 * Math.sin(Math.min(1, (1 - k) * 6) * Math.PI / 2)) * (0.3 + 0.7 * k);
      b.m.scale.x = b.m.scale.z = w;
      b.m.material.opacity = b.op * k;
      if (b.life <= 0) { this.scene.remove(b.m); b.m.material.dispose(); this.beams.splice(i, 1); }
    }
  }
}
