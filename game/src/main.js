// Skyrath: flight, combat, endless stages, player levels, coins, revive.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { createWorld, heightAt, WORLD_RADIUS, CEILING, WATER_Y, CASTLE, VILLAGES } from "./world.js";
import { createStory } from "./story.js";
import { initCloud, cloudDirty, cloudSignIn, cloudChoose, cloudStatusText, cloud } from "./cloud.js";
import { buildCrystalWorld } from "./crystal.js";
import { createPortal } from "./portal.js";
import { createMeta } from "./meta.js";
import { GodBoss, godForStage, godAttack, godMove, GODS } from "./gods.js";
import { createProgression, UPGRADES, upgradeCost, FEATHER_GEMS, GEM_TO_COINS } from "./progression.js";
import { FX, ELEMENTS } from "./fx.js";
import { PLATFORM, IS_CRAZY, isMobile, initPlatform, hasSdk, setHooks, loadSave, writeSave, loadingStart, loadingStop, gameplayStart, gameplayStop, happytime, watchMuteSetting, rewardedAvailable, showRewarded, showMidgame } from "./platform.js";
import { SKINS, LEGENDS, RARITY, skinById, skinsFor, skinState } from "./skins.js";
import { AudioMgr } from "./audio.js";

const $ = (id) => document.getElementById(id);
const BOT = new URLSearchParams(location.search).has("bot");
const DRAGONS = {
  fire: { name: "EMBER", desc: "Fire. +15% damage.", shot: "fire_shot", dmg: 1.15, hp: 1, speed: 1, regen: 0 },
  frost: { name: "GLACIER", desc: "Frost. +25% health.", shot: "ice_shot", dmg: 1, hp: 1.25, speed: 1, regen: 0 },
  storm: { name: "TEMPEST", desc: "Storm. +12% speed.", shot: "lightning_shot", dmg: 1, hp: 1, speed: 1.12, regen: 0 },
  forest: { name: "VERDANT", desc: "Forest. Heals over time.", shot: "leaf_shot", dmg: 1, hp: 1, speed: 1, regen: 1.6 },
};
const IDS = Object.keys(DRAGONS);                 // the four base dragons (also the enemy pool)
const LEGEND_IDS = Object.keys(LEGENDS);
for (const id of LEGEND_IDS) DRAGONS[id] = LEGENDS[id];
for (const id of LEGEND_IDS) ELEMENTS[id] = LEGENDS[id].el;
const SCALE = 8.5;
const UP = new THREE.Vector3(0, 1, 0);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const angDiff = (a, b) => { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
const groundAt = (x, z) => Math.max(heightAt(x, z), WATER_Y);

// ---------------------------------------------------------------- save
const save = { coins: 0, gems: 0, best: 0, gfx: "auto", seenStory: false };
try { Object.assign(save, JSON.parse(localStorage.getItem("skyrath_save") || "{}")); } catch { /* storage unavailable */ }
if (!save.sid) save.sid = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);   // identifies this save "line" for cloud sync
// CrazyGames: saved to the player's account. Android app: also copied to Google Play Games (cloud.js)
const persist = () => { save.rev = (save.rev || 0) + 1; writeSave("skyrath_save", JSON.stringify(save)); cloudDirty(); };
if (!save.gfxAuto) { save.gfx = "auto"; save.gfxAuto = true; }      // v1.5.1: everyone starts on Auto graphics once
if (PLATFORM === "windows" && !save.gfxWin) { save.gfx = "high"; save.gfxWin = true; }   // the Windows app starts on High graphics
const prog = createProgression(save, persist);
const skins = skinState(save);
// daily rewards, missions, achievements; toasts are small banners at the top of the screen
let toastT = null;
function toast(title, sub) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.innerHTML = `<b>${title}</b><span>${sub}</span>`;
  el.classList.remove("show"); void el.offsetWidth; el.classList.add("show");
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove("show"), 3200);
  if (typeof refreshMissionBadge === "function") refreshMissionBadge();
}
const meta = createMeta(save, () => persist(), { toast });

// skin textures are loaded on demand and cached; a skin swaps the dragon's texture and its fireball palette
const skinTex = {};
const texLoader = new THREE.TextureLoader();
function loadSkinTex(skin) {
  if (!skin || !skin.tex || skinTex[skin.id]) return Promise.resolve(skinTex[skin && skin.id]);
  return new Promise((res) => texLoader.load(`../assets/skins/${skin.tex}.jpg`, (t) => {
    t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; skinTex[skin.id] = t; res(t);
  }, undefined, () => res(null)));
}
function elementFor(id, skin) {
  const base = ELEMENTS[id];
  return skin && skin.el ? { ...base, ...skin.el } : base;
}

// ---------------------------------------------------------------- renderer
const canvas = $("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
const PR = Math.min(window.devicePixelRatio || 1, 1.75);
renderer.setPixelRatio(PR);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(66, 1, 1, 9000);
const composer = new EffectComposer(renderer);
composer.setPixelRatio(PR);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.2, 0.45, 0.94);
composer.addPass(bloom);
composer.addPass(new OutputPass());
function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  composer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", () => { resize(); layoutControls(); });

// Fit the FIRE / SURGE / DODGE column into the space below the HUD bars so they never overlap on short phone screens
function layoutControls() {
  const hud = document.getElementById("hud"), btns = document.getElementById("buttons"), tr = document.getElementById("topright");
  if (!hud || hud.classList.contains("hidden")) return;
  // keep the normal layout wherever it already fits; only step in when SURGE would hit the bars or DODGE would leave the screen
  btns.style.transform = ""; btns.style.top = ""; btns.style.transformOrigin = "";
  const H = window.innerHeight, PANEL = 320;
  const hudBottom = tr.getBoundingClientRect().bottom;
  let topB = 1e9, botB = 0;
  for (const b of btns.querySelectorAll(".btn")) { const r = b.getBoundingClientRect(); topB = Math.min(topB, r.top); botB = Math.max(botB, r.bottom); }
  if (topB >= hudBottom + 4 && botB <= H - 2) return;
  const s = Math.max(0.45, Math.min(1, (H - hudBottom - 12) / PANEL, (H * 0.92) / PANEL));
  const top = Math.max(hudBottom + 8, (H - PANEL * s) / 2);
  btns.style.transformOrigin = "top right";
  btns.style.transform = `scale(${s.toFixed(3)})`;
  btns.style.top = `${Math.round(Math.min(top, H - PANEL * s - 6))}px`;
}
resize();

const MOBILE = isMobile();
const LIGHT_START = IS_CRAZY && MOBILE;     // phones inside the CrazyGames app start lighter; the Android app and PC keep full quality
const world = createWorld(scene, { low: save.gfx === "low" || (save.gfx === "auto" && LIGHT_START) });
const fx = new FX(scene);
const portal = createPortal(scene);
fx.camera = camera;
const audio = new AudioMgr();

// ---------------------------------------------------------------- dragons (cel shading + ink outline)
const models = {};
const godModels = {};
const toonGrad = new THREE.DataTexture(new Uint8Array([120, 178, 228, 255]), 4, 1, THREE.RedFormat);
toonGrad.minFilter = toonGrad.magFilter = THREE.NearestFilter; toonGrad.needsUpdate = true;
const matCache = new Map();
function toonFor(src, foe, tex) {
  const ice = foe && typeof world !== "undefined" && world.theme === "crystal";     // enemies of the ice world are frost-tinted
  const key = src.uuid + (foe ? "f" : "p") + (ice ? "i" : "") + (tex ? tex.uuid : "");
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshToonMaterial({ map: tex || src.map, gradientMap: toonGrad });
    if (foe && ice) { m.color.setRGB(0.62, 0.78, 0.96); m.emissive = new THREE.Color(0x3aa0ff); m.emissiveIntensity = 0.2; }
    else if (foe) { m.color.setRGB(0.7, 0.62, 0.7); m.emissive = new THREE.Color(0xff1447); m.emissiveIntensity = 0.15; }
    matCache.set(key, m);
  }
  return m;
}
function outlineMaterial(color) {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, fog: false });
  m.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n transformed += normalize(objectNormal) * 0.0075;"); };
  return m;
}
const outlinePlayer = outlineMaterial(0x1b1238), outlineFoe = outlineMaterial(0x5a0626);

class Dragon {
  constructor(id, scale, foe, skinTex) {
    const gltf = models[id];
    this.id = id;
    this.root = new THREE.Group();
    this.root.rotation.order = "YXZ";
    this.model = SkeletonUtils.clone(gltf.scene);
    this.model.scale.setScalar(scale);
    this.root.add(this.model);
    this.jaw = null; this.head = null; this.talkT = 0; this.hold = false;
    const skinned = [];
    this.model.traverse((o) => {
      if (o.isSkinnedMesh) { o.material = toonFor(o.material, foe, skinTex); o.frustumCulled = false; skinned.push(o); }
      if (o.isBone && o.name === "jaw") this.jaw = o;
      if (o.isBone && o.name === "head") this.head = o;
    });
    for (const o of skinned) {
      const ol = new THREE.SkinnedMesh(o.geometry, foe ? outlineFoe : outlinePlayer);
      ol.bind(o.skeleton, o.bindMatrix);
      ol.frustumCulled = false;
      ol.position.copy(o.position); ol.quaternion.copy(o.quaternion); ol.scale.copy(o.scale);
      o.parent.add(ol);
    }
    this.jawOpen = this.jaw ? this.jaw.quaternion.clone() : null;
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    for (const c of gltf.animations) this.actions[c.name] = this.mixer.clipAction(c);
    this.base = "fly"; this.current = null; this.oneShot = null;
    this.mixer.addEventListener("finished", (e) => {
      if (e.action === this.oneShot) { this.oneShot = null; if (!this.hold) this.play(this.base, 0.25); }
    });
    this.play("fly", 0);
    this.mixer.update(Math.random());
  }
  play(name, fade = 0.2) {
    const a = this.actions[name];
    if (!a || a === this.current) return;
    a.reset(); a.setLoop(THREE.LoopRepeat, Infinity); a.clampWhenFinished = false; a.timeScale = 1;
    a.fadeIn(fade).play();
    if (this.current) this.current.fadeOut(fade);
    this.current = a;
  }
  once(name, speed = 1, fade = 0.1, hold = false) {
    const a = this.actions[name];
    if (!a) return 0;
    const prev = this.current;
    a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.timeScale = speed;
    a.fadeIn(fade).play();
    if (prev && prev !== a) prev.fadeOut(fade);
    this.current = a; this.oneShot = a; this.hold = hold;
    return a.getClip().duration / speed;
  }
  setBase(name) {
    if (this.base === name) return;
    this.base = name;
    if (!this.oneShot) this.play(name, 0.3);
  }
  update(dt, talking, open) {
    this.mixer.update(dt);
    if (this.jaw && (talking || open)) {
      this.talkT += dt;
      this.jaw.quaternion.slerp(this.jawOpen, open ? 0.92 : 0.2 + 0.35 * Math.abs(Math.sin(this.talkT * 11)));
    }
  }
  mouth(out) {
    if (this.head) this.head.getWorldPosition(out); else this.root.getWorldPosition(out);
    return out;
  }
  dispose() { this.mixer.stopAllAction(); this.root.removeFromParent(); }
}

// ---------------------------------------------------------------- input
// input.x: turn (-1 left .. 1 right), input.v: climb (1) / dive (-1), both from the one stick / WASD
const input = { x: 0, v: 0, lookX: 0, lookY: 0, fire: false, boost: false, breath: false, queue: [] };
// look: how far the camera / crosshair is swung away from the dragon's heading (radians). dx/dy collect mouse or finger movement.
const look = { yaw: 0, pitch: 0, dx: 0, dy: 0, touching: false };
const keys = new Set();
const KEYMAP = { KeyQ: "dodgeL", KeyE: "dodgeR", ControlLeft: "dodge", KeyF: "ult" };
window.addEventListener("keydown", (e) => {
  audio.unlock();
  if (e.code === "Tab" || e.code === "Space" || e.code.startsWith("Arrow")) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  if (e.code === "KeyP" || e.code === "Escape") togglePause();
  if (KEYMAP[e.code]) input.queue.push(KEYMAP[e.code]);
});
window.addEventListener("keyup", (e) => keys.delete(e.code));
window.addEventListener("blur", () => keys.clear());

const stick = { id: null, cx: 0, cy: 0, x: 0, y: 0 };
const zone = $("stickZone"), base = $("stickBase"), knob = $("stickKnob");
function stickMove(e) {
  // one stick flies in every direction: left / right turn, up / down climb and dive
  const dx = e.clientX - stick.cx, dy = e.clientY - stick.cy;
  const R = 52, len = Math.hypot(dx, dy) || 1, k = Math.min(1, len / R);
  stick.x = (dx / len) * k; stick.y = (-dy / len) * k;
  knob.style.transform = `translate(${(dx / len) * k * R}px, ${(dy / len) * k * R}px)`;
}
zone.addEventListener("pointerdown", (e) => {
  audio.unlock();
  if (stick.id !== null) return;
  stick.id = e.pointerId; zone.setPointerCapture(e.pointerId);
  const r = base.getBoundingClientRect();
  stick.cx = r.left + r.width / 2; stick.cy = r.top + r.height / 2;
  stickMove(e);
});
zone.addEventListener("pointermove", (e) => { if (e.pointerId === stick.id) stickMove(e); });
const stickEnd = (e) => { if (e.pointerId !== stick.id) return; stick.id = null; stick.x = stick.y = 0; knob.style.transform = ""; };
zone.addEventListener("pointerup", stickEnd); zone.addEventListener("pointercancel", stickEnd);

const held = { fire: false, breath: false, boost: false, mfire: false, mbreath: false };
for (const b of document.querySelectorAll("#buttons .btn")) {
  const act = b.dataset.act;
  b.addEventListener("pointerdown", (e) => {
    e.preventDefault(); audio.unlock(); b.setPointerCapture(e.pointerId); b.classList.add("on");
    if (act in held) held[act] = true; else input.queue.push(act);
  });
  const up = () => { b.classList.remove("on"); if (act in held) held[act] = false; };
  b.addEventListener("pointerup", up); b.addEventListener("pointercancel", up);
  b.addEventListener("contextmenu", (e) => e.preventDefault());
}
// PC: left mouse button fires, right button breathes fire (the mouse does not steer)
window.addEventListener("mousedown", (e) => {
  if (G.state !== "play" || (e.target.closest && e.target.closest("button, .btn, #stickZone"))) return;
  if (e.button === 0) held.mfire = true;
  if (e.button === 2) held.mbreath = true;
});
window.addEventListener("mouseup", (e) => { if (e.button === 0) held.mfire = false; if (e.button === 2) held.mbreath = false; });
window.addEventListener("contextmenu", (e) => { if (G.state === "play") e.preventDefault(); });
window.addEventListener("blur", () => { held.mfire = held.mbreath = false; });

const padPrev = {};
function readInput() {
  const kx = (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) - (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0);
  const kv = (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) - (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0);
  // gamepad: left stick turns and climbs; A fire, X breath, RT boost, LB/RB dodge, Y surge, Start pause
  let gx = 0, gv = 0, gFire = false, gBoost = false, gBreath = false;
  const pad = navigator.getGamepads ? [...navigator.getGamepads()].find((g) => g && g.connected) : null;
  if (pad) {
    const dz = (v) => (Math.abs(v) < 0.18 ? 0 : v);
    gx = dz(pad.axes[0] || 0); gv = -dz(pad.axes[1] || 0);
    const b = (i) => !!(pad.buttons[i] && pad.buttons[i].pressed);
    gFire = b(0); gBreath = b(2); gBoost = b(7);
    const edge = { 1: "dodge", 4: "dodgeL", 5: "dodgeR", 3: "ult" };
    for (const i in edge) { if (b(+i) && !padPrev[i]) input.queue.push(edge[i]); padPrev[i] = b(+i); }
    if (b(9) && !padPrev[9]) togglePause(); padPrev[9] = b(9);
  }
  input.x = clamp(kx + stick.x + gx, -1, 1);
  input.v = clamp(kv + stick.y + gv, -1, 1);
  input.fire = held.fire || held.mfire || keys.has("Space") || gFire;
  input.breath = held.breath || held.mbreath || gBreath;
  input.boost = held.boost || keys.has("ShiftLeft") || keys.has("ShiftRight") || gBoost;
}

