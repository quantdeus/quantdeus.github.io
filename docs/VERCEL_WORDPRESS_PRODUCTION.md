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
- native WordPress REST and WPVibe plugin execution.

WordPress is currently running as WordPress 7.1.2 on PHP 8.3.x with the WPVibe plugin connected.

## Mirror and control-plane topology

```
Canonical production
https://quantdeus.whf.bz
        │
        ├── WordPress / wp-admin / REST / WPVibe
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

Trusted OpenClaw may connect to WPVibe through its official remote MCP endpoint:

`https://mcp.wpvibe.ai/mcp`

The shared WPVibe OAuth identity is operator-managed and stored by OpenClaw in its persistent owner-only state. Credentials are never committed to GitHub.

Rules:

1. WPVibe operations target only `https://quantdeus.whf.bz` unless the owner explicitly names another connected site.
2. Hourly and autonomous scheduled swarm lanes are read-only in WPVibe.
3. Direct WordPress writes require an explicitly owner-authorized trusted task.
4. Prefer reversible content/settings operations and WPVibe's native safety gates.
5. Destructive, privilege-changing, theme-publish, plugin/core update or equivalent high-impact operations must respect WPVibe approval requirements.
6. Missing OAuth is fail-closed: agents report the authorization handoff instead of inventing access or using hidden credentials.

## Source of truth split

- WordPress production content/state: `https://quantdeus.whf.bz`.
- Application source, agent policy, CI, Issues and evidence: `quantdeus/quantdeus.github.io@main`.
- Vercel: mirror + API + OpenClaw execution plane.
- GitHub Pages: mirror.

## Historical note

The earlier plan to package native WordPress itself into Vercel Container Functions is no longer the active production-hosting decision. Keep related implementation artifacts only as rollback/history unless a future owner decision explicitly reactivates that architecture.
