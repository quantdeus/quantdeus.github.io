import {
  createHash,
  createHmac,
  createPublicKey,
  timingSafeEqual,
  verify as verifySignature
} from "node:crypto";

const DEFAULT_CLIENT_ID = "8122160274";
const DEFAULT_BOT_USERNAME = "QuantDeus_bot";
const CONFIG_TTL_MS = 5 * 60 * 1000;
const JWKS_TTL_MS = 60 * 60 * 1000;
let configCache = null;
let configCachedAt = 0;
let jwksCache = null;
let jwksCachedAt = 0;

const clean = value => String(value ?? "").trim();
const same = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

function botToken() {
  return clean(
    process.env.TELEGRAM_BOT_TOKEN ||
    process.env.QUANTDEUS_TELEGRAM_BOT_TOKEN ||
    process.env.TELEGRAM_TOKEN ||
    process.env.TELEGRAM
  );
}

function normalizeUser(raw, kind) {
  const id = clean(raw?.id ?? raw?.sub);
  if (!id) throw new Error("telegram_auth_invalid");
  const firstName = clean(raw?.first_name ?? raw?.given_name);
  const lastName = clean(raw?.last_name ?? raw?.family_name);
  const username = clean(raw?.username ?? raw?.preferred_username).replace(/^@/, "");
  const name = clean(raw?.name) || [firstName, lastName].filter(Boolean).join(" ") || username || `Telegram #${id}`;
  return {
    id,
    first_name: firstName || null,
    last_name: lastName || null,
    username: username || null,
    name: name.slice(0, 120),
    picture: clean(raw?.photo_url ?? raw?.picture) || null,
    auth_kind: kind
  };
}

export function roleForTelegramId(id) {
  const list = name => new Set(clean(process.env[name]).split(",").map(x => x.trim()).filter(Boolean));
  const key = String(id);
  if (list("QUANTDEUS_OWNER_TELEGRAM_IDS").has(key)) return "owner";
  if (list("QUANTDEUS_ADMIN_TELEGRAM_IDS").has(key)) return "admin";
  if (list("QUANTDEUS_MODERATOR_TELEGRAM_IDS").has(key)) return "moderator";
  return "member";
}

export async function verifyMiniAppInitData(raw) {
  const token = botToken();
  if (!token) throw new Error("telegram_auth_unavailable");
  if (!raw) throw new Error("telegram_auth_invalid");
  const params = new URLSearchParams(raw);
  const hash = clean(params.get("hash"));
  const authDate = Number(params.get("auth_date"));
  if (!hash || !Number.isFinite(authDate) || Math.abs(Date.now() / 1000 - authDate) > 86400) {
    throw new Error("telegram_auth_invalid");
  }
  const dataCheck = [...params.entries()]
    .filter(([key]) => key !== "hash")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(token).digest();
  const calculated = createHmac("sha256", secretKey).update(dataCheck).digest("hex");
  if (!same(calculated, hash)) throw new Error("telegram_auth_invalid");
  let user;
  try { user = JSON.parse(params.get("user") || "{}"); }
  catch { throw new Error("telegram_auth_invalid"); }
  return normalizeUser(user, "miniapp");
}

export async function telegramPublicConfig() {
  const envClientId = clean(process.env.QUANTDEUS_TELEGRAM_CLIENT_ID);
  const envUsername = clean(process.env.QUANTDEUS_TELEGRAM_BOT_USERNAME);
  if (envClientId) return {
    configured: true,
    client_id: envClientId,
    username: envUsername || DEFAULT_BOT_USERNAME
  };

  if (configCache && Date.now() - configCachedAt < CONFIG_TTL_MS) return configCache;
  // Client ID and bot username are public identifiers. Keep a canonical local
  // fallback so production auth does not depend on GitHub API availability or
  // unauthenticated GitHub rate limits during cold starts.
  configCache = {
    configured: true,
    client_id: DEFAULT_CLIENT_ID,
    username: DEFAULT_BOT_USERNAME
  };
  configCachedAt = Date.now();
  return configCache;
}

