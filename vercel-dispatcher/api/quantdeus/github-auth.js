import {
  completeGithubOAuth,
  githubAuthConfig,
  githubAuthHealth,
  githubAuthorizationUrl,
  verifyGithubAssertion
} from "../../lib/github-auth.js";

const json = (res, status, body) => res.status(status).json(body);

function cors(req, res) {
  const origin = req.headers?.origin;
  const allowed = githubAuthConfig().canonical_origin;
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

function callbackErrorUrl(code) {
  const config = githubAuthConfig();
  const url = new URL(config.canonical_origin + "/");
  url.searchParams.set("qd_github_error", code);
  return url.toString();
}

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method === "GET" && (req.query?.health === "1" || req.query?.action === "config")) {
    return json(res, 200, { ok: true, ...githubAuthHealth() });
  }

  if (req.method === "GET" && (req.query?.action === "start" || req.query?.start === "1")) {
    try {
      return redirect(res, githubAuthorizationUrl(req.query?.return_to));
    } catch (error) {
      const code = String(error?.message || "github_oauth_unavailable");
      console.warn("[github-auth-start]", code);
      return json(res, 503, { ok: false, error: code, ...githubAuthHealth() });
    }
  }

  if (req.method === "GET" && req.query?.code) {
    try {
      const result = await completeGithubOAuth(req.query.code, req.query?.state);
      const target = new URL(result.return_to);
      target.searchParams.set("qd_github_assertion", result.assertion);
      return redirect(res, target.toString());
    } catch (error) {
      const code = String(error?.message || "github_oauth_failed");
      console.warn("[github-auth-callback]", code);
      return redirect(res, callbackErrorUrl(code));
    }
  }

  if (req.method === "POST" || (req.method === "GET" && req.query?.action === "verify")) {
    try {
      const user = await verifyGithubAssertion(bearer(req));
      return json(res, 200, { ok: true, user, role: user.role, permission: user.permission });
    } catch (error) {
      const code = String(error?.message || "github_assertion_invalid");
      console.warn("[github-auth-verify]", code);
      const status = [
        "github_oauth_unconfigured",
        "github_permission_check_failed"
      ].includes(code) ? 503 : 401;
      return json(res, status, { ok: false, error: code });
    }
  }

  if (req.method === "GET") {
    return json(res, 200, { ok: true, ...githubAuthHealth() });
  }
  return json(res, 405, { ok: false, error: "method_not_allowed" });
}
