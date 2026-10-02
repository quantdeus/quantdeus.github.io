# QuantDeus WordPress platform migration — canonical runtime contract

Tracks: Issue #359.

## Decision and cutover

On 2026-10-02 the owner declared the site migration complete: **WordPress is now the canonical application/CMS runtime for QuantDeus.**

The repository `quantdeus/quantdeus.github.io` remains the canonical source/CI/evidence/swarm repository.

**Public cutover:** `https://quantdeus.github.io/` is the canonical public entrypoint and boots the canonical QuantDeus WordPress Playground runtime from `wordpress/blueprint.json`. The legacy `https://quantdeus.github.io/wordpress/` route redirects to the root entrypoint.

GitHub Pages itself is static hosting and does not execute PHP server-side; the WordPress runtime at this origin is therefore delivered through WordPress Playground in the browser. A future persistent PHP/MySQL WordPress host can replace the Playground transport without changing the first-party `quantdeus-core` and `quantdeus-aero` source contract.

## Canonical component mapping

| Legacy surface | Canonical WordPress surface | Status |
| --- | --- | --- |
| Static/Vercel homepage | `quantdeus-aero` theme | migrated |
| `store/products.json` | `qd_service` | migrated |
| guest inquiry delivery/webhook fallback | private `qd_inquiry` records | migrated; direct WordPress persistence |
| GitHub-Issues-backed Forum UI | `qd_forum_thread` + WordPress comments | migrated target |
| Telegram Mini App identity | `quantdeus-core` verification + WordPress session | canonical |
| owner/admin/moderator/member | WordPress roles/capabilities | canonical |
| Portal admin | native `wp-admin` QuantDeus surfaces | canonical |
| Portal SEO metadata | WordPress canonical/sitemap/theme metadata/schema | canonical |
| agent context/evidence | bounded `/wp-json/quantdeus/v1/` API | canonical integration surface |

## No-Make invariant

The canonical WordPress architecture has **no Make.com dependency**.

Allowed integration paths:
- WordPress REST/API;
- direct Telegram Bot API / Telegram Mini App verification;
- GitHub Actions and GitHub API/MCP;
- OpenClaw and external AI providers through explicit bounded APIs.

Not canonical:
- Make scenarios;
- Make webhook inboxes;
- Make polling;
- Make as a transport/orchestration layer;
- duplicated control planes outside the WordPress/GitHub/OpenClaw contracts.

Guest inquiries are persisted directly in WordPress and remain valid without registration.

## WordPress secret/config contract

Secrets belong in `wp-config.php` or the host environment and are never committed.

```php
define('QD_TELEGRAM_CLIENT_ID', '8122160274');
define('QD_TELEGRAM_BOT_USERNAME', 'QuantDeus_bot');
define('QD_TELEGRAM_BOT_TOKEN', getenv('TELEGRAM_BOT_TOKEN'));
define('QD_OWNER_TELEGRAM_IDS', getenv('QUANTDEUS_OWNER_TELEGRAM_IDS'));
define('QD_ADMIN_TELEGRAM_IDS', getenv('QUANTDEUS_ADMIN_TELEGRAM_IDS'));
define('QD_MODERATOR_TELEGRAM_IDS', getenv('QUANTDEUS_MODERATOR_TELEGRAM_IDS'));
```

## Repository responsibilities after migration

1. Keep `wordpress/src/quantdeus-core` and `wordpress/src/quantdeus-aero` reviewable as text source.
2. Run WordPress Playground CI from source via `git:directory`; do not commit generated ZIP packages.
3. Keep WordPress REST contracts smoke-tested.
4. Treat legacy Portal/Vercel files as rollback/history only until deliberately archived/removed.
5. Route new product work to WordPress, not legacy `/forum/`, `/store/` or Vercel Portal APIs.
6. Keep secrets out of Git.
7. Preserve a rollback snapshot before any destructive production migration.

## SEO and content

- semantic server-rendered WordPress pages;
- WordPress canonical URLs/XML sitemap;
- page-level titles/descriptions and OpenGraph;
- Organization schema for QuantDeus and Person schema where source-backed;
- editable image alt text and Media Library;
- responsive Cosmic Frutiger Aero presentation.

Ksenia Cherednikova biography, regalia, photos, social links and media must remain source-backed; missing items are owner/content inputs, never invented.

## Verification

CI must prove:
- PHP syntax for first-party source;
- Playground can install plugin/theme from the repository;
- `/wp-json/quantdeus/v1/health` reports `engine=wordpress` and `make_dependency=false`;
- both current quote services exist;
- the WordPress holding homepage renders;
- no Make dependency appears in canonical WordPress source/docs.
