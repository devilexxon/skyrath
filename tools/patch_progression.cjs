// One-off patch: wires upgrades, shop, healing orbs and the tabbed menu into the game.
const fs = require("fs");
const path = require("path");
const G = path.join(__dirname, "..", "game");
const rd = (f) => fs.readFileSync(path.join(G, f), "utf8");
const wr = (f, s) => fs.writeFileSync(path.join(G, f), s);
const rep = (s, a, b, n) => { if (!s.includes(a)) throw new Error("missing in " + n + ": " + a.slice(0, 80)); return s.replace(a, b); };

let m = rd("src/main.js");
if (!m.includes("createProgression")) {
  m = rep(m, 'import { createStory } from "./story.js";', 'import { createStory } from "./story.js";\nimport { createProgression, UPGRADES, upgradeCost, FEATHER_GEMS, GEM_TO_COINS } from "./progression.js";', "main");
  m = rep(m, "const persist = () => { try { localStorage.setItem(\"skyrath_save\", JSON.stringify(save)); } catch { /* ignore */ } };",
    "const persist = () => { try { localStorage.setItem(\"skyrath_save\", JSON.stringify(save)); } catch { /* ignore */ } };\nconst prog = createProgression(save, persist);", "main");

  // player stats from upgrades
  m = rep(m, "function makePlayer(id) {\n  const d = DRAGONS[id];", "function makePlayer(id) {\n  const d = DRAGONS[id];\n  const up = prog.stats();", "main");
  m = rep(m, "maxHp: Math.round(100 * d.hp), hp: Math.round(100 * d.hp),", "maxHp: Math.round(100 * d.hp * up.hp), hp: Math.round(100 * d.hp * up.hp), up,", "main");
  m = rep(m, "lv: 1, xp: 0, dmgMul: d.dmg,", "lv: 1, xp: 0, dmgMul: d.dmg * up.dmg,", "main");
  m = rep(m, "  if (p.def.regen && !p.dead) p.hp = Math.min(p.maxHp, p.hp + p.def.regen * dt);", "  if ((p.def.regen || p.up.regen) && !p.dead) p.hp = Math.min(p.maxHp, p.hp + (p.def.regen + p.up.regen) * dt);", "main");
  m = rep(m, "p.heat = Math.max(0, p.heat - 34 * dt);", "p.heat = Math.max(0, p.heat - 34 * p.up.heatUse * dt);", "main");
  m = rep(m, "hurtEnemy(e, 62 * p.dmgMul * 0.12, e.pos, \"breath\");", "hurtEnemy(e, 62 * p.dmgMul * p.up.breathDmg * 0.12, e.pos, \"breath\");", "main");
  m = rep(m, "    p.fireT = 0.2;", "    p.fireT = 0.2 / p.up.fireRate;", "main");
  m = rep(m, "  p.hp -= dmg; p.invuln = 0.25;", "  p.hp -= dmg * p.up.taken; p.invuln = 0.25;", "main");

  // enemies scale a little slower now that the player grows too
  m = rep(m, "const hp = 60 * Math.pow(1.14, G.stage - 1) * (boss ? 8 : 1);", "const hp = 60 * Math.pow(1.12, G.stage - 1) * (boss ? 8 : 1);", "main");

  // healing orbs
  m = rep(m, "  if (e.boss) for (let i = 0; i < 3; i++) dropPickup(e.pos, \"gem\", 1);",
    "  if (e.boss) for (let i = 0; i < 3; i++) dropPickup(e.pos, \"gem\", 1);\n  if (e.boss) for (let i = 0; i < 3; i++) dropPickup(e.pos, \"heal\", 0.2);\n  else if (Math.random() < 0.3) dropPickup(e.pos, \"heal\", 0.15);", "main");
  m = rep(m, "color: kind === \"coin\" ? 0xffc93c : 0x5fd0ff,", "color: kind === \"coin\" ? 0xffc93c : kind === \"heal\" ? 0x5dff8a : 0x5fd0ff,", "main");
  m = rep(m, "s.scale.setScalar(kind === \"coin\" ? 9 : 13);", "s.scale.setScalar(kind === \"coin\" ? 9 : kind === \"heal\" ? 15 : 13);", "main");
  m = rep(m, "      if (c.kind === \"coin\") { save.coins += c.value; audio.play(\"coin_pickup\", 0.5, rand(0.95, 1.2)); }",
    "      if (c.kind === \"heal\") { const h = p.maxHp * c.value * p.up.orbHeal; p.hp = Math.min(p.maxHp, p.hp + h); pop(`+${Math.round(h)} HP`, \"heal\", p.pos); audio.play(\"gem_pickup\", 0.6, 1.3); }\n      else if (c.kind === \"coin\") { save.coins += c.value; audio.play(\"coin_pickup\", 0.5, rand(0.95, 1.2)); }", "main");

  // revive with a Phoenix Feather or gems as well as coins
  m = rep(m, "  rb.disabled = save.coins < cost; rb.dataset.cost = cost;",
    "  rb.disabled = save.coins < cost; rb.dataset.cost = cost;\n  const fb = $(\"featherBtn\");\n  fb.textContent = save.feathers > 0 ? `Use a Phoenix Feather (${save.feathers} left)` : `Revive for ${FEATHER_GEMS} gems`;\n  fb.disabled = save.feathers <= 0 && save.gems < FEATHER_GEMS;", "main");
  m = rep(m, "$(\"reviveBtn\").addEventListener(\"click\", () => {\n  const cost = Number($(\"reviveBtn\").dataset.cost);\n  if (save.coins < cost || G.state !== \"down\") return;\n  save.coins -= cost; persist(); G.revives++;",
    "$(\"featherBtn\").addEventListener(\"click\", () => {\n  if (G.state !== \"down\") return;\n  if (save.feathers > 0) save.feathers--; else if (save.gems >= FEATHER_GEMS) save.gems -= FEATHER_GEMS; else return;\n  persist(); revivePlayer();\n});\n$(\"reviveBtn\").addEventListener(\"click\", () => {\n  const cost = Number($(\"reviveBtn\").dataset.cost);\n  if (save.coins < cost || G.state !== \"down\") return;\n  save.coins -= cost; persist(); G.revives++; revivePlayer();\n});\nfunction revivePlayer() {", "main");

  // menu: wallet + tabs
  m = rep(m, "  $(\"menuStats\").textContent = `Best stage: ${save.best}   Coins: ${save.coins}   Gems: ${save.gems}`;",
    "  $(\"menuStats\").textContent = `Best stage: ${save.best}`;\n  refreshShop();", "main");
  m = rep(m, "// opening story\n", `// ---------------------------------------------------------------- upgrades and shop
const fmt = (n) => n >= 10000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1) + "k" : String(n);
function refreshShop() {
  $("mCoins").textContent = fmt(save.coins); $("mGems").textContent = fmt(save.gems);
  const list = $("upgList");
  list.textContent = "";
  for (const u of UPGRADES) {
    const l = prog.lv(u.id), maxed = l >= u.max, cost = maxed ? 0 : upgradeCost(u, l);
    const row = document.createElement("div");
    row.className = "upg";
    row.innerHTML = \`<div class="ui">\${u.icon}</div><div class="ut"><b>\${u.name} <small>Lv \${l} / \${u.max}</small></b><span>\${u.desc(l)}\${maxed ? "" : "  →  " + u.desc(l + 1)}</span><i style="--p:\${(l / u.max) * 100}%"></i></div>\`;
    const b = document.createElement("button");
    b.className = "buy"; b.disabled = maxed || save.coins < cost;
    b.innerHTML = maxed ? "MAX" : \`<span class="ico coin"></span>\${fmt(cost)}\`;
    b.addEventListener("click", () => { if (prog.buy(u.id)) { audio.play("level_up", 0.7); refreshShop(); } });
    row.appendChild(b); list.appendChild(row);
  }
  const left = prog.chestLeft();
  const cb = $("chestBtn");
  cb.disabled = left > 0;
  cb.textContent = left > 0 ? \`Next free chest in \${Math.floor(left / 3600e3)}h \${Math.ceil((left % 3600e3) / 60e3)}m\` : "Open free chest";
  $("featherInfo").textContent = \`You have \${save.feathers} Phoenix Feather\${save.feathers === 1 ? "" : "s"}. Each one revives you for free.\`;
  $("featherBuy").disabled = save.gems < FEATHER_GEMS;
  $("exch1").disabled = save.gems < 1; $("exch10").disabled = save.gems < 10;
}
for (const t of document.querySelectorAll("#tabs .tab")) {
  t.addEventListener("click", () => {
    audio.unlock(); audio.play("ui_tap", 0.8);
    for (const x of document.querySelectorAll("#tabs .tab")) x.classList.toggle("sel", x === t);
    for (const p of document.querySelectorAll(".tabpanel")) p.classList.toggle("hidden", p.id !== "tab-" + t.dataset.tab);
    refreshShop();
  });
}
$("chestBtn").addEventListener("click", () => {
  const r = prog.openChest();
  if (!r) return;
  audio.play("gem_pickup", 1); audio.play("level_up", 0.8);
  $("chestMsg").textContent = \`+\${r.coins} coins and +\${r.gems} gems!\`;
  refreshShop();
});
$("featherBuy").addEventListener("click", () => { if (prog.buyFeather()) { audio.play("gem_pickup", 0.9); refreshShop(); } });
$("exch1").addEventListener("click", () => { if (prog.exchange(1)) { audio.play("coin_pickup", 0.9); refreshShop(); } });
$("exch10").addEventListener("click", () => { if (prog.exchange(10)) { audio.play("coin_pickup", 0.9); refreshShop(); } });
setInterval(() => { if (G.state === "menu") refreshShop(); }, 30000);

// opening story
`, "main");
  m = rep(m, "window.SKYRATH = { G, save, audio, startStory,", "window.SKYRATH = { G, save, audio, startStory, prog, refreshShop,", "main");
  wr("src/main.js", m);
}

