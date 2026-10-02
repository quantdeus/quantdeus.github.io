import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual
} from "node:crypto";

const DEFAULT_REPOSITORY = "quantdeus/quantdeus.github.io";
const DEFAULT_SITE_ORIGIN = "https://quantdeus.github.io";
const DEFAULT_CALLBACK_URL = "https://quantdeus.vercel.app/api/quantdeus/github-auth";
const STATE_TTL_SECONDS = 10 * 60;
const ASSERTION_TTL_SECONDS = 8 * 60 * 60;

const clean = value => String(value ?? "").trim();
const firstEnv = names => {
  for (const name of names) {
    const value = clean(process.env[name]);
    if (value) return value;
  }
  return "";
};

function oauthClientId() {
  return firstEnv([
    "QUANTDEUS_GITHUB_OAUTH_CLIENT_ID",
    "QD_GITHUB_CLIENT_ID",
    "GITHUB_OAUTH_CLIENT_ID",
    "GITHUB_CLIENT_ID",
    "GITHUB_ID"
  ]);
}

function oauthClientSecret() {
  return firstEnv([
    "QUANTDEUS_GITHUB_OAUTH_CLIENT_SECRET",
    "QD_GITHUB_CLIENT_SECRET",
    "GITHUB_OAUTH_CLIENT_SECRET",
    "GITHUB_CLIENT_SECRET",
    "GITHUB_SECRET"
  ]);
}

function serviceToken() {
  return firstEnv(["QUANTDEUS_GITHUB_TOKEN"]);
}

function signingSecret() {
  return firstEnv(["QUANTDEUS_GITHUB_ASSERTION_SECRET"]) || oauthClientSecret();
}

export function githubAuthConfig() {
  const client_id = oauthClientId();
  const client_secret = oauthClientSecret();
  const verifier_token = serviceToken();
  const repository = firstEnv(["QUANTDEUS_GITHUB_ADMIN_REPOSITORY", "QD_GITHUB_ADMIN_REPOSITORY"]) || DEFAULT_REPOSITORY;
  const canonical_origin = firstEnv(["QUANTDEUS_CANONICAL_ORIGIN"]) || DEFAULT_SITE_ORIGIN;
  const callback_url = firstEnv(["QUANTDEUS_GITHUB_OAUTH_CALLBACK_URL"]) || DEFAULT_CALLBACK_URL;
  const oauth_configured = Boolean(client_id && client_secret);
  const assertion_signing_configured = Boolean(signingSecret());
  return {
    client_id,
    client_secret,
    verifier_token,
    repository,
    canonical_origin,
    callback_url,
    configured: Boolean(oauth_configured && assertion_signing_configured),
    oauth_configured,
    permission_verifier_configured: Boolean(oauth_configured || verifier_token),
    assertion_signing_configured
  };
}

const b64 = value => Buffer.from(value).toString("base64url");
const json64 = value => b64(JSON.stringify(value));

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

function signPayload(payload, secret) {
  const encoded = json64(payload);
  const sig = createHmac("sha256", secret).update(encoded).digest("base64url");
  return encoded + "." + sig;
}

function verifyPayload(token, expectedType) {
  const secret = signingSecret();
  if (!secret) throw new Error("github_oauth_unconfigured");
  const parts = clean(token).split(".");
  if (parts.length !== 2) throw new Error("github_assertion_invalid");
  const expected = createHmac("sha256", secret).update(parts[0]).digest("base64url");
  if (!safeEqual(parts[1], expected)) throw new Error("github_assertion_invalid");
  let payload;
  try { payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")); }
  catch { throw new Error("github_assertion_invalid"); }
  const now = Math.floor(Date.now() / 1000);
  if (payload?.typ !== expectedType || !Number.isFinite(Number(payload.exp)) || Number(payload.exp) < now) {
    throw new Error("github_assertion_invalid");
  }
  if (payload.iat && Number(payload.iat) > now + 300) throw new Error("github_assertion_invalid");
  return payload;
}

function issue(type, payload, ttlSeconds) {
  const secret = signingSecret();
  if (!secret) throw new Error("github_oauth_unconfigured");
  const now = Math.floor(Date.now() / 1000);
  return signPayload({
    typ: type,
    iat: now,
    exp: now + ttlSeconds,
    nonce: randomBytes(18).toString("base64url"),
    ...payload
  }, secret);
}

function tokenKey() {
  const secret = signingSecret();
  if (!secret) throw new Error("github_oauth_unconfigured");
  return createHash("sha256").update("quantdeus-github-token|" + secret).digest();
}

function sealToken(token) {
  const value = clean(token);
  if (!value) throw new Error("github_assertion_invalid");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tokenKey(), iv);
  cipher.setAAD(Buffer.from("quantdeus-github-oauth"));
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64url");
}

function openToken(sealed) {
  let raw;
  try { raw = Buffer.from(clean(sealed), "base64url"); }
  catch { throw new Error("github_assertion_invalid"); }
  if (raw.length < 29) throw new Error("github_assertion_invalid");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  try {
    const decipher = createDecipheriv("aes-256-gcm", tokenKey(), iv);
    decipher.setAAD(Buffer.from("quantdeus-github-oauth"));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("github_assertion_invalid");
  }
}

function safeReturnTo(value, config) {
  try {
    const url = new URL(clean(value) || config.canonical_origin + "/");
    if (url.origin !== config.canonical_origin) return config.canonical_origin + "/";
    return url.origin + "/";
  } catch {
    return config.canonical_origin + "/";
  }
}

