# QuantDeus: GitHub Actions → Claude Code → Composio GitHub MCP

**Status:** The workflow and local tests can run without any AI expenditure. Actual Claude + Composio invocation requires the GitHub Actions secrets listed below and an existing Composio GitHub OAuth connection. Connections made to **ChatGPT** or **Claude Web** are not automatically visible to this GitHub Actions runner. Do not assume the Composio connection from another app can be reused until the project/user identity matches.

## Architecture

`@claude ...` comment from **quantdeus** on **draft PR #549**
→ `.github/workflows/claude-skyrim.yml` (default branch)
→ owner/PR gate → auth preflight → separate game checkout
→ Composio session SDK creates a **GitHub-only, read-only MCP** session
→ temporary secret-free `.mcp.json` with environment placeholders
→ `anthropics/claude-code-action@v1` starts Claude Code
→ Claude reads game source, can call `GITHUB_GET_ISSUE` via Composio MCP
→ posts review result to PR #549 (no code writes).

**Composio supplies GitHub tools, not Claude inference.** Claude Code needs its **own** OAuth token or Anthropic API key; Composio needs a project API key and matching Composio user with a linked GitHub account. Configuring one does not eliminate the other.

## Credential setup (one-time, by the repo administrator)

1. Verify/install official [Claude GitHub App](https://github.com/apps/claude) for **only** `quantdeus/quantdeus.github.io`. Review requested permissions.
2. In [Composio Dashboard](https://dashboard.composio.dev/), use the Composio project whose GitHub account is connected to `quantdeus`. Make sure that the GitHub connection belongs to the session identity selected below, with authorization to read the game repository and issue #548. Existing account connections in Claude Web/ChatGPT are not evidence of this GitHub Actions project's credentials.
3. In [repository Actions Secrets](https://github.com/quantdeus/quantdeus.github.io/settings/secrets/actions), store:
   - `COMPOSIO_API_KEY` — *Composio project API key*, with session-management and session-tool-execution permissions.
   - `COMPOSIO_USER_ID` — **the user ID in that Composio project with the existing GitHub connected account**. Use a repository secret so even the identity isn't published unnecessarily.
   - Optionally `COMPOSIO_GITHUB_ACCOUNT_ID` — `ca_...` ID of the specific GitHub connected account to select; reduces ambiguity when multiple GitHub accounts are linked.
   - Either `CLAUDE_CODE_OAUTH_TOKEN` (Claude Code setup-token generated privately on your machine, when supported) **or** `ANTHROPIC_API_KEY` (Anthropic API billing). OAuth is preferred if configured.
4. **Never** post values in GitHub comments, PR descriptions, source files or this chat. Do not store them as normal repository variables.

The Composio session policy enables **only** GitHub toolkit with tool `GITHUB_GET_ISSUE`, tagged `readOnlyHint`; it disables connection management and remote sandbox. The model also reads the files in the isolated checked-out game branch. It cannot mutate GitHub through Composio with that session. The Claude GitHub App may have broader permissions than this session; safeguard those separately.

## Trigger and verification

1. Merge the **configuration-only** PR adding the bridge to `main`, after QA. **Do not merge game PR #549**.
2. Send a **new** top-level comment on [game PR #549](https://github.com/quantdeus/quantdeus.github.io/pull/549), beginning with:

   `@claude Review Skyrim in review-target/projects/skyrim-mobile/. First fetch issue #548 through Composio GitHub MCP GITHUB_GET_ISSUE. Then report up to five concrete Android WebGL2, touch, save or streaming defects with file references. Do not commit, merge or deploy.`

3. Open [Actions](https://github.com/quantdeus/quantdeus.github.io/actions) → **Claude Code — Skyrim + Composio MCP** and verify all of: green preflight unit tests, populated credential flags, MCP session creation, Claude tool use `GITHUB_GET_ISSUE` through Composio, and a new Claude-authored review in PR #549.
4. If any key or user ID is missing, the `missing-auth` job fails before any Claude inference. If the Composio project does not have the GitHub account linked, the MCP step or tool call may fail: reconnect the account to the matching Composio identity and rerun via a new owner comment.

## Safety, expenditure and limitations

- **Owner only** (`quantdeus`), **PR #549 only**, explicit comment starting `@claude`; no cron and no inference on normal pushes or pull requests.
- Workflow token: read-only repository contents + permission to post issue/PR feedback. No automatic merges, deployments, code edits, or force push.
- Claude Code budget: 6 max turns and 18-minute job timeout. This bounds each invocation but **does not guarantee zero API spend** when authenticated.
- Composio MCP config stores **environment placeholders** for API key and session URL instead of literal credential values, then removes the descriptor on job completion.
- Account and application OAuth grants, model billing and permission to install GitHub Apps require an authorized human administrator. This repo change cannot create API keys or borrow another app's authenticated session.

## References

- [Composio sessions via MCP](https://docs.composio.dev/docs/sessions-via-mcp)
- [Composio configuring sessions and readOnlyHint tag](https://docs.composio.dev/docs/configuring-sessions)
- [Claude Code Action custom MCP](https://github.com/anthropics/claude-code-action/blob/main/docs/configuration.md)
- [Claude Code Action installation and authentication](https://github.com/anthropics/claude-code-action/blob/main/docs/setup.md)
- [Composio MCP with Claude Code / GitHub toolkit](https://composio.dev/toolkits/github/framework/claude-code)
