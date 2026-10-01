# QuantDeus Forum and Services deployment

## Runtime layout

- GitHub Pages serves `/forum/`, `/store/`, and the shared Cosmic Frutiger Aero stylesheet.
- Vercel serves `vercel-dispatcher/api/quantdeus/community.js` and `orders.js` from the existing `vercel-dispatcher` project root.
- Forum threads and replies are public GitHub Issues/comments. Telegram Mini App `initData` is verified on the server before every write.
- Service inquiry / order JSON files live in the private `quantdeus/quantdeus_core.pulse` repository. The public repository contains only the service catalog; Telegram contact context for quote requests stays in the private order repository.
- Preview deployments can read data but reject all writes. The API enables mutations only in Vercel production (unless an explicit preview override is set for a controlled test).

## Required Vercel environment variables

Set these in the Vercel project whose root directory is `vercel-dispatcher`:

| Variable | Purpose |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Verify signed Telegram Mini App data. Secret. |
| `QUANTDEUS_GITHUB_TOKEN` | GitHub API access: Issues read/write on `quantdeus/quantdeus.github.io`, Contents read on that repo, and Contents read/write on the private order repo. Secret. |
| `QUANTDEUS_OWNER_TELEGRAM_IDS` | Comma-separated owner IDs. Owner role cannot be changed through the site. |
| `QUANTDEUS_ADMIN_TELEGRAM_IDS` | Optional comma-separated admin IDs. |
| `QUANTDEUS_MODERATOR_TELEGRAM_IDS` | Optional comma-separated moderator IDs. |
| `QUANTDEUS_ORDER_HMAC_SECRET` | Long random secret for pseudonymous order and audit actor references. Secret. |
| `SBP_PHONE` | Optional. Required only for future fixed-price checkout; quote-based services do not use it. |
| `SBP_BANK` | Optional. Required only for fixed-price checkout. |
| `SBP_RECIPIENT` | Optional. Required only for fixed-price checkout. |
| `QUANTDEUS_ORDERS_REPOSITORY` | Optional private repo override; defaults to `quantdeus/quantdeus_core.pulse`. |

Do not put Telegram IDs, tokens, bank credentials, or phone configuration in HTML, JSON committed to the public repository, or client-side environment variables. Fixed product amounts are read server-side from `store/products.json`; an amount sent by the browser is ignored. Quote requests have no amount and do not expose payment instructions.

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
