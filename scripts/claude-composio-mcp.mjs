/**
 * Creates a short-lived, GitHub-read-only Composio session and a local MCP
 * definition consumed by Claude Code Action. Never log the session URL or key.
 *
 * CLI: COMPOSIO_API_KEY=... COMPOSIO_USER_ID=... node scripts/claude-composio-mcp.mjs
 * Caller installs @composio/core >= 0.19.1 before invoking.
 */
import { writeFile, chmod, appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const SERVER_NAME = 'composio-github';
export const REQUIRED_TOOL = 'GITHUB_GET_ISSUE';

export function sessionPolicy(connectedAccountId, directToolsPreset) {
  const policy = {
    toolkits: ['github'],
    tools: { github: { enable: [REQUIRED_TOOL] } },
    tags: ['readOnlyHint'],
    sandbox: { enable: false },
    manageConnections: { enable: false },
    sessionPreset: directToolsPreset,
    mcp: true,
  };
  if (connectedAccountId) {
    if (!/^ca_[a-zA-Z0-9_-]+$/.test(connectedAccountId)) {
      throw new Error('Invalid COMPOSIO_GITHUB_ACCOUNT_ID format.');
    }
    policy.connectedAccounts = { github: [connectedAccountId] };
  }
  return policy;
}

export function generateConfig(mcp) {
  if (!mcp?.url || !mcp?.headers || Object.keys(mcp.headers).length === 0) {
    throw new Error('Composio did not return an authenticated MCP endpoint.');
  }
  if (/[\r\n]/.test(mcp.url)) throw new Error('Unexpected newline in MCP URL.');
  const url = new URL(mcp.url);
  // Never forward Composio credentials to an arbitrary host.
  if (
    url.protocol !== 'https:' ||
    !(url.hostname === 'composio.dev' || url.hostname.endsWith('.composio.dev')) ||
    url.username || url.password || url.port
  ) {
    throw new Error('Unexpected Composio MCP endpoint origin.');
  }
  const keys = Object.keys(mcp.headers);
  if (
    keys.some((key) => !['x-api-key', 'x-org-id', 'x-project-id'].includes(key.toLowerCase())) ||
    !keys.some((key) => key.toLowerCase() === 'x-api-key')
  ) {
    throw new Error('Composio MCP must use a project-scoped x-api-key.');
  }
  return {
    mcpServers: {
      [SERVER_NAME]: {
        type: 'http',
        url: '${COMPOSIO_MCP_SESSION_URL}',
        headers: Object.fromEntries(Object.entries(mcp.headers).map(([key, value]) => [
          key, key.toLowerCase() === 'x-api-key' ? '${COMPOSIO_API_KEY}' : value,
        ])),
      },
    },
  };
}

export async function createMcpConfig({ key, userId, connectedAccountId, filePath, envFile, makeClient }) {
  if (!key || !userId) throw new Error('COMPOSIO_API_KEY and COMPOSIO_USER_ID are required.');
  if (userId.length > 128 || !/^[a-zA-Z0-9_.:@-]+$/.test(userId)) {
    throw new Error('Invalid Composio user ID.');
  }
  const { client, preset } = await makeClient(key);
  const policy = sessionPolicy(connectedAccountId, preset);
  const session = await client.create(userId, policy);
  const config = generateConfig(session.mcp);
  if (!envFile) throw new Error('A GitHub Actions environment file is required.');
  // The workspace MCP file only contains environment placeholders, not secrets.
  await writeFile(filePath, JSON.stringify(config), { mode: 0o600, flag: 'wx' });
  await chmod(filePath, 0o600);
  await appendFile(envFile, `COMPOSIO_MCP_SESSION_URL=${session.mcp.url}\n`);
  // Do not print URL, token, session ID, or headers: these are sensitive.
  process.stdout.write('Composio GitHub read-only MCP session created; config prepared.\n');
}

async function main() {
  const key = process.env.COMPOSIO_API_KEY;
  const userId = process.env.COMPOSIO_USER_ID;
  const connectedAccountId = process.env.COMPOSIO_GITHUB_ACCOUNT_ID;
  const filePath = resolve(process.env.GITHUB_WORKSPACE || process.cwd(), '.mcp.json');
  await createMcpConfig({
    key, userId, connectedAccountId, filePath,
    envFile: process.env.GITHUB_ENV,
    makeClient: async (apiKey) => {
      const { Composio, SessionPreset } = await import('@composio/core');
      return {
        client: new Composio({ apiKey }),
        preset: SessionPreset.DIRECT_TOOLS,
      };
    },
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    // Only log the stable, non-secret class of error.
    process.stderr.write('Composio MCP initialization failed. Verify project key, matching user ID, existing GitHub connection, and session permissions.\n');
    process.exitCode = 1;
  });
}
