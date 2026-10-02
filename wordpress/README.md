# QuantDeus WordPress Platform

This directory is the canonical staging package for the migration in Issue #359.

## Architecture

- `dist/quantdeus-core.zip` — first-party WordPress application plugin package.
- `dist/quantdeus-aero.zip` — first-party Cosmic Frutiger Aero theme package.
- `blueprint.json` — WordPress Playground bundle blueprint.
- `dist/quantdeus-wordpress-blueprint.zip` — self-contained staging bundle.
- `index.html` — browser launcher used by the existing `/wordpress/` route after merge.

The staging bundle moves the application surface into WordPress:

- Services and guest inquiries → WordPress custom post types + REST.
- Forum threads/replies/moderation → WordPress posts/comments + REST.
- Telegram Login / Mini App identity → `quantdeus-core` server verification and WordPress session.
- RBAC → WordPress roles/capabilities.
- Admin → native `wp-admin` + QuantDeus dashboard.
- SEO → WordPress sitemap/canonical plus QuantDeus metadata/schema.
- Agent integration → bounded REST context/evidence endpoints using WordPress authentication/Application Passwords.

The packaged source remains inspectable inside the plugin/theme ZIPs. The old Vercel/GitHub Portal remains unchanged until an explicit production cutover.
