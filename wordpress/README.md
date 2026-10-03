# QuantDeus WordPress Platform

WordPress is the canonical QuantDeus application/CMS runtime after the owner-declared migration on 2026-10-02.

## Canonical source

- `src/quantdeus-core/` — first-party application plugin: services, inquiries, forum, Telegram Mini App identity, RBAC, admin and bounded agent REST.
- `src/quantdeus-aero/` — first-party Cosmic Frutiger Aero theme.
- `blueprint.json` — reproducible developer/CI preview using WordPress Playground `git:directory` resources.
- root `/index.html` — canonical GitHub Pages WordPress launcher at `https://quantdeus.github.io/`.
- `wordpress/index.html` — compatibility redirect from the former `/wordpress/` URL to the root.

**Current production is the native WordPress runtime at `https://quantdeus.whf.bz`.** WordPress Playground is preview/CI only. Vercel (`https://quantdeus.vercel.app`) is the reverse-proxy mirror plus API/OpenClaw control plane, and GitHub Pages (`https://quantdeus.github.io`) is a public mirror.

## Runtime rule

WordPress owns public pages, content, users, roles, services, guest inquiries, forum/community data and admin.

GitHub remains canonical for source code, CI, issues, evidence and swarm coordination. Telegram/OpenClaw integrate through WordPress REST, GitHub-native paths, and the guarded native WordPress MCP lane at `https://quantdeus.whf.bz/wp-json/easy-mcp-ai/v1/mcp`. All registered agents inherit this production target; scheduled autonomous lanes are read-only, while direct production writes require an explicitly owner-authorized trusted task plus configured MCP authorization.

**Make.com is not an application dependency.** Do not add Make scenarios, Make webhooks, polling bridges or a second orchestration layer to the canonical WordPress runtime.

Legacy GitHub Pages/Vercel Portal code may remain temporarily as rollback/history evidence, but it is not the target product runtime.

## Native admin + visual ownership

- Target core: **WordPress 7.1.2**.
- `/wp-admin/` remains the native WordPress control plane.
- Appearance → Customize → **QuantDeus · Cosmic Frutiger Aero** uses the native Media Library for the header, hero and portal gallery.
- Appearance → Menus owns the Primary Menu; the theme only seeds the first canonical hierarchy.
- Appearance → Customize / Site Identity owns the custom logo.
- `theme.json` exposes QuantDeus layout, palette, typography and spacing to the native block editor.
- No third-party page builder is required by the canonical portal.


## Production runtime status

The production gate is satisfied by the owner-selected native WordPress host at `https://quantdeus.whf.bz`:

- WordPress 7.1.2;
- PHP 8.3.x;
- persistent WordPress database/uploads on the host;
- native `/wp-admin/`;
- free/self-hosted WordPress MCP plugins connected; WPVibe is not required;
- Vercel and GitHub Pages retained as mirrors/control surfaces rather than the canonical WordPress origin.

Production-changing agent work must preserve rollback evidence and follow the native WordPress MCP/OpenClaw guardrails documented in `docs/VERCEL_WORDPRESS_PRODUCTION.md`.
