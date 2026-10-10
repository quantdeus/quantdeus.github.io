# Claude Code Action — Skyrim Mobile review lane

This is a separate, opt-in integration for **draft PR #549**. It must not merge the game PR or deploy anything to production. The game remains isolated on `feat/skyrim-mobile-webgl-500mb`.

## What is already configured in the workflow

- Official action: `anthropics/claude-code-action@v1`
- Trigger: a **new** top-level or inline PR comment beginning with `@claude`, written by GitHub account `quantdeus`, on **PR #549 only**.
- Auth: GitHub Actions **repository secret** `CLAUDE_CODE_OAUTH_TOKEN` preferred; alternatively `ANTHROPIC_API_KEY`.
- Guardrails: owner-only, no bot/non-write-user triggers, 6-turn limit per invocation, read-only checkout, disallowed CLI edit/write/bash tools, no automatic invocation on pushes, no auto-merge or deploy.
- Pushes and configuration PRs run a **preflight only**: report *presence* of authorization without printing credentials. A real `@claude` call with no secret creates an explicit missing-credentials error.
- The official GitHub App can have repository permissions independent from the workflow token. Treat review-only restrictions as defense-in-depth, **not** an absolute permission sandbox; review its installation scope. Human approval remains mandatory for all changes.

## Required repository-admin steps

1. Install and authorize the **official Claude GitHub App** for **only** `quantdeus/quantdeus.github.io`: <https://github.com/apps/claude> (choose **Configure** → **Only select repositories**).
2. Choose one Anthropic credential (this is **not** the Composio connector):
   - Claude Code OAuth (Pro/Max with Claude Code CLI): on your own trusted machine run `claude setup-token` and store the resulting value as `CLAUDE_CODE_OAUTH_TOKEN`.
   - Anthropic Console API key: store it as `ANTHROPIC_API_KEY`; this uses API billing.
3. Add the credential **directly in GitHub**, *never in an issue, chat message, branch, PR, or Actions log*: <https://github.com/quantdeus/quantdeus.github.io/settings/secrets/actions> → **New repository secret**.
4. Activate this configuration by merging its **separate configuration-only PR** into `main` after checking the preflight and repository policy. GitHub only invokes `issue_comment` / review-comment workflows defined on the default branch. **Do not merge game PR #549.**
5. On <https://github.com/quantdeus/quantdeus.github.io/pull/549>, write a **new** comment, for example:

   `@claude Review this PR only. Identify up to five concrete defects in Android WebGL2 startup, input, loading, save, and pack verification. Quote files/lines and return your findings here; do not commit code, merge, or deploy.`

6. Check the **Claude Code — Skyrim gated reviewer** run in <https://github.com/quantdeus/quantdeus.github.io/actions> and verify an actual Claude-authored result. A prior `@claude` comment does **not** replay on installation.

**Expected safe failure:** If the secret is missing the action runs the preflight and an explicit `missing-auth` error; the Claude step is skipped. If the app has not been installed, the Claude step can fail with GitHub App/OIDC authentication; install it first.

## Related project

- Game branch: `feat/skyrim-mobile-webgl-500mb`
- Draft game PR: <https://github.com/quantdeus/quantdeus.github.io/pull/549>
- Coordinating issue: <https://github.com/quantdeus/quantdeus.github.io/issues/548>
- Workflow: `.github/workflows/claude-skyrim.yml`

## Sources

- Anthropic setup: <https://github.com/anthropics/claude-code-action/blob/main/docs/setup.md>
- Anthropic security: <https://github.com/anthropics/claude-code-action/blob/main/docs/security.md>
- GitHub Actions security: <https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions>
