# QuantDeus WordPress platform migration — implementation contract

Tracks: Issue #359.

## Decision

WordPress is the target primary application engine for QuantDeus, not only a marketing CMS.

## Implemented staging slice

| Current QuantDeus surface | WordPress target | Staging implementation |
| --- | --- | --- |
| Static/Vercel portal homepage | WordPress theme | `quantdeus-aero` front page |
| `store/products.json` | `qd_service` records | Seeded by `quantdeus-core` |
| private GitHub inquiry JSON | `qd_inquiry` private records | Guest REST inquiry endpoint + admin list |
| GitHub Issues forum | `qd_forum_thread` + WP comments | Read/create/reply/moderate REST API |
| Telegram website/Mini App auth | WordPress users/sessions | OIDC RS256 + Mini App HMAC verification |
| owner/admin/moderator/member | WordPress roles/capabilities | Telegram ID mapping + `qd_moderator` |
| Portal admin UI | `wp-admin` | QuantDeus dashboard, services, inquiries, forum |
| Portal metadata | WP sitemap/canonical + theme/plugin metadata | meta description, OpenGraph, Schema.org |
| OpenClaw/GitHub evidence | WP REST integration | `/agent/context` + idempotent `/agent/evidence` |

## WordPress secret/config contract

Secrets belong in `wp-config.php` or host environment, never in the repository.

```php
define('QD_TELEGRAM_CLIENT_ID', '8122160274');            // public identifier
define('QD_TELEGRAM_BOT_USERNAME', 'QuantDeus_bot');      // public identifier
define('QD_TELEGRAM_BOT_TOKEN', getenv('TELEGRAM_BOT_TOKEN'));
define('QD_OWNER_TELEGRAM_IDS', getenv('QUANTDEUS_OWNER_TELEGRAM_IDS'));
define('QD_ADMIN_TELEGRAM_IDS', getenv('QUANTDEUS_ADMIN_TELEGRAM_IDS'));
define('QD_MODERATOR_TELEGRAM_IDS', getenv('QUANTDEUS_MODERATOR_TELEGRAM_IDS'));
define('QD_TELEGRAM_CHAT_ID', getenv('TELEGRAM_CHAT_ID')); // optional inquiry push
define('QD_INQUIRY_EMAIL', getenv('QD_INQUIRY_EMAIL'));    // optional email fallback
```

Application Passwords should be used for external automation identities. The staging agent API is deliberately bounded to context reads and evidence writes; it is not a second orchestration plane.

## Ksenia Cherednikova content

The starter profile uses only public facts backed by currently discoverable profiles and leaves the official hero photo editable from the WordPress Media Library/featured image.

Starter references:

- SMS Casting: https://smscasting.ru/actor/1607
- Telegram: https://t.me/KseniaCherednikova
- OK.ru: https://ok.ru/kseniyache
- Profi.ru public profile surfaced in 2026 search for the 2024 Moscow A Cappella achievement

A real official photo asset was not found in the connected project Dropbox under Ksenia/Чередникова/Чувствую searches, so staging does not copy or hotlink an unverified third-party image.

## SEO

- semantic server-rendered WordPress pages;
- WordPress core canonical URLs and XML sitemap;
- page-specific descriptions;
- OpenGraph basics;
- `Organization` schema on the site and `Person` schema on the Ksenia page;
- editable media alt text through WordPress;
- mobile-first responsive theme.

## Migration / cutover gates

1. WordPress bundle boots in CI.
2. `/wp-json/quantdeus/v1/health` returns `engine=wordpress`.
3. Two seeded services are exposed by WordPress REST.
4. Guest inquiry contract is exercised in staging without requiring registration.
5. Forum read and authenticated write contracts pass.
6. Telegram domain binding is configured for the final WordPress production origin.
7. Production WordPress hosting supports plugins/theme and secure environment constants.
8. Backup and rollback snapshot exists.
9. Redirect map from legacy `/forum/`, `/store/`, Portal pages is tested.
10. Owner explicitly approves DNS/domain cutover.

## Current external blocker

The existing `quantdeus.wordpress.com` site is present but WordPress.com reports site-scoped MCP access unavailable until that site has a paid plan. That does not block the GitHub/Playground staging package; it blocks direct remote installation/configuration through the connected WordPress.com management tools.

No DNS switch, WordPress.com plan purchase, secret mutation, or production replacement is performed by this staging implementation.