// ---------------------------------------------------------------- state
const G = {
  state: "loading", choice: "fire", stage: 0, time: 0, slow: 1, shake: 0, freeze: 0,
  player: null, enemies: [], shots: [], pickups: [], lock: null, target: null, lockCand: null, lockT: 0,
  nextStageT: 0, spawnT: 0, pendingBoss: false, revives: 0, bannerT: 0, menuDragon: null, menuAngle: 0,
  combo: 0, comboT: 0, streak: 0, streakT: 0,
  run: { start: 0, kills: 0, godKills: 0, maxCombo: 0, taken: 0, dmg: 0 },
};
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), tmp3 = new THREE.Vector3(), tmp4 = new THREE.Vector3();
const shotTex = fx.tex;

function banner(title, sub = "", secs = 2.2) {
  $("bannerTitle").textContent = title; $("bannerSub").textContent = sub;
  $("banner").classList.add("show"); G.bannerT = secs;
}

// comic pop-up text at a world position (or screen centre when at is null)
const popHolder = $("pops");
const lastPop = {};
function pop(text, cls, at, sub) {
  let x = window.innerWidth / 2, y = window.innerHeight * 0.36;
  if (at) {
    tmp4.copy(at).project(camera);
    if (tmp4.z > 1) return;
    x = clamp((tmp4.x * 0.5 + 0.5) * window.innerWidth, 70, window.innerWidth - 70) + rand(-30, 30);
    y = clamp((-tmp4.y * 0.5 + 0.5) * window.innerHeight, 70, window.innerHeight - 120) + rand(-36, 10);
  }
  const el = document.createElement("div");
  el.className = `pop ${cls}`;
  el.textContent = text;
  if (sub) { const s = document.createElement("small"); s.textContent = sub; el.appendChild(s); }
  el.style.left = `${x}px`; el.style.top = `${y}px`;
  popHolder.appendChild(el);
  el.addEventListener("animationend", () => el.remove());
  // a new kill/hit-word pop replaces the previous one instead of stacking on top of it
  if (cls === "down" || cls === "hit" || cls === "crit") { const prev = lastPop[cls]; if (prev && prev.isConnected) prev.remove(); lastPop[cls] = el; }
  if (popHolder.childElementCount > 24) popHolder.firstElementChild.remove();
}

// evolved fire palettes per element: tier 2 is a hotter colour, tier 3 crackles with lightning
const HOT = { fire: [0xffffff, 0x4fa8ff, 0x2a5cff], frost: [0xffffff, 0xc07bff, 0x7a3cff], storm: [0xffffff, 0xffd23c, 0xff9a1e], forest: [0xffffff, 0xfff27a, 0x7fffb0] };
function fireTier(base, id, tier) {
  if (tier < 2) return base;
  const h = HOT[id] || HOT.fire;
  const el = { ...base, core: h[0], glow: h[1], trail: h[2] };
  if (tier >= 3) { el.trail = 0x9ff4ff; el.chain = true; }
  return el;
}

const xpNeed = (lv) => Math.round(50 * Math.pow(1.3, lv - 1));
function makePlayer(id) {
  const d = DRAGONS[id];
  const up = prog.stats();
  const skin = skinById(skins.equipped(id));
  const dragon = new Dragon(id, SCALE, false, skin && skinTex[skin.id]);
  scene.add(dragon.root);
  const el = elementFor(id, skin);
  return {
    dragon, id, def: d, el, pos: dragon.root.position, yaw: 0, pitch: 0, bank: 0, speed: 80, voice: d.voice || id,
    style: (skin && skin.shot) || d.style || "orb",
    maxHp: Math.round(100 * d.hp * up.hp), hp: Math.round(100 * d.hp * up.hp), up, energy: 100, heat: 100, heatWait: 0, ult: 0, ultReady: false,
    tier: 0, fireEl: el, charge: 0,
    lv: 1, xp: 0, dmgMul: d.dmg * up.dmg, fireT: 0, breathT: 0, breathSnd: 0, breathing: false, dodgeT: 0, dodgeVel: new THREE.Vector3(),
    invuln: 0, ulting: null, dead: false, fwd: new THREE.Vector3(0, 0, 1), voiceT: 0, wasBoost: false,
  };
}

// level-up panel on the right, under the health bars
let lvlT = null;
function levelPanel(lv, power) {
  const el = $("lvlPanel");
  el.innerHTML = `<b>LEVEL UP!</b><span class="lvn">LV ${lv}</span><small>+12 MAX HP · +6% DAMAGE</small>${power ? `<em>NEW POWER: ${power}</em>` : ""}`;
  el.classList.remove("show"); void el.offsetWidth; el.classList.add("show");
  clearTimeout(lvlT); lvlT = setTimeout(() => el.classList.remove("show"), power ? 3200 : 2500);
}

function gainXp(n) {
  const p = G.player;
  p.xp += n;
  while (p.xp >= xpNeed(p.lv)) {
    p.xp -= xpNeed(p.lv); p.lv++;
    p.maxHp += 12; p.dmgMul *= 1.06; p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.4);
    // the fire grows stronger at run levels 5, 10 and 15: bigger, hotter colour, then chain lightning
    const tier = p.lv >= 15 ? 3 : p.lv >= 10 ? 2 : p.lv >= 5 ? 1 : 0;
    let power = "";
    if (tier > p.tier) { p.tier = tier; p.fireEl = fireTier(p.el, p.id, tier); power = ["", "BIGGER FIREBALLS", "HOTTER FLAME", "CHAIN LIGHTNING"][tier]; }
    levelPanel(p.lv, power);
    fx.stars(p.pos, 0xffe27a, 22, 90, 4.5, 0.9);
    fx.ring(p.pos, 0xffe27a, 30, 0.6, camera);
    audio.play("level_up", 1);
    audio.say("announcer", "level_up", 0);
  }
}

// ---------------------------------------------------------------- worlds and the black hole
// stages 1-10 kingdom, 11-20 crystal, 21-30 kingdom (harder), and so on
const WORLD_NAMES = { kingdom: ["THE SKY KINGDOM", "DEFEND THE KINGDOM"], crystal: ["THE CRYSTAL EXPANSE", "A FROZEN WORLD BEYOND THE RIFT"] };
const worldFor = (stage) => (Math.floor((Math.max(1, stage) - 1) / 10) % 2 === 1 ? "crystal" : "kingdom");
let crystal = null;
function switchWorld(name) {
  if (name === "crystal" && !world.hasTheme("crystal")) { crystal = buildCrystalWorld(QUAL.light); world.addTheme("crystal", crystal); }
  world.setTheme(name);
}
function openRift() {
  const p = G.player;
  tmp.copy(p.fwd); tmp.y = 0; tmp.normalize();
  const at = tmp2.copy(p.pos).addScaledVector(tmp, 460);
  at.y = clamp(p.pos.y + 40, groundAt(at.x, at.z) + 180, CEILING - 160);
  portal.open(at);
  G.rift = true;
  banner("A RIFT HAS OPENED", "FLY INTO THE BLACK HOLE", 4);
  audio.play("ultimate_charge", 0.8, 0.5); G.shake = 0.6;
}
function updateRift(dt) {
  const p = G.player;
  if (G.warp) {
    const w = G.warp;
    w.t += dt;
    $("warp").style.opacity = String(w.t < 0.9 ? w.t / 0.9 : Math.max(0, 1 - (w.t - 1.1) / 0.9));
    camera.fov += (125 - camera.fov) * Math.min(1, 3 * dt); camera.updateProjectionMatrix();
    for (let i = 0; i < 3; i++) {                          // warp tunnel streaks
      const a = rand(0, Math.PI * 2), r = rand(10, 40);
      tmp2.set(Math.cos(a) * r, Math.sin(a) * r, 0).applyQuaternion(camera.quaternion);
      tmp.copy(camera.position).addScaledVector(p.fwd, rand(40, 120)).add(tmp2);
      fx.streakPuff(tmp, i % 2 ? 0xb48cff : 0x7fe8ff, rand(1.5, 3), 0.3, tmp3.copy(p.fwd).multiplyScalar(-700), 8);
    }
    if (!w.switched && w.t >= 0.9) {
      w.switched = true;
      const next = worldFor(G.stage + 1);
      switchWorld(next);
      portal.close();
      for (const sh of G.shots) sh.life = 0;
      const sp = next === "crystal" && crystal ? crystal.spawn : tmp.set(CASTLE.x + 80, 430, CASTLE.z + 520);
      p.pos.copy(sp); p.yaw = next === "crystal" ? 0 : Math.PI * 0.9; p.pitch = 0; p.pitchAim = 0;
      camera.position.copy(p.pos).add(tmp.set(0, 12, -40));
      world.setStage(G.stage + 1);
      world.setMood((next === "crystal" ? "frost" : "day"), 1, true);
      if (next === "crystal") meta.track("crystal", 1);
    }
    if (w.t >= 2.0) {
      G.warp = null; G.rift = false;
      $("warp").style.opacity = "0";
      const [title, sub] = WORLD_NAMES[world.theme];
      setTimeout(() => banner(title, sub, 3.5), 200);
      nextStage(3.2);
    }
    return true;
  }
  if (!G.rift) return false;
  if (!portal.active) return true;                         // waiting for the rift to open after the boss falls
  // the rift pulls you in when you get close; touching the core starts the warp
  const d = p.pos.distanceTo(portal.pos);
  if (d < 420) { tmp.copy(portal.pos).sub(p.pos).normalize(); p.pos.addScaledVector(tmp, (1 - d / 420) * 70 * dt); }
  if (Math.random() < 0.6) {                                // light being dragged into the hole
    tmp.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(portal.radius * rand(1.4, 2.4)).add(portal.pos);
    fx.streakPuff(tmp, Math.random() < 0.5 ? 0xb48cff : 0x7fe8ff, rand(2, 4), 0.7, tmp2.copy(portal.pos).sub(tmp).multiplyScalar(1.3), 5);
  }
  if (d < portal.radius * 0.45 + 10) {
    G.warp = { t: 0, switched: false };
    p.invuln = 3;
    audio.play("ultimate_blast", 0.9, 0.6); audio.play("boost", 1, 0.5);
  }
  return true;
}

function startRun() {
  clearRun();
  switchWorld("kingdom"); portal.close(); G.rift = false; G.warp = null; $("warp").style.opacity = "0";
  if (G.menuDragon) { G.menuDragon.dispose(); G.menuDragon = null; }
  const p = G.player = makePlayer(G.choice);
  p.pos.set(CASTLE.x + 80, 430, CASTLE.z + 520);
  p.yaw = Math.PI * 0.9;
  camera.position.copy(p.pos).add(tmp.set(0, 12, 40));
  G.stage = 0; G.revives = 0; G.state = "play"; G.slow = 1; G.combo = 0; G.streak = 0;
  G.run = { start: performance.now(), kills: 0, godKills: 0, maxCombo: 0, taken: 0, dmg: 0 };
  G.bestAtStart = save.best; G.newBestShown = false; G.sniperWarned = false;
  $("menu").classList.add("hidden"); $("down").classList.add("hidden"); $("hud").classList.remove("hidden");
  setTimeout(layoutControls, 30);
  audio.say("announcer", "get_ready", 0, true);
  gameplayStart(); G.adRevived = false;
  G.lock = G.lockCand = null; G.lockT = 0;
  nextStage(2.2);
  if (!save.seenTips3) {                              // one-time quick tips for the manual controls
    save.seenTips3 = true; persist();
    const tips = MOBILE
      ? [["FLY", "The stick turns, climbs and dives. Point at an enemy to lock on"], ["FIGHT", "FIRE shoots, BREATH burns up close, BOOST speeds up"]]
      : [["FLY", "W A S D or the arrow keys fly. Point at an enemy to lock on"], ["FIGHT", "Space or left click fires, right click breathes, Shift boosts, Q / E dodge, F surge"]];
    tips.forEach(([a, b], i) => setTimeout(() => { if (G.state === "play") banner(a, b, 3); }, 3500 + i * 3400));
  }
}

function clearRun() {
  for (const e of G.enemies) e.dragon.dispose();
  for (const s of G.shots) s.s.removeFromParent();
  for (const c of G.pickups) c.s.removeFromParent();
  G.enemies.length = G.shots.length = G.pickups.length = 0;
  if (G.player) { G.player.dragon.dispose(); G.player = null; }
  G.lock = G.target = null; G.nextStageT = 0; G.spawnT = 0;
  $("bossbar").classList.add("hidden"); popHolder.textContent = "";
}

function nextStage(delay) {
  if (G.stage >= 2) showMidgame();           // natural break between stages; the SDK allows at most one every ~3 minutes
  G.stage++;
  G.pendingBoss = G.stage % 5 === 0;
  G.spawnT = delay;
  const bossStage = Math.ceil(G.stage / 5) * 5;
  if (bossStage - G.stage <= 2 && loader) loadGod(godForStage(bossStage).def);
  world.setStage(G.stage);
  meta.stageStarted(G, G.player);
  if (G.stage > save.best) {
    save.best = G.stage; persist();
    if (G.bestAtStart > 0 && !G.newBestShown) { G.newBestShown = true; setTimeout(() => { if (G.state === "play") toast("NEW BEST!", `You reached stage ${G.stage}`); }, 2600); }
  }
  save.bestWorld = save.bestWorld || {};
  save.bestWorld[world.theme] = Math.max(save.bestWorld[world.theme] || 0, G.stage);
  $("level").textContent = G.stage;
  if (G.pendingBoss) { banner("BOSS INCOMING", `STAGE ${G.stage}`, 3); audio.say("announcer", "boss_incoming", 0, true); audio.playMusic("boss_theme"); }
  else { banner(`STAGE ${G.stage}`, G.stage === 1 ? "DEFEND THE KINGDOM" : (G.stage - 1) % 10 === 0 ? WORLD_NAMES[world.theme][0] : "THEY GROW STRONGER", 2.4); audio.playMusic("battle_theme"); if (G.stage > 1) audio.say("announcer", "next_wave", 0); }
}

function spawnGod() {
  const p = G.player;
  meta.godSpawned();
  const { def, tier } = godForStage(G.stage);
  const god = new GodBoss(godModels[def.id], def, tier, fx.tex);
  const a = rand(0, Math.PI * 2);
  const x = p.pos.x + Math.cos(a) * 520, z = p.pos.z + Math.sin(a) * 520;
  god.root.position.set(x, clamp(p.pos.y + 60, groundAt(x, z) + 160, CEILING - 80), z);
  scene.add(god.root);
  const hp = 60 * Math.pow(1.12, G.stage - 1) * 10 * (1 + tier * 0.25);
  G.enemies.push({
    dragon: god, godDef: def, id: def.id, el: ELEMENTS.foe, pos: god.root.position, vel: new THREE.Vector3(), hp, maxHp: hp, boss: true, phase: 1, ringT: 99,
    radius: def.size * 0.3, fireT: 99, orbit: Math.random() < 0.5 ? 1 : -1, alt: 70, state: "alive", dieT: 0,
    speed: 46 + Math.min(30, G.stage), yaw: 0, pitch: 0, name: def.name,
    dmg: 9 * (1 + 0.07 * (G.stage - 1)) * (1 + tier * 0.2), shotSpeed: 120 + Math.min(70, G.stage * 2.5),
    born: performance.now(), core: { open: false, t: 6 },
  });
  $("bossbar").classList.remove("hidden"); $("bossName").textContent = `${def.name.split(",")[0]}  ·  PHASE I`;
  banner(def.name, def.sub, 3.2);
  setTimeout(() => { if (G.state === "play") bossWarn("HIT THE CORE WHEN IT OPENS – FLY AROUND IT", 3.5); }, 3600);
  god.once("roar"); audio.play("dragon_roar", 1, 0.6); G.shake = 0.8;
  fx.ring(god.root.position, def.halo || 0x5fd0ff, 200, 1.0, camera);
}

