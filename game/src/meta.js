// Things that bring players back: a 7-day login calendar, 3 daily missions, achievements and personal bests.
// All progress lives in the normal save (so on CrazyGames it follows the player's account).

const DAILY = [
  { coins: 100 }, { coins: 150 }, { gems: 5 }, { coins: 250 }, { gems: 8 }, { coins: 400 }, { gems: 20 },
];

// stat: what is counted; mode "max" keeps the best value instead of adding
const MISSION_POOL = [
  { id: "kills30", text: "Defeat 30 enemies", stat: "kill", goal: 30, reward: { coins: 150 } },
  { id: "breath15", text: "Defeat 15 enemies with BREATH", stat: "breathKill", goal: 15, reward: { gems: 3 } },
  { id: "stage8", text: "Reach stage 8 in one run", stat: "stage", goal: 8, mode: "max", reward: { coins: 200 } },
  { id: "godclean", text: "Defeat a god without crashing", stat: "godKillClean", goal: 1, reward: { gems: 6 } },
  { id: "coins300", text: "Collect 300 coins", stat: "coins", goal: 300, reward: { gems: 2 } },
  { id: "dodge20", text: "Dodge 20 times", stat: "dodge", goal: 20, reward: { coins: 120 } },
  { id: "blast5", text: "Defeat 5 enemies with a charged blast", stat: "blastKill", goal: 5, reward: { gems: 3 } },
  { id: "wisp15", text: "Destroy 15 wisp drakes", stat: "wispKill", goal: 15, reward: { coins: 150 } },
  { id: "elite3", text: "Defeat 3 elite enemies", stat: "eliteKill", goal: 3, reward: { gems: 4 } },
  { id: "shield8", text: "Defeat 8 shield drakes", stat: "shieldKill", goal: 8, reward: { coins: 180 } },
  { id: "clean2", text: "Clear 2 stages without taking damage", stat: "cleanStage", goal: 2, reward: { gems: 4 } },
];

const ACHIEVEMENTS = [
  { id: "first", name: "First Blood", text: "Defeat your first enemy", stat: "kill", goal: 1, gems: 2 },
  { id: "slayer", name: "Dragon Slayer", text: "Defeat 100 enemies", stat: "kill", goal: 100, gems: 10 },
  { id: "legend", name: "Living Legend", text: "Defeat 1,000 enemies", stat: "kill", goal: 1000, gems: 40 },
  { id: "god1", name: "God Breaker", text: "Defeat a god", stat: "godKill", goal: 1, gems: 5 },
  { id: "god10", name: "Pantheon's Bane", text: "Defeat 10 gods", stat: "godKill", goal: 10, gems: 25 },
  { id: "rift", name: "Rift Walker", text: "Enter the Crystal Expanse", stat: "crystal", goal: 1, gems: 10 },
  { id: "stage20", name: "Deep Frost", text: "Reach stage 20", stat: "stage", goal: 20, gems: 20 },
  { id: "stage30", name: "Endless Sky", text: "Reach stage 30", stat: "stage", goal: 30, gems: 40 },
  { id: "breath100", name: "Inferno", text: "Defeat 100 enemies with BREATH", stat: "breathKill", goal: 100, gems: 10 },
  { id: "clean", name: "Untouchable", text: "Clear a stage without taking damage", stat: "cleanStage", goal: 1, gems: 8 },
  { id: "elite25", name: "Elite Hunter", text: "Defeat 25 elite enemies", stat: "eliteKill", goal: 25, gems: 15 },
  { id: "rich", name: "Dragon Hoard", text: "Collect 10,000 coins in total", stat: "coins", goal: 10000, gems: 15 },
];
const MAX_STATS = new Set(["stage"]);

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const dayIndex = (s) => Math.floor(new Date(s + "T00:00:00").getTime() / 86400000);
function seededPick(seedStr, n) {
  let h = 2166136261;
  for (const ch of seedStr) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const pool = MISSION_POOL.slice(), out = [];
  while (out.length < n && pool.length) { h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; out.push(pool.splice(h % pool.length, 1)[0]); }
  return out;
}
const rewardText = (r) => [r.coins ? `${r.coins} coins` : "", r.gems ? `${r.gems} gems` : ""].filter(Boolean).join(" + ");

