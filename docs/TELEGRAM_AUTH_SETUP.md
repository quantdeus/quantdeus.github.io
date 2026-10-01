# Telegram bot + website login setup

QuantDeus uses one Telegram identity layer across two surfaces:

1. **Mini App** → Telegram WebApp `initData`, verified server-side.
2. **Normal website** → Telegram Login OIDC, verified server-side against Telegram JWKS.

The shared browser client is `assets/qd-auth.js`. The Vercel verifier is
`vercel-dispatcher/lib/telegram-auth.js`, exposed through
`/api/quantdeus/auth`.

## Public OIDC configuration

`telegram-public.json` contains only non-secret bot identity:

- `client_id` / bot ID;
- bot username;
- display name.

The current file is generated from Telegram `getMe`; no bot token is written to
GitHub Pages.

## BotFather one-time domain binding

In @BotFather:

- select `@QuantDeus_bot`;
- open **Login Widget / Web Login** settings;
- allow `https://quantdeus.github.io` as the website origin.

This is the only owner-side Telegram configuration that cannot be represented by
repository code.

## Verification contract

Website login uses the official Telegram Login SDK. The resulting OIDC
`id_token` is sent as `Authorization: Bearer …` to the Vercel API.

The backend verifies:

- JWT algorithm is RS256;
- signature against `https://oauth.telegram.org/.well-known/jwks.json`;
- issuer is `https://oauth.telegram.org`;
- audience matches the canonical QuantDeus Telegram client ID;
- expiration / issued-at bounds.

Mini App requests continue to use `x-telegram-init-data` and the Telegram
WebApp HMAC verification path.

Forum writes accept either verified identity mechanism. Browser UI state by
itself is never trusted for authorization.

## Service inquiries

Quote-based service inquiries are intentionally independent from registration.

A visitor may submit:

- service;
- task / event description;
- reply contact (Telegram handle, phone, or email).

If the visitor is logged in through Telegram, the verified Telegram identity is
also attached privately. If not, the inquiry is stored with
`source: anonymous_web`.

Anonymous inquiries have:

- no payment amount;
- no payment action;
- a honeypot field and a small per-instance abuse throttle;
- contact data only in the private order repository.

## Required runtime storage

The Vercel Portal backend still needs `QUANTDEUS_GITHUB_TOKEN` with the scoped
access required to persist service inquiries into the private orders repository.
`QUANTDEUS_ORDERS_REPOSITORY` is optional; the default remains
`quantdeus/quantdeus_core.pulse`.

For moderator audit pseudonyms and future fixed-price customer ownership,
`QUANTDEUS_ORDER_HMAC_SECRET` should also be configured.

`TELEGRAM_BOT_TOKEN` is still used by Telegram Bot / Mini App server
verification. Website OIDC verification itself does not require the bot token at
request time once the public client ID is configured.
