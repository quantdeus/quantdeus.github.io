# QuantDeus Contributor Command Protocol

This protocol defines the opt-in human command surface for GitHub coordination tasks.

## Scope

Commands apply only to Issues carrying the `coord:task` label. They do not authorize production publication, spending, secret access, irreversible actions, sensitive outreach, or work outside the coordination queue.

## Human opt-in invariant

No person is assigned or claimed automatically. Ownership begins only when that person explicitly posts `/take` on a free coordination task.

## Commands

| Command | Preconditions | State transition | Expected effect |
|---|---|---|---|
| `/take` | `coord:task` + `coord:ready`; no current claimant | `ready -> active` | Record the commenting user as claimant and mark the task active. |
| `/release` | commenter is current claimant | `active -> ready` | Clear claimant metadata and return task to the open queue. |
| `/block reason` | commenter is current claimant; non-empty reason | `active -> blocked` | Preserve claimant, record the concrete blocker/reason, request human help. |
| `/ready` | coordination task is blocked/stale and caller is claimant or authorized maintainer | `blocked/stale -> ready` | Clear blocker/stale state and make the task claimable again; claimant is cleared. |
| `/done` | commenter is current claimant and acceptance evidence is present | `active -> done` | Mark done and close the Issue as completed. |

## Guardrails

1. Ignore command-like text on Issues without `coord:task`.
2. Reject `/take` when a task already has a claimant.
3. Reject ownership-changing commands from users other than the claimant, except explicit maintainer recovery through `/ready`.
4. `/block` must include a falsifiable reason or dependency; an empty blocker is not actionable.
5. `/done` is not a synonym for “started”: the Issue acceptance checklist/evidence must be satisfied before closure.
6. Claimant/blocker metadata must stay auditable in the Issue body or event trail; never store secrets there.
7. External notifications remain opt-in and must not expose private data or credentials.

## Minimal verification matrix

- Non-`coord:task` Issue + `/take` -> no coordination state change.
- Ready task + contributor `/take` -> active and claimant recorded.
- Claimed task + second contributor `/take` -> rejected; original claimant preserved.
- Active task + claimant `/block reproducible reason` -> blocked with reason preserved.
- Blocked task + `/ready` -> ready, blocker cleared, claimable again.
- Active task + claimant `/release` -> ready and claimant cleared.
- Active task + claimant `/done` without acceptance evidence -> remain active.
- Active task + claimant `/done` with acceptance evidence -> done and Issue closed completed.

## Relationship to the six-pillar queue

This is coordination infrastructure, not a seventh public pillar. The six public pillars remain Energy, Algorithmic Justice, Planetary Cooperation, Space Expansion, Human Potential, and Synthesis Aesthetics. Operational coordination supports them without replacing them.
