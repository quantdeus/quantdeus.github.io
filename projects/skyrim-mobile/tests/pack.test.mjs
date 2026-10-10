import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto, createHash } from "node:crypto";
import { verifyPack } from "../src/pack-loader.mjs";
test("accepts matching pack content", async () => {
 const bytes = new TextEncoder().encode("authorized game material").buffer;
 const digest = createHash("sha256").update(Buffer.from(bytes)).digest("hex");
 assert.equal(await verifyPack(bytes,digest,bytes.byteLength,webcrypto),true);
 assert.equal(await verifyPack(bytes,"0".repeat(64),bytes.byteLength,webcrypto),false);
 assert.equal(await verifyPack(bytes,digest,999,webcrypto),false);
});
