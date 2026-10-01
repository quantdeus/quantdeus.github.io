import {
  authErrorStatus,
  authenticateTelegramRequest,
  issueWebSession,
  publicAuthConfig,
  verifyTelegramOidcIdToken
} from "../../lib/telegram-auth.js";

const json = (res, status, body) => res.status(status).json(body);

function cors(req, res) {
  const origin = req.headers?.origin;
  let host = "";
  try { host = new URL(origin).hostname; } catch {}
  const deploymentHost = String(process.env.VERCEL_URL || "");
  if (origin && (
    origin === "https://quantdeus.github.io" ||
    origin === "https://quantdeus.vercel.app" ||
    (deploymentHost && host === deploymentHost)
  )) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type,authorization,x-telegram-session,x-telegram-init-data");
}

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method === "GET") {
    if (req.query?.me === "1") {
      try {
        const auth = await authenticateTelegramRequest(req);
        return json(res, 200, { ok: true, user: auth.user, method: auth.method });
      } catch (error) {
        return json(res, authErrorStatus(error.message), { ok: false, error: error.message });
      }
    }
    return json(res, 200, { ok: true, ...publicAuthConfig() });
  }

  if (req.method !== "POST") return json(res, 405, { ok: false, error: "method_not_allowed" });
  try {
    const idToken = String(req.body?.id_token || "").trim();
    if (!idToken) return json(res, 400, { ok: false, error: "id_token_required" });
    const user = await verifyTelegramOidcIdToken(idToken);
    const session_token = issueWebSession(user);
    return json(res, 200, {
      ok: true,
      session_token,
      expires_in: 43200,
      user
    });
  } catch (error) {
    return json(res, authErrorStatus(error.message), { ok: false, error: error.message || "telegram_login_failed" });
  }
}
