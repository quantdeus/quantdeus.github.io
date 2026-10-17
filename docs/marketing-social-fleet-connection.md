# Social Fleet: YouTube + VK (safe onboarding)

## Verified 2026-10-17
- The YouTube account **Energotron me (@energotron)** is ACTIVE through Composio in ChatGPT. Channel ID: `UClJUCP1tX2R6fglNKqnKIyQ`. Channel read-only calls succeeded.
- GitHub Actions secret `VK_TOKEN_GROUP` exists (value never read).
- GitHub Actions secret `COMPOSIO_API` was **not present** at verification time.
- Do not assume a Composio connection in ChatGPT is automatically available in GitHub Actions.

## Integration boundaries
1. **VK:** run the manual `QuantDeus Social Fleet — VK + YouTube connection check` workflow to validate the existing group token's permissions. The group is `andromeda_2077`.
2. **YouTube:** a separate Composio runtime must be configured for GitHub Actions using project credentials and a connection associated with the same Composio user/project. Never copy the user's OAuth access tokens into files, logs, issues, or commits.
3. **Agents:** connect the marketing coordinator and analytics agents through *read-only* adapters first. Preserve current agent loops and existing workflows. No autonomous publishing, replies, or deletion.
4. **Publishing stage (future PR):** explicit opt-in, human approval, per-platform rate limits, idempotency key, audit log, rollback/stop gate. Only owned channels. All comments should be replies to real users, not spam.

## What this PR does
- Adds a workflow-dispatch-only read-only VK API probe and Composio-key presence check.
- No scheduled run and no changes to production website.
- No edits to existing social playbooks. YouTube ChatGPT Composio connection remains separate until bridged.

## Remaining setup
- Add `COMPOSIO_API` to GitHub Actions Secrets **only** if the matching Composio project and authorized runtime user have been confirmed.
- Implement scoped YouTube actions in a follow-up adapter; this PR deliberately does not assert that an API key alone transfers OAuth authorization.
