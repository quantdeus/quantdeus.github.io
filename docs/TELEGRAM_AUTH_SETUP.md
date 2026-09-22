# Telegram bot + website login setup

QuantDeus uses two Telegram surfaces:

1. **Mini App menu button** → `https://quantdeus.github.io/telegram/`
2. **Website Login** → Telegram Login / OIDC on `https://quantdeus.github.io/`

## Repository secret

Create the repository Actions secret:

- `QUANTDEUS_TELEGRAM_BOT_TOKEN`

Do not commit or paste the token into repository files.

After the secret exists, run the workflow **Set Telegram Mini App URL** manually. It validates `getMe`, applies `setChatMenuButton`, then verifies the resulting menu URL.

## BotFather Login Widget

In @BotFather:

- select the QuantDeus bot;
- open **Login Widget**;
- add `https://quantdeus.github.io` to Allowed URLs / trusted origins.

The public site loads only non-secret bot identity generated at deploy time. The bot token is never written to GitHub Pages.

## Runtime behavior

- Inside Telegram Mini App, the UI uses Telegram WebApp user context.
- In a normal browser, the site shows **Войти через Telegram** and uses Telegram Login OIDC.
- Browser OIDC ID tokens are checked against Telegram JWKS before the UI marks the session `OIDC ✓`.
- Any future privileged backend action should validate the ID token again server-side.
