# Human Potential — Mini App feedback loop v1

Status: implementation contract for issue #103.

## Outcome
Create a privacy-preserving, locally verifiable feedback cycle for the Telegram Mini App without introducing a backend or medical inference.

## UI contract
- Two explicit controls: `Useful` and `Not useful` (Russian labels are acceptable in the current UI).
- One optional short note, max 280 characters.
- A save/complete action.
- Feedback is scoped to the current Mini App experience, not to health, diagnosis, identity, or psychological profiling.

## Storage contract
Default storage is browser/Telegram WebView `localStorage` only.

Key: `qd_feedback_v1`

Record shape:
```json
{
  "rating": "useful | not_useful",
  "note": "optional text, <=280 chars",
  "completedAt": "ISO-8601 timestamp",
  "schema": 1
}
```

No network request, webhook, analytics endpoint, Telegram user ID, diagnosis, health inference, or private profile data is part of v1. A backend requires separate approval.

## Locally verifiable completion event
A cycle is complete only after a valid rating is saved. The app should then:
1. write `qd_feedback_v1`;
2. render a visible saved/completed state;
3. allow the user to overwrite or clear the local feedback.

The observable completion event is the presence of a schema-1 record with `rating` and `completedAt` in localStorage plus the visible saved state. This is a local product signal, **not** an `R_QD` measurement.

## Acceptance test / README instructions
Until the UI patch is separately approved for production, test the contract in browser DevTools:

```js
localStorage.setItem('qd_feedback_v1', JSON.stringify({
  rating: 'useful',
  note: 'local smoke test',
  completedAt: new Date().toISOString(),
  schema: 1
}));
JSON.parse(localStorage.getItem('qd_feedback_v1'));
```

Expected: an object with `rating === 'useful'`, `schema === 1`, a non-empty `completedAt`, and no network activity caused by this storage operation.

Cleanup:
```js
localStorage.removeItem('qd_feedback_v1');
```

## Production gate
This file deliberately does **not** modify `site/index.html`, because a main-site change can trigger the existing Pages production deployment. UI integration remains gated on explicit publication approval.