function spawnEnemy(boss, swarm) {
  if (boss && godModels[godForStage(G.stage).def.id]) { spawnGod(); return; }
  const p = G.player;
  const pool = IDS.filter((i) => i !== p.id);
  const id = pool[Math.floor(Math.random() * pool.length)];
  const scale = SCALE * (boss ? 2.6 : swarm ? 0.5 : rand(0.9, 1.1));
  const dragon = new Dragon(id, scale, true);
  const a = swarm ? swarm.a + rand(-0.12, 0.12) : rand(0, Math.PI * 2), r = swarm ? rand(420, 480) : rand(360, 470);
  const x = p.pos.x + Math.cos(a) * r, z = p.pos.z + Math.sin(a) * r;
  const y = clamp(p.pos.y + rand(-40, 40), groundAt(x, z) + 90, CEILING - 60);
  dragon.root.position.set(x, y, z);
  scene.add(dragon.root);
  const hp = 60 * Math.pow(1.12, G.stage - 1) * (boss ? 8 : swarm ? 0.25 : 1);
  G.enemies.push({
    dragon, id, el: ELEMENTS.foe, pos: dragon.root.position, vel: new THREE.Vector3(), hp, maxHp: hp, boss, phase: 1, ringT: 3,
    radius: boss ? 40 : 15, fireT: rand(1.5, 3), orbit: Math.random() < 0.5 ? 1 : -1, alt: rand(-25, 15), state: "alive", dieT: 0,
    speed: (56 + Math.min(44, G.stage * 2.2)) * (boss ? 0.8 : swarm ? 1.25 : 1), yaw: 0, pitch: 0, name: boss ? "THE DREAD WYRM" : swarm ? "WISP DRAKE" : DRAGONS[id].name,
  });
  const e = G.enemies[G.enemies.length - 1];
  if (swarm) { e.swarm = true; e.radius = 9; e.fireT = rand(3, 5); e.orbit = swarm.orbit; e.alt = rand(-10, 10); }
  else if (!boss) makeType(e, rollType());
  if (boss) { $("bossbar").classList.remove("hidden"); $("bossName").textContent = "THE DREAD WYRM"; audio.play("dragon_roar", 1); dragon.once("roar"); }
}

