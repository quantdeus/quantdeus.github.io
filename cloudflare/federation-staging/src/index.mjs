// QuantDeus Federation Staging Bridge v0.2
// Read-only observability. No credentials, mutation routes, content exports, or production writes.
const JSON_HEADERS = Object.freeze({
  "content-type": "application/json; charset=utf-8",
  "cache-control": "public, max-age=10",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "access-control-allow-origin": "https://quantdeus.ru"
});
const WP_URL = "https://quantdeus.ru";
const API_VERSION = "0.2.0";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}
function statusCode(code) {
  return Number.isInteger(code) ? code : null;
}
async function inspectService(service, path) {
  if (!service || typeof service.fetch !== "function") {
    return { configured: false, responding: false, http_status: null };
  }
  try {
    const r = await service.fetch(new Request("https://internal.quantdeus.invalid" + path, {
      method: "GET",
      signal: AbortSignal.timeout(5000)
    }));
    return { configured: true, responding: r.ok, http_status: statusCode(r.status) };
  } catch {
    return { configured: true, responding: false, http_status: null };
  }
}
async function inspectWp(fetcher) {
  const url = WP_URL + "/wp-json/wp/v2/posts?per_page=1&status=publish&_fields=id";
  try {
    const response = await fetcher(new Request(url, {
      method: "GET",
      headers: { accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(6000)
    }));
    const kind = response.headers?.get("content-type") || "";
    // Status check only: do not echo WordPress content or any private data.
    return {
      configured: true,
      responding: response.ok && kind.includes("json"),
      http_status: statusCode(response.status)
    };
  } catch {
    return { configured: true, responding: false, http_status: null };
  }
}
export function createFederationHandler({ fetcher = fetch } = {}) {
  return async function handle(request, env = {}) {
    const method = request.method.toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      return json({ error: "read_only", code: "METHOD_NOT_ALLOWED" }, 405);
    }
    const url = new URL(request.url);
    if (url.pathname === "/health" || url.pathname === "/api/health") {
      return json({ ok: true, bridge: "quantdeus-federation-staging", version: API_VERSION, mode: "read_only" });
    }
    if (url.pathname !== "/api/federation/status") return json({ error: "not_found" }, 404);
    const [seven, metaverse, wordpress] = await Promise.all([
      inspectService(env.SEVEN, "/api/status"),
      inspectService(env.METAVERSE, "/api/health"),
      inspectWp(fetcher)
    ]);
    return json({
      bridge: "quantdeus-federation-staging",
      version: API_VERSION,
      mode: "read_only",
      observed_at: new Date().toISOString(),
      components: { seven, metaverse, wordpress },
      qdrp: { production_write: false, staging_grant_broker: "not_deployed", github_dispatch: "not_configured" },
      note: "Service responses reflect connectivity only. No WP Git Sync configuration or agent identity is inferred."
    });
  };
}
export default { fetch: createFederationHandler() };
