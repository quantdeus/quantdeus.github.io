import test from 'node:test';
import assert from 'node:assert/strict';
import { generateConfig, sessionPolicy, REQUIRED_TOOL } from './claude-composio-mcp.mjs';

test('restrict Composio session to GitHub read-only tool', () => {
  const p = sessionPolicy(undefined, 'direct');
  assert.deepEqual(p.toolkits, ['github']);
  assert.deepEqual(p.tools.github.enable, [REQUIRED_TOOL]);
  assert.deepEqual(p.tags, ['readOnlyHint']);
  assert.deepEqual(p.sandbox, { enable: false });
  assert.deepEqual(p.manageConnections, { enable: false });
  assert.equal(p.mcp, true);
});

test('MCP configuration stores only environment placeholders', () => {
  const cfg = generateConfig({
    url: 'https://backend.composio.dev/api/v3.1/sessions/example/mcp',
    headers: { 'x-api-key': 'TEST_VALUE' },
  });
  const output = JSON.stringify(cfg);
  assert.equal(output.includes('TEST_VALUE'), false);
  assert.equal(output.includes('/sessions/example/mcp'), false);
  assert.ok(output.includes('COMPOSIO_API_KEY'));
  assert.ok(output.includes('COMPOSIO_MCP_SESSION_URL'));
});

test('Reject unexpected MCP origins and elevated headers', () => {
  const base = { url: 'https://backend.composio.dev/mcp', headers: { 'x-api-key': 'TEST_VALUE' } };
  assert.throws(() => generateConfig({ ...base, url: 'http://backend.composio.dev/mcp' }));
  assert.throws(() => generateConfig({ ...base, url: 'https://composio.dev.example.net/mcp' }));
  assert.throws(() => generateConfig({ ...base, headers: { untrusted: 'test' } }));
});
