import {
  issueTelegramLoginRequest,
  telegramBotAuthHealth,
  verifyTelegramBotAssertion
} from "../../lib/telegram-bot-auth.js";

const json = (res, status, body) => res.status(status).json(body);

function cors(req, res) {
  const origin = req.headers?.origin;
  const allowed = telegramBotAuthHealth().site_origin;
  if (origin && (origin === allowed || origin === "https://playground.wordpress.net")) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type,authorization");
}

function redirect(res, location) {
  res.statusCode = 302;
  res.setHeader("Location", location);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.end();
}

function bearer(req) {
  const value = String(req.headers?.authorization || "").trim();
  return /^Bearer\s+/i.test(value) ? value.replace(/^Bearer\s+/i, "").trim() : "";
}

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method === "GET" && req.query?.health === "1") {
    return json(res, 200, { ok: true, ...telegramBotAuthHealth() });
  }

  if (req.method === "GET" && (req.query?.action === "start" || req.query?.start === "1")) {
    try {
      const request = issueTelegramLoginRequest();
      if (req.query?.format === "json") {
        return json(res, 200, { ok: true, ...request, username: telegramBotAuthHealth().username });
      }
      return redirect(res, request.bot_url);
    } catch (error) {
      const code = String(error?.message || "telegram_bot_auth_unavailable");
      return json(res, 503, { ok: false, error: code, ...telegramBotAuthHealth() });
    }
  }

  if (req.method === "POST" || (req.method === "GET" && req.query?.action === "verify")) {
    try {
      const user = verifyTelegramBotAssertion(bearer(req));
      return json(res, 200, { ok: true, user, role: "member" });
    } catch (error) {
      const code = String(error?.message || "telegram_bot_assertion_invalid");
      const status = code === "telegram_bot_auth_unconfigured" ? 503 : 401;
      return json(res, status, { ok: false, error: code });
    }
  }

  return json(res, 405, { ok: false, error: "method_not_allowed" });
}
