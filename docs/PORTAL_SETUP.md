# QuantDeus Forum and Services deployment

## Runtime layout

- GitHub Pages serves `/forum/`, `/store/`, and the shared Cosmic Frutiger Aero stylesheet.
- Vercel serves `vercel-dispatcher/api/quantdeus/community.js` and `orders.js` from the existing `vercel-dispatcher` project root.
- Forum threads and replies are public GitHub Issues/comments. Writes accept either server-verified Telegram Mini App `initData` or a server-verified Telegram OIDC ID token from the website login.
- Service inquiry / order JSON files live in the private `quantdeus/quantdeus_core.pulse` repository. Quote inquiries do not require registration: anonymous visitors provide a reply contact, while signed-in visitors may additionally attach their verified Telegram identity. Contact data stays in the private order repository.
- Preview deployments can read data but reject all writes. The API enables mutations only in Vercel production (unless an explicit preview override is set for a controlled test).

## Required Vercel environment variables

Set these in the Vercel project whose root directory is `vercel-dispatcher`:

| Variable | Purpose |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Verify signed Telegram Mini App data. Secret. |
| `QUANTDEUS_PRO_PAYMENT_PROVIDERS_JSON` | Secret JSON registry of Pro checkout providers used by the auth bot. Each entry may expose an HTTPS `month_url` and/or `year_url`; never commit real checkout URLs or provider credentials. |
| `QUANTDEUS_GITHUB_TOKEN` | GitHub API access: Issues read/write on `quantdeus/quantdeus.github.io`, Contents read on that repo, and Contents read/write on the private order repo. Secret. |
| `QUANTDEUS_OWNER_TELEGRAM_IDS` | Comma-separated owner IDs. Owner role cannot be changed through the site. |
| `QUANTDEUS_ADMIN_TELEGRAM_IDS` | Optional comma-separated admin IDs. |
| `QUANTDEUS_MODERATOR_TELEGRAM_IDS` | Optional comma-separated moderator IDs. |
| `QUANTDEUS_ORDER_HMAC_SECRET` | Long random secret for pseudonymous order and audit actor references. Secret. |
| `SBP_PHONE` | Optional. Required only for future fixed-price checkout; quote-based services do not use it. |
| `SBP_BANK` | Optional. Required only for fixed-price checkout. |
| `SBP_RECIPIENT` | Optional. Required only for fixed-price checkout. |
| `QUANTDEUS_ORDERS_REPOSITORY` | Optional private repo override; defaults to `quantdeus/quantdeus_core.pulse`. |

The Pro page links to `https://t.me/QuantDeus_bot?start=pro`. Both Telegram execution lanes read the same protected `QUANTDEUS_PRO_PAYMENT_PROVIDERS_JSON` registry, so adding or disabling a cashier does not require changing public source. The bot accepts at most six providers and only HTTPS checkout URLs.\n\nDo not put Telegram IDs, tokens, bank credentials, or phone configuration in HTML, JSON committed to the public repository, or client-side environment variables. Fixed product amounts are read server-side from `store/products.json`; an amount sent by the browser is ignored. Quote requests have no amount and do not expose payment instructions.

## Product catalog

Edit `store/products.json`. An item can be purchased only when `available` is `true` and `price_rub` is a positive integer. The initial QuantDeus entries intentionally have no prices and are unavailable for checkout; they are catalog records, not offers for sale.

## Status model

`created → payment_pending → paid | rejected`

The buyer action “Я оплатил” moves an order to `payment_pending` only. Owner/admin confirmation requires a note and creates an audit event. Repeat buyer confirmation is idempotent. Moderator role cannot view or confirm financial orders.

## Verification

From `vercel-dispatcher/` run:

```sh
node --test tests/portal-api.test.mjs
```

The tests cover forum moderation authorization, quote-based service inquiries, server-side fixed pricing, buyer/admin payment permissions, duplicate payment notification, and read-only previews.


## Website Telegram login

The canonical landing page, Forum and Services pages load `assets/qd-auth.js`.
In a normal browser it launches Telegram Login OIDC. In the Mini App it reuses
Telegram WebApp `initData`.

The backend identity endpoint is `/api/quantdeus/auth`; Forum and Services reuse
the same verifier. OIDC tokens are validated against Telegram JWKS and the
canonical client ID from `telegram-public.json`.

## Anonymous service inquiry acceptance

Current quote services may be submitted without a QuantDeus account. Anonymous
submission requires a reply contact and a sufficiently detailed request. The
backend adds a honeypot and a bounded abuse throttle before writing the inquiry
to the private repository.

Authentication remains mandatory for Forum publishing, moderation, admin order
views, and any future fixed-price payment lifecycle.
