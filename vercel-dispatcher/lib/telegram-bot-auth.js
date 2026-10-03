import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const DEFAULT_BOT_USERNAME = "QuantDeus_bot";
const DEFAULT_SITE_ORIGIN = "https://quantdeus.whf.bz";
const REQUEST_TTL_SECONDS = 10 * 60;
const ASSERTION_TTL_SECONDS = 5 * 60;

const clean = value => String(value ?? "").trim();

function botToken() {
  return clean(
    process.env.TELEGRAM_BOT_TOKEN ||
    process.env.QUANTDEUS_TELEGRAM_BOT_TOKEN ||
    process.env.TELEGRAM ||
    process.env.Telegram_bot_token ||
    process.env.TELEGRAM_TOKEN
  );
}

export function telegramBotUsername() {
  return clean(process.env.QUANTDEUS_TELEGRAM_BOT_USERNAME) || DEFAULT_BOT_USERNAME;
}

export function telegramSiteOrigin() {
  return clean(process.env.QUANTDEUS_CANONICAL_ORIGIN) || DEFAULT_SITE_ORIGIN;
}

function key(label) {
  const token = botToken();
  if (!token) throw new Error("telegram_bot_auth_unconfigured");
  return createHash("sha256").update("quantdeus-bot-auth|" + label + "|" + token).digest();
}

function safeEqual(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function hmac(label, value, bytes = 16) {
  return createHmac("sha256", key(label)).update(value).digest().subarray(0, bytes);
}

export function telegramBotAuthHealth() {
  return {
    configured: Boolean(botToken()),
    username: telegramBotUsername(),
    site_origin: telegramSiteOrigin()
  };
}

export function issueTelegramLoginRequest() {
  if (!botToken()) throw new Error("telegram_bot_auth_unconfigured");
  const exp = Math.floor(Date.now() / 1000) + REQUEST_TTL_SECONDS;
  const body = Buffer.allocUnsafe(12);
  body.writeUInt32BE(exp, 0);
  randomBytes(8).copy(body, 4);
  const sig = hmac("request", body, 12);
  const token = Buffer.concat([body, sig]).toString("base64url");
  return {
    start_payload: "qdl_" + token,
    bot_url: "https://t.me/" + telegramBotUsername() + "?start=qdl_" + token,
    expires_in: REQUEST_TTL_SECONDS
  };
}

export function verifyTelegramLoginRequest(startPayload) {
  const value = clean(startPayload);
  if (!value.startsWith("qdl_")) throw new Error("telegram_bot_login_request_invalid");
  let raw;
  try { raw = Buffer.from(value.slice(4), "base64url"); }
  catch { throw new Error("telegram_bot_login_request_invalid"); }
  if (raw.length !== 24) throw new Error("telegram_bot_login_request_invalid");
  const body = raw.subarray(0, 12);
  const sig = raw.subarray(12);
  const expected = hmac("request", body, 12);
  if (!safeEqual(sig, expected)) throw new Error("telegram_bot_login_request_invalid");
  const exp = body.readUInt32BE(0);
  const now = Math.floor(Date.now() / 1000);
  if (exp < now || exp > now + REQUEST_TTL_SECONDS + 60) throw new Error("telegram_bot_login_request_expired");
  return { exp };
}

function compactUser(raw) {
  const id = clean(raw?.id);
  if (!id) throw new Error("telegram_bot_user_invalid");
  return {
    id,
    u: clean(raw?.username).replace(/^@/, "").slice(0, 40),
    n: clean(raw?.first_name || raw?.name).slice(0, 32)
  };
}

export function issueTelegramBotAssertion(rawUser) {
  const user = compactUser(rawUser);
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    t: "qdt",
    i: now,
    e: now + ASSERTION_TTL_SECONDS,
    d: user.id,
    u: user.u || undefined,
    n: user.n || undefined,
    x: randomBytes(8).toString("base64url")
  };
  const body = Buffer.from(JSON.stringify(payload));
  const sig = hmac("assertion", body, 16);
  return Buffer.concat([body, sig]).toString("base64url");
}

export function verifyTelegramBotAssertion(token) {
  let raw;
  try { raw = Buffer.from(clean(token), "base64url"); }
  catch { throw new Error("telegram_bot_assertion_invalid"); }
  if (raw.length < 20) throw new Error("telegram_bot_assertion_invalid");
  const body = raw.subarray(0, raw.length - 16);
  const sig = raw.subarray(raw.length - 16);
  const expected = hmac("assertion", body, 16);
  if (!safeEqual(sig, expected)) throw new Error("telegram_bot_assertion_invalid");

  let payload;
  try { payload = JSON.parse(body.toString("utf8")); }
  catch { throw new Error("telegram_bot_assertion_invalid"); }

  const now = Math.floor(Date.now() / 1000);
  if (
    payload?.t !== "qdt" ||
    !payload?.d ||
    !Number.isFinite(Number(payload?.e)) ||
    Number(payload.e) < now ||
    Number(payload.e) > now + ASSERTION_TTL_SECONDS + 60
  ) throw new Error("telegram_bot_assertion_invalid");

  const name = clean(payload.n) || clean(payload.u) || "Telegram #" + clean(payload.d);
  return {
    id: clean(payload.d),
    name,
    username: clean(payload.u) || null,
    picture: null,
    auth_kind: "store-bot"
  };
}

export function telegramReturnUrl(assertion) {
  const url = new URL(telegramSiteOrigin() + "/login/");
  url.searchParams.set("qd_telegram_assertion", assertion);
  return url.toString();
}
