# QuantDeus WordPress Platform

WordPress is the target canonical QuantDeus application and CMS runtime.

## Production target

The production-grade implementation is under native/:

- native/wp-content/themes/quantdeus-horizon — Full Site Editing child theme of Twenty Twenty-Five;
- native/docker-compose.yml — reproducible persistent WordPress 7.1.2 plus MySQL staging stack;
- src/quantdeus-core — first-party domain plugin for services, inquiries, Forum, RBAC, auth, Federation, Research and REST;
- docs/NATIVE_WORDPRESS_CUTOVER.md — production cutover and rollback contract.

The native runtime uses a shared server database and persistent uploads. Native /wp-admin/ and the Site Editor are the only CMS control plane.

## Playground status

blueprint.json and staging-blueprint.json are developer and CI previews only.

The current GitHub Pages launcher still boots WordPress Playground in the browser. Production smoke on 2026-10-02 proved that this cannot be treated as the final multi-user WordPress runtime because browser-local WordPress storage is not the shared canonical database.

Playground therefore remains:
- a reversible preview;
- a compatibility test;
- a rollback surface while native staging is validated.

It is not the production persistence layer.

## Runtime rule

WordPress owns public pages, content, users, roles, services, guest inquiries, forum/community data and admin.

GitHub remains canonical for source code, CI, issues, evidence and swarm coordination. Telegram and OpenClaw integrate through explicit APIs.

Make.com is not an application dependency. Do not add Make scenarios, Make webhooks, polling bridges or a second orchestration layer to the canonical WordPress runtime.

## Design rule

QuantDeus Horizon is a native block theme:
- Site Editor templates and template parts;
- native Navigation block;
- real photographic imagery as primary visuals;
- Cosmic Frutiger Aero DAY/EARTH plus NIGHT/HORIZON system;
- responsive menu collapse before horizontal overflow;
- Dashicons for utility iconography;
- no SVG illustration placeholders on the canonical native homepage.

Production cutover is gated by native staging smoke and explicit owner approval.
