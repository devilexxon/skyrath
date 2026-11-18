// Cut the per-speaker voice recordings into one file per line and normalise loudness.
// Usage: node tools/cut_audio.mjs   (run from the project root; needs ffmpeg in PATH)
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync } from "node:fs";

const RAW = "assets/audio/raw";
const VOICE = "assets/audio/voice";
const LINES = {
  announcer: ["skyrath", "choose_your_dragon", "get_ready", "fight", "next_wave", "level_up",
    "boss_incoming", "ultimate_ready", "victory", "defeated", "revive", "new_record"],
  fire: ["select", "attack", "ultimate", "taunt", "hit", "win"],
  frost: ["select", "attack", "ultimate", "taunt", "hit", "win"],
  storm: ["select", "attack", "ultimate", "taunt", "hit", "win"],
  forest: ["select", "attack", "ultimate", "taunt", "hit", "win"],
};

function silences(file) {
  let out = "";
  try {
    execFileSync("ffmpeg", ["-hide_banner", "-i", file, "-af", "silencedetect=noise=-35dB:d=0.45", "-f", "null", "-"],
      { stdio: ["ignore", "ignore", "pipe"] });
  } catch (e) { out = String(e.stderr || ""); }
  return out;
}

function detect(file) {
  const r = execFileSync("ffmpeg", ["-hide_banner", "-i", file, "-af", "silencedetect=noise=-35dB:d=0.45", "-f", "null", "-"],
    { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
  return r;
}

function run(args) {
  const { spawnSync } = require_child();
  return spawnSync("ffmpeg", args, { encoding: "utf8" });
}
import { spawnSync } from "node:child_process";
function require_child() { return { spawnSync }; }

mkdirSync(VOICE, { recursive: true });
for (const [speaker, names] of Object.entries(LINES)) {
  const file = `${RAW}/${speaker}.mp3`;
  const res = spawnSync("ffmpeg", ["-hide_banner", "-i", file, "-af", "silencedetect=noise=-35dB:d=0.45", "-f", "null", "-"], { encoding: "utf8" });
  const text = res.stderr;
  const dur = Number((text.match(/Duration: (\d+):(\d+):([\d.]+)/) || []).slice(1).reduce((a, v) => a * 60 + Number(v), 0));
  const starts = [...text.matchAll(/silence_start: ([\d.]+)/g)].map((m) => Number(m[1]));
  const ends = [...text.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));
  // speech segments lie between silences
  let segs = [];
  let t = 0;
  for (let i = 0; i < starts.length; i++) {
    if (starts[i] - t > 0.15) segs.push([t, starts[i]]);
    t = ends[i] ?? dur;
  }
  if (dur - t > 0.15) segs.push([t, dur]);
  // too many segments means a line has an internal pause: merge the closest neighbours
  while (segs.length > names.length) {
    let best = 0, gap = Infinity;
    for (let i = 0; i < segs.length - 1; i++) {
      const g = segs[i + 1][0] - segs[i][1];
      if (g < gap) { gap = g; best = i; }
    }
    segs.splice(best, 2, [segs[best][0], segs[best + 1][1]]);
  }
  console.log(`${speaker}: ${segs.length} segments for ${names.length} lines`);
  if (segs.length !== names.length) { console.log("  MISMATCH, skipped"); continue; }
  segs.forEach(([a, b], i) => {
    const out = `${VOICE}/${speaker}_${names[i]}.mp3`;
    const r = spawnSync("ffmpeg", ["-hide_banner", "-y", "-i", file, "-ss", Math.max(0, a - 0.06).toFixed(3), "-to", Math.min(dur, b + 0.18).toFixed(3),
      "-af", "loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=in:d=0.02", "-ar", "44100", "-b:a", "128k", out], { encoding: "utf8" });
    console.log(`  ${out}  ${(b - a).toFixed(2)}s  ${r.status === 0 ? "ok" : "FAILED"}`);
  });
}
console.log("voice files:", readdirSync(VOICE).length);
