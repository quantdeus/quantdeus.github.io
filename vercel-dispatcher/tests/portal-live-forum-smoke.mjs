import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import forum from "../api/quantdeus/community.js";

globalThis.crypto ||= webcrypto;

const botToken = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
const githubToken = String(process.env.QUANTDEUS_GITHUB_TOKEN || "").trim();
if (!botToken) throw new Error("TELEGRAM_BOT_TOKEN is required for live forum smoke");
if (!githubToken) throw new Error("QUANTDEUS_GITHUB_TOKEN is required for live forum smoke");

process.env.VERCEL_ENV = "production";
process.env.QUANTDEUS_ORDER_HMAC_SECRET ||= "portal-live-smoke-audit-key";
process.env.QUANTDEUS_MODERATOR_TELEGRAM_IDS = "910000003";

function resMock() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    end() { return this; }
  };
}

async function signedInitData(id, firstName) {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id, first_name: firstName })
  });
  const check = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const importKey = raw => crypto.subtle.importKey(
    "raw",
    Buffer.from(raw),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const secret = await crypto.subtle.sign("HMAC", await importKey("WebAppData"), Buffer.from(botToken));
  const key = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, Buffer.from(check));
  params.set("hash", Buffer.from(sig).toString("hex"));
  return params.toString();
}

async function call(req) {
  const res = resMock();
  await forum(req, res);
  return res;
}

const runId = String(process.env.QD_SMOKE_RUN_ID || Date.now());
const creator = await signedInitData(910000001, "Portal Smoke A");
const replier = await signedInitData(910000002, "Portal Smoke B");
const moderator = await signedInitData(910000003, "Portal Smoke Moderator");

// Guest must fail before any GitHub mutation.
const guest = await call({
  method: "POST",
  headers: {},
  body: {
    action: "thread",
    title: "Guest must fail",
    category: "community",
    text: "This must never be persisted."
  }
});
assert.equal(guest.statusCode, 401, JSON.stringify(guest.body));
assert.equal(guest.body.error, "telegram_auth_invalid");

// First authenticated identity creates a real GitHub-backed forum thread.
const created = await call({
  method: "POST",
  headers: { "x-telegram-init-data": creator },
  body: {
    action: "thread",
    title: `Portal #182 live smoke ${runId}`,
    category: "community",
    text: "Production-key-signed two-user persistence smoke. This thread is test evidence and will be locked automatically."
  }
});
assert.equal(created.statusCode, 201, JSON.stringify(created.body));
const threadId = Number(created.body?.thread?.number);
assert(Number.isInteger(threadId) && threadId > 0, "thread id missing");

// Second authenticated identity replies to the same persisted thread.
const replied = await call({
  method: "POST",
  headers: { "x-telegram-init-data": replier },
  body: {
    action: "reply",
    thread_id: threadId,
    text: "Second independently signed smoke identity reply."
  }
});
assert.equal(replied.statusCode, 201, JSON.stringify(replied.body));

// Re-read through the public forum API and verify persistence.
const reread = await call({
  method: "GET",
  query: { id: String(threadId) },
  headers: {}
});
assert.equal(reread.statusCode, 200, JSON.stringify(reread.body));
assert.equal(Number(reread.body?.thread?.number), threadId);
assert((reread.body?.replies || []).some(x => String(x.body || "").includes("Second independently signed smoke identity reply.")));

// Moderator locks the evidence thread. Audit marker is persisted by the handler.
const locked = await call({
  method: "POST",
  headers: { "x-telegram-init-data": moderator },
  body: { action: "moderate", command: "lock", thread_id: threadId }
});
assert.equal(locked.statusCode, 200, JSON.stringify(locked.body));
assert.equal(locked.body?.thread?.state, "closed");

const finalRead = await fetch(`https://api.github.com/repos/quantdeus/quantdeus.github.io/issues/${threadId}`, {
  headers: {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    Authorization: `Bearer ${githubToken}`
  }
});
assert(finalRead.ok, `GitHub final read failed: ${finalRead.status}`);
const finalIssue = await finalRead.json();
assert.equal(finalIssue.state, "closed");
assert.match(String(finalIssue.body || ""), /qd-audit: action=lock/);
assert.match(String(finalIssue.body || ""), /role=moderator/);

console.log(JSON.stringify({
  ok: true,
  smoke: "portal-live-forum",
  thread_id: threadId,
  guest_write_denied: true,
  two_user_create_reply_persisted: true,
  moderator_lock_audited: true
}));
