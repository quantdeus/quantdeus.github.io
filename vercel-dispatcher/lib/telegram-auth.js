import { createHmac, timingSafeEqual } from "node:crypto";

const utf8 = value => Buffer.from(String(value), "utf8");
const b64url = value => Buffer.from(value).toString("base64url");
const fromB64url = value => Buffer.from(String(value), "base64url");
const nowSeconds = () => Math.floor(Date.now() / 1000);

function sessionSecret() {
  return String(process.env.QUANTDEUS_SESSION_SECRET || process.env.QUANTDEUS_ORDER_HMAC_SECRET || "").trim();
}

function hmacHex(key, message) {
  return createHmac("sha256", key).update(message).digest("hex");
}

function hmacB64(key, message) {
  return createHmac("sha256", key).update(message).digest("base64url");
}

function safeEqualText(a, b) {
  const x = utf8(a), y = utf8(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function cleanUser(user) {
  const id = String(user?.id || user?.sub || "").trim();
  if (!/^\d+$/.test(id)) throw new Error("telegram_auth_invalid");
  const safe = (value, max) => String(value || "").trim().slice(0, max);
  return {
    id,
    first_name: safe(user.first_name || user.given_name, 80),
    last_name: safe(user.last_name || user.family_name, 80),
    username: safe(user.username || user.preferred_username, 64),
    photo_url: safe(user.photo_url || user.picture, 500)
  };
}

export function publicAuthConfig() {
  const clientId = String(process.env.TELEGRAM_OAUTH_CLIENT_ID || "").trim();
  return { configured: Boolean(clientId), client_id: clientId || null };
}

export function issueWebSession(user, ttlSeconds = 60 * 60 * 12) {
  const secret = sessionSecret();
  if (!secret) throw new Error("telegram_session_unavailable");
  const normalized = cleanUser(user);
  const now = nowSeconds();
  const payload = {
    v: 1,
    sub: normalized.id,
    user: normalized,
    iat: now,
    exp: now + Math.max(300, Math.min(60 * 60 * 24 * 7, Number(ttlSeconds) || 43200))
  };
  const part = b64url(JSON.stringify(payload));
  return `v1.${part}.${hmacB64(secret, "v1." + part)}`;
}

export function verifyWebSession(token) {
  const secret = sessionSecret();
  if (!secret) throw new Error("telegram_session_unavailable");
  const [version, part, signature] = String(token || "").split(".");
  if (version !== "v1" || !part || !signature) throw new Error("telegram_auth_invalid");
  const expected = hmacB64(secret, "v1." + part);
  if (!safeEqualText(expected, signature)) throw new Error("telegram_auth_invalid");
  let payload;
  try { payload = JSON.parse(fromB64url(part).toString("utf8")); }
  catch { throw new Error("telegram_auth_invalid"); }
  const now = nowSeconds();
  if (payload?.v !== 1 || !payload?.exp || payload.exp < now || payload.iat > now + 60) throw new Error("telegram_auth_invalid");
  return cleanUser(payload.user || { id: payload.sub });
}

export async function verifyMiniAppInitData(raw) {
  const botToken = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!botToken) throw new Error("telegram_auth_unavailable");
  if (!raw) throw new Error("telegram_auth_invalid");
  const params = new URLSearchParams(raw);
  const hash = params.get("hash");
  const authDate = Number(params.get("auth_date"));
  if (!hash || !Number.isFinite(authDate) || Math.abs(Date.now() / 1000 - authDate) > 86400) throw new Error("telegram_auth_invalid");
  const check = [...params.entries()]
    .filter(([key]) => key !== "hash")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const calculated = hmacHex(secretKey, check);
  if (!safeEqualText(calculated, hash)) throw new Error("telegram_auth_invalid");
  let user;
  try { user = JSON.parse(params.get("user") || "{}"); }
  catch { throw new Error("telegram_auth_invalid"); }
  return cleanUser(user);
}

export async function authenticateTelegramRequest(req, { optional = false } = {}) {
  const initData = String(req.headers?.["x-telegram-init-data"] || "").trim();
  if (initData) return { user: await verifyMiniAppInitData(initData), method: "mini_app" };

  const bearer = String(req.headers?.authorization || "").match(/^Bearer\s+(.+)$/i)?.[1]
    || String(req.headers?.["x-telegram-session"] || "").trim();
  if (bearer) return { user: verifyWebSession(bearer), method: "web_session" };

  if (optional) return null;
  throw new Error("telegram_auth_invalid");
}

function decodeJwtPart(part) {
  try { return JSON.parse(fromB64url(part).toString("utf8")); }
  catch { throw new Error("telegram_oidc_invalid"); }
}

export async function verifyTelegramOidcIdToken(token) {
  const clientId = String(process.env.TELEGRAM_OAUTH_CLIENT_ID || "").trim();
  if (!clientId) throw new Error("telegram_oidc_unconfigured");
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw new Error("telegram_oidc_invalid");
  const header = decodeJwtPart(parts[0]);
  const payload = decodeJwtPart(parts[1]);
  if (header.alg !== "RS256" || !header.kid) throw new Error("telegram_oidc_invalid");

  const jwksResponse = await fetch("https://oauth.telegram.org/.well-known/jwks.json", { cache: "no-store" });
  if (!jwksResponse.ok) throw new Error("telegram_oidc_jwks_failed");
  const jwks = await jwksResponse.json();
  const jwk = (jwks.keys || []).find(key => key.kid === header.kid);
  if (!jwk) throw new Error("telegram_oidc_invalid");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    fromB64url(parts[2]),
    utf8(parts[0] + "." + parts[1])
  );
  if (!ok) throw new Error("telegram_oidc_invalid");

  const now = nowSeconds();
  const audiences = Array.isArray(payload.aud) ? payload.aud.map(String) : [String(payload.aud || "")];
  if (payload.iss !== "https://oauth.telegram.org" || !audiences.includes(clientId)) throw new Error("telegram_oidc_invalid");
  if (!payload.exp || payload.exp < now - 30 || (payload.nbf && payload.nbf > now + 30)) throw new Error("telegram_oidc_invalid");
  return cleanUser({
    id: payload.id || payload.sub,
    first_name: payload.given_name,
    last_name: payload.family_name,
    username: payload.preferred_username,
    photo_url: payload.picture
  });
}

export function authErrorStatus(code) {
  if (["telegram_auth_unavailable", "telegram_session_unavailable", "telegram_oidc_unconfigured"].includes(code)) return 503;
  if (["telegram_auth_invalid", "telegram_oidc_invalid"].includes(code)) return 401;
  if (code === "telegram_oidc_jwks_failed") return 502;
  return 502;
}
