import { randomUUID, timingSafeEqual as safeCompare } from "node:crypto";

const PUBLIC_REPO = "quantdeus/quantdeus.github.io";
const DEFAULT_PRIVATE_REPO = "quantdeus/quantdeus_core.pulse";
const json = (res, status, body) => res.status(status).json(body);
function cors(req, res) {
  const origin = req.headers?.origin;
  let host = ""; try { host = new URL(origin).hostname; } catch {}
  const deploymentHost = String(process.env.VERCEL_URL || "");
  if (origin && (origin === "https://quantdeus.github.io" || origin === "https://quantdeus.vercel.app" || (deploymentHost && host === deploymentHost))) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type,x-telegram-init-data");
}
function timingSafeEqual(a, b) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && safeCompare(x, y);
}
async function hmac(keyBytes, message) {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return Buffer.from(await crypto.subtle.sign("HMAC", key, Buffer.from(message)));
}
async function telegramUser(raw) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) throw new Error("telegram_auth_unavailable");
  if (!raw) throw new Error("telegram_auth_invalid");
  const params = new URLSearchParams(raw), hash = params.get("hash"), authDate = Number(params.get("auth_date"));
  if (!hash || !Number.isFinite(authDate) || Math.abs(Date.now() / 1000 - authDate) > 86400) throw new Error("telegram_auth_invalid");
  const check = [...params.entries()].filter(([k]) => k !== "hash").sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("\n");
  const secret = await hmac(Buffer.from("WebAppData"), botToken);
  if (!timingSafeEqual((await hmac(secret, check)).toString("hex"), hash)) throw new Error("telegram_auth_invalid");
  try {
    const user = JSON.parse(params.get("user") || "{}");
    if (!user.id) throw new Error();
    return user;
  } catch { throw new Error("telegram_auth_invalid"); }
}
function roleFor(id) {
  const list = name => new Set(String(process.env[name] || "").split(",").map(x => x.trim()).filter(Boolean));
  if (list("QUANTDEUS_OWNER_TELEGRAM_IDS").has(String(id))) return "owner";
  if (list("QUANTDEUS_ADMIN_TELEGRAM_IDS").has(String(id))) return "admin";
  return "member";
}
async function github(repo, path, options = {}) {
  const token = process.env.QUANTDEUS_GITHUB_TOKEN;
  if (!token) throw new Error("github_storage_unconfigured");
  const response = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    ...options,
    headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", Authorization: `Bearer ${token}`, ...(options.headers || {}) }
  });
  const text = await response.text();
  let data; try { data = JSON.parse(text); } catch { data = {}; }
  if (!response.ok) throw new Error(`github_${response.status}`);
  return data;
}
function encodeContent(value) { return Buffer.from(JSON.stringify(value, null, 2) + "\n").toString("base64"); }
function decodeContent(value) { return JSON.parse(Buffer.from(String(value).replace(/\n/g, ""), "base64").toString("utf8")); }
async function catalog() {
  const ref = encodeURIComponent(process.env.VERCEL_GIT_COMMIT_REF || "main");
  const file = await github(PUBLIC_REPO, `/contents/store/products.json?ref=${ref}`);
  return decodeContent(file.content).products || [];
}
function writesEnabled() { return process.env.VERCEL_ENV === "production" || process.env.QD_ENABLE_PREVIEW_WRITES === "true"; }
async function readOrder(id) {
  const repo = process.env.QUANTDEUS_ORDERS_REPOSITORY || DEFAULT_PRIVATE_REPO;
  const path = `/contents/quantdeus-store/orders/${encodeURIComponent(id)}.json?ref=main`;
  const file = await github(repo, path);
  return { repo, path: path.split("?")[0], sha: file.sha, order: decodeContent(file.content) };
}
async function writeOrder(repo, path, order, sha) {
  const body = { message: `store: ${order.status} ${order.id}`, content: encodeContent(order), ...(sha ? { sha } : {}) };
  const apiPath = path.startsWith("/contents/") ? path : `/contents/${path}`;
  return github(repo, apiPath, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
async function customerRef(id) {
  const secret = process.env.QUANTDEUS_ORDER_HMAC_SECRET;
  if (!secret) throw new Error("order_hmac_unconfigured");
  return (await hmac(Buffer.from(secret), String(id))).toString("hex");
}
function sbpConfig() {
  const phone = process.env.SBP_PHONE, bank = process.env.SBP_BANK, recipient = process.env.SBP_RECIPIENT;
  return phone && bank && recipient ? { method: "СБП", phone, bank, recipient } : null;
}
const safeText = (value, max) => String(value || "")
  .trim()
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
  .slice(0, max);
function paymentFor(order) {
  return order?.pricing_mode === "quote" ? null : sbpConfig();
}
function safeMessage(error) {
  if (["github_storage_unconfigured", "order_hmac_unconfigured", "telegram_auth_unavailable", "telegram_auth_invalid"].includes(error.message)) return error.message;
  if (/^github_404$/.test(error.message)) return "order_not_found";
  return "store_backend_failed";
}

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  try {
    if (req.method === "GET" && req.query?.products === "1") return json(res, 200, { ok: true, products: await catalog() });
    if (req.method === "GET") {
      const user = await telegramUser(req.headers["x-telegram-init-data"]);
      const role = roleFor(user.id);
      if (req.query?.admin === "1") {
        if (role !== "owner" && role !== "admin") return json(res, 403, { ok: false, error: "forbidden" });
        const repo = process.env.QUANTDEUS_ORDERS_REPOSITORY || DEFAULT_PRIVATE_REPO;
        const entries = await github(repo, "/contents/quantdeus-store/orders?ref=main").catch(error => error.message === "github_404" ? [] : Promise.reject(error));
        const ids = entries.filter(x => x.type === "file" && x.name.endsWith(".json")).slice(0, 100);
        const results = await Promise.all(ids.map(async file => {
          try { return decodeContent((await github(repo, `/contents/${file.path}?ref=main`)).content); }
          catch { return null; }
        }));
        return json(res, 200, { ok: true, orders: results.filter(Boolean).sort((a, b) => b.created_at.localeCompare(a.created_at)) });
      }
      const id = String(req.query?.id || "");
      if (!/^[a-f0-9-]{20,40}$/i.test(id)) return json(res, 400, { ok: false, error: "invalid_order_id" });
      const found = await readOrder(id);
      if (role !== "owner" && role !== "admin" && found.order.customer_ref !== await customerRef(user.id)) return json(res, 404, { ok: false, error: "order_not_found" });
      return json(res, 200, { ok: true, order: found.order, payment: paymentFor(found.order) });
    }
    if (req.method !== "POST") return json(res, 405, { ok: false, error: "method_not_allowed" });
    const user = await telegramUser(req.headers["x-telegram-init-data"]), role = roleFor(user.id), body = req.body || {};
    if (!writesEnabled()) return json(res, 409, { ok: false, error: "preview_read_only" });
    if (body.action === "create") {
      const products = await catalog();
      const product = products.find(p => {
        if (p.id !== body.product_id || p.available !== true) return false;
        if (p.pricing_mode === "quote") return p.price_rub == null;
        return Number.isInteger(p.price_rub) && p.price_rub > 0;
      });
      if (!product) return json(res, 400, { ok: false, error: "product_unavailable" });

      const quote = product.pricing_mode === "quote";
      const requestNote = safeText(body.note, 1600);
      if (quote && requestNote.length < 5) return json(res, 400, { ok: false, error: "inquiry_note_required" });

      const id = randomUUID(), now = new Date().toISOString();
      const actorRef = await customerRef(user.id);
      const order = {
        id,
        product_id: product.id,
        product_name: product.name,
        pricing_mode: quote ? "quote" : "fixed",
        amount: quote ? null : product.price_rub,
        currency: "RUB",
        status: quote ? "inquiry_created" : "created",
        customer_ref: actorRef,
        ...(quote ? {
          request_note: requestNote,
          contact: {
            telegram_user_id: String(user.id),
            telegram_username: safeText(user.username, 64) || null,
            display_name: safeText([user.first_name, user.last_name].filter(Boolean).join(" "), 120) || "Telegram user"
          }
        } : {}),
        created_at: now,
        updated_at: now,
        audit: [{ actor_ref: actorRef, actor_role: role, action: quote ? "inquiry_created" : "created", at: now }]
      };
      const repo = process.env.QUANTDEUS_ORDERS_REPOSITORY || DEFAULT_PRIVATE_REPO;
      await writeOrder(repo, `quantdeus-store/orders/${id}.json`, order);
      return json(res, 201, {
        ok: true,
        order: {
          id,
          product_id: product.id,
          product_name: product.name,
          pricing_mode: order.pricing_mode,
          amount: order.amount,
          status: order.status,
          ...(quote ? { request_note: order.request_note } : {})
        },
        payment: paymentFor(order)
      });
    }
    const id = String(body.order_id || "");
    if (!/^[a-f0-9-]{20,40}$/i.test(id)) return json(res, 400, { ok: false, error: "invalid_order_id" });
    const found = await readOrder(id), order = found.order;
    const owner = role === "owner" || role === "admin";
    if (!owner && order.customer_ref !== await customerRef(user.id)) return json(res, 404, { ok: false, error: "order_not_found" });
    const now = new Date().toISOString();
    if (body.action === "cancel") {
      if (order.status === "cancelled") return json(res, 200, { ok: true, order, idempotent: true });
      if (!["created", "inquiry_created"].includes(order.status) && !(owner && order.status === "payment_pending")) return json(res, 409, { ok: false, error: "invalid_transition" });
      order.status = "cancelled";
      order.audit.push({ actor_ref: await customerRef(user.id), actor_role: role, action: "cancelled", at: now });
    } else if (body.action === "payment_submitted") {
      if (order.pricing_mode === "quote") return json(res, 409, { ok: false, error: "payment_not_applicable" });
      if (order.status === "payment_pending") return json(res, 200, { ok: true, order, payment: paymentFor(order), idempotent: true });
      if (order.status !== "created") return json(res, 409, { ok: false, error: "invalid_transition" });
      order.status = "payment_pending";
      order.audit.push({ actor_ref: await customerRef(user.id), actor_role: "member", action: "payment_submitted", at: now });
    } else if (body.action === "confirm" || body.action === "reject") {
      if (!owner) return json(res, 403, { ok: false, error: "forbidden" });
      if (order.status === (body.action === "confirm" ? "paid" : "rejected")) return json(res, 200, { ok: true, order, idempotent: true });
      if (order.status !== "payment_pending") return json(res, 409, { ok: false, error: "invalid_transition" });
      const note = String(body.note || "").trim().slice(0, 300);
      if (!note) return json(res, 400, { ok: false, error: "reason_required" });
      order.status = body.action === "confirm" ? "paid" : "rejected";
      order.audit.push({ actor_ref: await customerRef(user.id), actor_role: role, action: body.action, at: now, note });
    } else return json(res, 400, { ok: false, error: "unknown_action" });
    order.updated_at = now;
    await writeOrder(found.repo, found.path, order, found.sha);
    return json(res, 200, { ok: true, order, payment: paymentFor(order) });
  } catch (error) {
    const code = safeMessage(error);
    const status = ["github_storage_unconfigured", "order_hmac_unconfigured", "telegram_auth_unavailable"].includes(code) ? 503 : code === "order_not_found" ? 404 : code === "telegram_auth_invalid" ? 401 : 502;
    return json(res, status, { ok: false, error: code });
  }
}
