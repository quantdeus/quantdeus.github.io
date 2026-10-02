# QuantDeus WordPress Platform

WordPress is the canonical QuantDeus application/CMS runtime after the owner-declared migration on 2026-10-02.

## Canonical source

- `src/quantdeus-core/` — first-party application plugin: services, inquiries, forum, Telegram Mini App identity, RBAC, admin and bounded agent REST.
- `src/quantdeus-aero/` — first-party Cosmic Frutiger Aero theme.
- `blueprint.json` — reproducible developer/CI preview using WordPress Playground `git:directory` resources.
- root `/index.html` — canonical GitHub Pages WordPress launcher at `https://quantdeus.github.io/`.
- `wordpress/index.html` — compatibility redirect from the former `/wordpress/` URL to the root.

During migration, GitHub Pages may remain a legacy/rollback entrypoint. **WordPress Playground is preview/CI only, not the target production application runtime.** The production target is server-side WordPress 7.1.2 on a PHP 8.3-capable host with persistent MySQL/MariaDB storage and persistent uploads, exposing the normal `/wp-admin/` runtime.

## Runtime rule

WordPress owns public pages, content, users, roles, services, guest inquiries, forum/community data and admin.

GitHub remains canonical for source code, CI, issues, evidence and swarm coordination. Telegram/OpenClaw integrate directly through WordPress REST or GitHub-native paths.

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


## Production runtime gate

The repository now contains the native WordPress application layer, but a static GitHub Pages origin cannot execute a persistent PHP/MySQL WordPress installation.

Production cutover therefore requires an owner-selected WordPress-capable runtime with:

- WordPress 7.1.2;
- PHP 8.3-compatible server runtime;
- persistent MySQL/MariaDB;
- persistent `wp-content/uploads`;
- HTTPS and canonical domain mapping;
- server-side secrets for Telegram/GitHub auth;
- backups/rollback;
- deployment of `quantdeus-core` and `quantdeus-aero`.

Until that runtime is explicitly selected and approved, GitHub Pages/Playground is migration preview/rollback evidence only and must not be described as the final native production WordPress engine.
