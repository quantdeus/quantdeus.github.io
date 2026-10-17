/**
 * QuantDeus Social Fleet — read-only social insights for humans and marketing agents.
 * Avoid leaking credentials/connection metadata. No publish, comment, delete or update calls.
 */
const API = 'https://backend.composio.dev/api/v3.1';
const TARGET_CHANNEL = 'UClJUCP1tX2R6fglNKqnKIyQ'; // Energotron me / QuantDeus
const composioKey = process.env.COMPOSIO_API || '';
const vkToken = process.env.VK_TOKEN_GROUP || '';
const report = [
  '# QuantDeus Social Fleet — Read-only platform insights',
  '',
  'This diagnostic makes no edits to YouTube or VK.',
  '',
];
let errors = 0;
async function append() {
  const text = report.join('\n') + '\n';
  if (process.env.GITHUB_STEP_SUMMARY) {
    const {appendFile} = await import('node:fs/promises');
    await appendFile(process.env.GITHUB_STEP_SUMMARY, text);
  }
  console.log(text);
}
function fail(label) {
  errors++;
  report.push(label);
}
async function composioGet(path) {
  const response = await fetch(API + path, {
    headers: {'x-api-key': composioKey, Accept: 'application/json'},
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('Composio HTTP ' + response.status);
  return response.json();
}
async function readYouTube() {
  report.push('## YouTube: Energotron me (@energotron)');
  if (!composioKey) return fail('⚠️ Missing COMPOSIO_API GitHub Actions secret.');
  try {
    const accounts = await composioGet('/connected_accounts?limit=100');
    const eligible = (accounts.items || []).filter(a =>
      a.status === 'ACTIVE' && !a.is_disabled &&
      (a.toolkit?.slug === 'youtube' || a.toolkit_slug === 'youtube')
    ).slice(0, 10);
    if (!eligible.length) return fail('❌ No active YouTube connected account in this Composio project.');
    const attempts = [];
    for (const account of eligible) {
      // Only call a read-only tool on connected accounts in the authorized project.
      const response = await fetch(API + '/tools/execute/YOUTUBE_GET_CHANNEL_STATISTICS', {
        method: 'POST',
        headers: {'x-api-key': composioKey, 'Content-Type': 'application/json'},
        body: JSON.stringify({
          connected_account_id: account.id,
          ...(account.user_id ? {user_id: account.user_id} : {}),
          version: 'latest',
          arguments: {mine: true, part: 'snippet,statistics'},
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) {
        // Do not log raw provider errors: restrict diagnostics to safe error codes.
        let safeCode = '';
        try {
          const j = await response.json();
          const code = String(j?.error?.code || j?.code || '');
          if (/^[a-zA-Z0-9_-]{1,60}$/.test(code)) safeCode = ' (' + code + ')';
        } catch { /* response might not be JSON */ }
        attempts.push('HTTP ' + response.status + safeCode);
        continue;
      }
      const result = await response.json();
      if (result.successful === false) {
        attempts.push('tool execution returned unsuccessful');
        continue;
      }
      const p = result.data || result;
      const channels = p.channels || p.items || p.data?.channels || p.data?.items || [];
      const selected = channels.find(c => c.id === TARGET_CHANNEL);
      if (!selected) {
        // Log only JSON object keys, never provider response values or identifiers.
        const topKeys = Object.keys(result).slice(0, 8).join(',');
        const dataKeys = Object.keys(p || {}).slice(0, 8).join(',');
        attempts.push('no channel match [keys:' + topKeys + '/' + dataKeys + ']');
        continue;
      }
      const stat = selected.statistics || {};
      const n = v => Number.isFinite(Number(v)) ? Number(v).toLocaleString('ru-RU') : '—';
      report.push('✅ Channel verified through the Composio project.',
        '',
        '| Subscribers | Views | Videos |',
        '|---:|---:|---:|',
        '| ' + n(stat.subscriberCount) + ' | ' + n(stat.viewCount) + ' | ' + n(stat.videoCount) + ' |',
        '',
        'Channel: https://www.youtube.com/channel/' + TARGET_CHANNEL);
      return;
    }
    fail('❌ Expected YouTube channel not verified. Read-only diagnostics: ' + attempts.join('; ') + '.');
  } catch {
    fail('❌ YouTube read failed (see Composio project connection / API scopes).');
  }
}
async function readVK() {
  report.push('', '## VK: andromeda_2077');
  if (!vkToken) return fail('⚠️ Missing VK_TOKEN_GROUP GitHub Actions secret.');
  try {
    const body = new URLSearchParams({
      access_token: vkToken,
      group_id: 'andromeda_2077',
      fields: 'members_count',
      v: '5.199',
    });
    const response = await fetch('https://api.vk.com/method/groups.getById', {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body,
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return fail('❌ VK API HTTP error.');
    const payload = await response.json();
    if (!payload.response) return fail('❌ VK API did not accept the read-only request.');
    const v = Array.isArray(payload.response) ? payload.response[0] :
      Array.isArray(payload.response.groups) ? payload.response.groups[0] : payload.response;
    const count = v?.members_count;
    report.push('✅ VK group read access confirmed.',
      'Group: https://vk.ru/andromeda_2077',
      'Members: ' + (typeof count === 'number' ? count.toLocaleString('ru-RU') : 'not returned by this token'));
  } catch {
    fail('❌ VK group stats request failed.');
  }
}
await Promise.all([readYouTube(), readVK()]);
report.push('', '> Agent scope: read-only. Draft/publish/reply actions require separate approval and workflow.');
await append();
if (errors) process.exitCode = 1;
