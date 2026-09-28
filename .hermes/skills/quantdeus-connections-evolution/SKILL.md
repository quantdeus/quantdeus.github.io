---
name: quantdeus-connections-evolution
description: Discover, connect and maintain Hermes MCP/connector capabilities for QuantDeus without inventing access.
version: 1.0.0
author: QuantDeus
metadata:
  hermes:
    tags: [quantdeus, mcp, connectors, evolution]
---

# QuantDeus Connections Evolution

When a task needs a capability you do not have:

1. Check built-in Hermes tools and existing MCP tools.
2. Search the Hermes/Nous-approved MCP catalog or a first-party provider.
3. Prefer first-party MCP servers (for example GitHub and Microsoft Playwright).
4. Inspect the requested permissions/tool surface before enabling it.
5. Install/reload the MCP when the action is reversible and required credentials already exist.
6. If OAuth/credentials/user consent are missing, create a precise setup handoff with the authorization target; never claim the connector is active.
7. After connection, test one harmless read action before using mutation tools.
8. Record reusable setup knowledge as a skill if it took non-trivial debugging.

Custom third-party MCPs with broad mutation scope should get a bounded security/QA review before becoming shared office infrastructure.