let h = rd("index.html");
if (!h.includes('id="tabs"')) {
  const a = h.indexOf('<div id="menu" class="overlay">'), b = h.indexOf("</div>", h.indexOf('<p class="help">', a)) + 6;
  if (a < 0 || b < 6) throw new Error("menu block");
  const helpLine = h.slice(h.indexOf('<p class="help">', a), h.indexOf("</p>", h.indexOf('<p class="help">', a)) + 4);
  h = h.slice(0, a) + `<div id="menu" class="overlay">
  <div id="wallet"><div class="pill"><span class="ico coin"></span><b id="mCoins">0</b></div><div class="pill"><span class="ico gem"></span><b id="mGems">0</b></div></div>
  <h1>SKYRATH</h1>
  <div id="tabs"><button class="tab glass sel" data-tab="dragons">DRAGONS</button><button class="tab glass" data-tab="upgrades">UPGRADES</button><button class="tab glass" data-tab="shop">SHOP</button></div>
  <div id="tab-dragons" class="tabpanel">
    <div id="cards"></div>
    <div id="menuStats"></div>
    <button id="startBtn" class="cta" disabled>Loading&hellip;</button>
    <button id="storyBtn" class="cta ghost slim">Watch the story</button>
    ${helpLine}
  </div>
  <div id="tab-upgrades" class="tabpanel hidden">
    <p class="note">Upgrades are permanent and work for every dragon. Earn coins by defeating enemies.</p>
    <div id="upgList"></div>
  </div>
  <div id="tab-shop" class="tabpanel hidden">
    <div class="shopgrid">
      <div class="sitem"><b>Free chest</b><span>Coins and gems every 4 hours. Bigger as your best stage grows.</span><button id="chestBtn" class="cta slim">Open free chest</button><em id="chestMsg"></em></div>
      <div class="sitem"><b>Phoenix Feather</b><span id="featherInfo"></span><button id="featherBuy" class="cta slim"><span class="ico gem"></span> ${"${FEATHER}"} gems</button></div>
      <div class="sitem"><b>Exchange</b><span>Turn gems into coins: 1 gem = ${"${RATE}"} coins.</span><div class="row"><button id="exch1" class="cta slim ghost">1 gem</button><button id="exch10" class="cta slim ghost">10 gems</button></div></div>
      <div class="sitem soon"><b>Gem packs</b><span>Coming soon.</span></div>
    </div>
  </div>
</div>` + h.slice(b);
  h = h.replace("${FEATHER}", "5").replace("${RATE}", "60");
  h = rep(h, '<button id="reviveBtn" class="cta"></button>', '<button id="featherBtn" class="cta"></button>\n  <button id="reviveBtn" class="cta"></button>', "html");
  wr("index.html", h);
}

