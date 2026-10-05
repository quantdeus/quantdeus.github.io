---
name: bounded-scheduling
description: Design and review scheduled work using the useful PicoClaw lightweight-cron discipline: event-driven, bounded, auditable, and non-self-amplifying.
---
# Bounded Scheduling

Use for cron, periodic maintenance, learning cycles, retries, and background automation.

## Procedure

1. Validate the trigger and owner.
2. Confirm the scheduled job has one bounded purpose.
3. Prefer event-driven work over polling.
4. Define an explicit cadence, concurrency policy, timeout, and observable output.
5. Keep autonomous lanes read-only unless a separate authority gate explicitly permits mutation.
6. On failure, fail visibly or back off; never create an unbounded retry loop.
7. Review whether the cadence still serves the goal.

## Schedule Changes

Data may recommend **keep / adjust / retire**. Data does not create self-replicating schedulers or silently rewrite its own cadence.

## Resource Claims

Do not preserve legacy claims such as “microseconds”, exact CPU percentages, or battery cost unless they are measured in the current runtime.
