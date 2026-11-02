# QuantDeus LLM Gateway — Cloudflare first

The LLM bridge belongs on Cloudflare Workers, not the legacy Vercel dispatcher.

## Provider fallback order

1. **Cloudflare Workers AI** via the `AI` binding.
2. **GitHub Models** via the `GITHUB_MODELS_TOKEN` Worker secret, only if Workers AI fails.

The Worker validates GitHub Actions OIDC tokens (issuer, signature, audience, repository, expiry, event/workflow) before inference. It accepts the browser homunculus workflow and the existing issue-comment site-agent lane. No unauthenticated inference endpoint is exposed; `/health` reports health only.

## Deploy

From `cloudflare/llm-gateway`:

```sh
npx wrangler secret put GITHUB_MODELS_TOKEN
npx wrangler deploy
```

Then set the repository Actions variable `QD_CLOUDFLARE_LLM_BRIDGE` to the deployed Worker URL. Set the Worker secret before relying on GitHub Models fallback. Never put provider tokens in repository files.

## Migration guard

The browser workflow must fail closed if `QD_CLOUDFLARE_LLM_BRIDGE` is unset; it must not silently route inference back to the legacy Vercel LLM endpoint. This change migrates the LLM bridge only. The separate OpenClaw Sandbox runtime is not migrated by this Worker.
