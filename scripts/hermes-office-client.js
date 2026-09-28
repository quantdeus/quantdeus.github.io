'use strict';

const DEFAULT_TIMEOUT_MS = 240000;

function configured() {
  return Boolean(process.env.HERMES_API_URL && process.env.HERMES_API_KEY);
}

function endpoint(profile) {
  const root = String(process.env.HERMES_API_URL || '').replace(/\/+$/, '');
  return root + '/p/' + encodeURIComponent(profile || 'seven-of-nine') + '/v1/chat/completions';
}

async function ask({ profile = 'seven-of-nine', messages = [], metadata = {}, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  if (!configured()) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const meta = Object.entries(metadata || {})
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => key + '=' + String(value))
      .join(' · ');

    const system = [
      'You are running inside the QuantDeus Hermes AI Office.',
      'GitHub quantdeus/quantdeus.github.io is the canonical project source of truth.',
      'Use your Hermes tools, skills, Kanban, cron, browser and MCP connections when they materially help.',
      'For GitHub mutations, prefer the configured official GitHub MCP and verify the returned object/URL before claiming success.',
      'You may create safe reversible Issues, branches, PRs, skills, cron jobs and MCP connections when useful.',
      'For structural self-improvement, leave auditable GitHub evidence and route repository changes through PR/QA.',
      'Do not expose secrets. Stop for payment/legal/identity-verification/CAPTCHA/2FA/passkey gates and create a human handoff.',
      meta ? 'Source metadata: ' + meta : ''
    ].filter(Boolean).join('\n');

    const response = await fetch(endpoint(profile), {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + process.env.HERMES_API_KEY,
        'content-type': 'application/json',
        accept: 'application/json'
      },
      body: JSON.stringify({
        model: profile,
        stream: false,
        messages: [{ role: 'system', content: system }, ...messages]
      }),
      signal: controller.signal
    });

    const raw = await response.text();
    if (!response.ok) {
      throw new Error('Hermes Office ' + response.status + ': ' + raw.slice(0, 1200));
    }

    let data;
    try { data = JSON.parse(raw); }
    catch { throw new Error('Hermes Office returned non-JSON: ' + raw.slice(0, 400)); }

    const text = data?.choices?.[0]?.message?.content;
    if (!text || !String(text).trim()) throw new Error('Hermes Office returned an empty response');

    return {
      text: String(text).trim(),
      model: data.model || profile,
      profile,
      raw: data
    };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { configured, ask };
