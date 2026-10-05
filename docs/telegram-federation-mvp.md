# Governed Telegram Federation MVP — Issue #430

Issue #430 is implemented as a bounded federation layer on top of the existing webhook-only QuantDeus Telegram/OpenClaw control plane.

## What the MVP does

- keeps Telegram transport webhook-only;
- requires explicit opt-in and owner/admin approval for adding nodes;
- drops bot-authored updates and suppresses immediate duplicate update IDs;
- applies bounded per-chat rate limits before LLM/OpenClaw work;
- exposes webhook health plus an advisory scale-request signal;
- never provisions infrastructure or spends money automatically;
- keeps external outreach opt-in only and forbids mass autonomous posting.

## Scaling contract

A scale request is evidence, not authority. When pending Telegram updates cross the configured threshold, the runtime may report:

`scale_request.requested=true`

The only allowed action is `owner-review`. No server purchase, paid resource creation, privilege escalation, or external commitment may happen from this signal alone.

## Failure and falsification criteria

The MVP should be reconsidered if any of these occur:

1. legitimate users are rate-limited at normal conversational load;
2. duplicate suppression drops Telegram redelivery needed after a failed response;
3. pending-update thresholds do not correlate with observable queue pressure;
4. webhook-only operation regresses;
5. bot-authored messages can trigger bot-to-bot loops;
6. any code path turns an advisory scale request into autonomous provisioning or spend.

## Scope deliberately not included

- autonomous bot replication;
- autonomous server discovery/purchase;
- unsolicited mass outreach;
- credential sharing between humans;
- bypassing qShield/RBAC/owner gates.

These are outside the bounded MVP and require a separate owner-approved design review.
