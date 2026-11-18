// Tiny static file server for local play-testing. Usage: node tools/serve.mjs [port]
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { networkInterfaces } from "node:os";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PORT = Number(process.argv[2] || process.env.PORT || 5173);
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".glb": "model/gltf-binary", ".png": "image/png",
  ".jpg": "image/jpeg", ".webp": "image/webp", ".mp3": "audio/mpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon",
};

createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (path === "/") { res.writeHead(302, { Location: "/game/index.html" }).end(); return; }
    let file = normalize(join(ROOT, path));
    if (!file.startsWith(ROOT)) { res.writeHead(403).end("forbidden"); return; }
    // the public repo ships only the optimized models: serve assets/models_opt when a full-size model is not present
    if (/[\\/]assets[\\/]models[\\/][^\\/]+\.glb$/.test(file)) {
      const opt = file.replace(/([\\/]assets[\\/])models([\\/])/, "$1models_opt$2");
      try { await stat(file); } catch { file = opt; }
    }
    const info = await stat(file);
    if (info.isDirectory()) { res.writeHead(302, { Location: path.replace(/\/?$/, "/index.html") }).end(); return; }
    const data = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[extname(file).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(data);
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(PORT, "0.0.0.0", () => {
  console.log(`Skyrath dev server: http://localhost:${PORT}/`);
  for (const list of Object.values(networkInterfaces())) {
    for (const n of list || []) if (n.family === "IPv4" && !n.internal) console.log(`  on your phone (same Wi-Fi): http://${n.address}:${PORT}/`);
  }
});
