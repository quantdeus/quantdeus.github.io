# QuantDeus Galactic Mesh — real open-source implementation

Parent: [Issue #554](https://github.com/quantdeus/quantdeus.github.io/issues/554).
Related: #552 (agent-network discovery), #421 (broker/security), #547 (hourly support).

## What is implemented here (not a simulation)
A manual GitHub Actions job starts **GitHub's real official MCP server**, performs an MCP JSON-RPC initialization, lists its live tools, invokes the real **issue_read** tool against an existing QuantDeus GitHub Issue, and uses **search_repositories** to discover actual GitHub MCP/multi-agent projects. The result validates Issue identity and prints a verifiable Actions run report.

This is a live external GitHub read. It does **not** imply that 10,000 model instances or agents have been launched. The current 27-agent canonical registry remains the single source of truth: \`coordination/agents.json\`. Actual delegated reasoning remains the existing trusted OpenClaw/agent-role workflow. The MCP probe verifies real GitHub tool transport and returns actual current repository search candidates. It does not execute external code from discovered projects.

## Run (only after QA and human-reviewed merge)
GitHub → Actions → **QuantDeus Galactic Mesh — live MCP read** → Run workflow → Issue \`554\`.

- Uses GitHub Actions' ephemeral \`GITHUB_TOKEN\` and **issues:read** only.
- Docker image: \`ghcr.io/github/github-mcp-server:v2.0.2\`. Before production rollout, pin an inspected digest to reduce upstream-change risk.
- Runs the official MCP server in read-only mode, with only the issues toolset and Docker process/resource restrictions.
- Calls two bounded read-only tools (issue_read and search_repositories); no comments, outreach, registrations, secrets changes or WordPress changes.
- Errors fail the run; no fabricated success.
- The workflow is **manual**, not scheduled and not triggered by Issues to avoid loops.
- Does not require a paid LLM API. Public repository standard GitHub Actions runner usage is included by GitHub, subject to abuse policy and quota / cost changes.

### Run locally
Requires Node.js >=20, Docker, and a GitHub token with access to read this repository's Issues.

\`\`\`bash
export GITHUB_REPOSITORY=quantdeus/quantdeus.github.io
# Supply your secret only as environment variable, never commit it.
export GITHUB_PERSONAL_ACCESS_TOKEN=...
ISSUE_NUMBER=554 node scripts/galactic-mcp-live.mjs
\`\`\`

## Verified open-source candidates and integration decisions

| Component | Upstream source | Licence / availability | Decision |
|---|---|---|---|
| GitHub MCP Server | https://github.com/github/github-mcp-server | MIT; upstream server with read-only mode | Implemented live MCP read route |
| A2A protocol | https://github.com/a2aproject/A2A | Apache-2.0 interoperability specification | Adopt as inter-agent transport for later approved connectors |
| MCP reference servers | https://github.com/modelcontextprotocol/servers | Apache-2.0 / legacy MIT | Reference and curated allowlist only |
| Ollama | https://github.com/ollama/ollama | MIT app; model weights have their own licenses | Local/self-hosted inference candidate; NOT free cloud GPU |
| QuantDeus OpenClaw and existing role cron | canonical repository | Existing project infrastructure | Real model execution path; inspect availability, quota and auth before dispatch |

Open-source code does not make inference, storage, hosting or third-party infrastructure free. A2A is not a scheduler or model runtime. GitHub Actions is not an unlimited agent compute service. No account farms, automated unsolicited posts or quota evasion.

## Next live integrations (new small PRs)
1. Use the existing authorised **agent-role-cron.yml** to process Issue #554 with a named role and verified artifact; inspect the active OpenClaw execution evidence and its real quota first.
2. Build an authenticated, brokered MCP-to-A2A adapter with approved agent cards and strict allowlisted destinations; no federation with arbitrary external peers.
3. Deliver one high-quality QuantDeus tutorial/service demonstration and generate channel-specific **drafts** using actual product evidence.
4. Scale concurrently active agents only with measured capacity, approved infrastructure and actual zero-incremental-spend accounting. Never substitute synthetic registries for production evidence.

**Guardrails:** read-only initial toolset; human-approved publishing; no mass DMs; no unauthorized actions on external networks; no direct main push; QA checks before merge; no recurring API floods; preserve GitHub/WordPress production.
