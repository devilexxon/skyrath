// Shrink the textures inside GLB models (mesh, skin and animations are copied byte for byte).
// Usage: node tools/shrink_glb.mjs <in.glb> <out.glb> [size=1024] [quality=4]
//   size: longest side of each texture in pixels; quality: ffmpeg JPEG -q:v (2 best .. 31 worst)
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

const [src, dst, sizeArg, qArg] = process.argv.slice(2);
const SIZE = Number(sizeArg || 1024), Q = String(qArg || 4);
const glb = readFileSync(src);
const jsonLen = glb.readUInt32LE(12);
const json = JSON.parse(glb.subarray(20, 20 + jsonLen).toString("utf8"));
const binStart = 20 + jsonLen + 8;
const bin = glb.subarray(binStart, binStart + glb.readUInt32LE(20 + jsonLen));

const tmp = mkdtempSync(join(tmpdir(), "glb-"));
const replaced = new Map();                       // bufferView index -> new bytes
for (const [i, im] of (json.images || []).entries()) {
  const bv = json.bufferViews[im.bufferView];
  const bytes = bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
  const ext = im.mimeType === "image/png" ? "png" : "jpg";
  const inF = join(tmp, `in${i}.${ext}`), outF = join(tmp, `out${i}.jpg`);
  writeFileSync(inF, bytes);
  const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", inF,
    "-vf", `scale='min(${SIZE},iw)':-2:flags=lanczos`, "-q:v", Q, outF]);
  if (r.status !== 0) { console.log("skip image", i, r.stderr?.toString()); continue; }
  const out = readFileSync(outF);
  if (out.length < bytes.length) { replaced.set(im.bufferView, out); im.mimeType = "image/jpeg"; }
}
rmSync(tmp, { recursive: true, force: true });

// rebuild the binary chunk with every bufferView 4-byte aligned
const parts = []; let off = 0;
for (const [i, bv] of json.bufferViews.entries()) {
  const data = replaced.get(i) || bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
  const pad = (4 - (off % 4)) % 4;
  if (pad) { parts.push(Buffer.alloc(pad)); off += pad; }
  bv.byteOffset = off; bv.byteLength = data.length; bv.buffer = 0;
  parts.push(data); off += data.length;
}
const padEnd = (4 - (off % 4)) % 4; if (padEnd) parts.push(Buffer.alloc(padEnd));
const newBin = Buffer.concat(parts);
json.buffers = [{ byteLength: newBin.length }];
let js = Buffer.from(JSON.stringify(json), "utf8");
js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
const header = Buffer.alloc(12); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
const jh = Buffer.alloc(8); jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
const bh = Buffer.alloc(8); bh.writeUInt32LE(newBin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
const total = 12 + 8 + js.length + 8 + newBin.length; header.writeUInt32LE(total, 8);
writeFileSync(dst, Buffer.concat([header, jh, js, bh, newBin]));
console.log(`${src} ${(glb.length / 1e6).toFixed(2)}MB -> ${dst} ${(total / 1e6).toFixed(2)}MB`);
