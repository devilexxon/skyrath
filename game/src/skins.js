// Dragon skins: recolours of the four base dragons (a new texture on the same rigged model)
// and legendary dragons (their own model). Each skin also has its own fireball look.
//   shot: "orb" (default), "spiral" (two embers orbit the fireball), "shard" (a long icy streak),
//         "bolt" (crackling zig-zag trail), "petal" (spinning petals), "nova" (big pulsing star)
export const RARITY = { common: "Common", rare: "Rare", epic: "Epic", legendary: "Legendary" };

export const SKINS = [
  { id: "fire", dragon: "fire", name: "Ember", rarity: "common", own: true },
  { id: "fire_obsidian", dragon: "fire", name: "Molten Obsidian", rarity: "rare", coins: 2500, gems: 60, tex: "fire_obsidian",
    el: { core: 0xfff0b0, glow: 0xff8a1e, trail: 0x3a1408 }, shot: "spiral" },
  { id: "fire_blueinferno", dragon: "fire", name: "Blue Inferno", rarity: "epic", gems: 120, tex: "fire_blueinferno",
    el: { core: 0xffffff, glow: 0x3fb8ff, trail: 0x1f4cff }, shot: "spiral" },

  { id: "frost", dragon: "frost", name: "Glacier", rarity: "common", own: true },
  { id: "frost_aurora", dragon: "frost", name: "Aurora", rarity: "epic", gems: 120, tex: "frost_aurora",
    el: { core: 0xffffff, glow: 0x6dffc8, trail: 0xb27aff }, shot: "shard" },
  { id: "frost_midnight", dragon: "frost", name: "Midnight Frost", rarity: "rare", coins: 2500, gems: 60, tex: "frost_midnight",
    el: { core: 0xffffff, glow: 0x6a8cff, trail: 0x2a2f8a }, shot: "shard" },

  { id: "storm", dragon: "storm", name: "Tempest", rarity: "common", own: true },
  { id: "storm_golden", dragon: "storm", name: "Golden Thunder", rarity: "epic", gems: 120, tex: "storm_golden",
    el: { core: 0xffffff, glow: 0xffd23c, trail: 0xfff1a0 }, shot: "bolt" },
  { id: "storm_crimson", dragon: "storm", name: "Crimson Storm", rarity: "rare", coins: 2500, gems: 60, tex: "storm_crimson",
    el: { core: 0xffe0e6, glow: 0xff2e4a, trail: 0x6a0a1a }, shot: "bolt" },

  { id: "forest", dragon: "forest", name: "Verdant", rarity: "common", own: true },
  { id: "forest_sakura", dragon: "forest", name: "Sakura", rarity: "rare", coins: 2500, gems: 60, tex: "forest_sakura",
    el: { core: 0xfff0f6, glow: 0xff8ac8, trail: 0xffc8e0 }, shot: "petal" },
  { id: "forest_autumn", dragon: "forest", name: "Autumn Ember", rarity: "rare", coins: 2500, gems: 60, tex: "forest_autumn",
    el: { core: 0xfff0c0, glow: 0xff9a2a, trail: 0xc8441a }, shot: "petal" },
];

// Legendary dragons are new playable dragons, bought with gems only
export const LEGENDS = {
  solaris: { name: "SOLARIS", desc: "Legendary sun wyrm. +20% damage, fire heals you a little.", shot: "fire_shot", dmg: 1.2, hp: 1.1, speed: 1.05, regen: 0.8,
    el: { core: 0xffffff, glow: 0xffc23c, trail: 0xff6a1e, name: "Sun" }, style: "nova", gems: 400, voice: "fire" },
  voidrend: { name: "VOIDREND", desc: "Legendary void dragon. +15% speed, +15% damage.", shot: "lightning_shot", dmg: 1.15, hp: 1.05, speed: 1.15, regen: 0,
    el: { core: 0xffffff, glow: 0xb46bff, trail: 0x4fe8ff, name: "Void" }, style: "bolt", gems: 400, voice: "storm" },
};

export const skinById = (id) => SKINS.find((s) => s.id === id);
export const skinsFor = (dragon) => SKINS.filter((s) => s.dragon === dragon);

// local ownership for now; moves to the server (Firebase) once accounts are connected
export function skinState(save) {
  if (!save.skins) save.skins = { owned: [], equip: {} };
  return {
    owns: (id) => { const s = skinById(id); return (s && s.own) || save.skins.owned.includes(id); },
    equipped: (dragon) => save.skins.equip[dragon] || dragon,
    equip: (dragon, id) => { save.skins.equip[dragon] = id; },
    grant: (id) => { if (!save.skins.owned.includes(id)) save.skins.owned.push(id); },
  };
}
