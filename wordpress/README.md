# QuantDeus WordPress Platform

WordPress is the canonical QuantDeus application/CMS runtime after the owner-declared migration on 2026-10-02.

## Canonical source

- `src/quantdeus-core/` — first-party application plugin: services, inquiries, forum, Telegram Mini App identity, RBAC, admin and bounded agent REST.
- `src/quantdeus-aero/` — first-party Cosmic Frutiger Aero theme.
- `blueprint.json` — reproducible developer/CI preview using WordPress Playground `git:directory` resources.
- `index.html` — developer preview launcher for the GitHub Pages repository.

The production WordPress origin is owner-managed and is intentionally not hard-coded here until the final public domain is declared as repository configuration.

## Runtime rule

WordPress owns public pages, content, users, roles, services, guest inquiries, forum/community data and admin.

GitHub remains canonical for source code, CI, issues, evidence and swarm coordination. Telegram/OpenClaw integrate directly through WordPress REST or GitHub-native paths.

**Make.com is not an application dependency.** Do not add Make scenarios, Make webhooks, polling bridges or a second orchestration layer to the canonical WordPress runtime.

Legacy GitHub Pages/Vercel Portal code may remain temporarily as rollback/history evidence, but it is not the target product runtime.
