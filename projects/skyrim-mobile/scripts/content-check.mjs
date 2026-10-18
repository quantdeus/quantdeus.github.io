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
const actualByCategory = Object.fromEntries(Object.keys(budget.allocations).map(k => [k, 0]));
for (const item of manifest.packs) {
  if (!/^[a-z0-9_-]+$/.test(item.id) ||
      !/^[a-z0-9_/-]+\.(glb|ktx2|ogg|bin|zip)$/.test(item.path) ||
      item.path.includes("..") || claimed.has(item.path))
    throw new Error("Invalid or duplicate content pack path");
  claimed.add(item.path);
  if (!(item.category in actualByCategory) || ["runtime", "reserve"].includes(item.category)) throw new Error("Invalid pack category");
  if (!/^[0-9a-f]{64}$/.test(item.sha256)) throw new Error("Missing SHA256 for " + item.id);
  const pathname = new URL("packs/" + item.path, root);
  const data = await readFile(pathname);
  const actualHash = createHash("sha256").update(data).digest("hex");
  if (data.length !== item.sizeBytes || actualHash !== item.sha256)
    throw new Error("Content corruption: " + item.path);
  bytes += data.length;
  actualByCategory[item.category] += data.length;
  if (actualByCategory[item.category] > budget.allocations[item.category]) throw new Error("Pack category over budget: " + item.category);
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
let runtimeBytes = 0;
if (process.argv.includes("--release")) {
  async function sumRuntime(dir) {
    for (const ent of await readdir(dir, {withFileTypes:true})) {
      const pathToFile = path.join(dir, ent.name);
      if (ent.isDirectory()) await sumRuntime(pathToFile);
      else if (ent.isFile()) runtimeBytes += (await stat(pathToFile)).size;
    }
  }
  await sumRuntime(new URL("dist/", root).pathname);
  if (runtimeBytes < 1 || runtimeBytes > budget.allocations.runtime)
    throw new Error("Runtime build empty or exceeds 25MB");
}
if (bytes + runtimeBytes > budget.limitBytes - budget.allocations.reserve)
  throw new Error("Content + runtime exceed the 500MB limit after reserve");
console.log("PACK QA OK: packs=" + bytes + " bytes; runtime=" + runtimeBytes + " bytes; max=500000000 with 30000000-byte reserve.");
