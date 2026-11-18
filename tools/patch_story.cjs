// One-off patch: wires the opening story into world.js, main.js, audio.js, index.html and style.css.
const fs = require("fs");
const path = require("path");
const G = path.join(__dirname, "..", "game");
const rd = (f) => fs.readFileSync(path.join(G, f), "utf8");
const wr = (f, s) => fs.writeFileSync(path.join(G, f), s);
const rep = (s, a, b, n) => { if (!s.includes(a)) throw new Error("missing in " + n + ": " + a.slice(0, 70)); return s.replace(a, b); };

let w = rd("src/world.js");
if (!w.includes("export const VILLAGES")) {
  w = rep(w, "export const CASTLE = new THREE.Vector3(CASTLE0.x * S, CASTLE0.y * V, CASTLE0.z * S);", "export const CASTLE = new THREE.Vector3(CASTLE0.x * S, CASTLE0.y * V, CASTLE0.z * S);\nexport const VILLAGES = [];          // filled when the world is built: [{x, y, z}]", "world");
  w = rep(w, "    spots.push({ x, z });\n  }", "    spots.push({ x, z });\n  }\n  for (const s of spots) VILLAGES.push({ x: s.x, y: heightAt(s.x, s.z), z: s.z });", "world");
  w = rep(w, "const MOOD_ORDER =", `MOODS.fire = { top: col("#3a0f1e"), mid: col("#c8422a"), low: col("#ffb060"), sun: col("#ff7a3a"), fog: col("#b8553a"), light: col("#ffb48a"), shade: col("#7a2f3a"), rim: col("#ffd08a"),
  hemiS: col("#ff9a6a"), hemiG: col("#5a3028"), dir: new THREE.Vector3(0.6, 0.25, -0.3), sunI: 1.6, hemiI: 1.0 };
MOODS.ash = { top: col("#1c1f33"), mid: col("#4a4660"), low: col("#8a7a80"), sun: col("#c9a890"), fog: col("#5d5868"), light: col("#a09aa8"), shade: col("#45435a"), rim: col("#d0b0a0"),
  hemiS: col("#8a88a0"), hemiG: col("#3a3838"), dir: new THREE.Vector3(0.2, 0.3, -0.7), sunI: 0.9, hemiI: 0.85 };
const MOOD_ORDER =`, "world");
  w = rep(w, "  let target = MOODS.day;", "  let target = MOODS.day;\n  let rate = 0.55;", "world");
  w = rep(w, "    setStage(stage) { target = MOODS[MOOD_ORDER[(stage - 1) % MOOD_ORDER.length]]; },",
    `    setStage(stage) { target = MOODS[MOOD_ORDER[(stage - 1) % MOOD_ORDER.length]]; rate = 0.55; },
    setMood(name, speed = 0.55, snap = false) {
      target = MOODS[name] || MOODS.day; rate = speed;
      if (snap) { for (const key of ["top", "mid", "low", "sun", "fog", "light", "shade", "rim", "hemiS", "hemiG", "dir"]) now[key].copy(target[key]); now.sunI = target.sunI; now.hemiI = target.hemiI; }
    },`, "world");
  w = rep(w, "      const k = Math.min(1, dt * 0.55);", "      const k = Math.min(1, dt * rate);", "world");
  wr("src/world.js", w);
}

