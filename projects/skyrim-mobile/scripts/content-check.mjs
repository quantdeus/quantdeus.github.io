import { readFile, readdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
const root = new URL("../", import.meta.url);
const budget = JSON.parse(await readFile(new URL("content-budget.json", root)));
const manifest = JSON.parse(await readFile(new URL("packs/manifest.json", root)));
const allocations = Object.values(budget.allocations);
if (allocations.some(v => !Number.isInteger(v) || v < 0) ||
    allocations.reduce((sum, v) => sum + v, 0) !== budget.limitBytes)
  throw new Error("Pack budget does not sum to release maximum");
if (budget.limitBytes !== 500000000) throw new Error("Release must remain within 500 MB");
if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.packs)) throw new Error("Invalid manifest");
let bytes = 0;
const claimed = new Set();
for (const item of manifest.packs) {
  if (!/^[a-z0-9_-]+$/.test(item.id) ||
      !/^[a-z0-9_/-]+\.(glb|ktx2|ogg|bin|zip)$/.test(item.path) ||
      item.path.includes("..") || claimed.has(item.path))
    throw new Error("Invalid or duplicate content pack path");
  claimed.add(item.path);
  if (!/^[0-9a-f]{64}$/.test(item.sha256)) throw new Error("Missing SHA256 for " + item.id);
  const pathname = new URL("packs/" + item.path, root);
  const data = await readFile(pathname);
  const actualHash = createHash("sha256").update(data).digest("hex");
  if (data.length !== item.sizeBytes || actualHash !== item.sha256)
    throw new Error("Content corruption: " + item.path);
  bytes += data.length;
}
async function visit(folder, prefix="") {
  for (const ent of await readdir(folder, { withFileTypes:true })) {
    const relative = prefix + ent.name;
    const absolute = path.join(folder, ent.name);
    if (ent.isDirectory()) await visit(absolute, relative + "/");
    else if (ent.isFile() && relative !== "manifest.json" && !claimed.has(relative))
      throw new Error("Untracked pack file: " + relative);
  }
}
await visit(new URL("packs/", root).pathname);
if (bytes > budget.limitBytes) throw new Error("Game packs exceed 500 MB");
console.log("PACK QA OK: " + manifest.packs.length + " actual packs; " + bytes + "/500000000 bytes installed in source. Reserve is a budget, not content.");
