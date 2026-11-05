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
const API_VERSION = "0.2.1";

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
  // WordPress origin is occasionally unreachable outside Russia. Jetpack public API
  // provides an independent public metadata health route, without exposing content.
  const routes = [
    {
      id: "direct_wp_rest",
      url: WP_URL + "/wp-json/wp/v2/posts?per_page=1&status=publish&_fields=id",
      timeout: 3200,
      valid: body => Array.isArray(body)
    },
    {
      id: "jetpack_public_api",
      url: "https://public-api.wordpress.com/rest/v1.1/sites/quantdeus.ru/posts/?number=1&fields=ID,URL",
      timeout: 5800,
      valid: body => !!body && Array.isArray(body.posts)
    }
  ];
  let lastStatus = null;
  for (const target of routes) {
    try {
      const response = await fetcher(new Request(target.url, {
        method: "GET", headers: { accept: "application/json" },
        redirect: "error", signal: AbortSignal.timeout(target.timeout)
      }));
      lastStatus = statusCode(response.status);
      const kind = response.headers?.get("content-type") || "";
      if (!response.ok || !kind.includes("json")) continue;
      const data = await response.json();
      if (!target.valid(data)) continue;
      return { configured: true, responding: true, http_status: lastStatus, route: target.id };
    } catch {
      // An unavailable endpoint is never treated as a successful response.
    }
  }
  return { configured: true, responding: false, http_status: lastStatus, route: "unverified" };
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
