# QuantDeus Homunculi web twin

Route: `https://quantdeus.github.io/homunculi/`

The page mirrors the four QuantDeus coordination rooms and exposes the same eight Telegram bot roles:

- coord
- code
- science
- research
- security
- web
- ops
- archive

## Identity

Inside Telegram, the page reads the Telegram Mini App user context. In a normal browser it uses Telegram OIDC when `telegram-public.json` has been generated and `https://quantdeus.github.io` is allowed in BotFather.

The OIDC signature is verified in the browser for UI identity. Privileged backend operations must verify Telegram identity again server-side.

## Conversation storage

The zero-backend web mirror uses the existing Utterances/GitHub Issue rooms (#112–#115). Telegram identity is the QuantDeus account layer; Utterances may separately request GitHub OAuth to publish a comment to the repository issue.

## Bot bridge

Agent cards open the configured QuantDeus Telegram bot using `?start=agent_<role>`. The bot branch `bot-homunculi` recognizes that payload and returns the role-specific command.
