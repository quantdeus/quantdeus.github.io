# QuantDeus Portal / Forum / Services deployment

## Runtime layout

- GitHub Pages serves the public landing page, `/telegram/`, `/forum/`, `/store/`, and shared Cosmic Frutiger Aero assets.
- Vercel serves `/api/quantdeus/auth`, `community`, and `orders` from the existing `vercel-dispatcher` project.
- Telegram Mini App requests use server-verified `initData`.
- Ordinary browser sessions use Telegram OIDC. Vercel verifies Telegram's signed `id_token`, then returns a short-lived QuantDeus session token signed server-side.
- Forum writes require a verified Telegram Mini App or browser session.
- **Quote service inquiries do not require registration or Telegram login.** Guests provide a name, a reply contact, and the request description.
- Service inquiry/order JSON files live in the private `quantdeus/quantdeus_core.pulse` repository. Guest contact details never go into the public repository.
- Preview deployments can read data but reject mutations unless `QD_ENABLE_PREVIEW_WRITES=true` is set for a controlled smoke.

## Required Vercel environment variables

Configure these in the Vercel project whose root is `vercel-dispatcher`:

| Variable | Purpose |
| --- | --- |
| `TELEGRAM_OAUTH_CLIENT_ID` | Telegram browser-login/OIDC client ID. Required for **website login**. This value may be returned publicly by the auth config endpoint. |
| `QUANTDEUS_SESSION_SECRET` | Long random secret used to sign short-lived browser sessions. Preferred dedicated secret. If absent, the runtime falls back to `QUANTDEUS_ORDER_HMAC_SECRET`. |
| `TELEGRAM_BOT_TOKEN` | Secret used to verify Telegram Mini App `initData`. Required for Mini App authenticated actions, not for anonymous service inquiries. |
| `QUANTDEUS_GITHUB_TOKEN` | GitHub API access: Issues read/write on `quantdeus/quantdeus.github.io` and Contents read/write on the private order repo. Required for Forum persistence and storing service inquiries. |
| `QUANTDEUS_OWNER_TELEGRAM_IDS` | Comma-separated owner Telegram IDs. |
| `QUANTDEUS_ADMIN_TELEGRAM_IDS` | Optional comma-separated admin IDs. |
| `QUANTDEUS_MODERATOR_TELEGRAM_IDS` | Optional comma-separated moderator IDs. |
| `QUANTDEUS_ORDER_HMAC_SECRET` | Long random secret for pseudonymous authenticated order/audit references. Also acts as a browser-session fallback secret if `QUANTDEUS_SESSION_SECRET` is not set. |
| `QUANTDEUS_ORDERS_REPOSITORY` | Optional private repo override; defaults to `quantdeus/quantdeus_core.pulse`. |
| `SBP_PHONE`, `SBP_BANK`, `SBP_RECIPIENT` | Optional; needed only for future fixed-price checkout. Current quote services do not expose payment instructions. |

Do not commit Telegram tokens, GitHub tokens, session secrets, owner IDs, bank details, or private customer contacts to the public repository.

## Telegram browser login

The public pages load `/assets/telegram-auth.js`.

Browser flow:

1. The page asks `/api/quantdeus/auth` for public login configuration.
2. Telegram Login OIDC returns a signed `id_token`.
3. The browser sends only that `id_token` to Vercel.
4. Vercel validates issuer, audience, expiry, Telegram JWKS signature, and user ID.
5. Vercel returns a short-lived QuantDeus session token.
6. The browser keeps the token in `sessionStorage`; Forum/Admin APIs re-verify its server signature on every request.

Configure the QuantDeus website origin/redirect permissions in Telegram/BotFather for the production site before enabling `TELEGRAM_OAUTH_CLIENT_ID`.

Mini App sessions remain separate and continue to use signed `initData`.

## Current service catalog

`store/products.json` is the public server-authoritative catalog.

Current live offerings:

- **Автоматизация бизнеса** — `pricing_mode: "quote"`, no fixed price.
- **Концерт Ксении Чередниковой** — `pricing_mode: "quote"`, no fixed price.

### Guest inquiry

A guest can submit a quote inquiry without creating an account:

`service → name + reply contact + request note → inquiry_created`

Stored private contact fields:

- display name;
- reply contact entered by the guest (Telegram username, phone, or email);
- request description.

The guest receives an inquiry ID. Guest inquiries do not receive payment actions or authenticated order-management access.

### Authenticated inquiry

A Telegram-authenticated user can submit the same quote inquiry. Telegram identity is stored only in the private order record and is pseudonymized in audit references.

### Future fixed-price products

Fixed-price checkout remains available as:

`created → payment_pending → paid | rejected`

A fixed-price purchase still requires Telegram authentication. A buyer cannot mark an order as paid; `Я оплатил` only moves it to `payment_pending`, and owner/admin confirmation requires an audit note.

## Verification

From `vercel-dispatcher/`:

```sh
node --check api/quantdeus/auth.js
node --check lib/telegram-auth.js
node --test tests/portal-api.test.mjs
```

The Portal tests cover:

- anonymous Forum write denial;
- Mini App authorization and RBAC;
- signed browser Telegram sessions;
- registration-free guest quote inquiries;
- required guest reply contact;
- fixed-price auth enforcement;
- server-authoritative pricing;
- audited payment confirmation;
- preview write denial.
