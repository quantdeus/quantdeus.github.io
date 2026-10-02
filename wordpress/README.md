# QuantDeus WordPress Platform

WordPress is the canonical QuantDeus application/CMS runtime after the owner-declared migration on 2026-10-02.

## Canonical source

- `src/quantdeus-core/` — first-party application plugin: services, inquiries, forum, Telegram Mini App identity, RBAC, admin and bounded agent REST.
- `src/quantdeus-aero/` — first-party Cosmic Frutiger Aero theme.
- `blueprint.json` — reproducible developer/CI preview using WordPress Playground `git:directory` resources.
- root `/index.html` — canonical GitHub Pages WordPress launcher at `https://quantdeus.github.io/`.
- `wordpress/index.html` — compatibility redirect from the former `/wordpress/` URL to the root.

GitHub Pages serves the public entrypoint while WordPress Playground executes PHP/WordPress in the browser from the canonical Blueprint.

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
