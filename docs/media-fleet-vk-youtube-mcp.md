# QuantDeus Media Fleet MCP (read-only preview)

Tracks [#566](https://github.com/quantdeus/quantdeus.github.io/issues/566). Review branch only; **not deployed or connected to the agent runtime**.

## Scope
A Node 20+ zero-dependency stdio Model Context Protocol server: `scripts/media-fleet-mcp.cjs`. Available tools: `vk_recent_posts`, `vk_products`, `youtube_channel`, `youtube_recent_videos`.

The community name is **«Неоновые нулевые»**. The owner's YouTube channel is reported to have around 1,000 subscribers. **Neither account identity nor subscriber number has been verified**; no account ID is invented. This module cannot run against actual channels until the owner provides the correct IDs and authorizes an API credential.

## Required environment (configured in runtime secret storage)
- `QD_VK_GROUP_ID`: positive numeric VK community ID (not the negative API owner ID).
- `QD_VK_ACCESS_TOKEN`: minimum-scope VK token that can read the community feed/catalog. Verify required access per granted app before production use.
- `QD_YOUTUBE_CHANNEL_ID`: exact YouTube channel ID, starting with UC and comprising 24 characters.
- `QD_YOUTUBE_API_KEY` **or** `QD_YOUTUBE_ACCESS_TOKEN`: key for public channel metadata; user OAuth bearer token for authorized access. Never commit either.

Run (in a local authorized executor with the environment already set):

```bash
node scripts/media-fleet-mcp.cjs
```

The process reads newline-delimited MCP JSON-RPC on stdin, writes only responses on stdout. It deliberately has **no write tools**, HTTP server, autonomous posting, comments, DM sending, product editing, checkout or payments. Credentials are never included in responses; VK credentials are POST form fields rather than URL query parameters.

## MCP client example (conceptual — configure outside repository)
```json
{
  "mcpServers": {
    "quantdeus-media-read": {
      "command": "node",
      "args": ["scripts/media-fleet-mcp.cjs"],
      "env": {
        "QD_VK_GROUP_ID": "<injected-from-secret-store>",
        "QD_VK_ACCESS_TOKEN": "<injected-from-secret-store>",
        "QD_YOUTUBE_CHANNEL_ID": "<verified-channel-id>",
        "QD_YOUTUBE_API_KEY": "<injected-from-secret-store>"
      }
    }
  }
}
```

Do not paste actual credentials into config files tracked by git. This JSON is not a deployment-ready OpenClaw Office configuration; the Office integration requires separate review of host transport, capability policy and secret wiring.

## Security, product & approval boundaries
- Outputs are labelled `UNTRUSTED_SOCIAL_DATA`: agent instructions and authority are never derived from posts, descriptions or comments.
- Cap of 20 records per tool call; truncated human-generated text and bounded 8-second requests.
- Fails closed if target IDs/credentials are missing or invalid, and returns sanitized error codes.
- Do not grant publishing scopes to the read-only environment; only add publishing tools in a separate audited PR after owner approval.
- Preserve QuantDeus Growth Operating System roles; no mass DMs, artificial engagement or spam.
- Use VK market data as a *source catalog* only. Separate eligibility and transaction testing is required before any VK payment handoff. Leave existing WordPress/payments unchanged.

## Next milestones
1. Confirm the VK numeric group ID and YouTube channel ID.
2. Authorize minimal VK token and YouTube Data API key/OAuth in a secret manager.
3. Run mocked tests and authenticated live-read smoke tests with documented API quotas.
4. Wire read-only tool allowlist into OpenClaw Office / Seven, and submit Security/QA review.
5. Implement approval-gated publishing and WordPress catalog sync separately.