async function fetchJson(url) {
  let response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "QuantDeus/1.0 (+https://quantdeus.github.io)"
      }
    });
  } catch {
    throw new Error("telegram_oidc_unavailable");
  }
  if (!response.ok) throw new Error("telegram_oidc_unavailable");
  const data = await response.json().catch(() => null);
  if (!data) throw new Error("telegram_oidc_unavailable");
  return data;
}

async function telegramJwks() {
  if (jwksCache && Date.now() - jwksCachedAt < JWKS_TTL_MS) return jwksCache;
  let data;
  try {
    data = await fetchJson("https://oauth.telegram.org/.well-known/jwks.json");
  } catch {
    // Discovery fallback keeps us compatible if Telegram changes the JWKS URI.
    const discovery = await fetchJson("https://oauth.telegram.org/.well-known/openid-configuration");
    if (!clean(discovery?.jwks_uri)) throw new Error("telegram_oidc_unavailable");
    data = await fetchJson(discovery.jwks_uri);
  }
  if (!Array.isArray(data?.keys) || data.keys.length === 0) throw new Error("telegram_oidc_unavailable");
  jwksCache = data;
  jwksCachedAt = Date.now();
  return data;
}

export async function telegramAuthHealth() {
  const config = await telegramPublicConfig();
  const jwks = await telegramJwks();
  return {
    configured: Boolean(config?.configured && config?.client_id),
    client_id: String(config.client_id),
    username: config.username || null,
    jwks_keys: jwks.keys.length
  };
}

function decodePart(part) {
  try { return JSON.parse(Buffer.from(part, "base64url").toString("utf8")); }
  catch { throw new Error("telegram_auth_invalid"); }
}

export async function verifyOidcIdToken(token) {
  const parts = clean(token).split(".");
  if (parts.length !== 3) throw new Error("telegram_auth_invalid");
  const header = decodePart(parts[0]), payload = decodePart(parts[1]);
  if (header.alg !== "RS256" || !clean(header.kid)) throw new Error("telegram_auth_invalid");

  const [config, jwks] = await Promise.all([telegramPublicConfig(), telegramJwks()]);
  const jwk = jwks.keys.find(key => key.kid === header.kid);
  if (!jwk) throw new Error("telegram_auth_invalid");

  let key;
  try { key = createPublicKey({ key: jwk, format: "jwk" }); }
  catch { throw new Error("telegram_auth_invalid"); }
  const ok = verifySignature(
    "RSA-SHA256",
    Buffer.from(`${parts[0]}.${parts[1]}`),
    key,
    Buffer.from(parts[2], "base64url")
  );
  if (!ok) throw new Error("telegram_auth_invalid");

  const now = Math.floor(Date.now() / 1000);
  const audience = Array.isArray(payload.aud) ? payload.aud.map(String) : [String(payload.aud || "")];
  if (
    payload.iss !== "https://oauth.telegram.org" ||
    !audience.includes(String(config.client_id)) ||
    !Number.isFinite(Number(payload.exp)) ||
    Number(payload.exp) < now - 30 ||
    (payload.iat && Number(payload.iat) > now + 300)
  ) throw new Error("telegram_auth_invalid");

  return normalizeUser(payload, "oidc");
}

export async function requestTelegramIdentity(req, { optional = false } = {}) {
  const initData = clean(req.headers?.["x-telegram-init-data"]);
  if (initData) return verifyMiniAppInitData(initData);

  const authorization = clean(req.headers?.authorization);
  if (/^Bearer\s+/i.test(authorization)) {
    return verifyOidcIdToken(authorization.replace(/^Bearer\s+/i, ""));
  }

  if (optional) return null;
  throw new Error("telegram_auth_invalid");
}

export function publicTelegramUser(user) {
  return {
    id: String(user.id),
    name: user.name,
    username: user.username,
    picture: user.picture,
    auth_kind: user.auth_kind
  };
}

export function anonymousCustomerRef(seed) {
  return "anon-" + createHash("sha256").update(String(seed)).digest("hex").slice(0, 24);
}
