# External coordination channel contract

Status: implementation contract for Issue #10. This document configures **no live channel** and sends **no message**.

## Goal

Allow the QuantDeus coordinator to emit low-volume, opt-in notifications through exactly one explicitly configured adapter (Telegram, Slack, Discord, or generic webhook) without storing credentials in tracked files.

## Safety and consent gates

1. **Default off.** If no adapter is explicitly enabled, delivery is a no-op.
2. **Secrets only.** Tokens, chat/channel IDs when sensitive, and webhook URLs must come from repository/environment secrets; never commit them or echo them to logs.
3. **Opt-in destination.** A destination is eligible only after an owner explicitly configures it. Discovery of a URL/token is not consent.
4. **No blind retry.** One event gets one delivery attempt unless a human explicitly requests a retry.
5. **No production side effects from tests.** Validation uses dry-run/redacted payloads unless a destination has been explicitly approved for a live smoke test.
6. **Minimal payload.** Send event type, public-safe summary, public evidence URL/commit, and timestamp. Exclude private leads, secrets, webhook URLs, internal checkpoints and unverified metrics.
7. **Auditability.** Record provider, event ID/hash, attempt timestamp and outcome; never record the credential itself.

## Adapter interface

Each provider implements the same logical contract:

```text
send(event) -> { status: disabled|dry_run|accepted|failed, provider, event_id, timestamp }
```

Required event fields:

```text
kind        # e.g. coord.task.done, coord.task.blocked
summary     # public-safe, <= 500 chars
evidence    # public GitHub URL or commit SHA
timestamp   # ISO-8601
```

Optional field: `severity = info|attention`.

## Configuration contract

A future implementation may use variables such as:

- `QD_NOTIFY_PROVIDER` = `telegram|slack|discord|webhook`
- `QD_NOTIFY_ENABLED` = `true` only after explicit configuration
- provider credentials/destination stored as repository secrets

Variable names are documentation, not evidence that secrets or a channel exist.

## Dedupe / rate guard

- Dedupe key: `kind + evidence`.
- Do not deliver the same key twice in a coordinator cycle.
- Default maximum: 3 accepted coordination notifications per day per configured destination.
- `failed` is not `accepted`; retries remain human-controlled.

## Verification matrix

| Test | Expected result |
|---|---|
| No provider configured | `disabled`, zero network delivery |
| Provider named but enable flag false | `disabled` |
| Dry-run with valid public-safe event | redacted payload produced, zero network delivery |
| Event contains secret-like field/webhook URL | rejected before adapter |
| Duplicate `kind + evidence` | second attempt suppressed |
| Fourth accepted event in same day | suppressed by rate guard |
| Explicitly approved live smoke test | one attempt; accepted only if provider returns success |
| Provider error | `failed`; no automatic retry |

## Acceptance evidence for Issue #10

Issue #10 is complete only when all of the following are true:

- one adapter is implemented and disabled by default;
- configuration reads credentials only from secrets/environment;
- dry-run tests prove no delivery when disabled;
- secret/redaction, dedupe and daily rate guards are tested;
- an owner has explicitly configured a destination;
- if a live smoke test is authorized, its accepted provider response is recorded without exposing credentials.

Until those conditions are observed, the correct state is **blocked**, not done.
