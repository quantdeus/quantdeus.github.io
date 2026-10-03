# QuantDeus production topology

Status: **current production topology**  
Effective: 2026-10-03  
Supersedes the Vercel-as-WordPress-production decision recorded here on 2026-10-02.

## Canonical production

**The canonical public QuantDeus production site is:**

`https://quantdeus.whf.bz`

It is the persistent native WordPress runtime and owns:

- the public website;
- native `/wp-admin/`;
- WordPress content, users and roles;
- Media Library uploads;
- bbPress/forum data;
- service/content administration;
- native WordPress REST and free/self-hosted MCP execution.

WordPress is currently running as WordPress 7.1.2 on PHP 8.3.x with free/self-hosted MCP plugins available. WPVibe is not part of the canonical runtime.

## Mirror and control-plane topology

```
Canonical production
https://quantdeus.whf.bz
        │
        ├── WordPress / wp-admin / REST / native MCP
        │
        └── content source for public mirrors
                │
                ▼
https://quantdeus.vercel.app
        │
        ├── reverse-proxy public mirror
        ├── QuantDeus API / auth / Telegram
        └── OpenClaw / agent control plane
                │
                ▼
https://quantdeus.github.io
        └── public GitHub Pages mirror
```

Vercel remains a production **agent/API/control-plane runtime**, but it is not the canonical public WordPress origin.

GitHub Pages remains a public mirror and repository-backed fallback surface, but it is not the canonical WordPress runtime.

## Swarm → WordPress

The canonical free/self-hosted MCP endpoint is:

`https://quantdeus.whf.bz/wp-json/easy-mcp-ai/v1/mcp`

It is the WordPress lane inherited by the registered QuantDeus swarm through trusted OpenClaw. WPVibe is not required.

Rules:

1. All WordPress MCP operations target only `https://quantdeus.whf.bz` unless the owner explicitly names another site.
2. Hourly and autonomous scheduled swarm lanes are read-only; the runtime exposes only read/discovery tool families to those lanes.
3. Direct WordPress writes require an explicitly owner-authorized trusted task.
4. Write-capable MCP exposure additionally requires `QUANTDEUS_WORDPRESS_MCP_AUTHORIZATION`; when it is absent, writes fail closed.
5. Prefer reversible content/settings operations with a backup or undo path and verify the rendered production result.
6. Destructive, privilege-changing, theme-publish, plugin/core update, secret, spending or other high-impact operations remain human-controlled.
7. Never commit MCP credentials to GitHub and never fall back to hidden or guessed credentials.

## Source of truth split

- WordPress production content/state: `https://quantdeus.whf.bz`.
- Application source, agent policy, CI, Issues and evidence: `quantdeus/quantdeus.github.io@main`.
- Vercel: mirror + API + OpenClaw execution plane.
- GitHub Pages: mirror.

## Historical note

The earlier plan to package native WordPress itself into Vercel Container Functions is no longer the active production-hosting decision. Keep related implementation artifacts only as rollback/history unless a future owner decision explicitly reactivates that architecture.