// ---------------------------------------------------------------- enemy types
// shield: blocks hits from the front (flank it)   diver: dives straight at you (dodge it)
// sniper: charges a beam, red warning line         mender: heals other enemies (kill it first)
// elite: any type can be an elite: tougher, glowing gold, drops gems
const TYPE_INFO = {
  shield: { name: "SHIELD DRAKE", hp: 1.4 },
  diver: { name: "DIVER IMP", hp: 0.6, speed: 1.4, scale: 0.65 },
  sniper: { name: "SNIPER WYVERN", hp: 0.9 },
  mender: { name: "MENDER", hp: 1.0 },
};
function rollType() {
  const st = G.stage, ice = world.theme === "crystal";
  const pool = [["drake", 10]];
  if (st >= 3) pool.push(["shield", ice ? 5 : 3]);
  if (st >= 4) pool.push(["diver", 3]);
  if (st >= 6) pool.push(["sniper", ice ? 3 : 2]);
  if (st >= 7) pool.push(["mender", 1.6]);
  let r = Math.random() * pool.reduce((a, x) => a + x[1], 0);
  for (const [t, w] of pool) { r -= w; if (r <= 0) return t; }
  return "drake";
}
function auraSprite(color, size) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: fx.tex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55, fog: false }));
  sp.scale.setScalar(size);
  return sp;
}
function makeType(e, type) {
  e.type = type;
  const info = TYPE_INFO[type];
  if (info) {
    e.name = info.name; e.hp *= info.hp; e.maxHp = e.hp;
    if (info.speed) e.speed *= info.speed;
    if (info.scale) { e.dragon.model.scale.multiplyScalar(info.scale); e.radius *= info.scale; }
  }
  e.dmgK = 1;
  if (type === "shield") {
    // a glowing half-dome in front of the dragon
    const dome = new THREE.Mesh(new THREE.SphereGeometry(30, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x6fd8ff, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    dome.rotation.x = Math.PI / 2; dome.position.z = 14;
    e.dragon.root.add(dome); e.shieldMesh = dome;
  }
  if (type === "diver") { e.diveT = rand(3, 5); e.dragon.root.add(auraSprite(0xff3b3b, 26)); }
  if (type === "sniper") { e.snipeT = rand(3, 5); e.fireT = 1e9; const eye = auraSprite(0xc070ff, 18); eye.position.z = 10; e.dragon.root.add(eye); }
  if (type === "mender") { e.healT = 1; e.dragon.root.add(auraSprite(0x5dff8a, 60)); }
  // elites: from stage 6, more often in the ice world
  if (G.stage >= 6 && Math.random() < (world.theme === "crystal" ? 0.2 : 0.12)) {
    e.elite = true; e.name = "ELITE " + e.name; e.hp *= 2.2; e.maxHp = e.hp; e.dmgK = 1.3;
    e.dragon.model.scale.multiplyScalar(1.15); e.radius *= 1.15;
    e.dragon.root.add(auraSprite(0xffc23c, 80));
  }
}

// per-type behaviour; returns true when it took over this enemy's movement for the frame
function typeBehaviour(e, dt, p, dist, dmg) {
  if (e.shieldMesh) e.shieldMesh.material.opacity += (0.28 - e.shieldMesh.material.opacity) * Math.min(1, 4 * dt);
  if (e.type === "diver") {
    if (e.dive) {
      e.dive.t -= dt;
      tmp3.copy(p.pos).sub(e.pos).normalize().multiplyScalar(280);
      e.vel.lerp(tmp3, Math.min(1, 3 * dt));
      e.pos.addScaledVector(e.vel, dt);
      if (Math.random() < 0.6) fx.puff(e.pos, 0xff3b3b, 10, 0.3, null, 8);
      if (dist < e.radius + 14 && !p.dead) {
        damagePlayer(dmg * 2.2); pop("RAMMED!", "bad", p.pos);
        fx.burst(e.pos, ELEMENTS.foe, 24, 120, 12, 0.6); audio.play("enemy_death", 0.8, 1.2);
        e.hp = 0; killEnemy(e, true); return true;
      }
      if (e.dive.t <= 0) { e.dive = null; e.diveT = rand(4, 7); }
      return true;
    }
    e.diveT -= dt;
    if (e.diveT <= 0 && dist < 520 && !p.dead) {
      if (!e.warned) { e.warned = true; e.diveT = 0.8; pop("INCOMING!", "bad", e.pos); fx.ring(e.pos, 0xff3b3b, 40, 0.5, camera); audio.play("dragon_roar", 0.5, 1.6); }
      else { e.warned = false; e.dive = { t: 2.4 }; }
    }
    return false;
  }
  if (e.type === "sniper") {
    e.snipeT -= dt;
    if (e.aim) {
      e.aim.t -= dt;
      e.dragon.mouth(tmp);
      if ((e.aim.flash -= dt) <= 0) {                      // red warning line toward you while it charges
        e.aim.flash = 0.08;
        tmp2.copy(p.pos).sub(tmp); const L = tmp2.length(); tmp2.divideScalar(L || 1);
        fx.beam(tmp, tmp2, L, 0.9, { glow: 0xff2e3a, core: 0xff8080 }, 0.1);
      }
      if (e.aim.t <= 0) {
        tmp2.copy(p.pos).sub(tmp).normalize();
        shoot("e", tmp, tmp2, 560, dmg * 2.5, { core: 0xffe0e6, glow: 0xff2e3a, trail: 0xff2e3a, name: "Snipe" }, 20, null, false);
        audio.play("lightning_shot", 0.8, 0.7); e.aim = null; e.snipeT = rand(5, 7);
      }
    } else if (e.snipeT <= 0 && dist < 750 && !p.dead) {
      e.aim = { t: 1.3, flash: 0 };
      if (!G.sniperWarned) { G.sniperWarned = true; pop("SNIPER!", "bad", e.pos); }
    }
    return false;
  }
  if (e.type === "mender") {
    e.healT -= dt;
    if (e.healT <= 0) {
      e.healT = 1;
      for (const o of G.enemies) {
        if (o === e || o.state !== "alive" || o.godDef || o.hp >= o.maxHp) continue;
        if (o.pos.distanceTo(e.pos) > 240) continue;
        o.hp = Math.min(o.maxHp, o.hp + o.maxHp * 0.05);
        tmp2.copy(o.pos).sub(e.pos); const L = tmp2.length(); tmp2.divideScalar(L || 1);
        fx.beam(e.pos, tmp2, L, 1.2, { glow: 0x5dff8a, core: 0xd0ffe0 }, 0.35);
      }
    }
    return false;
  }
  return false;
}

function spawnWave() {
  const n = G.pendingBoss ? 2 : Math.min(2 + Math.floor((G.stage - 1) / 2), 7);
  if (G.pendingBoss) spawnEnemy(true);
  for (let i = 0; i < n; i++) spawnEnemy(false);
  // from stage 2: a pack of small, fast, weak wisp drakes flying together, for satisfying multi-kills
  if (G.stage >= 2 && !G.pendingBoss) {
    const pack = { a: rand(0, Math.PI * 2), orbit: Math.random() < 0.5 ? 1 : -1 };
    const k = QUAL.light ? 2 : G.stage >= 6 ? 4 : 3;
    for (let i = 0; i < k; i++) spawnEnemy(false, pack);
  }
  if (G.stage === 1) audio.say("announcer", "fight", 0, true);
}

function shoot(owner, from, dir, speed, dmg, el, size, target, crit) {
  const m = new THREE.SpriteMaterial({ map: shotTex, color: el.core, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
  const s = new THREE.Sprite(m);
  s.scale.setScalar(size);
  s.position.copy(from);
  scene.add(s);
  G.shots.push({ s, pos: s.position, vel: dir.clone().multiplyScalar(speed), life: 3.2, dmg, owner, el, target, size, trailT: 0, speed, crit, style: owner === "p" && G.player ? G.player.style : "orb", age: 0 });
}

function damagePlayer(dmg) {
  const p = G.player;
  if (p.invuln > 0 || p.dead || G.state !== "play") return;
  p.hp -= dmg * p.up.taken; p.invuln = 0.25; G.shake = Math.max(G.shake, 0.6);
  G.run.taken += dmg * p.up.taken;
  G.combo = 0;
  audio.play("hit_taken", 0.9);
  pop("OUCH!", "bad", p.pos);
  if (!p.dragon.oneShot) p.dragon.once("hit", 1.2);
  audio.say(p.voice, "hit", 7);
  if (p.hp <= 0) killPlayer();
}

function killPlayer() {
  const p = G.player;
  p.hp = 0; p.dead = true; G.state = "down";
  gameplayStop();
  p.dragon.once("death", 1, 0.1, true);
  audio.play("enemy_death", 1);
  audio.say("announcer", "defeated", 0, true);
  const cost = 40 * Math.pow(2, G.revives);
  const { score, rank } = runRank();
  $("rank").textContent = rank; $("rank").className = `rank r${rank}`;
  const bestScore = save.bestScore || 0;
  if (score > bestScore) { save.bestScore = score; persist(); }
  $("downInfo").textContent = `${score > bestScore && bestScore > 0 ? "NEW BEST SCORE!  " : ""}Score ${score}  ·  Stage ${G.stage}  ·  ${G.run.kills} kills  ·  best combo ${G.run.maxCombo}  ·  Best stage: ${save.best}  ·  Best score: ${Math.max(score, bestScore)}`;
  const rb = $("reviveBtn");
  rb.textContent = save.coins >= cost ? `Revive for ${cost} coins` : `Revive costs ${cost} coins`;
  rb.disabled = save.coins < cost; rb.dataset.cost = cost;
  const ab = $("adReviveBtn");
  ab.classList.toggle("hidden", !rewardedAvailable() || G.adRevived);
  ab.disabled = false; ab.innerHTML = AD_REVIVE_HTML;
  const fb = $("featherBtn");
  fb.textContent = save.feathers > 0 ? `Use a Phoenix Feather (${save.feathers} left)` : `Revive for ${FEATHER_GEMS} gems`;
  fb.disabled = save.feathers <= 0 && save.gems < FEATHER_GEMS;
  setTimeout(() => { if (G.state === "down") { popHolder.textContent = ""; $("banner").classList.remove("show"); $("down").classList.remove("hidden"); if (!rb.disabled) audio.say("announcer", "revive", 0); } }, 1700);
}

// hit confirmation: an X flashes on the crosshair (bigger and red on a kill)
let hitT = null;
function hitMark(kill, strong) {
  const h = $("hitmark");
  h.className = kill ? "kill" : strong ? "strong" : "";
  void h.offsetWidth; h.classList.add("show");
  clearTimeout(hitT); hitT = setTimeout(() => h.classList.remove("show"), kill ? 380 : 140);
}

// run rank from S to D: stage reached, kills, best combo, and how little damage was taken
function runRank() {
  const r = G.run, mins = Math.max(1, (performance.now() - r.start) / 60000);
  const score = Math.round(G.stage * 120 + r.kills * 15 + r.godKills * 250 + r.maxCombo * 4 + Math.max(0, 400 - r.taken / mins * 2));
  const rank = score >= 2600 ? "S" : score >= 1600 ? "A" : score >= 900 ? "B" : score >= 450 ? "C" : "D";
  return { score, rank };
}

// comic hit words: the element's own word, BOOM on crits, MULTI HIT when hits land close together; at most ~3 a second
const HIT_WORDS = { fire: ["SIZZLE!", "BURN!"], solaris: ["SIZZLE!", "BURN!"], frost: ["CRACK!", "FREEZE!"], storm: ["ZAP!", "JOLT!"], voidrend: ["ZAP!", "JOLT!"], forest: ["SLASH!", "THORN!"] };
function hitWord(e, kind, at) {
  const now = G.time;
  G.hitTimes = (G.hitTimes || []).filter((t) => now - t < 0.4); G.hitTimes.push(now);
  if (now - (G.wordT || -9) < 0.33) return;
  G.wordT = now;
  const name = e.name;
  if (kind === "blast") { pop("CHARGED HIT!", "crit", at, name); G.shake = Math.max(G.shake, 0.4); return; }
  if (kind === "crit") { pop("BOOM!", "crit", at, name); G.shake = Math.max(G.shake, 0.3); return; }
  if (kind === "weak") { pop("WEAK POINT!", "crit", at, name); G.shake = Math.max(G.shake, 0.25); return; }
  if (G.hitTimes.length >= 2) { pop(`MULTI HIT x${G.hitTimes.length}`, "hit", at, name); return; }
  const w = HIT_WORDS[G.player.id] || ["HIT!"];
  pop(Math.random() < 0.5 ? "HIT!" : w[Math.floor(Math.random() * w.length)], "hit", at, name);
}

function hurtEnemy(e, dmg, at, kind) {
  if (e.state !== "alive") return;
  const p = G.player;
  if (e.type === "shield" && kind !== "crit" && p) {
    tmp4.copy(p.pos).sub(e.pos).normalize();
    const fwdDot = tmp4.x * Math.sin(e.yaw) + tmp4.z * Math.cos(e.yaw);
    if (fwdDot > 0.45) {                                // you are in front of the shield
      dmg *= 0.1;
      if (G.time - (e.blockT || -9) > 0.6) { e.blockT = G.time; pop("BLOCKED", "bad", at || e.pos, "HIT IT FROM THE SIDE"); fx.stars(at || e.pos, 0x6fd8ff, 6, 60, 5, 0.4); }
      if (e.shieldMesh) e.shieldMesh.material.opacity = 0.7;
    }
  }
  e.hp -= dmg;
  G.lastHitKind = kind;
  p.ult = Math.min(100, p.ult + (kind === "breath" ? 1.2 : e.boss ? 3 : 5));
  G.combo++; G.comboT = 1.8;
  G.run.dmg += dmg; G.run.maxCombo = Math.max(G.run.maxCombo, G.combo);
  hitMark(e.hp <= 0, kind === "weak" || kind === "crit");
  // floating damage numbers (breath ticks are added up so they don't spam)
  if (kind === "breath") { e.dmgAcc = (e.dmgAcc || 0) + dmg; if ((e.dmgT = (e.dmgT || 0) + 1) % 4 === 0) { pop(String(Math.round(e.dmgAcc)), "dmg", at || e.pos); e.dmgAcc = 0; } }
  else pop(String(Math.round(dmg)), kind === "weak" || kind === "crit" ? "dmg big" : "dmg", at || e.pos);
  if (kind !== "breath") {
    fx.burst(at || e.pos, p.fireEl, 8, 70, 10, 0.45);
    fx.shards(at || e.pos, [0xffd23c, p.fireEl.glow, 0xffffff], kind === "crit" || kind === "weak" ? 18 : 10, 150, 7, 0.45);
    fx.stars(at || e.pos, p.fireEl.core, kind === "crit" ? 9 : 4, 60, 7, 0.5);
    audio.play("impact", 0.7, rand(0.9, 1.15));
    hitWord(e, kind, at || e.pos);
  } else fx.burst(e.pos, p.el, 3, 40, 8, 0.3);
  if (!e.dragon.oneShot) e.dragon.once("hit", 1.3);
  if (e.hp <= 0) killEnemy(e);
}

function killEnemy(e, rammed) {
  const p = G.player;
  meta.enemyKilled(e, G.lastHitKind, rammed);
  e.state = "dying"; e.dieT = 1.7; e.hp = 0;
  e.dragon.once("death", 1, 0.1, true);
  fx.burst(e.pos, p.el, e.boss ? 70 : 30, e.boss ? 170 : 105, e.boss ? 30 : 16, 0.9);
  fx.stars(e.pos, 0xfff2a8, e.boss ? 40 : 14, 120, 11, 0.9);
  fx.ring(e.pos, p.fireEl.glow, e.boss ? 140 : 60, 0.6, camera);
  fx.ring(e.pos, 0xffffff, e.boss ? 200 : 90, 0.9, camera);
  fx.shards(e.pos, [0xffd23c, 0xffffff, p.fireEl.glow], e.boss ? 60 : 32, e.boss ? 320 : 220, e.boss ? 14 : 9, 0.7);
  audio.play("enemy_death", e.boss ? 1 : 0.75, e.boss ? 0.8 : rand(0.95, 1.2));
  G.shake = Math.max(G.shake, e.boss ? 1.3 : 0.4);
  G.freeze = e.boss ? 0.22 : 0.07;
  p.ult = Math.min(100, p.ult + (e.boss ? 40 : 14));
  G.streak = G.streakT > 0 ? G.streak + 1 : 1; G.streakT = 4;
  G.run.kills++;
  if (e.godDef) { happytime(); G.lastGod = e.godDef.name.split(",")[0]; G.run.godKills++; const secs = Math.round((performance.now() - e.born) / 1000); setTimeout(() => pop(`DEFEATED IN ${secs}s`, "level"), 900); }
  pop(e.godDef ? "GOD SLAIN!" : e.boss ? "WYRM SLAIN!" : ["DOWN!", "DOUBLE DOWN!", "TRIPLE DOWN!", "RAMPAGE!"][Math.min(3, G.streak - 1)], "down", e.pos, e.name);
  const coins = e.swarm ? 1 : (e.boss ? 60 : 6) + G.stage;
  for (let i = 0; i < (e.boss ? 10 : e.swarm ? 1 : 3); i++) dropPickup(e.pos, "coin", Math.ceil(coins / (e.boss ? 10 : e.swarm ? 1 : 3)));
  if (e.boss) for (let i = 0; i < 3; i++) dropPickup(e.pos, "gem", 1);
  if (e.elite) for (let i = 0; i < 2; i++) dropPickup(e.pos, "gem", 1);
  if (e.boss) for (let i = 0; i < 3; i++) dropPickup(e.pos, "heal", 0.2);
  else if (Math.random() < 0.3) dropPickup(e.pos, "heal", 0.15);
  if (G.lock === e) G.lock = null;
  gainXp(e.boss ? 160 + G.stage * 6 : e.swarm ? 6 + G.stage : 18 + G.stage * 2);
  if (Math.random() < 0.3) audio.say(p.voice, "taunt", 9);
}

function dropPickup(at, kind, value) {
  const m = new THREE.SpriteMaterial({ map: fx.star, color: kind === "coin" ? 0xffc93c : kind === "heal" ? 0x5dff8a : 0x5fd0ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
  const s = new THREE.Sprite(m);
  s.scale.setScalar(kind === "coin" ? 9 : kind === "heal" ? 15 : 13);
  s.position.copy(at);
  scene.add(s);
  G.pickups.push({ s, pos: s.position, vel: new THREE.Vector3(rand(-50, 50), rand(10, 70), rand(-50, 50)), kind, value, t: 0 });
}

// ---------------------------------------------------------------- crashing into the world
// Trees, houses, floating rocks and the castle are solid. A crash pushes you out, slows you down and costs a little
// health (more when you hit faster). Waterfalls can be flown through: a splash and a short slowdown.
const CRASH_FX = { tree: [0x4f8a3a, 0x7fbf4a, 0x3a6a2a], house: [0xd8cdb8, 0xb5a58c, 0xe2633f], castle: [0xf0eadc, 0xc9bfae, 0x2fa39a], rock: [0x8e857a, 0x6e665c, 0x7c9e52] };
const CRASH_WORD = { tree: "CRASH!", house: "SMASH!", castle: "BONK!", rock: "CRASH!" };
const _push = new THREE.Vector3();
function crashCheck(p, dt) {
  p.crashT = Math.max(0, (p.crashT || 0) - dt);
  p.splashT = Math.max(0, (p.splashT || 0) - dt);
  if (p.dead) return;
  const hit = world.collide(p.pos.x, p.pos.y, p.pos.z, 8);
  if (hit) {
    _push.set(hit.x, hit.y, hit.z);
    const len = _push.length();
    p.pos.add(_push);
    if (len > 0.01) {
      _push.divideScalar(len);
      // bounce: turn away from the surface and lose speed
      if (_push.y > 0.7) p.pitch = Math.max(p.pitch, 0.25);                   // skimmed the top: pop up
      else if (_push.y < -0.7) p.pitch = Math.min(p.pitch, -0.2);             // hit from below
      else {
        const away = Math.atan2(_push.x, _push.z);
        p.yaw += angDiff(away, p.yaw) * 0.35;
        p.pitch = Math.max(p.pitch, 0.12);
      }
    }
    if (p.crashT <= 0) {
      const fast = clamp((p.speed - 40) / 110, 0, 1);
      p.speed *= 0.5;
      p.crashT = 0.6;
      const cols = CRASH_FX[hit.kind] || CRASH_FX.rock;
      fx.burst(p.pos, { core: cols[0], glow: cols[1], trail: cols[2] }, 14, 90, 9, 0.6);
      fx.shards(p.pos, cols, 10, 120, 7, 0.5);
      G.shake = Math.max(G.shake, 0.5 + fast * 0.6);
      audio.play("impact", 0.9, 0.7);
      if (p.invuln <= 0 && !p.ulting) {
        meta.crashed();
        damagePlayer((6 + fast * 12) * (1 + 0.15 * Math.floor((G.stage - 1) / 10)));     // crashes hurt a little more in later worlds
        pop(CRASH_WORD[hit.kind] || "CRASH!", "bad", p.pos);
      }
    }
  }
  // waterfalls: fly through for a splash and a short slowdown
  for (const wf of world.waterfalls) {
    const dy = wf.obj.position.y - wf.baseY;
    if (Math.abs(p.pos.x - wf.x) < 10 && Math.abs(p.pos.z - wf.z) < wf.half + 6 && p.pos.y < wf.top + dy && p.pos.y > wf.bottom) {
      if (p.splashT <= 0) {
        p.splashT = 0.5; p.speed *= 0.8;
        fx.burst(p.pos, { core: 0xffffff, glow: 0xcfeaff, trail: 0x9fd4ff }, 18, 80, 8, 0.6);
        audio.play("wing_flap", 0.8, 0.8);
      }
    }
  }
}

// ---------------------------------------------------------------- ice world hazards
// Falling ice shards: a warning circle appears ahead of you, then a big shard drops through it.
// Freezing wind zones: swirling snow; inside, the dragon slows down and the screen frosts over.
const ICE_EL = { core: 0xffffff, glow: 0x9fe6ff, trail: 0x6fc8ff, name: "Ice" };
let shardT = 4, frostAmt = 0;
const pendingShards = [];
function crystalHazards(dt) {
  const p = G.player;
  const tier = Math.floor((G.stage - 1) / 10);
  if (!p.dead && !G.warp && !G.rift) {
    shardT -= dt;
    if (shardT <= 0) {
      shardT = rand(3.2, 5.5) / (1 + tier * 0.25);
      const at = new THREE.Vector3().copy(p.pos).addScaledVector(p.fwd, p.speed * 1.5).add(tmp.set(rand(-50, 50), 0, rand(-50, 50)));
      fx.rune(at, 0x9fe6ff, 46, 1.1);
      pendingShards.push({ at, t: 1.0 });
    }
  }
  for (let i = pendingShards.length - 1; i >= 0; i--) {
    const sh = pendingShards[i];
    sh.t -= dt;
    if (sh.t <= 0) {
      pendingShards.splice(i, 1);
      const from = tmp.copy(sh.at); from.y += 260;
      shoot("e", from, tmp2.set(rand(-0.04, 0.04), -1, rand(-0.04, 0.04)).normalize(), 280, 12 * (1 + 0.07 * (G.stage - 1)), ICE_EL, 24, null, false);
      audio.play("ice_shot", 0.5, 0.6);
    }
  }
  // freezing wind
  let inside = false;
  for (const z of crystal.winds) {
    const d = Math.hypot(p.pos.x - z.x, p.pos.z - z.z);
    if (d < z.r) inside = true;
    if (Math.hypot(camera.position.x - z.x, camera.position.z - z.z) < 1000 && Math.random() < (QUAL.light ? 0.35 : 0.7)) {
      const a = rand(0, Math.PI * 2), r = rand(20, z.r), y = rand(groundAt(z.x, z.z) + 10, groundAt(z.x, z.z) + 520);
      tmp.set(z.x + Math.cos(a) * r, y, z.z + Math.sin(a) * r);
      fx.puff(tmp, 0x8fa8bc, rand(6, 12), 1.2, tmp2.set(-Math.sin(a) * 90, rand(-10, 10), Math.cos(a) * 90), 8, 0.3);
    }
  }
  if (inside && !p.dead) {
    p.speed = Math.max(45, p.speed * (1 - 1.4 * dt));
    if (!p.inWind) pop("FREEZING WIND!", "bad", p.pos);
  }
  p.inWind = inside;
  frostAmt += ((inside ? 1 : 0) - frostAmt) * Math.min(1, 3 * dt);
  $("frost").style.opacity = frostAmt.toFixed(2);
}

// mist rising where each waterfall lands, and spray at the top (only near the camera)
let mistT = 0;
function waterfallMist(dt) {
  mistT -= dt;
  if (mistT > 0) return;
  mistT = QUAL.light ? 0.3 : 0.18;
  for (const wf of world.waterfalls) {
    const dy = wf.obj.position.y - wf.baseY;
    if (Math.hypot(camera.position.x - wf.x, camera.position.z - wf.z) > 1100) continue;
    tmp.set(wf.x + rand(-4, 4), wf.bottom + rand(2, 10), wf.z + rand(-wf.half, wf.half));
    fx.puff(tmp, 0x3e4c56, rand(16, 28), rand(1.4, 2.2), tmp2.set(rand(-8, 8), rand(8, 18), rand(-8, 8)), 22, 0.5);   // soft spray (sprites add light, so the colour is kept dim)
    if (Math.random() < 0.5) { tmp.set(wf.x + 2, wf.top + dy - 2, wf.z + rand(-wf.half, wf.half)); fx.puff(tmp, 0x6f8090, rand(5, 9), 0.6, tmp2.set(rand(2, 8), rand(-6, 2), 0), 6, 0.8); }
  }
}

// ---------------------------------------------------------------- update: player
// angle between where the dragon is heading and an enemy
function aimAngle(p, e) {
  tmp.copy(e.godDef ? e.dragon.heartWorld(tmp) : e.pos).sub(p.pos);
  const dist = tmp.length() || 1;
  return { ang: Math.acos(clamp(tmp.dot(p.fwd) / dist, -1, 1)), dist };
}

// Auto-lock (as in v1.5.2): whatever stays near the crosshair for a moment gets locked; the lock holds until it dies or drifts far off.
function pickTarget(p, dt) {
  if (G.lock) {
    const { ang, dist } = G.lock.state === "alive" ? aimAngle(p, G.lock) : { ang: 9, dist: 1e9 };
    if (ang < 1.25 && dist < 950) return G.lock;
    G.lock = null;
  }
  let best = null, score = 1e9;
  for (const e of G.enemies) {
    if (e.state !== "alive") continue;
    const { ang, dist } = aimAngle(p, e);
    if (dist > 800 || ang > (e.boss ? 0.7 : 0.5)) continue;
    const sc = ang + dist / 2000;
    if (sc < score) { score = sc; best = e; }
  }
  if (best && best === G.lockCand) {
    G.lockT += dt;
    if (G.lockT >= 0.15) { G.lock = best; G.lockCand = null; G.lockT = 0; }
  } else { G.lockCand = best; G.lockT = 0; }
  return best;
}

function aimDir(p, from, speed, out, maxDist = 1e9) {
  const t = G.target;
  if (!t || t.state !== "alive") return out.copy(p.fwd);
  const at = t.godDef && t.core && t.core.open ? t.dragon.heartWorld(tmp4) : t.pos;
  const dist = at.distanceTo(from);
  if (dist > maxDist) return out.copy(p.fwd);
  return out.copy(at).addScaledVector(t.vel, dist / speed).sub(from).normalize();
}

function updatePlayer(p, dt) {
  const d = p.dragon;
  p.invuln = Math.max(0, p.invuln - dt);
  p.fireT -= dt; p.dodgeT -= dt; p.voiceT -= dt;
  if ((p.def.regen || p.up.regen) && !p.dead) p.hp = Math.min(p.maxHp, p.hp + (p.def.regen + p.up.regen) * dt);
  const ult = p.ulting;
  const steer = ult ? 0.15 : 1;

  // ---- flight (as in v1.5.2): the stick / WASD turn, climb and dive
  p.yaw -= input.x * 1.7 * dt * steer;
  // altitude assist: with a locked target and the stick level, ease toward the target's height (the stick always wins)
  let wantPitch = input.v * 0.95 * steer;
  if (G.lock && G.lock.state === "alive" && Math.abs(input.v) < 0.15 && !ult) {
    tmp.copy(G.lock.godDef ? G.lock.dragon.heartWorld(tmp) : G.lock.pos).sub(p.pos);
    wantPitch = clamp(Math.atan2(tmp.y, Math.hypot(tmp.x, tmp.z)), -0.7, 0.7) * 0.85;
  }
  p.pitch += (wantPitch - p.pitch) * Math.min(1, 4 * dt);
  p.bank += (input.x * 0.85 * steer - p.bank) * Math.min(1, 4.5 * dt);

  // ---- boost (manual): BOOST button / Shift, uses the blue energy bar
  const boosting = input.boost && p.energy > 1 && !ult;
  p.energy = clamp(p.energy + (boosting ? -30 : 15) * dt, 0, 100);
  const want = 80 * p.def.speed * (boosting ? 1.8 : 1) * (ult ? 0.3 : 1);
  p.speed += (want - p.speed) * Math.min(1, 2.5 * dt);
  if (boosting && !p.wasBoost) audio.play("boost", 0.8);
  if (boosting) {
    fx.puff(tmp.copy(p.pos).addScaledVector(p.fwd, -8), 0xffffff, 5, 0.35, null, 9);
    // speed lines rushing past the camera
    for (let i = 0; i < (QUAL.light ? 1 : 2); i++) {
      const a = rand(0, Math.PI * 2), r = rand(14, 34);
      tmp2.set(Math.cos(a) * r, Math.sin(a) * r * 0.6, 0).applyQuaternion(camera.quaternion);
      tmp.copy(camera.position).addScaledVector(p.fwd, rand(50, 110)).add(tmp2);
      fx.streakPuff(tmp, 0xffffff, rand(1.2, 2.2), 0.28, tmp3.copy(p.fwd).multiplyScalar(-(p.speed + 380)), 6);
    }
  }
  p.wasBoost = boosting;

  const cp = Math.cos(p.pitch);
  p.fwd.set(Math.sin(p.yaw) * cp, Math.sin(p.pitch), Math.cos(p.yaw) * cp);
  p.pos.addScaledVector(p.fwd, p.speed * dt);
  if (p.dodgeVel.lengthSq() > 1) { p.pos.addScaledVector(p.dodgeVel, dt); p.dodgeVel.multiplyScalar(Math.max(0, 1 - 4.5 * dt)); }

  const r = Math.hypot(p.pos.x, p.pos.z);
  if (r > WORLD_RADIUS) p.yaw += angDiff(Math.atan2(-p.pos.x, -p.pos.z), p.yaw) * Math.min(1, 2.2 * dt);
  const ground = groundAt(p.pos.x, p.pos.z) + 12;
  if (p.pos.y < ground) { p.pos.y = ground; p.pitch = Math.max(p.pitch, 0.18); p.pitchAim = Math.max(p.pitchAim || 0, 0.18); }
  if (p.pos.y > CEILING) { p.pos.y = CEILING; p.pitch = Math.min(p.pitch, -0.05); p.pitchAim = Math.min(p.pitchAim || 0, 0); }
  crashCheck(p, dt);
  d.root.rotation.set(-p.pitch, p.yaw, p.bank);

  d.setBase(boosting ? "boost" : (p.pitch < -0.28 ? "glide" : "fly"));
  G.target = pickTarget(p, dt);

  while (input.queue.length) {
    const act = input.queue.shift();
    if (p.dead) continue;
    if ((act === "dodge" || act === "dodgeL" || act === "dodgeR") && p.dodgeT <= 0 && !ult) {
      // Q / E roll left / right; the DODGE button rolls the way you are turning, or away from the nearest incoming shot
      let side = act === "dodgeL" ? 1 : act === "dodgeR" ? -1 : input.x < -0.2 ? 1 : input.x > 0.2 ? -1 : 0;
      if (!side) {
        let near = null, nd = 1e9;
        for (const s of G.shots) { if (s.owner !== "e") continue; const d2 = s.pos.distanceToSquared(p.pos); if (d2 < nd) { nd = d2; near = s; } }
        if (near) { tmp.copy(near.pos).sub(p.pos); side = (tmp.x * Math.cos(p.yaw) - tmp.z * Math.sin(p.yaw)) > 0 ? -1 : 1; }
        else side = Math.random() < 0.5 ? 1 : -1;
      }
      p.dodgeVel.set(Math.cos(p.yaw) * side, 0, -Math.sin(p.yaw) * side).multiplyScalar(125);
      p.dodgeT = 1.3; p.invuln = Math.max(p.invuln, 0.55);
      meta.track("dodge", 1);
      d.once(side > 0 ? "roll_L" : "roll_R", 1.15);
      audio.play("wing_flap", 1, 1.2);
      fx.stars(p.pos, 0xffffff, 6, 60, 3.5, 0.4);
    } else if (act === "ult" && p.ult >= 100 && !ult) {
      p.ult = 0; p.ultReady = false;
      p.ulting = { t: 0, fired: false, dur: d.once("ultimate", 1.15) };
      p.invuln = Math.max(p.invuln, p.ulting.dur + 0.4);
      audio.play("ultimate_charge", 1, 0.7);
      audio.say(p.voice, "ultimate", 0, true);
      banner("SURGE", `${p.def.name} UNLEASHED`, 2.2);
    }
  }

  // breath: hold BREATH (right mouse button) for a short-range stream that burns everything in a cone, while heat lasts
  if (p.heat <= 2) p.overheat = true; else if (p.heat > 30) p.overheat = false;
  p.breathing = input.breath && !p.overheat && !ult && !p.dead;
  if (p.breathing) {
    p.heat = Math.max(0, p.heat - 34 * p.up.heatUse * dt); p.heatWait = 0.6;
    d.mouth(tmp);
    aimDir(p, tmp, 600, tmp2, 300);
    for (let i = 0; i < 4; i++) {
      tmp3.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(0.11).add(tmp2).normalize().multiplyScalar(rand(230, 330) + p.speed);
      const c = i === 0 ? p.fireEl.core : (i % 2 ? p.fireEl.glow : p.fireEl.trail);
      fx.puff(tmp4.copy(tmp).addScaledVector(tmp2, rand(2, 10)), c, rand(5, 9), rand(0.45, 0.7), tmp3, 20, 1.1, i === 3);
    }
    p.breathSnd -= dt;
    if (p.breathSnd <= 0) { p.breathSnd = 0.22; audio.play(p.def.shot, 0.4, rand(0.75, 0.95)); }
    p.breathT -= dt;
    if (p.breathT <= 0) {
      p.breathT = 0.12;
      for (const e of G.enemies) {
        if (e.state !== "alive") continue;
        tmp3.copy(e.pos).sub(tmp);
        const dist = tmp3.length();
        if (dist > 270 + e.radius) continue;
        const ang = Math.acos(clamp(tmp3.dot(tmp2) / dist, -1, 1));
        if (ang < 0.24 + Math.atan(e.radius / dist)) hurtEnemy(e, 62 * p.dmgMul * p.up.breathDmg * 0.12, e.pos, "breath");
      }
    }
  } else {
    p.heatWait -= dt;
    if (p.heatWait <= 0) p.heat = Math.min(100, p.heat + 22 * dt);
  }

  if (ult) {
    ult.t += dt;
    G.slow = 0.3;
    d.mouth(tmp);
    if (!ult.fired) { fx.puff(tmp, p.el.glow, 5 + ult.t * 7, 0.25, null, 6); if (Math.random() < 0.5) fx.stars(p.pos, p.el.core, 1, 70, 4, 0.5); }
    if (!ult.fired && ult.t >= ult.dur * 0.76) {
      ult.fired = true;
      const dir = aimDir(p, tmp, 2000, tmp2).clone();
      fx.beam(tmp, dir, 820, 17, p.el, 1.1);
      fx.ring(tmp, p.el.core, 45, 0.6, camera);
      fx.burst(tmp, p.el, 36, 200, 12, 0.7);
      fx.stars(tmp, 0xffffff, 24, 220, 7, 0.9);
      audio.play("ultimate_blast", 1); audio.play("dragon_roar", 0.9);
      G.shake = 1.8;
      for (const e of G.enemies) {
        if (e.state !== "alive") continue;
        tmp3.copy(e.pos).sub(tmp);
        const along = tmp3.dot(dir);
        if (along < -20 || along > 840) continue;
        const perp = Math.sqrt(Math.max(0, tmp3.lengthSq() - along * along));
        if (perp > 75 + e.radius && e !== G.target) continue;
        hurtEnemy(e, e.boss ? e.maxHp * 0.4 : e.maxHp * 10, e.pos, "crit");
      }
    }
    if (ult.t >= ult.dur) { p.ulting = null; G.slow = 1; }
  } else if (input.fire && p.fireT <= 0 && !p.dead && !p.breathing) {
    p.fireT = 0.2 / p.up.fireRate;
    d.mouth(tmp);
    aimDir(p, tmp, 300, tmp2);
    const crit = Math.random() < 0.12;
    const big = 1 + p.tier * 0.15;
    shoot("p", tmp, tmp2, 300 + p.speed, 20 * p.dmgMul * (crit ? 2.2 : 1), p.fireEl, (crit ? 15 : 11) * big, G.target, crit);
    fx.burst(tmp, p.fireEl, 3 + p.tier, 30, 6, 0.2);
    fx.puff(tmp, p.fireEl.core, 9 * big, 0.12, null, 0);           // muzzle flash
    if (!d.oneShot) d.once("attack", 2.2);
    audio.play(p.def.shot, 0.55, rand(1.05, 1.3));
    if (p.voiceT <= 0 && Math.random() < 0.06) { if (audio.say(p.voice, "attack", 8)) p.voiceT = 8; }
  }

  // charged fireball: keep FIRE held (away from breath range) to fill the meter, let go to launch a big blast
  if (input.fire && !p.breathing && !ult && !p.dead) {
    const was = p.charge;
    p.charge = Math.min(1, p.charge + dt / 1.4);
    if (p.charge >= 1 && was < 1) { fx.ring(p.pos, p.fireEl.glow, 22, 0.35, camera); }
    if (p.charge >= 1 && Math.random() < 0.5) fx.puff(d.mouth(tmp), p.fireEl.glow, 10, 0.18, null, 4);
  } else {
    if (p.charge >= 1 && !p.dead && !ult) {
      d.mouth(tmp);
      aimDir(p, tmp, 260, tmp2);
      shoot("p", tmp, tmp2, 260 + p.speed, 20 * p.dmgMul * 7, p.fireEl, 34, G.target, true);
      G.shots[G.shots.length - 1].blast = true;
      fx.burst(tmp, p.fireEl, 16, 80, 12, 0.4);
      d.once("attack", 1.4);
      audio.play(p.def.shot, 1, 0.6); audio.play("boost", 0.6, 0.7);
      G.shake = Math.max(G.shake, 0.5);
    }
    p.charge = 0;
  }

  if (p.ult >= 100 && !p.ultReady) { p.ultReady = true; audio.say("announcer", "ultimate_ready", 0); pop("SURGE READY!", "level"); }
}

// ---------------------------------------------------------------- update: enemies, shots, pickups
// short warning strip under the boss bar (no sound)
let warnT = null;
function bossWarn(text, secs = 1.4) {
  const el = $("bossWarn");
  el.textContent = text; el.classList.remove("show"); void el.offsetWidth; el.classList.add("show");
  clearTimeout(warnT); warnT = setTimeout(() => el.classList.remove("show"), secs * 1000);
}

const godCtx = {
  get player() { return G.player; }, fx, audio, camera, rand, groundAt, ceiling: CEILING - 60,
  shoot: (from, dir, speed, dmg, size, homing) => { shoot("e", from, dir, speed, dmg, ELEMENTS.foe, size, null, false); if (homing) G.shots[G.shots.length - 1].homing = true; },
  ring: (pos, color, r) => fx.ring(pos, color, r, 0.7, camera),
  rune: (pos, color, r) => fx.rune(pos, color, r),
  warn: (text, secs = 1.4) => bossWarn(text, secs),
};
function updateEnemies(dt) {
  const p = G.player;
  const edt = dt * G.slow;
  for (let i = G.enemies.length - 1; i >= 0; i--) {
    const e = G.enemies[i];
    if (e.state === "dying") {
      if (e.godDef && e.dragon.fade !== 1) e.dragon.setFade(1);
      e.dieT -= dt; e.vel.y -= 80 * dt; e.pos.addScaledVector(e.vel, dt);
      e.dragon.root.rotation.z += dt * 2.2;
      e.dragon.update(dt, false, true);
      if (Math.random() < 0.5) fx.puff(e.pos, 0xff5a7a, 10, 0.5, null, 14);
      if (e.dieT <= 0 || e.pos.y < groundAt(e.pos.x, e.pos.z)) {
        fx.burst(e.pos, ELEMENTS.foe, 16, 60, 13, 0.6);
        e.dragon.dispose(); G.enemies.splice(i, 1);
      }
      continue;
    }
    if (e.boss && e.phase === 1 && e.hp < e.maxHp * 0.5) {
      e.phase = 2; e.speed *= 1.3; e.ringT = 1.5;
      pop("ENRAGED!", "bad", e.pos); banner(e.godDef ? e.godDef.name : "THE WYRM RAGES", "PHASE TWO", 2.4);
      if (e.godDef) $("bossName").textContent = `${e.godDef.name.split(",")[0]}  ·  PHASE II`;
      e.dragon.once("roar"); audio.play("dragon_roar", 1, 0.85); G.shake = 1; G.freeze = 0.15;
      fx.ring(e.pos, 0xff2e63, 120, 0.8, camera);
    }
    tmp.copy(p.pos).sub(e.pos);
    const dist = tmp.length() || 1;
    tmp.divideScalar(dist);
    if (e.godDef) {                                   // gods drift, swoop and teleport, face you, and fight with their own patterns
      const busy = godMove(e, edt, godCtx);
      // the crystal core opens for a few seconds, then seals again (shorter waits when enraged)
      e.core.t -= edt;
      if (e.core.t <= 0 && !busy) {
        e.core.open = !e.core.open;
        e.core.t = e.core.open ? 4.5 : (e.phase === 2 ? 5 : 7);
        e.dragon.setCoreOpen(e.core.open);
        if (e.core.open) { pop("CORE OPEN!", "crit", e.dragon.heartWorld(tmp4)); fx.ring(tmp4, 0xff2e7a, 70, 0.6, camera); }
      }
      if (Math.hypot(e.pos.x, e.pos.z) > WORLD_RADIUS + 200) e.pos.multiplyScalar(0.995);
      const face = Math.atan2(p.pos.x - e.pos.x, p.pos.z - e.pos.z);
      e.yaw += angDiff(face, e.yaw) * Math.min(1, 2.5 * edt);
      e.dragon.root.rotation.set(0, e.yaw, clamp(-e.vel.dot(tmp2.set(Math.cos(e.yaw), 0, -Math.sin(e.yaw))) * 0.002, -0.25, 0.25));
      const gd = e.pos.distanceTo(p.pos);
      if (gd < e.radius + 70) p.pos.addScaledVector(tmp, e.radius + 70 - gd);   // you cannot fly through a god
      if (!p.dead && !busy) godAttack(e, edt, godCtx);
      e.dragon.update(edt, false, false);
      continue;
    }
    tmp2.crossVectors(UP, tmp).multiplyScalar(e.orbit);
    const baseDmg = 8 * (1 + 0.07 * (G.stage - 1)) * (e.dmgK || 1);
    if (e.type && typeBehaviour(e, edt, p, dist, baseDmg)) { if (e.state === "alive") { e.dragon.root.rotation.set(0, Math.atan2(e.vel.x, e.vel.z), 0); e.dragon.update(edt, false, false); } continue; }
    const far0 = e.type === "sniper" ? 640 : e.type === "mender" ? 480 : 0;
    const near = e.godDef ? 360 : e.boss ? 180 : far0 ? far0 - 180 : 120, far = e.godDef ? 560 : e.boss ? 340 : far0 || 270;
    if (dist > far) tmp3.copy(tmp).addScaledVector(tmp2, 0.25);
    else if (dist < near) tmp3.copy(tmp).multiplyScalar(-0.9).addScaledVector(tmp2, 0.8);
    else tmp3.copy(tmp2).addScaledVector(tmp, 0.15);
    tmp3.y += clamp((p.pos.y + e.alt - e.pos.y) / 60, -0.6, 0.6);
    if (e.pos.y < groundAt(e.pos.x, e.pos.z) + 50) tmp3.y = 1;
    if (Math.hypot(e.pos.x, e.pos.z) > WORLD_RADIUS + 80) tmp3.set(-e.pos.x, 0, -e.pos.z);
    tmp3.normalize().multiplyScalar(e.speed);
    e.vel.lerp(tmp3, Math.min(1, 1.4 * edt));
    e.pos.addScaledVector(e.vel, edt);
    if (e.pos.y > CEILING - 60) { e.pos.y = CEILING - 60; if (e.vel.y > 0) e.vel.y = 0; }   // enemies never fly above where you can reach
    if (!e.godDef) {                                 // enemy dragons slide off trees, houses and rocks instead of passing through
      const hit = world.collide(e.pos.x, e.pos.y, e.pos.z, e.radius * 0.7);
      if (hit) { e.pos.x += hit.x; e.pos.y += hit.y; e.pos.z += hit.z; e.vel.y = Math.max(e.vel.y, 20); }
    }
    const sp = e.vel.length() || 1;
    const yaw = Math.atan2(e.vel.x, e.vel.z);
    e.yaw += angDiff(yaw, e.yaw) * Math.min(1, 5 * edt);
    e.pitch += (Math.asin(clamp(e.vel.y / sp, -1, 1)) - e.pitch) * Math.min(1, 4 * edt);
    e.dragon.root.rotation.set(-e.pitch, e.yaw, clamp(angDiff(yaw, e.yaw) * 1.5, -0.7, 0.7));

    const speed = 110 + Math.min(70, G.stage * 3);
    const dmg = baseDmg * (e.boss ? 1.6 : e.swarm ? 0.5 : 1);
    e.fireT -= edt;
    if (e.fireT <= 0 && dist < 480 && !p.dead) {
      const interval = Math.max(0.9, 2.5 - 0.08 * G.stage) * (e.boss ? (e.phase === 2 ? 0.5 : 0.75) : 1);
      e.fireT = interval * rand(0.7, 1.3);
      e.dragon.mouth(tmp);
      tmp2.copy(p.pos).addScaledVector(p.fwd, p.speed * (dist / speed) * 0.75).sub(tmp).normalize();
      const n = e.boss ? 1 : 0;
      for (let k = -n; k <= n; k++) {
        tmp3.copy(tmp2).addScaledVector(UP, k * 0.07).normalize();
        shoot("e", tmp, tmp3, speed, dmg, ELEMENTS.foe, e.boss ? 17 : 11, null, false);
      }
      if (!e.dragon.oneShot) e.dragon.once("attack", 1.5);
      if (dist < 320) audio.play("fire_shot", 0.25, 0.8);
    }
    if (e.boss && e.phase === 2) {
      e.ringT -= edt;
      if (e.ringT <= 0 && !p.dead) {                     // ring of shots the player has to climb over or dive under
        e.ringT = 4.2;
        for (let k = 0; k < 14; k++) {
          const a = (k / 14) * Math.PI * 2;
          shoot("e", e.pos, tmp3.set(Math.cos(a), 0, Math.sin(a)), speed * 0.8, dmg, ELEMENTS.foe, 15, null, false);
        }
        fx.ring(e.pos, 0xff2e63, 80, 0.6, camera);
        audio.play("lightning_shot", 0.6, 0.7);
      }
    }
    e.dragon.update(edt, false, false);
  }
}

// extra effects when a player shot lands: the charged blast splashes, evolved fire chains to a nearby foe
function afterHit(s, hit) {
  if (s.blast) {
    hitWord(hit, "blast", s.pos);
    fx.burst(s.pos, s.el, 40, 160, 18, 0.7); fx.ring(s.pos, s.el.glow, 90, 0.6, camera); fx.ring(s.pos, 0xffffff, 140, 0.8, camera);
    fx.shards(s.pos, [0xffd23c, 0xffffff, s.el.glow], 40, 260, 11, 0.7);
    audio.play("ultimate_blast", 0.6, 1.3); G.shake = Math.max(G.shake, 0.8);
    for (const e of G.enemies) if (e !== hit && e.state === "alive" && e.pos.distanceTo(s.pos) < 110 + e.radius) hurtEnemy(e, s.dmg * 0.5, e.pos, "crit");
  }
  if (s.el.chain) {
    let best = null, bd = 190;
    for (const e of G.enemies) { if (e === hit || e.state !== "alive") continue; const dd = e.pos.distanceTo(s.pos); if (dd < bd) { bd = dd; best = e; } }
    if (best) {
      tmp3.copy(best.pos).sub(s.pos).normalize();
      fx.beam(s.pos, tmp3, bd, 3, s.el, 0.25); fx.beam(s.pos, tmp3, bd, 1.2, { glow: 0xffffff, core: 0xffffff }, 0.18);
      hurtEnemy(best, s.dmg * 0.4, best.pos, "shot");
      audio.play("lightning_shot", 0.35, 1.4);
    }
  }
}

// each skin's fireball leaves its own kind of trail
const side = new THREE.Vector3(), up2 = new THREE.Vector3();
function shotTrail(s) {
  const st = s.style, t = s.age;
  if (st === "orb" || s.owner !== "p") { fx.puff(s.pos, s.el.trail, s.size * 0.85, 0.32, null, -s.size * 0.5); return; }
  tmp.copy(s.vel).normalize();
  side.crossVectors(tmp, UP).normalize(); up2.crossVectors(side, tmp);
  if (st === "spiral") {            // two embers orbit the fireball
    for (const k of [0, Math.PI]) {
      tmp2.copy(s.pos).addScaledVector(side, Math.cos(t * 22 + k) * s.size * 0.7).addScaledVector(up2, Math.sin(t * 22 + k) * s.size * 0.7);
      fx.puff(tmp2, k ? s.el.glow : s.el.trail, s.size * 0.45, 0.35, null, -s.size * 0.2);
    }
    fx.puff(s.pos, s.el.trail, s.size * 0.6, 0.2, null, -s.size * 0.3);
  } else if (st === "shard") {      // a long thin icy streak
    for (let i = 0; i < 3; i++) fx.puff(tmp2.copy(s.pos).addScaledVector(tmp, -i * s.size * 0.5), i ? s.el.trail : s.el.glow, s.size * (0.5 - i * 0.1), 0.45, null, -s.size * 0.15);
    if (Math.random() < 0.4) fx.puff(s.pos, 0xffffff, 3, 0.5, tmp2.set(rand(-20, 20), rand(-20, 20), rand(-20, 20)), 0, 0, true);
  } else if (st === "bolt") {       // crackling zig-zag
    tmp2.copy(s.pos).addScaledVector(side, rand(-1, 1) * s.size * 0.8).addScaledVector(up2, rand(-1, 1) * s.size * 0.8);
    fx.puff(tmp2, s.el.glow, s.size * 0.4, 0.18, null, 0, 0, true);
    fx.puff(s.pos, s.el.trail, s.size * 0.7, 0.22, null, -s.size * 0.4);
  } else if (st === "petal") {      // spinning petals drift away
    fx.puff(s.pos, s.el.trail, s.size * 0.6, 0.25, null, -s.size * 0.3);
    if (Math.random() < 0.7) fx.puff(s.pos, s.el.glow, s.size * 0.35, 0.8, tmp2.copy(side).multiplyScalar(rand(-40, 40)).addScaledVector(up2, rand(-30, 10)), 0, 1.5, true);
  } else if (st === "nova") {       // big pulsing star
    fx.puff(s.pos, s.el.glow, s.size * (0.9 + Math.sin(t * 30) * 0.3), 0.3, null, -s.size * 0.4);
    fx.puff(s.pos, 0xffffff, s.size * 0.5, 0.15, null, 0, 0, true);
  }
}

function updateShots(dt) {
  const p = G.player;
  for (let i = G.shots.length - 1; i >= 0; i--) {
    const s = G.shots[i];
    const sdt = s.owner === "e" ? dt * G.slow : dt;
    s.life -= sdt;
    if (s.owner === "p" && s.target && s.target.state === "alive") {
      (s.target.godDef && s.target.core.open ? s.target.dragon.heartWorld(tmp) : tmp.copy(s.target.pos)).sub(s.pos).normalize().multiplyScalar(s.speed);   // locked shots seek a god's heart
      s.vel.lerp(tmp, Math.min(1, (G.lock === s.target ? 6 : 2) * dt));   // locked shots turn hard, unlocked ones get a gentle nudge
    }
    if (s.homing && p && !p.dead) {
      tmp.copy(p.pos).sub(s.pos).normalize().multiplyScalar(s.speed);
      s.vel.lerp(tmp, Math.min(1, 0.9 * sdt));
    }
    s.pos.addScaledVector(s.vel, sdt);
    s.trailT -= dt;
    s.age += dt;
    if (s.trailT <= 0) { s.trailT = 0.03; shotTrail(s); if (s.crit) fx.puff(s.pos, 0xffffff, 6, 0.3, null, 0, 0, true); }
    let dead = s.life <= 0 || s.pos.y < groundAt(s.pos.x, s.pos.z);
    if (!dead && s.owner === "p") {
      for (const e of G.enemies) {
        if (e.state !== "alive") continue;
        if (e.godDef) {
          const h = e.dragon.heartWorld(tmp4), hr = e.godDef.heartR;
          if (h.distanceToSquared(s.pos) < hr * hr) {
            // the core only takes bonus damage while it is open
            if (e.core.open) hurtEnemy(e, s.dmg * 3, s.pos, "weak");
            else { hurtEnemy(e, s.dmg * 0.6, s.pos, "shot"); if (Math.random() < 0.15) pop("ARMOURED", "bad", s.pos); }
            dead = e; break;
          }
        }
        if (e.pos.distanceToSquared(s.pos) < (e.radius + 4) * (e.radius + 4)) { hurtEnemy(e, s.dmg, s.pos, s.blast ? "blast" : s.crit ? "crit" : "shot"); dead = e; break; }
      }
      if (dead) afterHit(s, dead);
    } else if (!dead && p && !p.dead && p.pos.distanceToSquared(s.pos) < 110) {
      if (p.invuln <= 0) { damagePlayer(s.dmg); fx.burst(s.pos, s.el, 10, 50, 9, 0.4); dead = true; }
    }
    if (dead) { if (s.life > 0) fx.burst(s.pos, s.el, 5, 30, 7, 0.3); s.s.removeFromParent(); s.s.material.dispose(); G.shots.splice(i, 1); }
  }
}

function updatePickups(dt) {
  const p = G.player;
  for (let i = G.pickups.length - 1; i >= 0; i--) {
    const c = G.pickups[i];
    c.t += dt;
    c.s.material.rotation += dt * 4;
    if (c.t > 0.45) { tmp.copy(p.pos).sub(c.pos).normalize().multiplyScalar(70 + c.t * 300); c.vel.lerp(tmp, Math.min(1, 6 * dt)); }
    else c.vel.multiplyScalar(Math.max(0, 1 - 2 * dt));
    c.pos.addScaledVector(c.vel, dt);
    if (c.t > 0.45 && c.pos.distanceToSquared(p.pos) < 170) {
      if (c.kind === "heal") { const h = p.maxHp * c.value * p.up.orbHeal; p.hp = Math.min(p.maxHp, p.hp + h); pop(`+${Math.round(h)} HP`, "heal", p.pos); audio.play("gem_pickup", 0.6, 1.3); }
      else if (c.kind === "coin") { save.coins += c.value; audio.play("coin_pickup", 0.5, rand(0.95, 1.2)); meta.track("coins", c.value); }
      else { save.gems += c.value; audio.play("gem_pickup", 0.8); }
      persist();
      c.s.removeFromParent(); c.s.material.dispose(); G.pickups.splice(i, 1);
    }
  }
}

function updateStage(dt) {
  if (updateRift(dt)) return;
  if (G.spawnT > 0) {
    G.spawnT -= dt;
    if (G.spawnT <= 0) {
      // a god fight waits (up to 8 s) for its model to finish downloading
      const def = G.pendingBoss ? godForStage(G.stage).def : null;
      if (def && !godModels[def.id] && (G.bossWait = (G.bossWait || 0) + 0.25) < 8) { loadGod(def); G.spawnT = 0.25; return; }
      G.bossWait = 0; spawnWave();
    }
    return;
  }
  if (G.nextStageT > 0) { G.nextStageT -= dt; if (G.nextStageT <= 0) nextStage(1.6); return; }
  if (!G.enemies.some((e) => e.state === "alive") && G.state === "play") {
    const p = G.player;
    const wasBoss = G.pendingBoss;
    p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.3);
    G.nextStageT = wasBoss ? 4.5 : 3;
    meta.stageCleared(G, p);
    if (wasBoss && G.stage % 10 === 0) { G.nextStageT = 0; setTimeout(() => { if (G.state === "play" && G.player) openRift(); }, 3200); G.rift = true; }
    $("bossbar").classList.add("hidden");
    if (wasBoss) { banner("VICTORY", G.lastGod ? `${G.lastGod} FALLS` : "THE DREAD WYRM FALLS", 3.5); audio.say("announcer", "victory", 0, true); p.dragon.once("roar"); audio.play("dragon_roar", 0.8); setTimeout(() => audio.say(p.voice, "win", 0), 1800); }
    else banner("STAGE CLEAR", "+30% HEALTH", 2.2);
  }
}

// ---------------------------------------------------------------- camera and HUD
const camTarget = new THREE.Vector3(), camLook = new THREE.Vector3();
function updateCamera(dt) {
  const p = G.player;
  const back = p.ulting ? 40 : 27;
  camTarget.copy(p.pos).addScaledVector(tmp.set(Math.sin(p.yaw), Math.sin(p.pitch) * 0.6, Math.cos(p.yaw)), -back).addScaledVector(UP, 10);
  const ground = groundAt(camTarget.x, camTarget.z) + 4;
  if (camTarget.y < ground) camTarget.y = ground;
  camera.position.lerp(camTarget, 1 - Math.exp(-7 * dt));
  camLook.copy(p.pos).addScaledVector(p.fwd, 34).addScaledVector(UP, 3);
  if (!SET.shake) G.shake = 0;
  if (G.shake > 0.01) { camera.position.x += (Math.random() - 0.5) * G.shake * 2.2; camera.position.y += (Math.random() - 0.5) * G.shake * 2.2; G.shake *= Math.max(0, 1 - 5 * dt); }
  camera.lookAt(camLook);
  camera.rotateZ(-p.bank * 0.12);
  if (G.warp) return;                                     // the warp controls the zoom
  const fov = 66 + (p.speed - 80) * 0.15;
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * Math.min(1, 4 * dt); camera.updateProjectionMatrix(); }
}

const markerPool = [], platePool = [];
let lastLayout = "";
function updateHud() {
  const p = G.player;
  const sz = innerWidth + "x" + innerHeight;           // re-fit the buttons if the screen size changed (rotation, resize)
  if (sz !== lastLayout) { lastLayout = sz; layoutControls(); }
  $("hpFill").style.transform = `scaleX(${clamp(p.hp / p.maxHp, 0, 1)})`;
  $("hpText").textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;
  $("xpFill").style.transform = `scaleX(${clamp(p.xp / xpNeed(p.lv), 0, 1)})`;
  $("plv").textContent = p.lv;
  $("enFill").style.transform = `scaleX(${p.energy / 100})`;
  $("heatFill").style.transform = `scaleX(${p.heat / 100})`;
  $("ultFill").style.transform = `scaleX(${p.ult / 100})`;
  $("coins").textContent = save.coins; $("gems").textContent = save.gems;
  $("bUlt").classList.toggle("ready", p.ult >= 100);
  $("bBreath").classList.toggle("cool", !!p.overheat); $("bBreath").classList.toggle("active", p.breathing);
  $("bBoost").classList.toggle("cool", p.energy < 5);
  $("bDodge").classList.toggle("cool", p.dodgeT > 0);
  $("bDodge").style.setProperty("--p", Math.round(clamp(1 - p.dodgeT / 1.3, 0, 1) * 100));
  $("bUlt").style.setProperty("--p", Math.round(p.ult));
  const ch = $("charge");
  ch.style.display = p.charge > 0.12 ? "block" : "none";
  $("chargeFill").style.transform = `scaleX(${p.charge})`; ch.classList.toggle("full", p.charge >= 1);
  const alive = G.enemies.filter((e) => e.state === "alive");
  $("foes").textContent = alive.length ? `ENEMIES ${alive.length}` : "";
  const boss = alive.find((e) => e.boss);
  if (boss) $("bossFill").style.transform = `scaleX(${clamp(boss.hp / boss.maxHp, 0, 1)})`;
  const combo = $("combo");
  if (G.combo >= 5) { combo.textContent = `${G.combo} HIT COMBO`; combo.classList.add("show"); } else combo.classList.remove("show");

  const w = window.innerWidth, h = window.innerHeight, holder = $("markers");
  let used = 0;
  const markTargets = G.rift && portal.active ? [...alive, { pos: portal.pos, boss: true }] : alive;
  for (const e of markTargets) {
    tmp.copy(e.pos).project(camera);
    const behind = tmp.z > 1;
    let x = tmp.x, y = tmp.y;
    if (behind) { x = -x; y = -y; }
    if (!(behind || Math.abs(x) > 0.94 || Math.abs(y) > 0.9)) continue;
    const len = Math.max(Math.abs(x) / 0.94, Math.abs(y) / 0.9) || 1;
    x /= len; y /= len;
    let m = markerPool[used];
    if (!m) { m = document.createElement("div"); holder.appendChild(m); markerPool.push(m); }
    m.className = e.boss ? "marker boss" : "marker";
    m.style.display = "block";
    m.style.left = `${(x * 0.5 + 0.5) * w}px`; m.style.top = `${(-y * 0.5 + 0.5) * h}px`;
    m.style.transform = `rotate(${Math.atan2(x, y)}rad)`;
    used++;
  }
  for (let i = used; i < markerPool.length; i++) markerPool[i].style.display = "none";

  // nameplates: name and a small health bar over every on-screen enemy within 500 m (bosses use the big bar)
  let np = 0;
  const plates = $("plates");
  for (const e of alive) {
    if (e.boss || e === G.target) continue;
    const d = e.pos.distanceTo(p.pos);
    if (d > 500) continue;
    tmp.copy(e.pos); tmp.y += e.radius * 1.6 + 6; tmp.project(camera);
    if (tmp.z > 1 || Math.abs(tmp.x) > 0.95 || Math.abs(tmp.y) > 0.95) continue;
    let el = platePool[np];
    if (!el) { el = document.createElement("div"); el.className = "plate"; el.innerHTML = "<span></span><i><b></b></i>"; plates.appendChild(el); platePool.push(el); }
    el.style.display = "block";
    el.style.left = `${(tmp.x * 0.5 + 0.5) * w}px`; el.style.top = `${(-tmp.y * 0.5 + 0.5) * h}px`;
    el.style.opacity = d > 380 ? (500 - d) / 120 : 1;
    if (el.dataset.n !== e.name) { el.firstChild.textContent = e.name; el.dataset.n = e.name; }
    el.lastChild.firstChild.style.transform = `scaleX(${clamp(e.hp / e.maxHp, 0, 1)})`;
    np++;
  }
  for (let i = np; i < platePool.length; i++) platePool[i].style.display = "none";

  const ret = $("reticle"), t = G.target;
  ret.classList.remove("has");
  if (t) {
    tmp.copy(t.pos).project(camera);
    if (tmp.z < 1 && Math.abs(tmp.x) < 1 && Math.abs(tmp.y) < 1) {
      ret.style.display = "block"; ret.style.left = `${(tmp.x * 0.5 + 0.5) * w}px`; ret.style.top = `${(-tmp.y * 0.5 + 0.5) * h}px`;
      ret.classList.toggle("locked", G.lock === t);
      ret.classList.toggle("locking", G.lock !== t && G.lockCand === t);
      ret.style.setProperty("--hp", `${clamp(t.hp / t.maxHp, 0, 1) * 100}%`);
      const dist = t.pos.distanceTo(p.pos);
      const inRange = dist < 270 + (t.radius || 0);
      $("retInfo").textContent = `${G.lock === t ? "LOCKED  " : ""}${t.name}  ${inRange ? "" : Math.round(dist) + " m"}`;
      $("inRange").style.display = inRange ? "block" : "none";
    } else ret.style.display = "none";
  } else ret.style.display = "none";
}

// ---------------------------------------------------------------- menu
const MENU_AT = new THREE.Vector3(CASTLE.x + 60, CASTLE.y + 300, CASTLE.z + 330);
const cardImg = (id) => LEGENDS[id] ? `../assets/concepts/skins/legend_${id}.png` : `../assets/concepts/${id}_openmouth_v2.png`;
const skinImg = (s) => s.own ? cardImg(s.dragon) : `../assets/concepts/skins/${s.id}.png`;
function buildMenu() {
  const cards = $("cards");
  for (const id of [...IDS, ...LEGEND_IDS]) {
    const b = document.createElement("button");
    b.className = LEGENDS[id] ? "card legend" : "card"; b.dataset.id = id;
    b.innerHTML = `<img alt="" src="${cardImg(id)}"><b>${DRAGONS[id].name}</b><small>${DRAGONS[id].desc}</small><i class="lock"></i>`;
    b.addEventListener("click", () => { audio.unlock(); choose(id, true); });
    cards.appendChild(b);
  }
  refreshCards();
}
function refreshCards() {
  // the play menu only shows dragons you own; legendary dragons are bought in the shop
  for (const c of document.querySelectorAll("#cards .card")) {
    const id = c.dataset.id, L = LEGENDS[id];
    c.style.display = L && !skins.owns(id) ? "none" : "";
    c.querySelector(".lock").innerHTML = L ? "LEGENDARY" : "";
  }
  // shop: legendary dragons
  if (loader && !document.getElementById("tab-shop").classList.contains("hidden")) for (const id of LEGEND_IDS) loadLegend(id);
  const lc = $("legendCards");
  lc.innerHTML = "";
  for (const id of LEGEND_IDS) {
    const L = LEGENDS[id], owned = skins.owns(id);
    const el = document.createElement("div");
    el.className = "lcard";
    el.innerHTML = `<img alt="" src="${cardImg(id)}"><b>${L.name}</b><small>${L.desc}</small>` +
      (owned ? `<em>OWNED</em>` : `<button class="cta"><span class="ico gem"></span> ${L.gems}</button>`);
    const btn = el.querySelector("button");
    if (btn) btn.addEventListener("click", () => {
      if (save.gems < L.gems) { pop("NOT ENOUGH GEMS", "bad"); return; }
      save.gems -= L.gems; skins.grant(id); persist(); loadLegend(id);
      audio.play("level_up", 1); pop(`${L.name} UNLOCKED!`, "level");
      refreshShop(); refreshCards();
    });
    lc.appendChild(el);
  }
  // shop: pick which owned dragon's skins to browse
  const sp = $("skinPick");
  sp.innerHTML = "";
  for (const id of [...IDS, ...LEGEND_IDS]) {
    if (!skinsFor(id).length || (LEGENDS[id] && !skins.owns(id))) continue;
    const b = document.createElement("button");
    b.textContent = DRAGONS[id].name; b.dataset.v = id;
    b.classList.toggle("on", id === skinDragon);
    b.addEventListener("click", () => { skinDragon = id; previewSkin = null; refreshCards(); renderSkins(id); showMenuDragon(id); });
    sp.appendChild(b);
  }
}
let skinDragon = "fire";

// skins row under the dragon cards: preview by tapping, buy with coins or gems, equip
let previewSkin = null;
function renderSkins(id) {
  const row = $("skinRow");
  const list = skinsFor(id);
  row.innerHTML = "";
  if (!list.length) return;
  const cur = previewSkin || skins.equipped(id);
  for (const s of list) {
    const owned = skins.owns(s.id), equipped = skins.equipped(id) === s.id;
    const el = document.createElement("div");
    el.className = `skin r-${s.rarity}${cur === s.id ? " sel" : ""}`;
    let action = "";
    if (equipped) action = `<em>EQUIPPED</em>`;
    else if (owned) action = `<button data-a="equip">EQUIP</button>`;
    else action = (s.coins ? `<button data-a="coins"><span class="ico coin"></span>${fmt(s.coins)}</button>` : "") + (s.gems ? `<button data-a="gems"><span class="ico gem"></span>${s.gems}</button>` : "");
    el.innerHTML = `<img alt="" src="${skinImg(s)}"><b>${s.name}</b><small>${RARITY[s.rarity]}</small><div class="act">${action}</div>`;
    el.querySelector("img").addEventListener("click", () => { previewSkin = s.id; showMenuDragon(id, s.id); renderSkins(id); audio.play("ui_tap", 0.8); });
    for (const btn of el.querySelectorAll("button")) btn.addEventListener("click", () => buySkin(id, s, btn.dataset.a));
    row.appendChild(el);
  }
}
function buySkin(id, s, how) {
  if (how === "coins") { if (save.coins < s.coins) { pop("NOT ENOUGH COINS", "bad"); return; } save.coins -= s.coins; }
  else if (how === "gems") { if (save.gems < s.gems) { pop("NOT ENOUGH GEMS", "bad"); return; } save.gems -= s.gems; }
  if (how !== "equip") { skins.grant(s.id); audio.play("level_up", 0.8); }
  skins.equip(id, s.id); previewSkin = null; persist();
  refreshShop(); renderSkins(id); showMenuDragon(id, s.id);
}

async function showMenuDragon(id, skinId) {
  if (!models[id]) return;
  const skin = skinById(skinId || skins.equipped(id));
  const tex = await loadSkinTex(skin);
  if (G.choice !== id && skinDragon !== id) return;
  if (G.menuDragon) G.menuDragon.dispose();
  G.menuDragon = new Dragon(id, SCALE * 1.6, false, skin && tex);
  G.menuDragon.root.position.copy(MENU_AT);
  scene.add(G.menuDragon.root);
}
function choose(id, speak) {
  if (LEGENDS[id] && !skins.owns(id)) id = "fire";
  G.choice = id; previewSkin = null;
  for (const c of document.querySelectorAll("#cards .card")) c.classList.toggle("sel", c.dataset.id === id);
  const L = LEGENDS[id], sb = $("startBtn");
  if (models[IDS[0]]) {
    if (L && !models[id]) { sb.disabled = true; sb.textContent = "Loading dragon…"; }
    else if (L && !skins.owns(id)) { sb.disabled = false; sb.innerHTML = `UNLOCK <span class="ico gem"></span> ${L.gems}`; }
    else { sb.disabled = false; sb.textContent = "FLY"; }
  }
  if (!models[id]) return;
  showMenuDragon(id).then(() => {
    if (speak && G.menuDragon) { audio.play("ui_tap", 1); G.menuDragon.once("roar", 1.2); audio.say(DRAGONS[id].voice || id, "select", 0, true); }
  });
}
function showMenu() {
  if (G.pendingRestore && applyCloudSave(G.pendingRestore)) return;      // a cloud save arrived during the run: load it now
  gameplayStop();
  clearRun();
  switchWorld("kingdom"); portal.close(); G.rift = false; G.warp = null; $("warp").style.opacity = "0";
  G.state = "menu";
  world.setStage(1);
  $("hud").classList.add("hidden"); $("down").classList.add("hidden"); $("paused").classList.add("hidden"); $("begin").classList.add("hidden"); $("story").classList.add("hidden"); $("menu").classList.remove("hidden");
  refreshShop();
  audio.playMusic("menu_theme");
  // always come back to the simple PLAY tab
  for (const x of document.querySelectorAll("#tabs .tab")) x.classList.toggle("sel", x.dataset.tab === "dragons");
  for (const p of document.querySelectorAll(".tabpanel")) p.classList.toggle("hidden", p.id !== "tab-dragons");
  $("wallet").classList.add("hidden");
  refreshCards();
  choose(G.choice, false);
  renderMissions();
  const dp = meta.dailyPending();
  if (dp) { $("dailyPopText").textContent = `Day ${dp.day} of 7: ${meta.rewardText(dp.reward)}`; $("dailyPop").classList.remove("hidden"); }
}
function togglePause() {
  if (performance.now() - (G.pauseAt || 0) < 250) return;
  G.pauseAt = performance.now();
  if (G.state === "play") { G.state = "paused"; $("paused").classList.remove("hidden"); gameplayStop(); }
  else if (G.state === "paused") { G.state = "play"; $("paused").classList.add("hidden"); gameplayStart(); }
}
// Android back button (called from the app wrapper): pause/resume the run; returns false when the app may go to the background
window.skyrathBack = () => { if (G.state === "play" || G.state === "paused") { togglePause(); return true; } return false; };
document.addEventListener("visibilitychange", () => { if (document.hidden && G.state === "play" && !BOT) togglePause(); });
// full screen and landscape lock (the lock only works on phones, and only while full screen)
function goFullscreen() {
  if (IS_CRAZY) return;                      // CrazyGames provides full screen; in-game buttons are not allowed there
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!req || document.fullscreenElement) return;
  try {
    const r = req.call(el, { navigationUI: "hide" });
    if (r && r.then) r.then(() => { if (screen.orientation && screen.orientation.lock) screen.orientation.lock("landscape").catch(() => {}); }).catch(() => {});
  } catch { /* not allowed here */ }
}
$("startBtn").addEventListener("click", () => {
  audio.unlock(); audio.play("ui_tap", 1);
  const L = LEGENDS[G.choice];
  if (L && !skins.owns(G.choice)) {                // buy a legendary dragon with gems
    if (save.gems < L.gems) { pop("NOT ENOUGH GEMS", "bad"); return; }
    save.gems -= L.gems; skins.grant(G.choice); persist();
    audio.play("level_up", 1); pop(`${L.name} UNLOCKED!`, "level");
    refreshShop(); refreshCards(); choose(G.choice, false); return;
  }
  goFullscreen(); startRun();
});
$("fsBtn").addEventListener("click", goFullscreen);
// ---------------------------------------------------------------- upgrades and shop
const fmt = (n) => n >= 10000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1) + "k" : String(n);
function refreshShop() {
  $("mCoins").textContent = fmt(save.coins); $("mGems").textContent = fmt(save.gems);
  const list = $("upgList");
  list.textContent = "";
  for (const u of UPGRADES) {
    const l = prog.lv(u.id), maxed = l >= u.max, cost = maxed ? 0 : upgradeCost(u, l);
    const row = document.createElement("div");
    row.className = "upg";
    row.innerHTML = `<div class="ui">${u.icon}</div><div class="ut"><b>${u.name} <small>Lv ${l} / ${u.max}</small></b><span>${maxed ? u.desc(l) : (l ? u.desc(l) + "  →  " : "Next: ") + u.desc(l + 1)}</span><i style="--p:${(l / u.max) * 100}%"></i></div>`;
    const b = document.createElement("button");
    b.className = "buy"; b.disabled = maxed || save.coins < cost;
    b.innerHTML = maxed ? "MAX" : `<span class="ico coin"></span>${fmt(cost)}`;
    b.addEventListener("click", () => { if (prog.buy(u.id)) { audio.play("level_up", 0.7); refreshShop(); } });
    row.appendChild(b); list.appendChild(row);
  }
  const left = prog.chestLeft();
  $("chestAdBtn").classList.toggle("hidden", !rewardedAvailable() || prog.chestLeft() <= 0);
  const cb = $("chestBtn");
  cb.disabled = left > 0;
  cb.textContent = left > 0 ? `Next free chest in ${Math.floor(Math.ceil(left / 60e3) / 60)}h ${Math.ceil(left / 60e3) % 60}m` : "Open free chest";
  $("featherInfo").textContent = `You have ${save.feathers} Phoenix Feather${save.feathers === 1 ? "" : "s"}. Each one revives you for free.`;
  $("featherBuy").disabled = save.gems < FEATHER_GEMS;
  $("exch1").disabled = save.gems < 1; $("exch10").disabled = save.gems < 10;
}
// ---------------------------------------------------------------- missions tab
function renderMissions() {
  const dp = meta.dailyPending();
  const streak = dp ? dp.day : (save.daily.streak || 0);
  const row = $("dailyRow");
  row.innerHTML = meta.DAILY.map((r, i) => {
    const d = i + 1, done = dp ? d < dp.day : d <= streak, now = dp && d === dp.day;
    return `<div class="dday${done ? " done" : ""}${now ? " now" : ""}"><small>DAY ${d}</small><b>${r.gems ? `<span class="ico gem"></span>${r.gems}` : `<span class="ico coin"></span>${r.coins}`}</b></div>`;
  }).join("");
  const db = $("dailyClaim");
  db.disabled = !dp; db.textContent = dp ? `Claim day ${dp.day} reward` : "Come back tomorrow";
  $("missionList").innerHTML = meta.missions().map((m) => {
    const prog = Math.min(m.goal, m.state.prog), done = prog >= m.goal;
    return `<div class="mrow${m.state.claimed ? " claimed" : ""}"><div class="mtext"><b>${m.text}</b><small>Reward: ${meta.rewardText(m.reward)}</small>
      <i class="mbar"><em style="width:${(prog / m.goal) * 100}%"></em></i></div>
      <span class="mprog">${prog} / ${m.goal}</span>
      ${m.state.claimed ? `<span class="mdone">CLAIMED</span>` : `<button class="cta slim" data-m="${m.id}" ${done ? "" : "disabled"}>Claim</button>`}</div>`;
  }).join("");
  for (const b of $("missionList").querySelectorAll("button[data-m]")) b.addEventListener("click", () => {
    const m = meta.claimMission(b.dataset.m);
    if (m) { audio.play("gem_pickup", 1); toast("REWARD!", meta.rewardText(m.reward)); refreshShop(); renderMissions(); }
  });
  $("achList").innerHTML = meta.achievements().map((a) =>
    `<div class="ach${a.done ? " done" : ""}"><b>${a.name}</b><small>${a.text}</small><em>${a.done ? "UNLOCKED" : `${a.prog} / ${a.goal}`} · <span class="ico gem"></span>${a.gems}</em></div>`).join("");
  refreshMissionBadge();
}
function refreshMissionBadge() {
  const n = meta.claimable();
  const b = $("missionBadge");
  if (b) { b.textContent = n; b.style.display = n ? "inline-flex" : "none"; }
}
$("dailyClaim").addEventListener("click", () => {
  const r = meta.claimDaily();
  if (r) { audio.play("level_up", 0.9); toast(`DAY ${r.day} REWARD!`, meta.rewardText(r.reward)); refreshShop(); renderMissions(); $("dailyPop").classList.add("hidden"); }
});
$("dailyPopClaim").addEventListener("click", () => $("dailyClaim").click());
$("dailyPopClose").addEventListener("click", () => $("dailyPop").classList.add("hidden"));

for (const b of document.querySelectorAll("#shopTabs button")) {
  b.addEventListener("click", () => {
    audio.play("ui_tap", 0.8);
    for (const x of document.querySelectorAll("#shopTabs button")) x.classList.toggle("on", x === b);
    for (const sp of document.querySelectorAll(".shoppanel")) sp.classList.toggle("hidden", sp.id !== "shop-" + b.dataset.s);
    if (b.dataset.s === "skins") { if (!skins.owns(skinDragon) && LEGENDS[skinDragon]) skinDragon = "fire"; refreshCards(); renderSkins(skinDragon); showMenuDragon(skinDragon); }
    else choose(G.choice, false);
  });
}
for (const t of document.querySelectorAll("#tabs .tab")) {
  t.addEventListener("click", () => {
    audio.unlock(); audio.play("ui_tap", 0.8);
    for (const x of document.querySelectorAll("#tabs .tab")) x.classList.toggle("sel", x === t);
    for (const p of document.querySelectorAll(".tabpanel")) p.classList.toggle("hidden", p.id !== "tab-" + t.dataset.tab);
    $("wallet").classList.toggle("hidden", t.dataset.tab === "dragons");
    if (t.dataset.tab === "missions") renderMissions();
    refreshShop(); refreshCards();
    if (t.dataset.tab === "shop" && !document.getElementById("shop-skins").classList.contains("hidden")) { renderSkins(skinDragon); showMenuDragon(skinDragon); }
    else choose(G.choice, false);
  });
}
const AD_REVIVE_HTML = $("adReviveBtn").innerHTML;
// rewarded ads (CrazyGames build only): optional, clearly marked, reward only after the ad finishes
$("chestAdBtn").addEventListener("click", async () => {
  const b = $("chestAdBtn"); b.disabled = true;
  const ok = await showRewarded();
  b.disabled = false;
  if (!ok) { $("chestMsg").textContent = "No ad available right now. Try again later."; return; }
  const r = prog.openChest(true);
  if (r) { audio.play("gem_pickup", 1); $("chestMsg").textContent = `+${r.coins} coins and +${r.gems} gems!`; }
  refreshShop();
});
$("adReviveBtn").addEventListener("click", async () => {
  if (G.state !== "down" || G.adRevived) return;
  const b = $("adReviveBtn"); b.disabled = true;
  const ok = await showRewarded();
  b.disabled = false;
  if (ok && G.state === "down") { G.adRevived = true; revivePlayer(); }
  else if (!ok) b.textContent = "No ad available right now";
});
$("chestBtn").addEventListener("click", () => {
  const r = prog.openChest();
  if (!r) return;
  audio.play("gem_pickup", 1); audio.play("level_up", 0.8);
  $("chestMsg").textContent = `+${r.coins} coins and +${r.gems} gems!`;
  refreshShop();
});
$("featherBuy").addEventListener("click", () => { if (prog.buyFeather()) { audio.play("gem_pickup", 0.9); refreshShop(); } });
$("exch1").addEventListener("click", () => { if (prog.exchange(1)) { audio.play("coin_pickup", 0.9); refreshShop(); } });
$("exch10").addEventListener("click", () => { if (prog.exchange(10)) { audio.play("coin_pickup", 0.9); refreshShop(); } });
setInterval(() => { if (G.state === "menu") refreshShop(); }, 30000);

// opening story
let story = null;
function startStory() {
  gameplayStop();
  if (!story) return;
  clearRun();
  if (G.menuDragon) { G.menuDragon.dispose(); G.menuDragon = null; }
  $("menu").classList.add("hidden"); $("hud").classList.add("hidden"); $("begin").classList.add("hidden");
  G.state = "story";
  story.start();
}
$("beginBtn").addEventListener("click", () => { audio.unlock(); goFullscreen(); startStory(); });
$("storyBtn").addEventListener("click", () => { audio.unlock(); audio.play("ui_tap", 1); startStory(); });
$("skipBtn").addEventListener("click", () => { if (story) story.skip(); });
$("pauseBtn").addEventListener("click", togglePause);
$("resumeBtn").addEventListener("click", togglePause);
$("exitBtn").addEventListener("click", showMenu);
$("quitBtn").addEventListener("click", showMenu);
// ---------------------------------------------------------------- settings (music, effects and voices each have their own volume)
const SET = save.settings = Object.assign({ music: 40, sfx: 100, voice: 100, shake: true, look: 100, invert: false }, save.settings || {});
// ---------------------------------------------------------------- graphics quality
// High: full resolution and glow. Low: no glow, 1x resolution, fewer particles.
// Auto (default): starts lighter on phones, then steps down by itself if the frame rate stays under ~42 fps.
const QUAL = { level: 0, bloom: true, pr: PR, light: false };
const AUTO_STEPS = [
  { bloom: true, prMax: 1.75, light: false },
  { bloom: false, prMax: 1.5, light: false },
  { bloom: false, prMax: 1.0, light: true },
  { bloom: false, prMax: 0.8, light: true },
];
function applyQuality() {
  const dpr = window.devicePixelRatio || 1;
  let st;
  if (save.gfx === "high") st = { bloom: true, prMax: 1.75, light: false };
  else if (save.gfx === "low") st = { bloom: false, prMax: 1.0, light: true };
  else st = AUTO_STEPS[QUAL.level];
  QUAL.bloom = st.bloom; QUAL.light = st.light;
  QUAL.pr = Math.min(dpr, st.prMax, save.gfx === "auto" && LIGHT_START ? 1.25 : 9);
  fx.low = st.light;
  renderer.setPixelRatio(QUAL.pr); composer.setPixelRatio(QUAL.pr); resize();
}
const fps = { t: 0, n: 0 };
function autoQuality(real) {
  if (save.gfx !== "auto" || G.state !== "play" || G.adPause || document.hidden || real > 0.25) { fps.t = 0; fps.n = 0; return; }
  fps.t += real; fps.n++;
  if (fps.t < 3) return;
  const rate = fps.n / fps.t; fps.t = 0; fps.n = 0;
  if (rate < 42 && QUAL.level < AUTO_STEPS.length - 1) { QUAL.level++; applyQuality(); console.info(`auto graphics: ${rate.toFixed(0)} fps -> step ${QUAL.level}`); }
}

function applySettings() {
  audio.setLevel("music", SET.music / 100); audio.setLevel("sfx", SET.sfx / 100); audio.setLevel("voice", SET.voice / 100);
  applyQuality();
}
function refreshSettings() {
  for (const [id, key] of [["volMusic", "music"], ["volSfx", "sfx"], ["volVoice", "voice"]]) { $(id).value = SET[key]; $(id + "V").textContent = SET[key]; }
  for (const b of $("gfxSeg").children) b.classList.toggle("on", b.dataset.v === save.gfx);
  for (const b of $("shakeSeg").children) b.classList.toggle("on", (b.dataset.v === "on") === SET.shake);
}
for (const [id, key] of [["volMusic", "music"], ["volSfx", "sfx"], ["volVoice", "voice"]]) {
  $(id).addEventListener("input", () => { SET[key] = Number($(id).value); $(id + "V").textContent = SET[key]; applySettings(); });
  $(id).addEventListener("change", () => persist());
}
for (const b of $("gfxSeg").children) b.addEventListener("click", () => { save.gfx = b.dataset.v; persist(); applySettings(); refreshSettings(); });
for (const b of $("shakeSeg").children) b.addEventListener("click", () => { SET.shake = b.dataset.v === "on"; persist(); refreshSettings(); });
for (const b of document.querySelectorAll(".setOpen")) b.addEventListener("click", () => { audio.unlock(); refreshSettings(); $("settings").classList.remove("hidden"); });
$("setClose").addEventListener("click", () => { persist(); $("settings").classList.add("hidden"); });
applySettings();
$("featherBtn").addEventListener("click", () => {
  if (G.state !== "down") return;
  if (save.feathers > 0) save.feathers--; else if (save.gems >= FEATHER_GEMS) save.gems -= FEATHER_GEMS; else return;
  persist(); revivePlayer();
});
$("reviveBtn").addEventListener("click", () => {
  const cost = Number($("reviveBtn").dataset.cost);
  if (save.coins < cost || G.state !== "down") return;
  save.coins -= cost; persist(); G.revives++; revivePlayer();
});
function revivePlayer() {
  const p = G.player;
  p.dead = false; p.hp = p.maxHp; p.invuln = 3; p.dragon.hold = false; p.dragon.oneShot = null; p.dragon.play(p.dragon.base, 0.3);
  p.pos.y = Math.max(p.pos.y, groundAt(p.pos.x, p.pos.z) + 160);
  for (const s of G.shots) s.life = 0;
  G.state = "play"; $("down").classList.add("hidden");
  gameplayStart();
  banner("REVIVED", "FIGHT ON", 2); audio.play("level_up", 0.9);
  fx.stars(p.pos, 0xffe27a, 24, 90, 5, 0.9);
}

// ---------------------------------------------------------------- loop
const clock = new THREE.Clock();
function frame() {
  // ?bot runs the loop on a timer so automated tests keep playing in a hidden or background window
  if (BOT) setTimeout(frame, 16); else requestAnimationFrame(frame);
  const real = clock.getDelta();
  const raw = Math.min(real, 0.05);
  G.time += raw;
  if (G.bannerT > 0) { G.bannerT -= raw; if (G.bannerT <= 0) $("banner").classList.remove("show"); }
  if (G.freeze > 0) G.freeze -= raw;
  const dt = G.freeze > 0 ? raw * 0.06 : raw;       // hit-stop: the world nearly freezes for a few frames on a kill
  if (G.adPause) { renderer.render(scene, camera); return; }   // an ad is showing: freeze everything

  if (G.state === "play" || G.state === "down") {
    readInput();
    const p = G.player;
    if (G.comboT > 0) { G.comboT -= raw; if (G.comboT <= 0) G.combo = 0; }
    if (G.streakT > 0) G.streakT -= raw;
    if (G.state === "play") updatePlayer(p, dt);
    else { p.pitch += (-0.5 - p.pitch) * Math.min(1, dt); p.pos.y = Math.max(p.pos.y - 30 * dt, groundAt(p.pos.x, p.pos.z) + 8); p.dragon.root.rotation.set(-p.pitch, p.yaw, p.bank); input.queue.length = 0; }
    p.dragon.update(dt, audio.speaking(p.id), p.breathing);
    updateEnemies(dt);
    updateShots(dt);
    updatePickups(dt);
    if (G.state === "play") updateStage(dt);
    updateCamera(raw);
    updateHud();
    p.dragon.model.visible = !(p.invuln > 0.3 && !p.ulting && !p.dead) || Math.floor(G.time * 14) % 2 === 0;
  } else if (G.state === "story") {
    story.update(Math.min(real, 0.5));     // real time, so the scenes stay in step with the narration on slow devices
  } else if (G.state === "menu" || G.state === "loading") {
    G.menuAngle += raw * 0.12;
    camera.position.set(MENU_AT.x + Math.sin(G.menuAngle) * 44, MENU_AT.y + 9, MENU_AT.z + Math.cos(G.menuAngle) * 44);
    camera.lookAt(MENU_AT.x, MENU_AT.y + 2, MENU_AT.z);
    if (G.menuDragon) { G.menuDragon.root.rotation.y = G.menuAngle * 0.5 + 2.6; G.menuDragon.update(raw, audio.speaking(G.menuDragon.id), false); }
  }
  if (G.state !== "loading") waterfallMist(raw);
  if (G.state === "play" && G.player && world.theme === "crystal" && crystal) crystalHazards(dt);
  else if (frostAmt > 0) { frostAmt = 0; $("frost").style.opacity = "0"; }
  portal.update(raw, camera);
  fx.update(raw);
  world.update(raw, camera.position);
  if (QUAL.bloom) composer.render(); else renderer.render(scene, camera);
  autoQuality(real);
}

// ---------------------------------------------------------------- boot
// ---------------------------------------------------------------- platform hooks: ads mute and freeze the game; the portal's mute setting always wins
const muteBy = { ad: false, platform: false };
setHooks({
  mute: (why, on) => { muteBy[why] = on; audio.setMuted(muteBy.ad || muteBy.platform); },
  pause: (on) => { G.adPause = on; },
});

// ---------------------------------------------------------------- on-demand model loading (keeps the first download small)
let loader = null;
const loading = {};
function loadModel(key, file, store) {
  if (store[key]) return Promise.resolve(store[key]);
  if (!loading[key]) loading[key] = new Promise((res) => loader.load(`../assets/models/${file}.glb`, (g) => { store[key] = g; res(g); }, undefined, (err) => { console.warn("model", key, err); delete loading[key]; res(null); }));
  return loading[key];
}
function loadLegend(id) { return loadModel(id, id, models).then((g) => { if (g && G.choice === id && G.state === "menu") choose(id, false); return g; }); }
function loadGod(def) { return loadModel(def.id, def.file, godModels); }

// ---------------------------------------------------------------- cloud save (Android app: Google Play Games)
function restoreCloud(remote) {
  if (G.state === "play" || G.state === "paused" || G.state === "down") { G.pendingRestore = remote; return; }   // never in the middle of a run
  applyCloudSave(remote);
}
// writes the cloud copy as this phone's save and restarts the game with it
function applyCloudSave(remote) {
  G.pendingRestore = null;
  try { localStorage.setItem("skyrath_save", JSON.stringify(remote)); sessionStorage.setItem("skyrath_restored", "1"); } catch { return false; }
  location.reload();
  return true;
}
function refreshCloudRow() {
  const row = $("cloudRow");
  if (!row) return;
  row.classList.toggle("hidden", !cloud.supported);
  $("cloudText").textContent = cloudStatusText();
  $("cloudBtn").classList.toggle("hidden", !cloud.available || cloud.signedIn);
}
function setupCloud() {
  initCloud({
    current: () => save,
    text: () => JSON.stringify(save),
    restore: restoreCloud,
    changed: refreshCloudRow,
    ask(cloudText, localText) {
      $("cloudPopCloud").textContent = cloudText; $("cloudPopLocal").textContent = localText;
      $("cloudPop").classList.remove("hidden");
    },
  });
  refreshCloudRow();
  let restored = false;
  try { restored = sessionStorage.getItem("skyrath_restored") === "1"; sessionStorage.removeItem("skyrath_restored"); } catch { /* ignore */ }
  if (restored) setTimeout(() => toast("PROGRESS RESTORED", "From your Google Play Games account"), 1200);
}
$("cloudBtn").addEventListener("click", () => { audio.unlock(); audio.play("ui_tap", 1); cloudSignIn(); });
$("cloudUseCloud").addEventListener("click", () => { $("cloudPop").classList.add("hidden"); cloudChoose(true); });
$("cloudUseLocal").addEventListener("click", () => { $("cloudPop").classList.add("hidden"); cloudChoose(false); });

async function boot() {
  await initPlatform();
  setupCloud();
  loadingStart();
  if (hasSdk()) {                               // progress lives in the CrazyGames Data module (linked to their account)
    try { const cloud = JSON.parse(loadSave("skyrath_save") || "null"); if (cloud) Object.assign(save, cloud); } catch { /* keep local */ }
    if (!save.gfxAuto) { save.gfx = "auto"; save.gfxAuto = true; }
    Object.assign(SET, save.settings || {}); save.settings = SET; applySettings();
  }
  if (IS_CRAZY) {
    if (save.seenStory === undefined || save.seenStory === false) save.seenStory = true;   // land new players in the menu, one tap from flying; the story is in Settings
    document.body.classList.add("crazygames");
  }
  watchMuteSetting();
  buildMenu();
  camera.position.set(MENU_AT.x, MENU_AT.y + 9, MENU_AT.z + 44);
  frame();
  loader = new GLTFLoader();
  const done = {};
  await Promise.all(IDS.map((id) => new Promise((res, rej) => {
    loader.load(`../assets/models/${id}.glb`, (g) => { models[id] = g; done[id] = 1; res(); }, (ev) => {
      if (ev.total) { done[id] = ev.loaded / ev.total; const pct = IDS.reduce((a, k) => a + (done[k] || 0), 0) / IDS.length; $("loadFill").style.transform = `scaleX(${pct})`; $("loadText").textContent = `Loading ${Math.round(pct * 100)}%`; }
    }, rej);
  })));
  $("loading").classList.add("hidden");
  loadingStop();
  $("startBtn").disabled = false; $("startBtn").textContent = "FLY";
  story = createStory({
    scene, camera, world, fx, audio, heightAt, VILLAGES, CASTLE,
    makeDragon: (id, scale, foe) => new Dragon(id, scale, foe),
    ui: { root: $("story"), text: $("storyText"), title: $("storyTitle") },
    onDone: () => { save.seenStory = true; persist(); showMenu(); },
  });
  if (save.seenStory) showMenu();
  else { G.state = "menu"; $("menu").classList.add("hidden"); $("begin").classList.remove("hidden"); }
  // legendary dragons and the equipped skins load in the background after the menu is up
  // legendary dragons load only once owned (or when the shop shows them); gods load a couple of stages before their fight
  for (const id of LEGEND_IDS) if (skins.owns(id)) loadLegend(id);
  for (const id of [...IDS, ...LEGEND_IDS]) loadSkinTex(skinById(skins.equipped(id)));

  window.SKYRATH = { G, save, audio, world, look, input, held, startStory, godModels, spawnGod: async () => { await loadGod(godForStage(G.stage).def); spawnGod(); }, loadGod, prog, refreshShop, openRift, switchWorld, hurtEnemy, setupCloud, cloud, makeType, spawnEnemy, meta, portal, get crystal() { return crystal; }, get story() { return story; } };
}
boot().catch((err) => { $("loadText").textContent = `Could not load the game: ${err.message || err}`; console.error(err); });
