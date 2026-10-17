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
  lines.push('| YouTube via Composio | ⚠️ COMPOSIO_API_KEY secret missing in GitHub Actions |');
} else {
  lines.push('| YouTube via Composio | ◻️ API key present; account linkage and scopes still require verification |');
}
lines.push('', '> Read-only diagnostic. No videos, posts, or comments were published.');
const report = lines.join('\n') + '\n';
if (summaryPath) {
  const { appendFile } = await import('node:fs/promises');
  await appendFile(summaryPath, report);
}
console.log('QuantDeus Social Fleet: connection check completed. See job summary for statuses.');
