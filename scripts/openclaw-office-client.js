'use strict';

const DEFAULT_TIMEOUT_MS = 250000;
const DEFAULT_VERCEL_URL = 'https://quantdeus.vercel.app/api/quantdeus/openclaw';
const OPENCLAW_AUDIENCE = 'quantdeus-vercel-openclaw';

function configured() {
  return Boolean(
    process.env.ACTIONS_ID_TOKEN_REQUEST_URL &&
    process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN
  );
}

async function getGitHubOidcToken() {
  const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!requestUrl || !requestToken) throw new Error('GITHUB_OIDC_UNAVAILABLE');
  const separator = requestUrl.includes('?') ? '&' : '?';
  const response = await fetch(requestUrl + separator + 'audience=' + encodeURIComponent(OPENCLAW_AUDIENCE), {
    headers: { authorization: 'Bearer ' + requestToken, accept: 'application/json' }
  });
  const raw = await response.text();
  if (!response.ok) throw new Error('GitHub OIDC ' + response.status + ': ' + raw.slice(0, 500));
  let data;
  try { data = JSON.parse(raw); }
  catch { throw new Error('GitHub OIDC returned non-JSON'); }
  if (!data?.value) throw new Error('GitHub OIDC returned no token');
  return data.value;
}

function normalizedMessages(messages, metadata, trusted = false) {
  const meta = Object.entries(metadata || {})
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => key + '=' + String(value))
    .join(' · ');
  const system = [
    'You are running inside the QuantDeus OpenClaw Office.',
    'GitHub quantdeus/quantdeus.github.io is the canonical project source of truth.',
    trusted
      ? 'This is the trusted QuantDeus Admin Office lane. Use the available GitHub MCP, workspace filesystem and Playwright MCP when they materially help.'
      : 'This route runs OpenClaw with tools disabled. Do not claim that you inspected or changed live GitHub, Vercel, Telegram, browser, cron, or MCP state.',
    trusted
      ? 'GitHub mutations must be reversible and auditable: prefer Issue/branch/PR plus QA evidence; do not push directly to main or weaken guardrails.'
      : 'Answer from the supplied prompt and repository context only. State clearly when a requested external action still needs an execution path.',
    trusted
      ? 'For browser work, stop for CAPTCHA, 2FA/passkeys, unavailable verification, payment, legal commitment, identity verification or destructive production actions.'
      : 'Route repository changes through PR and QA when an execution path is available.',
    'Do not expose secrets. Stop for payment/legal/identity-verification/CAPTCHA/2FA/passkey gates and create a human handoff.',
    meta ? 'Source metadata: ' + meta : ''
  ].filter(Boolean).join('\n');
  return [{ role: 'system', content: system }, ...(messages || [])];
}

async function ask({ profile, messages, metadata, trusted = false, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  if (!configured()) throw new Error('OPENCLAW_OFFICE_CREDENTIALS_UNAVAILABLE');
  const oidc = await getGitHubOidcToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = {
      authorization: 'Bearer ' + oidc,
      'content-type': 'application/json',
      accept: 'application/json'
    };
    if (process.env.GITHUB_TOKEN) headers['x-quantdeus-github-token'] = process.env.GITHUB_TOKEN;
    const response = await fetch(process.env.OPENCLAW_VERCEL_URL || DEFAULT_VERCEL_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        profile,
        messages: normalizedMessages(messages, metadata, trusted),
        metadata,
        execution_mode: trusted ? 'trusted-office' : 'chat'
      }),
      signal: controller.signal
    });
    const raw = await response.text();
    if (!response.ok) throw new Error('OpenClaw Office ' + response.status + ': ' + raw.slice(0, 1600));
    let data;
    try { data = JSON.parse(raw); }
    catch { throw new Error('OpenClaw Office returned non-JSON: ' + raw.slice(0, 400)); }
    if (!data?.text || !String(data.text).trim()) throw new Error('OpenClaw Office returned an empty response');
    return {
      text: String(data.text).trim(),
      model: data.model || profile,
      profile: data.profile || profile,
      raw: data,
      runtime: data.execution_mode || 'openclaw-agent-exec'
    };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { configured, ask };
