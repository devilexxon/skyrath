// Build a self-contained web package and zip it.
// Usage: node tools/build_web.mjs [web|crazygames|android]
//   web        -> dist/web/              + dist/release/Skyrath-v<ver>-PC-Web-itchio.zip   (itch.io, PC browsers)
//   crazygames -> dist/web-crazygames/   + dist/release/Skyrath-v<ver>-CrazyGames.zip      (CrazyGames SDK v3 build)
//   android    -> dist/web-android/      (packed into the Google Play bundle by tools/build_android.sh)
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const TARGET = process.argv[2] || "web";
if (!["web", "crazygames", "android"].includes(TARGET)) throw new Error("target must be web, crazygames or android");
const VER = (readFileSync(join(ROOT, "android", "version.properties"), "utf8").match(/versionName=(\S+)/) || [])[1] || "dev";
const OUT = join(ROOT, "dist", TARGET === "web" ? "web" : `web-${TARGET}`);
mkdirSync(join(ROOT, "dist", "release"), { recursive: true });
const ZIP = TARGET === "android" ? null : join(ROOT, "dist", "release", TARGET === "web" ? `Skyrath-v${VER}-PC-Web-itchio.zip` : `Skyrath-v${VER}-CrazyGames.zip`);
const IDS = ["fire", "frost", "storm", "forest"];

rmSync(OUT, { recursive: true, force: true });
if (ZIP) rmSync(ZIP, { force: true });
mkdirSync(join(OUT, "src"), { recursive: true });
mkdirSync(join(OUT, "assets", "models"), { recursive: true });
mkdirSync(join(OUT, "assets", "concepts"), { recursive: true });

// code: point at the bundled assets and the bundled 3D library
for (const f of readdirSync(join(ROOT, "game", "src"))) {
  writeFileSync(join(OUT, "src", f), readFileSync(join(ROOT, "game", "src", f), "utf8").replaceAll("../assets/", "assets/"));
}
let html = readFileSync(join(ROOT, "game", "index.html"), "utf8");
html = html.replace(/"three": "[^"]+"/, '"three": "./vendor/three.module.js"').replace(/"three\/addons\/": "[^"]+"/, '"three/addons/": "./vendor/jsm/"');
if (html.includes("cdn.jsdelivr")) throw new Error("index.html still points at the CDN");
// tell the game where it runs; the CrazyGames build also loads their SDK before the game code
let head = `<script>window.SKYRATH_PLATFORM = "${TARGET}";</script>`;
if (TARGET === "crazygames") head += `\n<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>`;
html = html.replace("</title>", "</title>\n" + head);
writeFileSync(join(OUT, "index.html"), html);
cpSync(join(ROOT, "game", "style.css"), join(OUT, "style.css"));
cpSync(join(ROOT, "vendor"), join(OUT, "vendor"), { recursive: true });

// assets: only what the game loads. Models come from assets/models_opt (textures shrunk by tools/shrink_glb.mjs) when present.
const model = (id) => existsSync(join(ROOT, "assets", "models_opt", `${id}.glb`)) ? join(ROOT, "assets", "models_opt", `${id}.glb`) : join(ROOT, "assets", "models", `${id}.glb`);
for (const id of IDS) {
  cpSync(model(id), join(OUT, "assets", "models", `${id}.glb`));
  const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", join(ROOT, "assets", "concepts", `${id}_openmouth_v2.png`), "-vf", "scale=360:-2", join(OUT, "assets", "concepts", `${id}_openmouth_v2.png`)]);
  if (r.status !== 0) cpSync(join(ROOT, "assets", "concepts", `${id}_openmouth_v2.png`), join(OUT, "assets", "concepts", `${id}_openmouth_v2.png`));
}
// skins: textures, card images (scaled down) and the legendary dragon models
cpSync(join(ROOT, "assets", "skins"), join(OUT, "assets", "skins"), { recursive: true });
mkdirSync(join(OUT, "assets", "concepts", "skins"), { recursive: true });
for (const f of readdirSync(join(ROOT, "assets", "concepts", "skins"))) {
  if (!f.endsWith(".png") || f.includes("_v2")) continue;
  const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", join(ROOT, "assets", "concepts", "skins", f), "-vf", "scale=300:-2", join(OUT, "assets", "concepts", "skins", f)]);
  if (r.status !== 0) cpSync(join(ROOT, "assets", "concepts", "skins", f), join(OUT, "assets", "concepts", "skins", f));
}
for (const f of ["solaris", "voidrend", "boss_leviathan", "boss_sun", "boss_moon"]) if (existsSync(model(f))) cpSync(model(f), join(OUT, "assets", "models", f + ".glb"));
for (const d of ["voice", "sfx", "music"]) cpSync(join(ROOT, "assets", "audio", d), join(OUT, "assets", "audio", d), { recursive: true });

function size(dir) { let t = 0; for (const f of readdirSync(dir)) { const p = join(dir, f); const s = statSync(p); t += s.isDirectory() ? size(p) : s.size; } return t; }
console.log(`web build: ${OUT}  ${(size(OUT) / 1048576).toFixed(1)} MB`);

// Windows tar writes forward-slash entry names; PowerShell Compress-Archive writes backslashes, which break on Linux servers
if (ZIP) {
  const z = spawnSync("C:/Windows/System32/tar.exe", ["-a", "-c", "-f", ZIP, "-C", OUT, ...readdirSync(OUT)], { encoding: "utf8" });
  if (z.status !== 0 || !existsSync(ZIP)) console.log("zip failed:", z.stderr); else console.log(`zip: ${ZIP}  ${(statSync(ZIP).size / 1048576).toFixed(1)} MB`);
}
