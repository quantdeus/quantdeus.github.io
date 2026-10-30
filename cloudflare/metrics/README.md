# QuantDeus Metrics v1

Privacy-conscious hybrid analytics for quantdeus.ru and quantdeus.github.io.

## Status

This is an implementation scaffold in GitHub, not a live deployment. No database, Worker URL, Web Analytics site ID, or production snippet is presumed to exist.

## Files

- worker.js — ingestion API and token-protected report endpoint.
- schema.sql — schema for a dedicated D1 database.
- wrangler.toml.example — example Worker binding configuration.
- ../../assets/quantdeus-metrics.js — browser client with explicit opt-in.
- ../../metrics/index.html — dashboard. The API URL and admin token are entered at runtime, not stored in source.

## Deployment sequence

1. Create a dedicated D1 database named quantdeus-metrics; do not reuse app tables.
2. Apply schema.sql to the new database.
3. Configure D1 binding METRICS_DB and exact ALLOWED_ORIGINS.
4. Set METRICS_ADMIN_TOKEN as a Worker secret. Never commit the token.
5. Deploy Worker, verify /health, and test malformed payloads, origin rejection, duplicate IDs, and report authentication.
6. Create/confirm Cloudflare Web Analytics entries and add their official snippets separately.
7. Only after a deployed Worker URL exists, include the browser client on both sites with site IDs quantdeus-main and quantdeus-pages.
8. Verify browser requests and actual D1 rows before calling the integration live.

## Browser snippet

Primary site:
<script defer src="/assets/quantdeus-metrics.js" data-endpoint="https://YOUR-WORKER.workers.dev/api/collect" data-site-id="quantdeus-main"></script>

GitHub Pages uses the asset URL appropriate to the repository root and site ID quantdeus-pages.

## API

- GET /health — basic health response.
- POST /api/collect — one event or events batch.
- GET /api/report?days=7&site=all — requires Authorization: Bearer <METRICS_ADMIN_TOKEN>.
- Site filters: all, quantdeus-main, quantdeus-pages. Window is limited to 1–90 days.

## Privacy and limitations

The client waits for opt-in before persistent pseudonymous browser ID creation or collection. Rejecting consent prevents analytics collection. Review banner wording, privacy policy, retention, and applicable legal requirements before production use. The identifier measures a browser, not a verified person; devices cannot be reliably joined. The client never sends form contents or raw search text.

Cloudflare Web Analytics is a separate data source; this Worker does not fetch or automatically merge its figures. Compare reports side-by-side until an authorized data integration is specified. The source attribution is approximate and may be affected by referrer stripping.

Before public production use, add durable rate limiting (for example Cloudflare rate limiting/WAF), stronger dashboard access control such as Cloudflare Access, retention/deletion jobs, automated tests, and accepted-event accounting tests. Do not mark forms as successful until their application confirms backend success.

## QA

After configuring the real D1 ID and secrets in a controlled environment:
npx wrangler d1 execute quantdeus-metrics --file=cloudflare/metrics/schema.sql --remote
npx wrangler deploy --config cloudflare/metrics/wrangler.toml

These are instructions only, not evidence of deployment.
