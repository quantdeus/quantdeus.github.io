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

## Official documentation

- [WordPress.com MCP overview](https://developer.wordpress.com/docs/mcp/)
- [Jetpack MCP connection instructions](https://jetpack.com/support/create-better-content-with-jetpack-ai/mcp/)
- [OAuth custom MCP-client guidance](https://developer.wordpress.com/docs/mcp/connect-custom-mcp-client/)
- [WordPress.com public REST API](https://developer.wordpress.com/docs/api/getting-started/)
