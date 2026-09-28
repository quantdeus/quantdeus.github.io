# Human Potential v2 — local feedback prototype specification

## Goal

Define a feature-branch-ready, non-production feedback loop for the QuantDeus Mini App. The published site must not be modified by this task.

## UI contract

Each eligible content/result card may expose two compact controls:

- **Useful** — records useful=true.
- **Not useful** — records useful=false.

An optional text field labeled **Optional note** may be shown after a choice. The note is not required to submit feedback.

## Storage contract

Default storage is browser-local only.

Suggested record fields:
- schema_version: 1
- item_id: stable-local-item-id
- useful: boolean
- note: optional short text
- created_at: ISO-8601 timestamp

Store under a namespaced key such as quantdeus.feedback.v1 in localStorage.

No network request, account identifier, Telegram identifier, health inference, diagnosis, profiling field, or hidden telemetry is part of this prototype.

## Interaction rules

1. A user may change Useful ↔ Not useful; local state updates deterministically.
2. Optional note may be empty.
3. Clearing local browser storage removes prototype feedback.
4. UI must indicate that feedback is stored on this device only.
5. A failure to access localStorage must degrade safely: show an inline message and do not pretend feedback was saved.

## Feature-branch-ready patch shape

A future implementation branch should contain:
- a small feedback UI component or equivalent DOM block;
- a local storage adapter with loadFeedback(itemId), saveFeedback(record), and deleteFeedback(itemId);
- no production API endpoint;
- no analytics hook;
- a local demo fixture.

## Local verification

1. Run the Mini App locally or open the local prototype fixture.
2. Mark one item Useful and refresh: state persists locally.
3. Switch to Not useful and refresh: updated state persists.
4. Add a short note and refresh: note persists.
5. Clear browser storage: feedback disappears.
6. Block localStorage in dev tools/private constraints: UI reports unsaved state instead of success.
7. Inspect network panel: submitting feedback produces zero feedback network requests.

## Acceptance boundary

This specification is DONE when it is sufficient to implement and test a local-only feature branch without touching production. Production merge/deploy requires a separate human-approved task.