let c = rd("style.css");
if (!c.includes("tabbed menu")) {
  c += `
/* ---- tabbed menu, upgrades and shop ---- */
#menu { justify-content: flex-start; padding-top: 14px; gap: 8px; }
#menu h1 { font-size: clamp(30px, 6vw, 60px); letter-spacing: clamp(6px, 1.6vw, 16px); }
#wallet { position: absolute; left: max(14px, env(safe-area-inset-left)); top: 12px; display: flex; gap: 8px; }
#tabs { display: flex; gap: 8px; }
.tab.glass { position: relative; border-radius: 999px; padding: 9px 20px; color: #fff; font: 800 13px/1 inherit; letter-spacing: 2px; cursor: pointer; }
.tab.glass.sel { --tint: rgba(255,200,80,.7); border-color: rgba(255,224,130,.95); }
.tabpanel { display: flex; flex-direction: column; align-items: center; gap: 10px; width: min(900px, 96vw); }
.note { margin: 0; font-size: 12px; opacity: .85; }
#upgList { display: grid; grid-template-columns: repeat(auto-fit, minmax(270px, 1fr)); gap: 8px; width: 100%; }
.upg { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 14px; background: rgba(13,22,38,.6); border: 1px solid rgba(255,255,255,.22); text-align: left; }
.upg .ui { font-size: 22px; width: 32px; text-align: center; }
.upg .ut { flex: 1; min-width: 0; position: relative; padding-bottom: 7px; }
.upg .ut b { display: block; font-size: 14px; letter-spacing: 1px; } .upg .ut b small { font-weight: 400; opacity: .7; margin-left: 4px; }
.upg .ut span { display: block; font-size: 11px; opacity: .85; }
.upg .ut i { position: absolute; left: 0; right: 0; bottom: 0; height: 4px; border-radius: 2px; background: linear-gradient(90deg, #ffcf5a var(--p), rgba(255,255,255,.15) var(--p)); }
.buy { display: flex; align-items: center; gap: 5px; border: 0; border-radius: 999px; padding: 8px 12px; font: 800 13px/1 inherit; color: #0d1626; background: linear-gradient(180deg, #ffe58f, #ffb938); cursor: pointer; min-width: 74px; justify-content: center; }
.buy:disabled { background: rgba(255,255,255,.18); color: rgba(255,255,255,.6); cursor: default; }
.shopgrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; width: 100%; }
.sitem { display: flex; flex-direction: column; gap: 6px; align-items: center; padding: 12px; border-radius: 16px; background: rgba(13,22,38,.6); border: 1px solid rgba(255,255,255,.22); }
.sitem b { font-size: 15px; letter-spacing: 1px; } .sitem span { font-size: 12px; opacity: .85; min-height: 30px; } .sitem em { font-size: 12px; color: #ffe27a; font-style: normal; min-height: 14px; }
.sitem .row { display: flex; gap: 6px; } .sitem.soon { opacity: .55; }
.sitem .cta.slim { display: inline-flex; align-items: center; gap: 6px; justify-content: center; }
.pop.heal { color: #6dff9a; font-size: 22px; }
@media (max-height: 480px) { #menu h1 { font-size: 28px; } .upg { padding: 6px 8px; } #upgList { gap: 6px; } }
`;
  wr("style.css", c);
}
console.log("patched");
