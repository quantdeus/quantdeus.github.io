import { publicTelegramUser, requestTelegramIdentity, roleForTelegramId, telegramAuthHealth } from "../../lib/telegram-auth.js";

const json = (res, status, body) => res.status(status).json(body);
function cors(req, res) {
  const origin = req.headers?.origin;
  let host = ""; try { host = new URL(origin).hostname; } catch {}
  const deploymentHost = String(process.env.VERCEL_URL || "");
  if (origin && (
    origin === "https://quantdeus.github.io" ||
    origin === "https://quantdeus.vercel.app" ||
    (deploymentHost && host === deploymentHost)
  )) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type,x-telegram-init-data,authorization");
}

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return json(res, 405, { ok: false, error: "method_not_allowed" });
  try {
    if (req.query?.health === "1") {
      const health = await telegramAuthHealth();
      return json(res, 200, { ok: true, ...health });
    }
    const user = await requestTelegramIdentity(req);
    return json(res, 200, {
      ok: true,
      user: publicTelegramUser(user),
      role: roleForTelegramId(user.id)
    });
  } catch (error) {
    const code = String(error?.message || "telegram_auth_invalid");
    console.warn("[telegram-auth]", code);
    const status = ["telegram_auth_unavailable", "telegram_oidc_unavailable", "telegram_oidc_unconfigured"].includes(code) ? 503 : 401;
    return json(res, status, { ok: false, error: code });
  }
}
