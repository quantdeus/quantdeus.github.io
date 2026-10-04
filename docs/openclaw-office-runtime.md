# OpenClaw Office runtime

QuantDeus now separates **scheduler** and **executor** concerns on Vercel:

- `quantdeus-openclaw-scheduler` is a dedicated persistent Vercel Sandbox that runs a loopback OpenClaw Gateway. Native `openclaw automations` stored in the Gateway SQLite database own the swarm schedule.
- `quantdeus-openclaw-office` remains the isolated execution Sandbox borrowed by trusted/brokered requests. It keeps the existing queue lock, per-request checkout/config isolation and guarded GitHub/Playwright/WordPress tool policy.
- Native automation command jobs do not hold GitHub credentials. They write allowlisted workflow-dispatch intents to a durable local spool.
- `.github/workflows/openclaw-native-watchdog.yml` is only a liveness/auth relay. On Vercel Hobby it resumes or rotates the scheduler Sandbox before the 45-minute continuous-session ceiling, syncs the native automation manifest, and drains the spool with that Actions run's short-lived `GITHUB_TOKEN`.
- Executor workflows keep `workflow_dispatch` and event triggers but no longer own recurring `schedule:` cadence. This prevents duplicate schedulers while preserving GitHub as the canonical audit/execution surface.

The scheduler Gateway binds to loopback only and uses a random token stored with mode 0600 inside the persistent Sandbox. No public Control UI port is opened. The watchdog route is accepted only from the exact GitHub Actions workflow through repository-scoped OIDC.

The Office execution Sandbox still uses the session timeout as its request lifecycle boundary. Queue contention returns HTTP 503. An explicitly configured `OPENCLAW_GATEWAY_MODEL` uses existing Vercel OIDC or an existing key and still passes the real capability probe.

Historical GUI evidence from 2026-10-01 showed the Office repeatedly stopping/resuming, with no public ports, and Pollinations generation returning 402 followed by OpenClaw 502. That evidence remains relevant to the executor/provider lane; it does not block the deterministic native scheduler because command automations do not require a model.
