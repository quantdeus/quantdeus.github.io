# QuantDeus LLM failover pool

Updated: 2026-09-30

## Admission rule

A configured provider is not considered healthy merely because an API key exists.

- Public/no-tools lane: the live probe must return HTTP 200 and the exact assistant text `OK`.
- Trusted OpenClaw lane: the model must complete a two-step function-calling round trip and finish with the exact `PROBE_DONE` marker.
- Failed providers are excluded from both the primary model and OpenClaw fallback list.
- Provider probes run in parallel. Healthy routes are ordered by curated quality/speed/capacity priority, with measured probe latency as the tie-breaker.
- If no provider passes the required capability probe, the endpoint fails closed with `openclaw_no_healthy_model_route`.

## Provider catalog

| Route | Default model | Key/config |
| --- | --- | --- |
| Cerebras | `gpt-oss-120b` | `CEREBRAS_API_KEY`, optional `CEREBRAS_MODEL` |
| Groq | `openai/gpt-oss-120b` | `GROQ_API_KEY`, optional `GROQ_MODEL` |
| Fireworks | `accounts/fireworks/models/glm-5p3-flash` | `FIREWORKS_API_KEY`, optional `FIREWORKS_MODEL` |
| DeepInfra | `XiaomiMiMo/MiMo-V2.6-Flash` | `DEEPINFRA_API_KEY` or `DEEPINFRA_TOKEN`, optional `DEEPINFRA_MODEL` |
| Together AI | `MiniMaxAI/MiniMax-M3` | `TOGETHER_API_KEY`, optional `TOGETHER_MODEL` |
| Gemini | `gemini-3.8-flash` | `GEMINI_API_KEY`, optional `GEMINI_MODEL` |
| NVIDIA NIM | `openai/gpt-oss-120b` | `NVIDIA_API_KEY`, optional `NVIDIA_MODEL` |
| xAI | `grok-4.7` | `XAI_API_KEY`, optional `XAI_MODEL` |
| Cloudflare Workers AI | `@cf/zai-org/glm-4.7-flash` | `CLOUDFLARE_API_KEY`, `CLOUDFLARE_ACCOUNT_ID`, optional `CLOUDFLARE_MODEL` |
| OpenRouter | `openrouter/free` | `OPENROUTER_API_KEY`, optional `OPENROUTER_MODEL` / `QD_LLM_MODEL` |
| Pollinations | `openai` | anonymous by default, optional `POLLINATIONS_API_KEY` / `POLLINATIONS_MODEL` |

Only configured keyed routes are added. Pollinations remains the final emergency route and must pass the same capability gate.

The retired Mistral route is intentionally not restored.
