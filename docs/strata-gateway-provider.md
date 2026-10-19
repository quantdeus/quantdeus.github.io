# Strata gateway provider and Kimi-K3 feasibility

**Status:** opt-in provider implementation; not enabled in production.  
**Date:** 2026-10-19

## What was added

`vercel-dispatcher/api/quantdeus/llm.js` now supports an optional direct Strata OpenAI-compatible route. It is enabled only when `QD_STRATA_ENABLED=true`. If Strata fails or times out, the existing Vercel AI Gateway route is used as fallback.

This route currently handles the bridge's text-generation contract. It does not prove compatibility with OpenClaw tool calling, nor does it reconfigure every separate agent execution path. Those require their own capability smoke tests and routing changes.

## Server-side configuration

Set these as deployment environment variables/secrets, never in client JavaScript or committed files:

- `QD_STRATA_ENABLED=true` — leave unset/false until a protected Strata endpoint is provisioned and tested.
- `QD_STRATA_BASE_URL` — HTTPS base URL reachable from the Vercel serverless function; for example, a private gateway URL. Do not use `localhost` unless Strata runs in the same network namespace (it normally will not).
- `QD_STRATA_MODEL` — exact model ID configured in `strata-server --model-id`.
- `QD_STRATA_API_KEY` — optional bearer credential if the reverse proxy requires it.
- `QD_STRATA_TIMEOUT_MS` — optional, default 90000; bounded to 1000–120000 ms.

The endpoint must be protected by TLS and authentication/firewall rules. Do not expose an unauthenticated GPU inference server to the public internet.

## Cloudflare Workers AI: Kimi K2.6

QuantDeus also supports an opt-in Cloudflare Workers AI route, with the hosted Vercel AI Gateway as fallback. The model ID is `@cf/moonshotai/kimi-k2.6`; Cloudflare documents this as a hosted model with tool calling, reasoning, vision, and a 262,144-token context window. Access requires a Workers Paid plan or prepaid AI Gateway credits; do not assume the account has billing/access enabled.

Set these as Vercel server-side environment variables/secrets only:

- `QD_CLOUDFLARE_AI_ENABLED=true` — activates the Cloudflare route.
- `CLOUDFLARE_ACCOUNT_ID` — Cloudflare account ID.
- `CLOUDFLARE_API_TOKEN` — API token with the minimum permissions needed to run Workers AI; store as a secret, never commit it.
- `QD_CLOUDFLARE_AI_MODEL=@cf/moonshotai/kimi-k2.6` — optional model override.
- `CLOUDFLARE_AI_GATEWAY_ID` — optional AI Gateway ID for routing/analytics/billing.
- `QD_CLOUDFLARE_AI_TIMEOUT_MS=90000` — optional timeout, bounded to 1–120 seconds.

The bridge posts to Cloudflare's OpenAI-compatible `/ai/v1/chat/completions` endpoint. If credentials, account access, model access, or the upstream request fail, it logs a short error without prompts/secrets and falls back to the existing Vercel AI Gateway. This only changes the bridge path used by the authenticated GitHub workflow; it does not automatically reconfigure every agent, OpenClaw, or unrelated provider configuration.

**Rollout checklist:** configure the account ID and API token in deployment secrets, verify Workers AI billing/model access, enable the flag in a preview deployment first, test the actual authenticated workflow and fallback, inspect token usage/costs, and only then enable production. Kimi K2.6 pricing shown in Cloudflare's model catalog is $0.95/M input tokens, $4.00/M output tokens, and $0.16/M cached input tokens at the time this document was prepared; confirm current pricing before broad rollout.

## Kimi-K3 assessment

The upstream `ro99/strata` README lists `kimi-k3` as a supported model type and provides an OpenAI-compatible `strata-server` endpoint. Its published reference table reports Kimi-K3 at about **1.45 TB** and **38.6 seconds per step** on a 64 GiB VRAM / 251 GiB RAM workstation, described as I/O-dependent; vision is not implemented in that route. This makes it technically interesting for experimentation, but a poor default for latency-sensitive agent traffic without a substantially larger, benchmarked host.

Recommended tiers:
1. Start Strata with a smaller supported model for the first connectivity and quality test.
2. Benchmark Kimi-K3 on hardware that can store the full checkpoint and record time-to-first-token, decode throughput, RAM/VRAM, disk I/O and failure rates.
3. Route only selected long-form/research jobs to Kimi-K3 if its measured latency and cost are acceptable.
4. Keep interactive coordinators and tool-sensitive roles on a model that passes their actual tool-call smoke tests.

## Acceptance and rollback

- Verify `GET`/health behavior using the exact server version's documented health endpoint, then run a text request through the bridge.
- Confirm Strata route selection from server logs without logging prompts or secrets.
- Force a Strata timeout and verify the hosted fallback returns a valid answer.
- Test every OpenClaw/tool-using role separately; text completion alone is not tool-call compatibility.
- Roll back by setting `QD_STRATA_ENABLED=false` or removing it. No model endpoint is changed when the flag is off.
