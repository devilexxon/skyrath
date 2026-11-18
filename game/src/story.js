// Opening story: five in-engine scenes with narration. Skippable; shown on first launch and replayable from the menu.
import * as THREE from "three";
import { ELEMENTS } from "./fx.js";

const SUBS = [
  "Long ago, the kingdom of Skyrath lived in peace beneath a gentle sky.",
  "Then the Dread Wyrms came. They fell from the clouds, and set the land on fire.",
  "By nightfall, only ashes remained. But the people of Skyrath did not kneel.",
  "In secret, they raised four young dragons: Ember, Glacier, Tempest and Verdant.",
  "Now they rise together. Choose your dragon, and take back the sky!",
];
const HEROES = ["fire", "frost", "storm", "forest"];
const FIRE_COLS = [0xffd070, 0xff7a1e, 0xff3a10];
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const ease = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const rand = (a, b) => a + Math.random() * (b - a);

export function createStory({ scene, camera, world, fx, audio, makeDragon, heightAt, VILLAGES, CASTLE, ui, onDone }) {
  const V = new THREE.Vector3();
  const P = new THREE.Vector3();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), look = new THREE.Vector3();
  const st = { active: false, idx: -1, t: 0, actors: [], emitters: [], burn: 0, fireSndT: 0, flags: {} };

  // dark smoke uses normal blending, so it has a small sprite pool of its own
  const smoke = [];
  for (let i = 0; i < 90; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: fx.tex, color: 0x2b2530, transparent: true, depthWrite: false, opacity: 0 }));
    s.visible = false; scene.add(s);
    smoke.push({ s, life: 0, max: 1, vel: new THREE.Vector3() });
  }
  function puffSmoke(at) {
    const p = smoke.find((q) => q.life <= 0);
    if (!p) return;
    p.s.position.copy(at); p.s.visible = true; p.life = p.max = rand(2.4, 3.6);
    p.vel.set(rand(-6, 10), rand(26, 40), rand(-6, 6));
  }
  function updateSmoke(dt) {
    for (const p of smoke) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.s.visible = false; continue; }
      const k = 1 - p.life / p.max;
      p.s.position.addScaledVector(p.vel, dt);
      p.s.scale.setScalar(26 + k * 90);
      p.s.material.opacity = 0.5 * (1 - k) * Math.min(1, k * 6);
    }
  }
  function burnAll(dt) {
    for (const e of st.emitters) {
      if (Math.random() < 0.55 * st.burn) {
        a.set(e.x + rand(-9, 9), e.y + rand(0, 8), e.z + rand(-9, 9));
        b.set(rand(-6, 6), rand(28, 52), rand(-6, 6));
        fx.puff(a, FIRE_COLS[Math.floor(Math.random() * 3)], rand(11, 20), rand(0.5, 0.85), b, 9, 0.5);
      }
      if (Math.random() < 0.1) puffSmoke(a.set(e.x, e.y + 16, e.z));
    }
    if (st.burn > 0.2 && st.emitters.length) {             // the fire sound is short, so keep re-triggering it
      st.fireSndT -= dt;
      if (st.fireSndT <= 0) { st.fireSndT = 2.6; audio.play("village_fire", 0.5 + st.burn * 0.5); }
    }
    updateSmoke(dt);
  }
  function orient(d, vel) {
    const sp = vel.length() || 1;
    d.root.rotation.set(-Math.asin(Math.max(-1, Math.min(1, vel.y / sp))), Math.atan2(vel.x, vel.z), 0);
  }
  function clearActors() { for (const d of st.actors) d.dispose(); st.actors.length = 0; }

  // path of raider i at progress u: a long dive that skims the village
  function raid(i, u, out) {
    const k = 2 * u - 1;
    out.set(V.x - 420 + i * 120 + u * (640 - i * 170), V.y + 72 + i * 22 + 360 * k * k, V.z - 600 + u * 1100);
    return out;
  }

  const SHOTS = [
    { dur: 8.2,
      enter() {
        world.setMood("day", 4, true);
        audio.playMusic("menu_theme"); audio.play("village_morning", 0.9);
      },
      update(t) {
        const th = 0.7 + t * 0.03;
        camera.position.set(V.x + Math.cos(th) * 270, V.y + 92 - t * 2, V.z + Math.sin(th) * 270);
        camera.lookAt(look.set(V.x, V.y + 18, V.z));
      } },
    { dur: 10,
      enter() {
        world.setMood("fire", 0.8);
        audio.playMusic("boss_theme"); audio.play("dragon_roar", 1, 0.8);
        for (let i = 0; i < 3; i++) { const d = makeDragon(HEROES[(i + 1) % 4], 22, true); d.setBase("glide"); scene.add(d.root); st.actors.push(d); }
        st.flags.dropT = 0;
      },
      update(t, dt) {
        let lead = null;
        st.actors.forEach((d, i) => {
          const u = clamp01((t - i * 0.6) / 7.4);
          raid(i, u, d.root.position);
          orient(d, raid(i, Math.min(1, u + 0.01), a).sub(d.root.position));
          d.update(dt, false, u > 0.3 && u < 0.75);
          if (i === 0) lead = d;
          if (u > 0.32 && u < 0.72) {
            st.flags.dropT -= dt;
            if (st.flags.dropT <= 0) {
              st.flags.dropT = 0.16;
              const ang = rand(0, 6.28), r = rand(10, 170);
              const x = V.x + Math.cos(ang) * r, z = V.z + Math.sin(ang) * r, y = heightAt(x, z);
              d.mouth(a); b.set(x, y, z).sub(a);
              const len = b.length(); b.divideScalar(len);
              fx.beam(a, b, len, 3.2, ELEMENTS.fire, 0.3);
              fx.burst(look.set(x, y + 6, z), ELEMENTS.fire, 14, 70, 14, 0.6);
              if (st.emitters.length < 18) st.emitters.push({ x, y, z });
              if (Math.random() < 0.5) audio.play("impact", 0.5, rand(0.7, 1));
              if (Math.random() < 0.35) audio.play("fire_shot", 0.5, 0.8);
            }
          }
        });
        st.burn = Math.min(1, st.burn + dt * 0.4);
        if (t < 4.2) {                                   // from the village, looking up at the dive
          camera.position.set(V.x + 120, V.y + 30, V.z + 190);
          camera.lookAt(look.copy(lead.root.position).lerp(V, 0.25));
        } else {                                         // high and wide over the burning roofs
          const k = t - 4.2;
          camera.position.set(V.x - 250 + k * 9, V.y + 175 + Math.sin(t * 31) * 0.9, V.z + 280 - k * 6);
          camera.lookAt(look.set(V.x, V.y + 25, V.z));
        }
      } },
    { dur: 8.6,
      enter() { clearActors(); world.setMood("ash", 0.7); audio.playMusic("menu_theme"); st.burn = 0.65; },
      update(t) {
        st.burn = Math.max(0.3, 0.65 - t * 0.04);
        camera.position.set(V.x - 190 - t * 13, V.y + 110 + t * 15, V.z + 230 + t * 11);
        camera.lookAt(look.set(V.x, V.y + 34, V.z));
      } },
    { dur: 10.5,
      enter() {
        world.setMood("gold", 0.8); st.burn = 0;
        HEROES.forEach((id, i) => {
          const d = makeDragon(id, 5.2, false);
          d.root.position.set(P.x - 25.5 + i * 17, P.y, P.z);
          scene.add(d.root); st.actors.push(d);
        });
        st.flags.named = 0;
      },
      update(t, dt) {
        const CUES = [3.6, 4.6, 5.5, 6.6];
        st.actors.forEach((d, i) => { d.root.position.y = P.y + Math.sin(t * 1.6 + i * 1.7) * 3; d.update(dt, false, false); });
        while (st.flags.named < 4 && t >= CUES[st.flags.named]) {
          const i = st.flags.named++, d = st.actors[i], el = ELEMENTS[HEROES[i]];
          fx.ring(d.root.position, el.glow, 26, 0.7, camera); fx.stars(d.root.position, el.core, 16, 60, 5, 0.9);
          fx.burst(d.root.position, el, 14, 40, 9, 0.6);
          d.once("roar", 1.5); audio.play("gem_pickup", 0.9, 0.9 + i * 0.08);
        }
        camera.position.set(P.x - 24 + t * 4.4, P.y + 6, P.z + 62 - t * 1.2);
        camera.lookAt(look.set(P.x - 8 + t * 1.5, P.y + 1, P.z));
      } },
    { dur: 7.6,
      enter() {
        world.setMood("day", 1.2); audio.playMusic("battle_theme");
        st.actors.forEach((d) => { d.model.scale.setScalar(8.5); d.setBase("boost"); });
        st.flags.title = false;
      },
      update(t, dt) {
        const u = ease(t / 7.4) * 0.92;
        st.actors.forEach((d, i) => {
          const sx = (i - 1.5) * 26;
          a.set(P.x + sx * (0.65 + 0.8 * u), P.y + u * 120 - Math.abs(i - 1.5) * 8 * u, P.z + u * 330);
          b.set(sx * 0.2, 120, 330);
          d.root.position.copy(a); orient(d, b);
          d.root.rotation.z = Math.sin(t * 1.4 + i) * 0.12;
          d.update(dt, false, false);
          if (Math.random() < 0.6) fx.puff(a, ELEMENTS[HEROES[i]].glow, 6, 0.5, null, 12);
        });
        camera.position.set(P.x + 16, P.y + 30 + u * 22, P.z + 250);
        camera.lookAt(look.set(P.x, P.y + u * 116, P.z + u * 330));   // follow the flight until it passes overhead
        if (t > 2.6 && !st.flags.title) { st.flags.title = true; ui.title.classList.add("show"); audio.play("dragon_roar", 0.9); audio.play("level_up", 0.8); }
      } },
  ];

  function enterShot(i) {
    st.idx = i; st.t = 0;
    ui.text.classList.remove("show");
    SHOTS[i].enter();
    audio.say("story", String(i + 1), 0, true);
    setTimeout(() => { if (st.active && st.idx === i) { ui.text.textContent = SUBS[i]; ui.text.classList.add("show"); } }, 250);
  }

  function finish() {
    if (!st.active) return;
    st.active = false;
    clearActors(); st.emitters.length = 0; st.burn = 0;
    for (const p of smoke) { p.life = 0; p.s.visible = false; }
    if (audio.voice) audio.voice.pause();
    ui.root.classList.add("hidden"); ui.title.classList.remove("show"); ui.text.classList.remove("show");
    world.setMood("day", 0.55, true);
    camera.fov = 66; camera.updateProjectionMatrix();
    onDone();
  }

  return {
    get active() { return st.active; },
    get shot() { return st.idx; },
    start() {
      const v = VILLAGES[0] || { x: CASTLE.x + 500, y: 20, z: CASTLE.z };
      V.set(v.x, v.y, v.z);
      P.set(CASTLE.x + 40, CASTLE.y + 150, CASTLE.z + 330);
      st.active = true; st.emitters.length = 0; st.burn = 0; st.fireSndT = 0; st.flags = {};
      camera.fov = 58; camera.updateProjectionMatrix();
      ui.root.classList.remove("hidden"); ui.title.classList.remove("show");
      enterShot(0);
    },
    update(dt) {
      if (!st.active) return;
      st.t += dt;
      const shot = SHOTS[st.idx];
      shot.update(st.t, dt);
      burnAll(dt);
      if (st.t >= shot.dur) { if (st.idx + 1 < SHOTS.length) enterShot(st.idx + 1); else finish(); }
    },
    skip: finish,
  };
}