let m = rd("src/main.js");
if (!m.includes("createStory")) {
  m = rep(m, 'import { createWorld, heightAt, WORLD_RADIUS, CEILING, WATER_Y, CASTLE } from "./world.js";', 'import { createWorld, heightAt, WORLD_RADIUS, CEILING, WATER_Y, CASTLE, VILLAGES } from "./world.js";\nimport { createStory } from "./story.js";', "main");
  m = rep(m, 'const save = { coins: 0, gems: 0, best: 0, gfx: "high" };', 'const save = { coins: 0, gems: 0, best: 0, gfx: "high", seenStory: false };', "main");
  m = rep(m, '  } else if (G.state === "menu" || G.state === "loading") {', '  } else if (G.state === "story") {\n    story.update(raw);\n  } else if (G.state === "menu" || G.state === "loading") {', "main");
  m = rep(m, '$("hud").classList.add("hidden"); $("down").classList.add("hidden"); $("paused").classList.add("hidden"); $("menu").classList.remove("hidden");',
    '$("hud").classList.add("hidden"); $("down").classList.add("hidden"); $("paused").classList.add("hidden"); $("begin").classList.add("hidden"); $("story").classList.add("hidden"); $("menu").classList.remove("hidden");', "main");
  m = rep(m, '$("pauseBtn").addEventListener("click", togglePause);', `// opening story
let story = null;
function startStory() {
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
$("pauseBtn").addEventListener("click", togglePause);`, "main");
  m = rep(m, "  showMenu();\n  window.SKYRATH = { G, save, audio };", `  story = createStory({
    scene, camera, world, fx, audio, heightAt, VILLAGES, CASTLE,
    makeDragon: (id, scale, foe) => new Dragon(id, scale, foe),
    ui: { root: $("story"), text: $("storyText"), title: $("storyTitle") },
    onDone: () => { save.seenStory = true; persist(); showMenu(); },
  });
  if (save.seenStory) showMenu();
  else { G.state = "menu"; $("menu").classList.add("hidden"); $("begin").classList.remove("hidden"); }
  window.SKYRATH = { G, save, audio, startStory, get story() { return story; } };`, "main");
  wr("src/main.js", m);
}

let au = rd("src/audio.js");
if (!au.includes("village_fire")) {
  au = rep(au, '"dragon_roar", "enemy_death", "coin_pickup", "gem_pickup", "level_up", "ui_tap", "boost", "hit_taken"];', '"dragon_roar", "enemy_death", "coin_pickup", "gem_pickup", "level_up", "ui_tap", "boost", "hit_taken", "village_fire", "village_morning"];', "audio");
  wr("src/audio.js", au);
}

let h = rd("index.html");
if (!h.includes('id="story"')) {
  h = rep(h, '<button id="startBtn" class="cta" disabled>Loading&hellip;</button>', '<button id="startBtn" class="cta" disabled>Loading&hellip;</button>\n  <button id="storyBtn" class="cta ghost slim">Watch the story</button>', "html");
  h = rep(h, '<div id="rotate">', `<div id="begin" class="overlay hidden">
  <h1>SKYRATH</h1>
  <p class="tag">The tale of four dragons</p>
  <button id="beginBtn" class="cta">BEGIN</button>
</div>

<div id="story" class="hidden">
  <div class="lb top"></div><div class="lb bot"></div>
  <div id="storyTitle">SKYRATH</div>
  <p id="storyText"></p>
  <button id="skipBtn" class="btn glass skip">SKIP</button>
</div>

<div id="rotate">`, "html");
  wr("index.html", h);
}

let c = rd("style.css");
if (!c.includes("opening story")) {
  c += `
/* ---- opening story ---- */
#story { position: fixed; inset: 0; pointer-events: none; z-index: 20; }
#story .lb { position: absolute; left: 0; right: 0; height: 11vh; background: #05070d; }
#story .lb.top { top: 0; } #story .lb.bot { bottom: 0; }
#storyText { position: absolute; left: 50%; bottom: 13vh; transform: translateX(-50%); width: min(820px, 86vw); margin: 0; text-align: center; font-size: clamp(15px, 2.5vw, 24px); line-height: 1.35; letter-spacing: .5px;
  text-shadow: 0 2px 8px #000, 0 0 2px #000; opacity: 0; transition: opacity .6s; }
#storyText.show { opacity: 1; }
#storyTitle { position: absolute; left: 0; right: 0; top: 30%; text-align: center; font-size: clamp(44px, 11vw, 120px); font-weight: 700; letter-spacing: clamp(10px, 3vw, 34px);
  text-shadow: 0 6px 30px rgba(0,30,90,.7), 0 0 60px rgba(255,220,140,.6); opacity: 0; transform: scale(1.25); transition: opacity 1.2s, transform 2.4s cubic-bezier(.2,.8,.2,1); }
#storyTitle.show { opacity: 1; transform: scale(1); }
.btn.glass.skip { pointer-events: auto; right: max(16px, env(safe-area-inset-right)); top: calc(11vh + 12px); width: 76px; height: 34px; border-radius: 18px; font-size: 11px; }
.btn.glass.skip::before, .btn.glass.skip::after { border-radius: 18px; }
.cta.slim { font-size: 13px; padding: 8px 22px; min-width: 0; letter-spacing: 2px; }
`;
  wr("style.css", c);
}
console.log("patched");
