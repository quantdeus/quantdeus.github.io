'use strict';

const agentRegistry = require('../coordination/agents.json');
const { getGithubOidcToken } = require('./github-oidc');

const DEFAULT_TIMEOUT_MS = 250000;
const DEFAULT_VERCEL_URL = 'https://quantdeus.vercel.app/api/quantdeus/openclaw';
const OPENCLAW_AUDIENCE = 'quantdeus-vercel-openclaw';
const collectiveDirective = String(agentRegistry.collective_cognition?.runtime_directive || '').trim();

function configured() {
  return Boolean(
    process.env.ACTIONS_ID_TOKEN_REQUEST_URL &&
    process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN
  );
}

function normalizedMessages(messages, metadata, trusted = false) {
  const meta = Object.entries(metadata || {})
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => key + '=' + String(value))
    .join(' · ');
  const system = [
    'You are running inside the QuantDeus OpenClaw Office.',
    'GitHub quantdeus/quantdeus.github.io is the canonical project source of truth.',
    collectiveDirective ? 'Collective cognition: ' + collectiveDirective : '',
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

const TRANSIENT_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

function officeError(message, { code = 'OPENCLAW_OFFICE_ERROR', status = null, transient = false, retrySafe = false } = {}) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  error.transient = Boolean(transient);
  error.retrySafe = Boolean(retrySafe);
  return error;
}

function isTransientError(error) {
  return Boolean(
    error && (
      error.transient === true ||
      error.name === 'AbortError' ||
      ['OPENCLAW_TIMEOUT', 'OPENCLAW_NETWORK', 'OPENCLAW_TRANSIENT'].includes(error.code)
    )
  );
}

function looksTransient(status, raw) {
  const text = String(raw || '').toLowerCase();
  return TRANSIENT_STATUS_CODES.has(Number(status)) ||
    text.includes('incomplete_turn') ||
    text.includes('incomplete or malformed tool call') ||
    text.includes('temporarily unavailable') ||
    text.includes('upstream timeout') ||
    text.includes('gateway timeout');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function askOnce({ profile, messages, metadata, trusted = false, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  if (!configured()) throw new Error('OPENCLAW_OFFICE_CREDENTIALS_UNAVAILABLE');
  const oidc = await getGithubOidcToken(OPENCLAW_AUDIENCE);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = {
      authorization: 'Bearer ' + oidc,
      'content-type': 'application/json',
      accept: 'application/json'
    };
    if (process.env.GITHUB_TOKEN) headers['x-quantdeus-github-token'] = process.env.GITHUB_TOKEN;

    let response;
    try {
      response = await fetch(process.env.OPENCLAW_VERCEL_URL || DEFAULT_VERCEL_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          profile,
          messages: normalizedMessages(messages, metadata, trusted),
          metadata,
          execution_mode: trusted ? 'trusted-office' : 'chat',
          // Give the server a slightly shorter budget than the caller so it can
          // terminate cleanly instead of leaving a zombie Sandbox turn behind.
          request_timeout_ms: Math.max(15000, Math.min(285000, timeoutMs - 5000))
        }),
        signal: controller.signal
      });
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw officeError('OpenClaw Office timed out after ' + timeoutMs + 'ms', {
          code: 'OPENCLAW_TIMEOUT',
          transient: true
        });
      }
      throw officeError('OpenClaw Office network error: ' + String(error?.message || error), {
        code: 'OPENCLAW_NETWORK',
        transient: true
      });
    }

    const raw = await response.text();
    if (!response.ok) {
      let errorData = null;
      try { errorData = JSON.parse(raw); } catch {}
      throw officeError('OpenClaw Office ' + response.status + ': ' + raw.slice(0, 1600), {
        code: looksTransient(response.status, raw) ? 'OPENCLAW_TRANSIENT' : 'OPENCLAW_HTTP_ERROR',
        status: response.status,
        transient: looksTransient(response.status, raw),
        retrySafe: errorData?.retry_safe === true
      });
    }

    let data;
    try { data = JSON.parse(raw); }
    catch { throw new Error('OpenClaw Office returned non-JSON: ' + raw.slice(0, 400)); }
    if (!data?.text || !String(data.text).trim()) throw new Error('OpenClaw Office returned an empty response');
    return {
      text: String(data.text).trim(),
      model: data.model || null,
      provider: data.model_provider || null,
      assistantTurns: data.assistant_turns ?? null,
      usage: data.usage || null,
      toolSummary: data.tool_summary || null,
      profile: data.profile || profile,
      raw: data,
      runtime: data.execution_mode || 'openclaw-agent-exec'
    };
  } finally {
    clearTimeout(timer);
  }
}

async function ask(options) {
  const retryTransient = options?.retryTransient === true;
  const attempts = retryTransient ? 2 : 1;
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await askOnce(options);
    } catch (error) {
      lastError = error;
      const retryAllowed = options?.trusted !== true || error?.retrySafe === true;
      if (!retryTransient || !isTransientError(error) || !retryAllowed || attempt >= attempts) throw error;
      console.warn('[openclaw-office] transient failure; retrying once', {
        attempt,
        code: error.code || null,
        status: error.status || null,
        message: String(error.message || error).slice(0, 500)
      });
      await sleep(1000);
    }
  }
  throw lastError;
}

module.exports = { configured, ask, isTransientError };
