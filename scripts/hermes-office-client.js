'use strict';

const DEFAULT_TIMEOUT_MS = 300000;
const DEFAULT_VERCEL_URL = 'https://quantdeus.vercel.app/api/quantdeus/hermes';
const HERMES_AUDIENCE = 'quantdeus-vercel-hermes';

function directConfigured() {
  return Boolean(process.env.HERMES_API_URL && process.env.HERMES_API_KEY);
}

function oidcConfigured() {
  return Boolean(process.env.ACTIONS_ID_TOKEN_REQUEST_URL && process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN);
}

function configured() {
  return directConfigured() || oidcConfigured();
}

function directEndpoint(profile) {
  const root = String(process.env.HERMES_API_URL || '').replace(/\/+$/, '');
  return root + '/p/' + encodeURIComponent(profile || 'seven-of-nine') + '/v1/chat/completions';
}

async function getGitHubOidcToken() {
  const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!requestUrl || !requestToken) throw new Error('GITHUB_OIDC_UNAVAILABLE');

  const separator = requestUrl.includes('?') ? '&' : '?';
  const r = await fetch(
    requestUrl + separator + 'audience=' + encodeURIComponent(HERMES_AUDIENCE),
    {
      headers: {
        authorization: 'Bearer ' + requestToken,
        accept: 'application/json'
      }
    }
  );
  const raw = await r.text();
  if (!r.ok) throw new Error('GitHub OIDC ' + r.status + ': ' + raw.slice(0, 500));

  let data;
  try { data = JSON.parse(raw); }
  catch { throw new Error('GitHub OIDC returned non-JSON'); }

  if (!data?.value) throw new Error('GitHub OIDC returned no token');
  return data.value;
}

function normalizedMessages(messages, metadata) {
  const meta = Object.entries(metadata || {})
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => key + '=' + String(value))
    .join(' · ');

  const system = [
    'You are running inside the QuantDeus Hermes AI Office.',
    'GitHub quantdeus/quantdeus.github.io is the canonical project source of truth.',
    'Use your Hermes tools, skills, Kanban, cron, browser, Playwright and MCP connections when they materially help.',
    'For GitHub mutations, verify the returned object/URL before claiming success.',
    'You may create safe reversible Issues, branches, PRs, skills, cron jobs and MCP connections when useful.',
    'For structural self-improvement, leave auditable GitHub evidence and route repository changes through PR/QA.',
    'Do not expose secrets. Stop for payment/legal/identity-verification/CAPTCHA/2FA/passkey gates and create a human handoff.',
    meta ? 'Source metadata: ' + meta : ''
  ].filter(Boolean).join('\n');

  return [{ role: 'system', content: system }, ...(messages || [])];
}

async function askDirect({ profile, messages, metadata, signal }) {
  const response = await fetch(directEndpoint(profile), {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + process.env.HERMES_API_KEY,
      'content-type': 'application/json',
      accept: 'application/json'
    },
    body: JSON.stringify({
      model: profile,
      stream: false,
      messages: normalizedMessages(messages, metadata)
    }),
    signal
  });

  const raw = await response.text();
  if (!response.ok) throw new Error('Hermes Office ' + response.status + ': ' + raw.slice(0, 1200));

  let data;
  try { data = JSON.parse(raw); }
  catch { throw new Error('Hermes Office returned non-JSON: ' + raw.slice(0, 400)); }

  const text = data?.choices?.[0]?.message?.content;
  if (!text || !String(text).trim()) throw new Error('Hermes Office returned an empty response');

  return {
    text: String(text).trim(),
    model: data.model || profile,
    profile,
    raw: data,
    runtime: 'direct-hermes-api'
  };
}

async function askVercel({ profile, messages, metadata, signal }) {
  const oidc = await getGitHubOidcToken();
  const url = process.env.HERMES_VERCEL_URL || DEFAULT_VERCEL_URL;

  const headers = {
    authorization: 'Bearer ' + oidc,
    'content-type': 'application/json',
    accept: 'application/json'
  };
  if (process.env.GITHUB_TOKEN) {
    headers['x-quantdeus-github-token'] = process.env.GITHUB_TOKEN;
  }
  if (process.env.OPENROUTER_API_KEY) {
    headers['x-quantdeus-openrouter-key'] = process.env.OPENROUTER_API_KEY;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      profile,
      messages: normalizedMessages(messages, metadata),
      metadata
    }),
    signal
  });

  const raw = await response.text();
  if (!response.ok) throw new Error('Hermes Cloud PC ' + response.status + ': ' + raw.slice(0, 1600));

  let data;
  try { data = JSON.parse(raw); }
  catch { throw new Error('Hermes Cloud PC returned non-JSON: ' + raw.slice(0, 400)); }

  if (!data?.text || !String(data.text).trim()) throw new Error('Hermes Cloud PC returned an empty response');

  return {
    text: String(data.text).trim(),
    model: data.model || profile,
    profile: data.profile || profile,
    raw: data,
    runtime: data.execution_mode || 'vercel-sandbox'
  };
}

async function tick({ timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (!oidcConfigured()) throw new Error('GITHUB_OIDC_UNAVAILABLE');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const oidc = await getGitHubOidcToken();
    const url = process.env.HERMES_VERCEL_URL || DEFAULT_VERCEL_URL;
    const headers = {
      authorization: 'Bearer ' + oidc,
      'content-type': 'application/json',
      accept: 'application/json'
    };
    if (process.env.GITHUB_TOKEN) {
      headers['x-quantdeus-github-token'] = process.env.GITHUB_TOKEN;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ mode: 'cron_tick' }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error('Hermes cron bridge HTTP ' + response.status);

    const data = await response.json();
    if (!data?.ok || data.mode !== 'cron_tick') throw new Error('Hermes cron bridge returned an invalid result');
    return {
      mode: data.mode,
      profiles_checked: data.profiles_checked,
      profiles_succeeded: data.profiles_succeeded,
      profiles_failed: data.profiles_failed
    };
  } finally {
    clearTimeout(timer);
  }
}

async function ask({ profile = 'seven-of-nine', messages = [], metadata = {}, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  if (!configured()) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    if (directConfigured()) {
      return await askDirect({ profile, messages, metadata, signal: controller.signal });
    }
    return await askVercel({ profile, messages, metadata, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { configured, ask, tick };
