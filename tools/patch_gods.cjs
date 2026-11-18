// One-off patch: wires the celestial god bosses into main.js.
const fs = require("fs");
const path = require("path");
const F = path.join(__dirname, "..", "game", "src", "main.js");
let m = fs.readFileSync(F, "utf8");
const rep = (a, b) => { if (!m.includes(a)) throw new Error("missing: " + a.slice(0, 90)); m = m.replace(a, b); };
if (m.includes("godAttack")) { console.log("already patched"); process.exit(0); }

rep('import { createStory } from "./story.js";', 'import { createStory } from "./story.js";\nimport { GodBoss, godForStage, godAttack, GODS } from "./gods.js";');
rep("const models = {};", "const models = {};\nconst godModels = {};");

// spawning
rep("function spawnEnemy(boss) {\n  const p = G.player;", `function spawnGod() {
  const p = G.player;
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
  });
  $("bossbar").classList.remove("hidden"); $("bossName").textContent = def.name;
  banner(def.name, def.sub, 3.2);
  god.once("roar"); audio.play("dragon_roar", 1, 0.6); G.shake = 0.8;
  fx.ring(god.root.position, def.halo || 0x5fd0ff, 200, 1.0, camera);
}

function spawnEnemy(boss) {
  if (boss && godModels[godForStage(G.stage).def.id]) { spawnGod(); return; }
  const p = G.player;`);

// boss phase two text and god movement/attacks
rep('pop("ENRAGED!", "bad", e.pos); banner("THE WYRM RAGES", "PHASE TWO", 2.4);', 'pop("ENRAGED!", "bad", e.pos); banner(e.godDef ? e.godDef.name : "THE WYRM RAGES", "PHASE TWO", 2.4);');
rep("    const near = e.boss ? 180 : 120, far = e.boss ? 340 : 270;", "    const near = e.godDef ? 260 : e.boss ? 180 : 120, far = e.godDef ? 460 : e.boss ? 340 : 270;");
rep("    e.dragon.root.rotation.set(-e.pitch, e.yaw, clamp(angDiff(yaw, e.yaw) * 1.5, -0.7, 0.7));\n",
  `    if (e.godDef) {                                   // gods turn to face you and fight with their own patterns
      const face = Math.atan2(p.pos.x - e.pos.x, p.pos.z - e.pos.z);
      e.yaw += angDiff(face, e.yaw) * Math.min(1, 2 * edt);
      e.dragon.root.rotation.set(0, e.yaw, 0);
      if (!p.dead) godAttack(e, edt, godCtx);
      e.dragon.update(edt, false, false);
      continue;
    }
    e.dragon.root.rotation.set(-e.pitch, e.yaw, clamp(angDiff(yaw, e.yaw) * 1.5, -0.7, 0.7));
`);
rep("function updateEnemies(dt) {", `const godCtx = {
  get player() { return G.player; }, fx, audio, camera, rand,
  shoot: (from, dir, speed, dmg, size, homing) => { shoot("e", from, dir, speed, dmg, ELEMENTS.foe, size, null, false); if (homing) G.shots[G.shots.length - 1].homing = true; },
  ring: (pos, color, r) => fx.ring(pos, color, r, 0.7, camera),
};
function updateEnemies(dt) {`);

// homing god orbs, and the weak point
rep("    s.pos.addScaledVector(s.vel, sdt);\n", `    if (s.homing && p && !p.dead) {
      tmp.copy(p.pos).sub(s.pos).normalize().multiplyScalar(s.speed);
      s.vel.lerp(tmp, Math.min(1, 0.9 * sdt));
    }
    s.pos.addScaledVector(s.vel, sdt);
`);
rep('        if (e.pos.distanceToSquared(s.pos) < (e.radius + 4) * (e.radius + 4)) { hurtEnemy(e, s.dmg, s.pos, s.crit ? "crit" : "shot"); dead = true; break; }',
  `        if (e.godDef) {
          const h = e.dragon.heartWorld(tmp4), hr = e.godDef.heartR;
          if (h.distanceToSquared(s.pos) < hr * hr) { hurtEnemy(e, s.dmg * 2.5, s.pos, "weak"); dead = true; break; }
        }
        if (e.pos.distanceToSquared(s.pos) < (e.radius + 4) * (e.radius + 4)) { hurtEnemy(e, s.dmg, s.pos, s.crit ? "crit" : "shot"); dead = true; break; }`);
rep('    if (kind === "crit") { pop("CRITICAL!", "crit", at || e.pos); G.shake = Math.max(G.shake, 0.3); }',
  '    if (kind === "crit") { pop("CRITICAL!", "crit", at || e.pos); G.shake = Math.max(G.shake, 0.3); }\n    else if (kind === "weak") { if (G.combo % 3 === 0) pop("WEAK POINT!", "crit", at || e.pos); G.shake = Math.max(G.shake, 0.25); }');

// victory text names the god
rep('banner("VICTORY", "THE DREAD WYRM FALLS", 3.5);', 'banner("VICTORY", G.lastGod ? `${G.lastGod} FALLS` : "THE DREAD WYRM FALLS", 3.5);');
rep('  pop(e.boss ? "WYRM SLAIN!"', '  if (e.godDef) G.lastGod = e.godDef.name.split(",")[0];\n  pop(e.godDef ? "GOD SLAIN!" : e.boss ? "WYRM SLAIN!"');

// load the god models in the background after the menu is up
rep("  window.SKYRATH = { G, save, audio, startStory,", `  for (const def of GODS) loader.load(\`../assets/models/\${def.file}.glb\`, (g) => { godModels[def.id] = g; }, undefined, (err) => console.warn("god model", def.id, err));
  window.SKYRATH = { G, save, audio, startStory, godModels, spawnGod: () => spawnGod(),`);

fs.writeFileSync(F, m);
console.log("patched");