export function createMeta(save, persist, hooks) {
  save.stats = save.stats || {};
  save.ach = save.ach || {};
  save.daily = save.daily || { last: "", streak: 0, claimed: "" };
  const run = { taken0: 0, crashedSinceGod: false };

  function ensureMissions() {
    const d = today();
    if (!save.missions || save.missions.date !== d) {
      save.missions = { date: d, list: seededPick(d, 3).map((m) => ({ id: m.id, prog: 0, claimed: false })) };
      persist();
    }
    return save.missions.list.map((x) => ({ ...MISSION_POOL.find((m) => m.id === x.id), state: x }));
  }

  function give(r) { save.coins += r.coins || 0; save.gems += r.gems || 0; }

  function track(stat, amount = 1) {
    if (MAX_STATS.has(stat)) save.stats[stat] = Math.max(save.stats[stat] || 0, amount);
    else save.stats[stat] = (save.stats[stat] || 0) + amount;
    for (const m of ensureMissions()) {
      if (m.stat !== stat || m.state.claimed) continue;
      const before = m.state.prog;
      m.state.prog = MAX_STATS.has(stat) || m.mode === "max" ? Math.max(m.state.prog, amount) : m.state.prog + amount;
      if (before < m.goal && m.state.prog >= m.goal) hooks.toast("MISSION COMPLETE!", m.text);
    }
    for (const a of ACHIEVEMENTS) {
      if (save.ach[a.id] || a.stat !== stat) continue;
      if ((save.stats[stat] || 0) >= a.goal) {
        save.ach[a.id] = Date.now(); save.gems += a.gems;
        hooks.toast("ACHIEVEMENT!", `${a.name}  ·  +${a.gems} GEMS`);
      }
    }
    persist();
  }

  return {
    track,
    // daily login calendar: returns the reward waiting today (or null)
    dailyPending() {
      const d = today();
      if (save.daily.claimed === d) return null;
      const gap = save.daily.last ? dayIndex(d) - dayIndex(save.daily.last) : 99;
      const streak = gap === 1 ? (save.daily.streak % 7) + 1 : gap === 0 ? save.daily.streak : 1;
      return { day: streak, reward: DAILY[streak - 1] };
    },
    claimDaily() {
      const pend = this.dailyPending();
      if (!pend) return null;
      give(pend.reward);
      save.daily = { last: today(), streak: pend.day, claimed: today() };
      persist();
      return pend;
    },
    missions: ensureMissions,
    claimMission(id) {
      const m = ensureMissions().find((x) => x.id === id);
      if (!m || m.state.claimed || m.state.prog < m.goal) return null;
      m.state.claimed = true; give(m.reward); persist();
      return m;
    },
    achievements: () => ACHIEVEMENTS.map((a) => ({ ...a, done: !!save.ach[a.id], prog: Math.min(a.goal, save.stats[a.stat] || 0) })),
    claimable() {
      const dp = this.dailyPending() ? 1 : 0;
      return dp + ensureMissions().filter((m) => !m.state.claimed && m.state.prog >= m.goal).length;
    },
    rewardText,
    DAILY,
    // ---- hooks from the game
    stageStarted(G, p) { run.taken0 = G.run.taken; },
    stageCleared(G, p) {
      track("stage", G.stage);
      if (G.run.taken - run.taken0 < 0.5) track("cleanStage", 1);
      run.taken0 = G.run.taken;
    },
    godSpawned() { run.crashedSinceGod = false; },
    crashed() { run.crashedSinceGod = true; },
    enemyKilled(e, kind, rammed) {
      if (rammed) return;
      track("kill", 1);
      if (kind === "breath") track("breathKill", 1);
      if (kind === "blast") track("blastKill", 1);
      if (e.swarm) track("wispKill", 1);
      if (e.elite) track("eliteKill", 1);
      if (e.type === "shield") track("shieldKill", 1);
      if (e.godDef) { track("godKill", 1); if (!run.crashedSinceGod) track("godKillClean", 1); }
    },
  };
}
