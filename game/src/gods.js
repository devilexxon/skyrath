// Celestial god bosses: one every 5th stage, rotating through three, stronger each time round.
// The models are static meshes; motion (float, sway, the leviathan's body wave) and the glowing heart are added here.
import * as THREE from "three";

export const GODS = [
  { id: "leviathan", file: "boss_leviathan", name: "THE SKY LEVIATHAN", sub: "TIDES OF THE UPPER SKY", size: 230, heart: [0, -0.04, 0.3], wave: true, heartR: 30, yaw: Math.PI },
  { id: "sun", file: "boss_sun", name: "SOLARION, THE SUN COLOSSUS", sub: "THE LIGHT THAT BURNS", size: 200, heart: [0, 0.1, 0.16], halo: 0xffd27a, heartR: 28 },
  { id: "moon", file: "boss_moon", name: "NYXARA, THE MOON SERAPH", sub: "QUEEN OF THE STARFALL", size: 210, heart: [0, 0.12, 0.14], halo: 0xc9b8ff, heartR: 28 },
];
export const godForStage = (stage) => {
  const n = Math.floor(stage / 5) - 1;
  return { def: GODS[n % GODS.length], tier: Math.floor(n / GODS.length) };
};

const tmpBox = new THREE.Box3(), tmpV = new THREE.Vector3();

// Adds a gentle travelling wave along the model's long axis (used by the serpent-like leviathan).
function addWave(mat, uniforms, axisLen) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uWaveT = uniforms.t;
    sh.vertexShader = "uniform float uWaveT;\n" + sh.vertexShader.replace("#include <begin_vertex>",
      `#include <begin_vertex>
       float wk = position.z / ${axisLen.toFixed(1)};
       transformed.x += sin(wk * 6.0 - uWaveT * 2.4) * ${(axisLen * 0.045).toFixed(2)} * smoothstep(0.0, 0.5, abs(wk));
       transformed.y += cos(wk * 5.0 - uWaveT * 2.0) * ${(axisLen * 0.02).toFixed(2)};`);
  };
}

