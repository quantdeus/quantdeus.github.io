# Jetpack WordPress.com MCP → QuantDeus swarm

Status: **implementation in draft PR; authenticated MCP for swarm NOT yet connected**. Parent task: [#667](https://github.com/quantdeus/quantdeus.github.io/issues/667).

## Verified site and distinct connections

- Canonical production: `https://quantdeus.ru`, WordPress.com/Jetpack site ID `258399627`.
- A WordPress.com MCP connection was verified **in a separate ChatGPT session** on 2026-11-03; this proves neither an OpenClaw authorization nor live GitHub Actions credentials.
- The **existing** native WordPress MCP stays primary for trusted OpenClaw routing: `https://quantdeus.ru/wp-json/easy-mcp-ai/v1/mcp`.
- The **additional official** WordPress.com MCP endpoint is `https://public-api.wordpress.com/wpcom/v2/mcp/v1`.
- Never target the legacy `quantdeus.wordpress.com` site or overwrite production to make this work.

## Phase A — credentialless evidence (this PR)

`scripts/jetpack-wordpress-readonly.js` uses only public WordPress.com REST **GET** methods and filters the response to site identity, published post counts, and up to eight published titles/IDs/links. It does not read drafts, account settings, users or customer data.

It writes `artifacts/seven-native/jetpack-public.json`. `.github/workflows/seven-native-readonly.yml` gathers it, and `scripts/seven-native-evidence.js` includes a bounded version in Seven's evidence prompt. The material is **untrusted external data**, never instructions.

- `status=ok`: public REST request succeeded and the site identity matched. **This is NOT evidence that the Jetpack MCP was authenticated.**
- `status=blocked`: public REST was unavailable, malformed or had a site mismatch. Record the blocker; do not fabricate access and do not try another site.
- No credentials or secrets are read or stored. All API calls are public, bounded and read-only. A failure does not block unrelated GitHub evidence.

The script only runs in the existing Seven workflow after **review and merge**. It has not been executed in Actions at the time this draft is prepared.

## Phase B — owner-authorized official MCP

The official WordPress.com MCP uses **OAuth 2.1** with PKCE / browser authorization. Jetpack-connected self-hosted WordPress sites use the same endpoint.

1. Seven inventories the **actual trusted OpenClaw runtime** and its supported remote MCP-client configuration. Do not assume an MCP client exists in a GitHub-hosted runner or that ChatGPT's tokens can be exported.
2. The operator registers the URL `https://public-api.wordpress.com/wpcom/v2/mcp/v1` in that persistent MCP client, and authorizes it through an **interactive WordPress.com browser flow**. Do not place an OAuth access or refresh token in this repository, a PR/Issue, an Actions artifact or a public site route.
3. Restrict WordPress.com MCP site-level capabilities to **Read only** for this client/workflow if the authorization UI permits. Keep all WordPress writes disabled for scheduled autonomous lanes at the runtime broker too. The WordPress.com account may enable Write tools by default; explicitly review these settings before granting access.
4. Test remote MCP `tools/list`, followed by an authenticated **read-only** tool call scoped to `wpcom_site=258399627`; confirm site URL and exactly a few published post/page IDs and names. Store only sanitized pass/fail, call type, timestamp and resource IDs as evidence. Do not log full tool payloads or user details.
5. Propagate only those approved read-only snapshots to Seven → Data/Archivist/QA. No direct access to account, site settings, members, private drafts, sales emails or plugin administration in the scheduled lanes.

### Human override

Direct WordPress writes, new roles, plugins, updates, theme publish, customer-data extraction, sending mail and publishing are **not enabled** by this work. Any such operation requires a separate explicit owner task, review, protected credentials and a verified backup/rollback path.

### Acceptance criteria

- [x] WordPress.com connection to Jetpack site observed in the operator's ChatGPT session.
- [x] Site identity and official remote MCP URL verified.
- [x] Public REST evidence adapter prepared in an isolated branch.
- [ ] Reviewed/merged GitHub PR.
- [ ] Real runner output confirms `jetpack-public.json.status=ok` (or explicitly records a blocker).
- [ ] Separate trusted OpenClaw OAuth 2.1 authorization approved by owner.
- [ ] Authenticated `tools/list` and read-only `tools/call` verified **from the agent runtime**.
- [ ] Seven's actual downstream handoff to Data/Archivist tested.

## Actual QuantDeus Vercel agent MCP configuration

The actual trusted-swarm configuration is assembled in `vercel-dispatcher/api/quantdeus/openclaw.js`, in the local JavaScript variable `mcpServers` and then projected as `config.mcp.servers` (not a top-level `mcpServers` object). Preserve all existing servers.

This change adds `wpcom-mcp` pointing to `https://public-api.wordpress.com/wpcom/v2/mcp/v1` with `transport: streamable-http`, `auth: oauth` and a strict allowlist of read-only list/search tools. It is installed **only for normal trusted Office runs**, not public or smoke lanes, and only when `QUANTDEUS_JETPACK_MCP_ENABLED=1` is configured. **Do not turn this switch on before successful OAuth token setup in the persistent trusted runtime.** A disabled switch is not proof of authentication or tool access.

To enable after the owner signs in:
1. In the persistent Vercel OpenClaw Office sandbox, set `OPENCLAW_HOME` and `OPENCLAW_STATE_DIR` to the same values used by the trusted Office application. Never send authorization codes/tokens through GitHub or the public site.
2. Ensure `wpcom-mcp` exists in the corresponding config, run `openclaw mcp login wpcom-mcp` and complete the browser redirect **in a client capable of receiving the callback**. OpenClaw Control UI's **Settings → MCP → Sign in** is preferred if available.
3. Confirm `openclaw mcp doctor wpcom-mcp --probe` succeeds and run a read-only site query for site ID `258399627`.
4. Enable the exact `QUANTDEUS_JETPACK_MCP_ENABLED=1` switch only after verified login, QA, and the reviewed PR is merged. If authentication fails, leave it unset; the native `wordpress` server remains unchanged.

Important: a user-supplied snippet using `"url":"[https://...](https://...)"` is **invalid as an MCP URL value**; the URL value must be a literal HTTPS URL without Markdown wrapping.

## CEO OAuth authorization — operator runbook (2026-11-03)

The CEO has authorized **starting the separate Jetpack MCP sign-in** for the trusted swarm runtime. This is not proof that a token has been issued. This operation cannot run from the ChatGPT WordPress connector: that connector's OAuth session belongs to ChatGPT.

**Best option when the existing OpenClaw Gateway / Control UI is actually available:**

1. Open **Settings → MCP → Add server** on the **actual existing trusted Gateway** (not the public QuantDeus website). Set name `quantdeus-jetpack`, transport `Streamable HTTP`, URL `https://public-api.wordpress.com/wpcom/v2/mcp/v1`, and OAuth authentication.
2. Select **Sign in**. Log into the WordPress.com account that owns Jetpack connection to `quantdeus.ru`, and approve the browser prompt. Do **not** share the callback URL, authorization code or token in the Issue/chat.
3. If WordPress.com offers **Keep existing access**, choose it to avoid changing permissions used by the existing ChatGPT connection. **Read only** on that consent screen changes shared account-level tool settings and may disable ChatGPT's existing write operations; choose it only if that broader restriction is intended. Keep the scheduled swarm broker read-only independently.
4. Return to OpenClaw, run **Test/Probe** and verify site ID `258399627`, without modifying WordPress. If OpenClaw has no live Gateway, use the terminal of its actual **persistent** trusted runtime instead.

**Native OpenClaw CLI in the persistent runtime** (confirmed syntax in OpenClaw docs):

```bash
openclaw mcp set quantdeus-jetpack '{"url":"https://public-api.wordpress.com/wpcom/v2/mcp/v1","transport":"streamable-http","auth":"oauth"}'
openclaw mcp login quantdeus-jetpack
openclaw mcp doctor quantdeus-jetpack --probe
openclaw mcp status --verbose
```

The login prints a **client-specific OAuth link**. There is no reusable generic WordPress login URL that safely completes this flow: the client must first create an OAuth registration/PKCE verifier and own a redirect. For remote/mobile browsers unable to reach a server-local loopback callback, use the native `openclaw mcp login quantdeus-jetpack --code ...` fallback **in the server terminal**, never via chat, as instructed by OpenClaw.

**Important runtime limitation:** repository GitHub Actions jobs are ephemeral. Do not authorize this in an Actions runner and assume OAuth tokens survive the next run. Auth must live in a persistent trusted OpenClaw state, with storage permissions and backup defined by that runtime's operator. A read-only public snapshot from this PR is only a bridge, not the new authenticated MCP connection.

- [WordPress.com MCP permissions and shared consent effects](https://wordpress.com/support/mcp/)
- [OpenClaw MCP OAuth and login](https://docs.openclaw.ai/cli/mcp/transports)
- [OpenClaw Gateway MCP server settings](https://docs.openclaw.ai/tools/mcp)

## Official documentation

- [WordPress.com MCP overview](https://developer.wordpress.com/docs/mcp/)
- [Jetpack MCP connection instructions](https://jetpack.com/support/create-better-content-with-jetpack-ai/mcp/)
- [OAuth custom MCP-client guidance](https://developer.wordpress.com/docs/mcp/connect-custom-mcp-client/)
- [WordPress.com public REST API](https://developer.wordpress.com/docs/api/getting-started/)
