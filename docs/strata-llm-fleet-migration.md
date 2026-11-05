# QuantDeus Galaxy Swarm — Strata LLM migration plan

**Status:** proposed implementation plan; not a production cutover.  
**Date:** 2026-10-19  
**Scope:** all agent profiles that can use a shared OpenAI-compatible inference endpoint.

## Decision

Adopt Strata as the preferred *self-hosted inference runtime* for the Galaxy Swarm, behind one shared LLM gateway. Do not install one model runtime per agent. Agents remain role/prompt/tool profiles; the shared gateway schedules their inference requests.

Strata can place model weights across GPU VRAM, system RAM and (where supported) NVMe. The amount of VRAM saved depends on the model, quantization, context/KV cache, expert placement and hardware. Treat “6× less VRAM” as a benchmark target, not a universal guarantee.

## Verified current state

- The documented LLM failover pool currently uses hosted routes (Cerebras, Groq, Fireworks, DeepInfra, Together AI, Gemini, NVIDIA NIM, xAI, Cloudflare Workers AI, OpenRouter and Pollinations): `docs/llm-provider-failover.md`.
- The Vercel LLM bridge uses the Vercel AI SDK Gateway model setting `LLM_BRIDGE_MODEL` / `BROWSER_PLANNER_MODEL`: `vercel-dispatcher/api/quantdeus/llm.js`.
- Therefore Strata cannot become the default merely by changing a model-name environment variable: a Strata host, network route, compatible API adapter and measured health/capability checks are prerequisites.

## Target architecture

```text
Agent profiles (Seven, Sherlock, Tuvok, Data, specialist agents, etc.)
                 |
                 v
       QuantDeus LLM Gateway / Router
       - auth + request limits
       - queue / bounded concurrency
       - per-role model and context policy
       - health + capability probes
                 |
        +--------+--------------------+
        |                             |
        v                             v
 Strata OpenAI-compatible       Existing hosted provider
 inference endpoint             failover pool
 (preferred when healthy)       (fallback when enabled)
        |
        v
 GPU VRAM + system RAM (+ NVMe where configured)
```

## Configuration contract

Introduce these server-side environment variables in the gateway/agent runner:

- `QD_STRATA_ENABLED=false` — feature flag; stays off until benchmark and security checks pass.
- `QD_STRATA_BASE_URL` — private/reachable base URL for the Strata-compatible API; never hardcode a machine address.
- `QD_STRATA_API_KEY` — optional endpoint credential, stored as a secret if the deployment requires it.
- `QD_STRATA_MODEL` — exact model identifier exposed by the running Strata server.
- `QD_STRATA_TIMEOUT_MS` — bounded request timeout.
- `QD_STRATA_MAX_CONCURRENCY` — explicit queue/concurrency ceiling based on measured hardware.
- `QD_STRATA_FALLBACK_ENABLED=true` — preserve existing healthy hosted routes if local inference fails.

Never expose these values to browser code, repository files, public logs, or agent-generated output. Do not add secret values to GitHub Actions artifacts or Issues.

## Migration stages

1. **Inventory:** identify every agent execution path (OpenClaw, GitHub Actions, Telegram/site bridge and any scheduled jobs) and classify whether it uses the common gateway or a separate provider path.
2. **Provision:** deploy Strata on a persistent machine with a compatible GPU/driver, sufficient system RAM and storage. Restrict access to the gateway; do not expose an unauthenticated inference endpoint publicly.
3. **Adapter:** add a server-side Strata provider implementing the same text and tool-call contract as the existing route. If the chosen Strata build lacks required tool calling, keep tool-capable roles on a compatible fallback until a smoke test proves parity.
4. **Shadow/canary:** send synthetic, non-sensitive test prompts to Strata; compare response validity, tool-call round trips, latency, error rate and VRAM/RAM use. Start with one non-critical role.
5. **Fleet rollout:** gradually route eligible agents through Strata; keep the existing provider pool available for rollback. Increase concurrency only after load testing.
6. **Default switch:** enable `QD_STRATA_ENABLED=true` only after all acceptance criteria below pass.

## Acceptance criteria

- Every registered agent has a documented route; no agent is silently assumed to use Strata.
- Public/no-tools smoke test returns the expected exact marker.
- Trusted tool-use smoke test completes a full tool-call round trip for every role that needs tools.
- Measured peak VRAM, host RAM, throughput, p50/p95 latency and failure rate are recorded for representative models and contexts.
- Compare against the same baseline model/context/quantization where possible; report the actual ratio rather than asserting 6× in advance.
- Fallback and rollback are tested; failed Strata health checks do not make the fleet report green.
- No secrets or private prompts appear in logs.

## Rollback

Set `QD_STRATA_ENABLED=false` and route back to the existing provider pool. Do not delete the Strata host or model data as part of rollback. Preserve a short audit report with the failing health check and verified route.

## Next implementation unit

Implement the provider adapter in the actual shared gateway after the Strata host/API contract is confirmed. Avoid editing the production LLM bridge to call a guessed endpoint or deploying a public GPU service without authentication.
