import { timingSafeEqual as safeCompare } from "node:crypto";

const REPO = "quantdeus/quantdeus.github.io";
const FORUM_MARKER = "<!-- quantdeus-forum:v1 -->";
const CATEGORIES = new Set(["news", "science", "space", "products", "community"]);
const writesEnabled = () => process.env.VERCEL_ENV === "production" || process.env.QD_ENABLE_PREVIEW_WRITES === "true";

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
  const params = new URLSearchParams(raw);
  const hash = params.get("hash");
  const authDate = Number(params.get("auth_date"));
  if (!hash || !Number.isFinite(authDate) || Math.abs(Date.now() / 1000 - authDate) > 86400) throw new Error("telegram_auth_invalid");
  const dataCheck = [...params.entries()].filter(([key]) => key !== "hash").sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("\n");
  const secretKey = await hmac(Buffer.from("WebAppData"), botToken);
  const calculated = (await hmac(secretKey, dataCheck)).toString("hex");
  if (!timingSafeEqual(calculated, hash)) throw new Error("telegram_auth_invalid");
  let user;
  try { user = JSON.parse(params.get("user") || "{}"); } catch { throw new Error("telegram_auth_invalid"); }
  if (!user.id) throw new Error("telegram_auth_invalid");
  return user;
}
function roleFor(id) {
  const owners = new Set(String(process.env.QUANTDEUS_OWNER_TELEGRAM_IDS || "").split(",").map(x => x.trim()).filter(Boolean));
  const admins = new Set(String(process.env.QUANTDEUS_ADMIN_TELEGRAM_IDS || "").split(",").map(x => x.trim()).filter(Boolean));
  const moderators = new Set(String(process.env.QUANTDEUS_MODERATOR_TELEGRAM_IDS || "").split(",").map(x => x.trim()).filter(Boolean));
  if (owners.has(String(id))) return "owner";
  if (admins.has(String(id))) return "admin";
  if (moderators.has(String(id))) return "moderator";
  return "member";
}
async function github(path, options = {}) {
  const token = process.env.QUANTDEUS_GITHUB_TOKEN;
  if (!token) throw new Error("github_storage_unconfigured");
  const response = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    ...options,
    headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", Authorization: `Bearer ${token}`, ...(options.headers || {}) }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`github_${response.status}`);
  return body;
}
const clean = value => String(value || "").trim();
const safeText = (value, max) => clean(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(/<!--\s*(?:quantdeus-forum|qd:)[\s\S]*?-->/gi, "").slice(0, max);

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method === "GET") {
    try {
      if (req.query?.me === "1") {
        const user = await telegramUser(req.headers["x-telegram-init-data"]);
        return json(res, 200, { ok: true, role: roleFor(user.id) });
      }
      const staffRoles = new Set(["owner", "admin", "moderator"]);
      const includeHidden = req.query?.moderation === "1";
      let moderationRole = null;
      if (includeHidden) {
        const user = await telegramUser(req.headers["x-telegram-init-data"]);
        moderationRole = roleFor(user.id);
        if (!staffRoles.has(moderationRole)) return json(res, 403, { ok: false, error: "forbidden" });
      }

      const threadId = clean(req.query?.id);
      if (threadId) {
        const id = Number(threadId);
        if (!Number.isInteger(id) || id <= 0) return json(res, 400, { ok: false, error: "invalid_thread_id" });
        const issue = await github(`/issues/${id}`).catch(error => error.message === "github_404" ? null : Promise.reject(error));
        if (!issue || issue.pull_request || !String(issue.body || "").includes(FORUM_MARKER)) {
          return json(res, 404, { ok: false, error: "thread_not_found" });
        }
        const hidden = String(issue.body || "").includes("<!-- qd:hidden -->");
        if (hidden) {
          let role = moderationRole;
          if (!role) {
            try {
              const user = await telegramUser(req.headers["x-telegram-init-data"]);
              role = roleFor(user.id);
            } catch {}
          }
          if (!staffRoles.has(role)) return json(res, 404, { ok: false, error: "thread_not_found" });
        }
        const comments = await github(`/issues/${id}/comments?per_page=100`);
        return json(res, 200, { ok: true, thread: issue, replies: comments });
      }

      const issues = await github("/issues?state=all&per_page=100&sort=updated&direction=desc");
      const threads = issues.filter(x => !x.pull_request && String(x.body || "").includes(FORUM_MARKER) && (includeHidden || !String(x.body || "").includes("<!-- qd:hidden -->")));
      if (req.query?.reports === "1") {
        const user = await telegramUser(req.headers["x-telegram-init-data"]), role = roleFor(user.id);
        if (!staffRoles.has(role)) return json(res, 403, { ok: false, error: "forbidden" });
        const reports = [];
        for (const issue of threads.slice(0, 50)) {
          const comments = await github(`/issues/${issue.number}/comments?per_page=100`);
          for (const comment of comments.filter(x => String(x.body || "").startsWith("**Жалоба участника**"))) reports.push({ thread_id: issue.number, title: issue.title, comment });
        }
        return json(res, 200, { ok: true, reports });
      }
      return json(res, 200, { ok: true, threads: threads.map(({ number, title, body, created_at, updated_at, comments, state }) => ({ number, title: String(title).replace(/^\[PINNED\]\s*/, ""), pinned: String(title).startsWith("[PINNED] "), hidden: String(body).includes("<!-- qd:hidden -->"), category: (String(body).match(/<!-- qd:category=([a-z-]+) -->/) || [])[1] || "community", body: body.split(FORUM_MARKER)[0].replace(/<!-- qd:[^>]* -->/g, "").trim(), created_at, updated_at, comments, state })).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updated_at.localeCompare(a.updated_at)) });
    } catch (error) {
      const status = ["github_storage_unconfigured", "telegram_auth_unavailable"].includes(error.message) ? 503 : error.message === "telegram_auth_invalid" ? 401 : 502;
      return json(res, status, { ok: false, error: error.message || "forum_read_failed" });
    }
  }
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "method_not_allowed" });
  let user;
  try { user = await telegramUser(req.headers["x-telegram-init-data"]); }
  catch (error) { return json(res, error.message === "telegram_auth_unavailable" ? 503 : 401, { ok: false, error: error.message }); }
  if (!writesEnabled()) return json(res, 409, { ok: false, error: "preview_read_only" });
  const body = req.body || {};
  const action = safeText(body.action, 20);
  try {
    if (action === "thread") {
      const title = safeText(body.title, 120), text = safeText(body.text, 8000), category = safeText(body.category, 30);
      if (title.length < 5 || text.length < 10 || !CATEGORIES.has(category)) return json(res, 400, { ok: false, error: "invalid_thread" });
      const author = safeText([user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || "Участник", 80);
      const issue = await github("/issues", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: `[FORUM] ${title}`, body: `${text}\n\n${FORUM_MARKER}\n<!-- qd:category=${category} -->\n<!-- qd:author=${author.replace(/-->/g, "") } -->` }) });
      return json(res, 201, { ok: true, thread: { number: issue.number, url: issue.html_url } });
    }
    if (action === "reply") {
      const id = Number(body.thread_id), text = safeText(body.text, 8000);
      if (!Number.isInteger(id) || id <= 0 || text.length < 2) return json(res, 400, { ok: false, error: "invalid_reply" });
      const issue = await github(`/issues/${id}`);
      if (!String(issue.body || "").includes(FORUM_MARKER) || issue.state !== "open") return json(res, 409, { ok: false, error: "thread_closed" });
      const author = safeText([user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || "Участник", 80).replace(/-->/g, "");
      const reply = await github(`/issues/${id}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: `**${author}**\n\n${text}` }) });
      return json(res, 201, { ok: true, reply: { id: reply.id, created_at: reply.created_at } });
    }
    if (action === "moderate") {
      const role = roleFor(user.id);
      if (!new Set(["owner", "admin", "moderator"]).has(role)) return json(res, 403, { ok: false, error: "forbidden" });
      const id = Number(body.thread_id), command = safeText(body.command, 20);
      if (!Number.isInteger(id) || id <= 0 || !["lock", "unlock", "hide", "restore", "pin", "unpin", "move"].includes(command)) return json(res, 400, { ok: false, error: "invalid_moderation" });
      if (command === "move" && role === "moderator") return json(res, 403, { ok: false, error: "forbidden" });
      const auditSecret = process.env.QUANTDEUS_ORDER_HMAC_SECRET;
      if (!auditSecret) return json(res, 503, { ok: false, error: "order_hmac_unconfigured" });
      const issue = await github(`/issues/${id}`);
      if (!String(issue.body || "").includes(FORUM_MARKER)) return json(res, 404, { ok: false, error: "thread_not_found" });
      const patched = { state: command === "lock" ? "closed" : command === "unlock" ? "open" : issue.state };
      if (command === "hide") patched.body = `${issue.body}\n<!-- qd:hidden -->`;
      if (command === "restore") patched.body = String(issue.body).replace("<!-- qd:hidden -->", "");
      if (command === "pin") patched.title = String(issue.title).startsWith("[PINNED] ") ? issue.title : `[PINNED] ${issue.title}`;
      if (command === "unpin") patched.title = String(issue.title).replace(/^\[PINNED\]\s*/, "");
      if (command === "move") {
        const category = safeText(body.category, 30);
        if (!CATEGORIES.has(category)) return json(res, 400, { ok: false, error: "invalid_category" });
        patched.body = String(issue.body).replace(/<!-- qd:category=[a-z-]+ -->/, `<!-- qd:category=${category} -->`);
      }
      const actor = role;
      const actorRef = (await hmac(Buffer.from(auditSecret), String(user.id))).toString("hex").slice(0, 16);
      const timestamp = new Date().toISOString();
      patched.body = `${patched.body ?? issue.body}\n\n<!-- qd-audit: action=${command} actor=${actorRef} role=${actor} at=${timestamp} result=success -->`;
      const updated = await github(`/issues/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patched) });
      return json(res, 200, { ok: true, thread: { number: updated.number, state: updated.state } });
    }
    if (action === "report") {
      const id = Number(body.thread_id), reason = safeText(body.reason, 500);
      if (!Number.isInteger(id) || id <= 0 || reason.length < 5) return json(res, 400, { ok: false, error: "invalid_report" });
      const issue = await github(`/issues/${id}`);
      if (!String(issue.body || "").includes(FORUM_MARKER)) return json(res, 404, { ok: false, error: "thread_not_found" });
      await github(`/issues/${id}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: `**Жалоба участника**\n\n${reason}` }) });
      return json(res, 201, { ok: true });
    }
    return json(res, 400, { ok: false, error: "unknown_action" });
  } catch (error) {
    return json(res, error.message === "github_storage_unconfigured" ? 503 : 502, { ok: false, error: error.message || "forum_write_failed" });
  }
}
