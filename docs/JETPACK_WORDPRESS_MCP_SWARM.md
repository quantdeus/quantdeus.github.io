# WordPress.com Jetpack MCP → GitHub-native QuantDeus OpenClaw

Task: https://github.com/quantdeus/quantdeus.github.io/issues/667
PR: https://github.com/quantdeus/quantdeus.github.io/pull/668

## Target and verified identity

- Canonical WordPress: `https://quantdeus.ru`, Jetpack/WordPress.com site ID `258399627`.
- MCP URL: `https://public-api.wordpress.com/wpcom/v2/mcp/v1`.
- The existing authenticated ChatGPT WordPress.com connection **cannot** be exported to GitHub agents.
- GitHub-native OpenClaw runs in `.github/workflows/seven-native-readonly.yml` and `.github/workflows/q-kryon-github-native.yml`. No Vercel dependencies are introduced by this PR.
- Existing native WordPress endpoint stays unchanged: `https://quantdeus.ru/wp-json/easy-mcp-ai/v1/mcp`.

## GitHub-native changes

### Seven of Nine

`scripts/jetpack-wordpress-readonly.js` collects only public REST evidence from WordPress.com: published post metadata, site identity, count. It stores minimal, sanitized evidence in `artifacts/seven-native/jetpack-public.json`. `scripts/seven-native-evidence.js` includes a bounded snapshot in Seven's read-only model prompt. This is **public REST**, not authenticated MCP.

The Seven workflow now runs `openclaw mcp set wpcom-mcp` within its GitHub Actions OpenClaw state with `auth: oauth`, the official URL and an explicit read-tool allowlist. **Registering a server is not completing OAuth.** The workflow deliberately does not run an interactive login on a disposable runner.

### Q and Kryon

`.github/workflows/q-kryon-github-native.yml` registers the same `wpcom-mcp` endpoint in the isolated real OpenClaw state used for Q and Kryon. It does not grant login credentials or site write permissions.

### MCP configuration shape

The official WordPress.com example is valid for clients with a top-level `mcpServers`:

```json
{"mcpServers":{"wpcom-mcp":{"url":"https://public-api.wordpress.com/wpcom/v2/mcp/v1"}}}
```

Native OpenClaw specifically uses `mcp.servers`:

```json
{"mcp":{"servers":{"wpcom-mcp":{"url":"https://public-api.wordpress.com/wpcom/v2/mcp/v1","transport":"streamable-http","auth":"oauth"}}}}
```

The production WordPress URL must be plain HTTPS, not a Markdown link.

## OAuth blocker: GitHub-hosted runners are disposable

WordPress.com uses dynamic client registration + OAuth 2.1 PKCE. OpenClaw `mcp login` stores temporary PKCE state and final credentials in its own state directory (SQLite). GitHub-hosted Actions runners disappear between runs. Starting a loopback OAuth login in a temporary runner and printing a sign-in URL **does not establish durable credentials for the next run**. Never print OAuth codes, tokens or PKCE state into public logs, repository files, Actions artifacts or GitHub Issues.

**Required for persistent authenticated MCP:**

1. Select a *persistent* trusted OpenClaw runtime / private long-lived self-hosted GitHub Actions runner that can store OAuth SQLite securely. Standard GitHub-hosted runners are not suitable for shared durable OAuth.
2. Configure the official `wpcom-mcp` server in that runtime, invoke `openclaw mcp login wpcom-mcp` and complete the browser-based WordPress.com consent via the exact sign-in URL printed by **that same runtime**.
3. Verify `openclaw mcp doctor wpcom-mcp --probe`, then an authenticated read of site ID `258399627`. No site writes.
4. Only then connect GitHub-native agents to that credential-owning trusted runtime. Avoid granting token access to unrelated workflow jobs.

Without that persistent runtime/auth, the GitHub Actions version remains **configuration-only** for MCP and **public-read-only** for actual content evidence. Never claim connected/authenticated until a true MCP `tools/list` or tool read from the target agent runtime passes.

## Acceptance / evidence

- [x] WordPress.com site observed in operator's ChatGPT connector; site ID `258399627`.
- [x] GitHub-native configuration prepared for Seven, Q, Kryon.
- [x] Public WordPress.com REST reader prepared for Seven.
- [ ] New PR QA status verified.
- [ ] GitHub Actions run using this branch confirms MCP configuration command succeeds.
- [ ] A private persistent runtime finishes its OWN WordPress.com OAuth login.
- [ ] Authenticated MCP read from the actual persistent OpenClaw runtime confirmed.

## References

- https://developer.wordpress.com/docs/mcp/
- https://developer.wordpress.com/docs/mcp/connect-custom-mcp-client/
- https://docs.openclaw.ai/cli/mcp/transports
- https://docs.openclaw.ai/tools/mcp