async function githubFetch(url, token, options = {}) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2026-03-10",
    "User-Agent": "QuantDeus-GitHub-Auth",
    ...(options.headers || {})
  };
  if (clean(token)) headers.Authorization = "Bearer " + clean(token);
  return fetch(url, {...options, headers});
}

async function exchangeCode(code, config) {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "QuantDeus-GitHub-Auth"
    },
    body: new URLSearchParams({
      client_id: config.client_id,
      client_secret: config.client_secret,
      code: clean(code),
      redirect_uri: config.callback_url
    })
  });
  if (!response.ok) throw new Error("github_oauth_exchange");
  const body = await response.json().catch(() => null);
  const token = clean(body?.access_token);
  if (!token) throw new Error("github_oauth_exchange");
  return token;
}

async function githubProfile(token) {
  const response = await githubFetch("https://api.github.com/user", token);
  if (!response.ok) throw new Error("github_profile_unavailable");
  const body = await response.json().catch(() => null);
  const login = clean(body?.login);
  const id = clean(body?.id);
  if (!login || !id) throw new Error("github_profile_unavailable");
  return { login, id, avatar_url: clean(body?.avatar_url) || null };
}

export async function githubPermission(login, config = githubAuthConfig(), userToken = "") {
  const token = clean(userToken) || clean(config.verifier_token);
  if (!token) throw new Error("github_permission_verifier_unconfigured");
  const match = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(config.repository);
  if (!match) throw new Error("github_repository_invalid");

  const repoUrl = `https://api.github.com/repos/${match[1]}/${match[2]}`;
  const repoResponse = await githubFetch(repoUrl, token);
  if (repoResponse.ok) {
    const repo = await repoResponse.json().catch(() => null);
    const permissions = repo?.permissions || {};
    if (permissions.admin === true) return "admin";
    if (permissions.maintain === true) return "maintain";
    if (permissions.push === true) return "write";
    if (permissions.triage === true) return "triage";
    if (permissions.pull === true) return "read";
  }

  const permissionUrl = repoUrl + "/collaborators/" + encodeURIComponent(login) + "/permission";
  const response = await githubFetch(permissionUrl, token);
  if (response.status === 404) return "none";
  if (!response.ok) throw new Error("github_permission_check_failed");
  const body = await response.json().catch(() => null);
  return clean(body?.role_name || body?.permission || "none").toLowerCase();
}

export function roleForGithubPermission(permission) {
  const value = clean(permission).toLowerCase();
  if (value === "admin") return "administrator";
  if (value === "maintain" || value === "write") return "qd_moderator";
  return "qd_member";
}

export function githubAuthHealth() {
  const config = githubAuthConfig();
  return {
    configured: config.configured,
    oauth_configured: config.oauth_configured,
    permission_verifier_configured: config.permission_verifier_configured,
    permission_strategy: config.oauth_configured ? "oauth-user-token" : (config.verifier_token ? "service-token" : "none"),
    assertion_signing_configured: config.assertion_signing_configured,
    client_id: config.client_id || null,
    repository: config.repository,
    callback_url: config.callback_url
  };
}

export function githubAuthorizationUrl(returnTo) {
  const config = githubAuthConfig();
  if (!config.configured) throw new Error("github_oauth_unconfigured");
  const state = issue("qd-gh-state", { return_to: safeReturnTo(returnTo, config) }, STATE_TTL_SECONDS);
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", config.client_id);
  url.searchParams.set("redirect_uri", config.callback_url);
  url.searchParams.set("state", state);
  url.searchParams.set("allow_signup", "false");
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export async function completeGithubOAuth(code, state) {
  const config = githubAuthConfig();
  if (!config.configured) throw new Error("github_oauth_unconfigured");
  const statePayload = verifyPayload(state, "qd-gh-state");
  const userToken = await exchangeCode(code, config);
  const profile = await githubProfile(userToken);
  const permission = await githubPermission(profile.login, config, userToken);
  if (!["write", "maintain", "admin"].includes(permission)) throw new Error("github_staff_required");
  const role = roleForGithubPermission(permission);
  const assertion = issue("qd-gh-assertion", {
    github_id: profile.id,
    login: profile.login,
    avatar_url: profile.avatar_url,
    permission,
    role,
    token_box: sealToken(userToken)
  }, ASSERTION_TTL_SECONDS);
  return {
    assertion,
    return_to: safeReturnTo(statePayload.return_to, config),
    user: { github_id: profile.id, login: profile.login, permission, role, avatar_url: profile.avatar_url }
  };
}

export async function verifyGithubAssertion(token) {
  const config = githubAuthConfig();
  if (!config.configured) throw new Error("github_oauth_unconfigured");
  const payload = verifyPayload(token, "qd-gh-assertion");
  const login = clean(payload.login);
  const github_id = clean(payload.github_id);
  if (!login || !github_id) throw new Error("github_assertion_invalid");
  const userToken = payload.token_box ? openToken(payload.token_box) : "";
  const permission = await githubPermission(login, config, userToken);
  if (!["write", "maintain", "admin"].includes(permission)) throw new Error("github_staff_required");
  return {
    github_id,
    login,
    avatar_url: clean(payload.avatar_url) || null,
    permission,
    role: roleForGithubPermission(permission)
  };
}
