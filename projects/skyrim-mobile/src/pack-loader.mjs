// Optional pack API for future independently delivered original assets.
// Fetch only same-origin, hash-verified files; never execute JS from downloaded packs.
export async function verifyPack(buffer, expectedSha256, expectedSizeBytes, cryptoProvider = globalThis.crypto) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength !== expectedSizeBytes) return false;
  if (!/^[a-f0-9]{64}$/.test(expectedSha256)) return false;
  const result = await cryptoProvider.subtle.digest("SHA-256", buffer);
  const actual = Array.from(new Uint8Array(result), x => x.toString(16).padStart(2, "0")).join("");
  return actual === expectedSha256;
}
export async function fetchVerifiedPack(record, baseUrl = "/packs/") {
  if (!/^[a-z0-9_/-]+\.(glb|ktx2|ogg|bin|zip)$/.test(record.path) || record.path.includes(".."))
    throw new Error("Invalid content path");
  if (!Number.isSafeInteger(record.sizeBytes) || record.sizeBytes < 0 || record.sizeBytes > 500000000)
    throw new Error("Invalid content size");
  const url = new URL(baseUrl + record.path, location.origin);
  if (url.origin !== location.origin) throw new Error("Cross-origin packs forbidden");
  const response = await fetch(url, { credentials:"same-origin", cache:"force-cache" });
  if (!response.ok) throw new Error("Pack download failed: " + response.status);
  const content = await response.arrayBuffer();
  if (!(await verifyPack(content, record.sha256, record.sizeBytes))) throw new Error("Pack hash mismatch");
  return content;
}