export class GodBoss {
  constructor(gltf, def, tier, glowTex) {
    this.def = def; this.tier = tier;
    this.root = new THREE.Group();
    this.root.rotation.order = "YXZ";
    this.model = gltf.scene.clone(true);
    this.inner = new THREE.Group();
    this.inner.add(this.model);
    this.root.add(this.inner);
    this.t = Math.random() * 10;
    this.uniforms = { t: { value: 0 } };
    this.oneShot = null; this.hold = false; this.actions = {};

    // fit: centre the model, scale its longest side to def.size, face +Z (toward the target when root looks at it)
    tmpBox.setFromObject(this.model);
    const size = tmpBox.getSize(new THREE.Vector3()), centre = tmpBox.getCenter(new THREE.Vector3());
    const k = def.size / Math.max(size.x, size.y, size.z);
    this.model.position.copy(centre).multiplyScalar(-k);
    this.model.scale.setScalar(k);
    this.inner.rotation.y = def.yaw || 0;
    const axisLen = Math.max(size.x, size.z) * k * 0.5;
    this.model.traverse((o) => {
      if (!o.isMesh) return;
      o.frustumCulled = false;
      const m = new THREE.MeshToonMaterial({ map: o.material.map || null, color: 0xffffff });
      m.emissive = new THREE.Color(0x30101c); m.emissiveIntensity = 0.25;
      if (def.wave) addWave(m, this.uniforms, axisLen / k);
      o.material = m;
    });

    // glowing crystal heart: the weak point
    this.heart = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff2e7a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
    this.heart.position.set(def.heart[0] * def.size, def.heart[1] * def.size, def.heart[2] * def.size);
    this.heart.scale.setScalar(def.heartR * 1.6);
    this.root.add(this.heart);
    if (def.ringMesh) {        // the models carry their own halos; kept for future gods without one
      this.halo = new THREE.Mesh(new THREE.RingGeometry(def.size * 0.32, def.size * 0.36, 48),
        new THREE.MeshBasicMaterial({ color: def.halo, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      this.halo.position.set(0, def.size * 0.3, -def.size * 0.12);
      this.root.add(this.halo);
    }
  }
  play() {}
  setBase() {}
  setCoreOpen(open) { this.coreOpen = open; if (open) this.flash = 1; }
  setFade(k) { this.fade = k; this.inner.scale.setScalar(Math.max(0.001, k)); this.heart.visible = k > 0.3; }
  once(name) { if (name === "roar" || name === "hit") this.flash = name === "roar" ? 1 : 0.35; return 0; }
  heartWorld(out) { return this.heart.getWorldPosition(out); }
  mouth(out) { return this.heartWorld(out); }
  update(dt, _talk, dying) {
    this.t += dt;
    this.uniforms.t.value = this.t;
    this.inner.position.y = Math.sin(this.t * 0.9) * this.def.size * 0.03;
    this.inner.rotation.z = Math.sin(this.t * 0.6) * 0.05;
    // sealed core: small, dim and violet; open core: big, bright and pulsing fast
    const open = this.coreOpen;
    const pulse = open ? 1.5 + Math.sin(this.t * 12) * 0.2 + (this.flash || 0) * 0.6 : 0.7 + Math.sin(this.t * 3) * 0.05;
    this.heart.scale.setScalar(this.def.heartR * 1.6 * pulse * (this.fade ?? 1));
    this.heart.material.color.setHex(open ? 0xff2e7a : 0x6a4a9a);
    this.heart.material.opacity = dying ? 0.4 : open ? 1 : 0.55;
    if (this.flash) this.flash = Math.max(0, this.flash - dt * 2);
    if (this.halo) { this.halo.rotation.z += dt * 0.4; this.halo.lookAt(tmpV.copy(this.halo.getWorldPosition(tmpV)).add(this.root.getWorldDirection(new THREE.Vector3()))); }
  }
  dispose() { this.root.removeFromParent(); }
}

// Per-god movement: drift around the player, swoop to a new side, or teleport.
// Returns true while the god is busy moving (attacks pause so the player can read the fight).
const MOVE = {
  leviathan: { swoop: [5, 7], tele: [12, 16], drift: 85 },
  sun: { swoop: [4.5, 6.5], tele: [9, 12], drift: 70 },
  moon: { swoop: [7, 9], tele: [7, 10], drift: 75 },
};
export function godMove(e, dt, ctx) {
  const p = ctx.player, cfg = MOVE[e.godDef.id] || MOVE.sun;
  const M = e.mv || (e.mv = { state: "drift", t: 0, swoopT: ctx.rand(...cfg.swoop), teleT: ctx.rand(...cfg.tele), dist: ctx.rand(400, 500), bob: Math.random() * 6, to: new THREE.Vector3(), from: new THREE.Vector3() });
  const rage = e.phase === 2 ? 1.55 : 1;
  const T = new THREE.Vector3(), S = new THREE.Vector3();
  M.bob += dt;
  const dist = e.pos.distanceTo(p.pos);
  if (e.pos.y > ctx.ceiling) { e.pos.y = ctx.ceiling; if (e.vel.y > 0) e.vel.y = 0; }

  if (M.state === "drift") {
    M.swoopT -= dt * rage; M.teleT -= dt * rage;
    // circle the player at a chosen range, bobbing up and down
    T.copy(e.pos).sub(p.pos); T.y = 0;
    const r = T.length() || 1; T.divideScalar(r);
    S.set(-T.z, 0, T.x).multiplyScalar(e.orbit);
    const want = S.multiplyScalar(cfg.drift * rage + 20).addScaledVector(T, (M.dist - r) * 0.8);
    want.y = (Math.min(ctx.ceiling, p.pos.y + 45 + Math.sin(M.bob * 0.7) * 15) - e.pos.y) * 0.9;   // hover a little above you, never out of reach
    e.vel.lerp(want, Math.min(1, 1.5 * dt));
    e.pos.addScaledVector(e.vel, dt);
    if (M.teleT <= 0 || dist > 900 || dist < e.radius + 60) { M.state = "vanish"; M.t = 0; e.dragon.once("roar"); ctx.ring(e.pos, e.godDef.halo || 0x5fd0ff, 160); ctx.audio.play("ultimate_charge", 0.6, 1.6); }
    else if (M.swoopT <= 0) {
      // fast curved dash to the opposite side of the player
      M.state = "swoop"; M.t = 0; M.from.copy(e.pos);
      const a = Math.atan2(e.pos.z - p.pos.z, e.pos.x - p.pos.x) + ctx.rand(1.6, 2.6) * (Math.random() < 0.5 ? 1 : -1);
      M.to.set(p.pos.x + Math.cos(a) * M.dist, p.pos.y + ctx.rand(20, 140), p.pos.z + Math.sin(a) * M.dist);
      e.orbit = -e.orbit;
      ctx.audio.play("boost", 0.9, 0.5);
    }
    return false;
  }
  if (M.state === "swoop") {
    M.t += dt / 1.3;
    const k = Math.min(1, M.t), s = k * k * (3 - 2 * k);
    T.lerpVectors(M.from, M.to, s);
    T.y += Math.sin(k * Math.PI) * 90;                       // arcs up over the player
    e.vel.copy(T).sub(e.pos).divideScalar(Math.max(dt, 1e-3));
    e.pos.copy(T);
    if (Math.random() < 0.6) ctx.fx.puff(e.pos, 0xffffff, 30, 0.6, null, 40);
    if (k >= 1) { M.state = "drift"; M.swoopT = ctx.rand(...cfg.swoop); e.vel.multiplyScalar(0.1); }
    return true;
  }
  if (M.state === "vanish") {
    M.t += dt;
    e.dragon.setFade(1 - M.t / 0.45);
    if (Math.random() < 0.8) ctx.fx.puff(e.pos, e.godDef.halo || 0x9fe0ff, 40, 0.5, null, 60);
    if (M.t >= 0.45) {
      // reappear somewhere new around the player
      const a = Math.random() * Math.PI * 2;
      M.dist = ctx.rand(420, 520);
      e.pos.set(p.pos.x + Math.cos(a) * M.dist, Math.min(ctx.ceiling, Math.max(p.pos.y + ctx.rand(10, 80), ctx.groundAt(p.pos.x + Math.cos(a) * M.dist, p.pos.z + Math.sin(a) * M.dist) + 160)), p.pos.z + Math.sin(a) * M.dist);
      e.vel.set(0, 0, 0);
      M.state = "appear"; M.t = 0;
      ctx.ring(e.pos, e.godDef.halo || 0x5fd0ff, 200); ctx.audio.play("lightning_shot", 0.8, 0.5);
    }
    return true;
  }
  // appear: grow back in, short grace before attacking
  M.t += dt;
  e.dragon.setFade(Math.min(1, M.t / 0.35));
  if (M.t >= 0.6) { M.state = "drift"; M.teleT = ctx.rand(...cfg.tele); e.dragon.setFade(1); }
  return true;
}

// Per-god attacks. ctx gives: shoot(from, dir, speed, dmg, size, homing), player, fx, audio, camera, rand, ring(pos,color,r)
export function godAttack(e, dt, ctx) {
  const { player: p } = ctx;
  const A = e.atk || (e.atk = { t: 2.5, spin: 0, mode: 0, burst: 0, burstT: 0 });
  const rage = e.phase === 2 ? 1.45 : 1;
  const T = new THREE.Vector3(), D = new THREE.Vector3(), H = new THREE.Vector3();
  e.dragon.heartWorld(H);
  A.t -= dt * rage * (e.atkK || 1);

  if (e.godDef.id === "leviathan") {
    // spiralling stream of tide orbs, and a ring wave in phase two
    A.spin += dt * 2.2;
    A.burstT -= dt;
    if (A.burst > 0 && A.burstT <= 0) {
      A.burst--; A.burstT = 0.09;
      for (let k = 0; k < 3; k++) {
        const a = A.spin + (k / 3) * Math.PI * 2;
        T.copy(p.pos).sub(H).normalize();
        D.set(Math.cos(a), Math.sin(a) * 0.4, Math.sin(a)).multiplyScalar(0.35).add(T).normalize();
        ctx.shoot(H, D, e.shotSpeed * 0.85, e.dmg, 14, false);
      }
    }
    if (A.t <= 0.9 && !A.warned) {
      A.warned = true;
      const nm = (A.mode + 1) % 2;
      if (nm === 0 || e.phase === 1) ctx.warn("TIDE SPIRAL – KEEP MOVING!"); else ctx.warn("TIDAL RING – CLIMB OR DIVE!");
      ctx.rune(H, 0x5fd0ff, 120);
    }
    if (A.t <= 0) {
      A.warned = false;
      A.mode = (A.mode + 1) % 2;
      if (A.mode === 0 || e.phase === 1) { A.burst = 14; A.t = 4.2; ctx.audio.play("ice_shot", 0.7, 0.6); }
      else {
        A.t = 5;
        for (let k = 0; k < 22; k++) { const a = (k / 22) * Math.PI * 2; ctx.shoot(H, D.set(Math.cos(a), 0, Math.sin(a)), e.shotSpeed * 0.7, e.dmg, 16, false); }
        ctx.ring(H, 0x5fd0ff, 140); ctx.audio.play("dragon_roar", 0.8, 0.7);
      }
    }
  } else if (e.godDef.id === "sun") {
    // fans of solar rays aimed at the player; phase two adds slow homing sun orbs
    if (A.t <= 0.9 && !A.warned) {
      A.warned = true;
      const nm = (A.mode + 1) % (e.phase === 2 ? 3 : 2);
      ctx.warn(nm < 2 ? "SOLAR FAN – DODGE!" : "HOMING SUNS – KEEP MOVING!");
      ctx.rune(H, 0xffd27a, 110);
    }
    if (A.t <= 0) {
      A.warned = false;
      A.mode = (A.mode + 1) % (e.phase === 2 ? 3 : 2);
      T.copy(p.pos).addScaledVector(p.fwd, p.speed * 0.6).sub(H).normalize();
      if (A.mode < 2) {
        A.t = 2.6;
        const n = 7 + (e.phase === 2 ? 4 : 0);
        const side = D.crossVectors(T, THREE.Object3D.DEFAULT_UP).normalize();
        for (let k = 0; k < n; k++) {
          const s = (k / (n - 1) - 0.5) * 0.9;
          ctx.shoot(H, T.clone().addScaledVector(side, s).addScaledVector(THREE.Object3D.DEFAULT_UP, A.mode ? s * 0.4 : 0).normalize(), e.shotSpeed, e.dmg, 13, false);
        }
        ctx.audio.play("fire_shot", 0.8, 0.6);
      } else {
        A.t = 3.4;
        for (let k = 0; k < 3; k++) ctx.shoot(H, T.clone().add(D.set(ctx.rand(-0.3, 0.3), ctx.rand(0.1, 0.4), ctx.rand(-0.3, 0.3))).normalize(), e.shotSpeed * 0.45, e.dmg * 1.6, 26, true);
        ctx.ring(H, 0xffd27a, 120); ctx.audio.play("ultimate_charge", 0.6, 1.3);
      }
    }
  } else {
    // moon: starfall rains down on where the player is heading; phase two adds crescent sweeps
    if (A.t <= 0.9 && !A.warned) {
      A.warned = true;
      const nm = (A.mode + 1) % (e.phase === 2 ? 2 : 1);
      if (nm === 0) {
        // mark where the stars will fall (ahead of you), then drop them exactly there
        A.aim = (A.aim || new THREE.Vector3()).copy(p.pos).addScaledVector(p.fwd, p.speed * 0.6);
        ctx.warn("STARFALL – MOVE!");
        for (let k = 0; k < 3; k++) ctx.rune(D.set(A.aim.x + ctx.rand(-60, 60), A.aim.y + ctx.rand(-20, 20), A.aim.z + ctx.rand(-60, 60)), 0xc9b8ff, 70);
      } else { ctx.warn("CRESCENT SWEEP – DODGE!"); ctx.rune(H, 0xc9b8ff, 110); }
    }
    if (A.t <= 0) {
      A.warned = false;
      A.mode = (A.mode + 1) % (e.phase === 2 ? 2 : 1);
      if (A.mode === 0) {
        A.t = 3;
        if (A.aim) T.copy(A.aim); else T.copy(p.pos).addScaledVector(p.fwd, p.speed * 1.4);
        for (let k = 0; k < 12; k++) {
          D.set(T.x + ctx.rand(-90, 90), T.y + ctx.rand(160, 230), T.z + ctx.rand(-90, 90));
          ctx.shoot(D, new THREE.Vector3(ctx.rand(-0.08, 0.08), -1, ctx.rand(-0.08, 0.08)).normalize(), e.shotSpeed * 0.8, e.dmg, 13, false);
        }
        ctx.audio.play("gem_pickup", 0.8, 0.6);
      } else {
        A.t = 3.2;
        T.copy(p.pos).sub(H).normalize();
        const side = D.crossVectors(T, THREE.Object3D.DEFAULT_UP).normalize();
        for (let k = 0; k < 15; k++) {
          const s = (k / 14 - 0.5) * 2.2;
          ctx.shoot(H, T.clone().multiplyScalar(Math.cos(s * 0.6)).addScaledVector(side, Math.sin(s * 0.6)).addScaledVector(THREE.Object3D.DEFAULT_UP, -Math.abs(s) * 0.12).normalize(), e.shotSpeed * 0.9, e.dmg, 14, false);
        }
        ctx.ring(H, 0xc9b8ff, 110); ctx.audio.play("lightning_shot", 0.7, 0.6);
      }
    }
  }
}
