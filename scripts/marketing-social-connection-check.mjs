/**
 * QuantDeus marketing fleet read-only readiness probe.
 * Never print API tokens, response bodies or authorization URLs.
 * No publishing, posting, comments, or other public mutations.
 */
const vkToken = process.env.VK_TOKEN_GROUP || '';
const composioKey = process.env.COMPOSIO_API_KEY || '';
const summaryPath = process.env.GITHUB_STEP_SUMMARY;
const lines = [
  '## QuantDeus social fleet readiness',
  '',
  '| Integration | Status |',
  '|---|---|',
];
if (!vkToken) {
  lines.push('| VK group | ⚠️ VK_TOKEN_GROUP secret missing |');
} else {
  try {
    const body = new URLSearchParams({
      access_token: vkToken,
      group_id: 'andromeda_2077',
      v: '5.199',
    });
    const response = await fetch('https://api.vk.com/method/groups.getById', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(12000),
    });
    const json = await response.json();
    if (response.ok && json.response) {
      lines.push('| VK group | ✅ Token accepted by groups.getById |');
    } else {
      // Do not expose API response; it can contain sensitive data.
      lines.push('| VK group | ❌ Cannot validate token/group; verify scope, permissions and group id |');
      process.exitCode = 1;
    }
  } catch {
    lines.push('| VK group | ❌ VK API request failed; check networking |');
    process.exitCode = 1;
  }
}
if (!composioKey) {
  lines.push('| YouTube via Composio | ⚠️ COMPOSIO_API secret missing in GitHub Actions |');
  process.exitCode = 1;
} else {
  try {
    // Read-only: validate this project's API key and look for an authorized YouTube connection.
    // Never print the response body: connection metadata may contain sensitive fields.
    const response = await fetch('https://backend.composio.dev/api/v3.1/connected_accounts?limit=100', {
      headers: { 'x-api-key': composioKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) {
      lines.push('| YouTube via Composio | ❌ Project API key validation failed (HTTP ' + response.status + ') |');
      process.exitCode = 1;
    } else {
      const payload = await response.json();
      const items = Array.isArray(payload.items) ? payload.items : [];
      const yt = items.filter(item => item?.toolkit?.slug === 'youtube' || item?.toolkit_slug === 'youtube');
      const active = yt.filter(item => item.status === 'ACTIVE' && !item.is_disabled);
      if (active.length) {
        lines.push('| YouTube via Composio | ✅ Valid key; ACTIVE YouTube connection in this project (' + active.length + ') |');
      } else if (payload.next_cursor) {
        lines.push('| YouTube via Composio | ⚠️ Valid key; no YouTube among first 100 connections — paginate to confirm |');
        process.exitCode = 1;
      } else {
        lines.push('| YouTube via Composio | ⚠️ Valid key, but no ACTIVE YouTube connection in this project |');
        process.exitCode = 1;
      }
    }
  } catch {
    lines.push('| YouTube via Composio | ❌ Project API connection failed; verify endpoint/network |');
    process.exitCode = 1;
  }
}
lines.push('', '> Read-only diagnostic. No videos, posts, or comments were published.');
const report = lines.join('\n') + '\n';
if (summaryPath) {
  const { appendFile } = await import('node:fs/promises');
  await appendFile(summaryPath, report);
}
console.log(report);
console.log('QuantDeus Social Fleet: connection check completed.');
