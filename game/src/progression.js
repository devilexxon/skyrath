// Permanent progression: coin upgrades shared by all dragons, gem shop, free chest (the future rewarded-ad slot).
export const UPGRADES = [
  { id: "power", name: "Power", icon: "🔥", max: 25, base: 100, desc: (l) => `+${l * 8}% damage` },
  { id: "vitality", name: "Vitality", icon: "❤", max: 25, base: 100, desc: (l) => `+${l * 10}% max health` },
  { id: "haste", name: "Haste", icon: "⚡", max: 20, base: 120, desc: (l) => `+${l * 5}% fire rate` },
  { id: "breath", name: "Breath", icon: "🌬", max: 20, base: 120, desc: (l) => `+${l * 10}% breath damage, ${l * 3}% less heat` },
  { id: "armor", name: "Armor", icon: "🛡", max: 20, base: 150, desc: (l) => `${Math.round(Math.min(0.5, l * 0.025) * 100)}% less damage taken` },
  { id: "renewal", name: "Renewal", icon: "✚", max: 20, base: 150, desc: (l) => `+${(l * 0.4).toFixed(1)} health per second, +${l * 4}% orb healing` },
];
export const upgradeCost = (u, lv) => Math.round(u.base * Math.pow(1.25, lv));

export const FEATHER_GEMS = 5;            // gem price of one Phoenix Feather (a free revive)
export const GEM_TO_COINS = 60;           // coins per gem in the exchange
const CHEST_HOURS = 4;

export function createProgression(save, persist) {
  save.upg = save.upg || {};
  save.feathers = save.feathers || 0;
  save.chestAt = save.chestAt || 0;
  const lv = (id) => save.upg[id] || 0;

  return {
    lv,
    stats() {
      return {
        dmg: 1 + lv("power") * 0.08,
        hp: 1 + lv("vitality") * 0.1,
        fireRate: 1 + lv("haste") * 0.05,
        breathDmg: 1 + lv("breath") * 0.1,
        heatUse: 1 - lv("breath") * 0.03,
        taken: 1 - Math.min(0.5, lv("armor") * 0.025),
        regen: lv("renewal") * 0.4,
        orbHeal: 1 + lv("renewal") * 0.04,
      };
    },
    buy(id) {
      const u = UPGRADES.find((x) => x.id === id);
      const l = lv(id);
      if (!u || l >= u.max) return false;
      const c = upgradeCost(u, l);
      if (save.coins < c) return false;
      save.coins -= c; save.upg[id] = l + 1; persist();
      return true;
    },
    buyFeather() {
      if (save.gems < FEATHER_GEMS) return false;
      save.gems -= FEATHER_GEMS; save.feathers++; persist(); return true;
    },
    exchange(gems) {
      if (save.gems < gems) return false;
      save.gems -= gems; save.coins += gems * GEM_TO_COINS; persist(); return true;
    },
    // free chest on a timer; when ads are live this becomes "watch an ad"
    chestLeft() { return Math.max(0, save.chestAt + CHEST_HOURS * 3600e3 - Date.now()); },
    openChest(skipTimer = false) {               // skipTimer: the player watched a rewarded ad
      if (this.chestLeft() > 0 && !skipTimer) return null;
      const coins = 150 + save.best * 25, gems = 2 + Math.floor(save.best / 10);
      save.coins += coins; save.gems += gems; save.chestAt = Date.now(); persist();
      return { coins, gems };
    },
  };
}
