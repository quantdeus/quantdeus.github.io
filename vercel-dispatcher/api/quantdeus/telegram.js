import crypto from 'node:crypto';

const REPOSITORY = 'quantdeus/quantdeus.github.io';
const ISSUER = 'https://token.actions.githubusercontent.com';
const JWKS_URL = `${ISSUER}/.well-known/jwks`;
const AUDIENCE = 'quantdeus-vercel-telegram';
const WORKFLOW = 'telegram-bot.yml';
const DEFAULT_WEBHOOK_URL = 'https://quantdeus.vercel.app/api/quantdeus/telegram';
let jwksCache = [];
let jwksAt = 0;

function decodeJsonPart(value) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

async function jwks() {
  if (jwksCache.length && Date.now() - jwksAt < 3600000) return jwksCache;
  const response = await fetch(JWKS_URL, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error('github_jwks_fetch_failed_' + response.status);
  jwksCache = (await response.json()).keys || [];
  jwksAt = Date.now();
  return jwksCache;
}

async function verifyGithubOidc(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('invalid_github_oidc_format');
  const header = decodeJsonPart(parts[0]);
  const claims = decodeJsonPart(parts[1]);
  if (header.alg !== 'RS256' || !header.kid) throw new Error('invalid_github_oidc_header');
  const key = (await jwks()).find(item => item.kid === header.kid);
  if (!key) throw new Error('github_oidc_unknown_key');
  const signatureOk = crypto.verify(
    'RSA-SHA256',
    Buffer.from(parts[0] + '.' + parts[1]),
    crypto.createPublicKey({ key, format: 'jwk' }),
    Buffer.from(parts[2], 'base64url')
  );
  if (!signatureOk) throw new Error('github_oidc_bad_signature');

  const now = Math.floor(Date.now() / 1000);
  const audienceOk = Array.isArray(claims.aud) ? claims.aud.includes(AUDIENCE) : claims.aud === AUDIENCE;
  if (claims.iss !== ISSUER || !audienceOk) throw new Error('github_oidc_bad_issuer_or_audience');
  if (!claims.exp || claims.exp < now - 15 || claims.nbf > now + 15) throw new Error('github_oidc_expired_or_not_yet_valid');
  if (claims.repository !== REPOSITORY) throw new Error('github_oidc_wrong_repository');

  const workflowRef = String(claims.workflow_ref || claims.job_workflow_ref || claims.workflow || '');
  if (!/\.github\/workflows\/telegram-bot\.yml(?:@|$)/.test(workflowRef)) throw new Error('github_oidc_wrong_workflow');
  if (!new Set(['push', 'workflow_dispatch']).has(String(claims.event_name || ''))) throw new Error('github_oidc_wrong_event');
  return claims;
}

function webhookSecret() {
  const base = String(process.env.TELEGRAM_WEBHOOK_SECRET || process.env.CRON_SECRET || process.env.QUANTDEUS_GITHUB_TOKEN || '').trim();
  if (!base) return '';
  return crypto.createHash('sha256').update('quantdeus-telegram-webhook:' + base).digest('base64url');
}

function safeEqual(actual, expected) {
  const left = Buffer.from(String(actual || ''));
  const right = Buffer.from(String(expected || ''));
  return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
}

async function telegram(botToken, method, payload = {}) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(payload)
  });
  const raw = await response.text();
  let body = {};
  try { body = JSON.parse(raw); } catch {}
  if (!response.ok || body.ok !== true) {
    throw new Error(`telegram_${method}_failed_${response.status}: ${body.description || raw.slice(0, 400)}`);
  }
  return body.result;
}

async function setupWebhook(req, res) {
  try {
    await verifyGithubOidc(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
  } catch (error) {
    return res.status(401).json({ ok: false, error: 'telegram_setup_auth_failed', detail: String(error.message || error) });
  }

  const botToken = String(req.body?.bot_token || '').trim();
  if (!botToken) return res.status(400).json({ ok: false, error: 'bot_token_required' });

  const secret = webhookSecret();
  if (!secret) return res.status(503).json({ ok: false, error: 'telegram_webhook_secret_unavailable' });

  const me = await telegram(botToken, 'getMe');
  const webhookUrl = String(process.env.TELEGRAM_WEBHOOK_URL || DEFAULT_WEBHOOK_URL);
  await telegram(botToken, 'setWebhook', {
    url: webhookUrl,
    secret_token: secret,
    allowed_updates: ['message'],
    drop_pending_updates: false,
    max_connections: 20
  });
  const info = await telegram(botToken, 'getWebhookInfo');

  return res.status(200).json({
    ok: true,
    bot: { id: me.id, username: me.username || null },
    webhook: {
      url: info.url || webhookUrl,
      pending_update_count: info.pending_update_count || 0,
      last_error_date: info.last_error_date || null,
      last_error_message: info.last_error_message || null
    }
  });
}

async function dispatchUpdate(update) {
  const githubToken = String(process.env.QUANTDEUS_GITHUB_TOKEN || '').trim();
  if (!githubToken) throw new Error('QUANTDEUS_GITHUB_TOKEN_missing');

  const encoded = Buffer.from(JSON.stringify(update), 'utf8').toString('base64url');
  const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + githubToken,
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
      'x-github-api-version': '2022-11-28'
    },
    body: JSON.stringify({
      ref: 'main',
      inputs: {
        telegram_update_b64: encoded,
        telegram_update_id: String(update.update_id)
      }
    })
  });
  const raw = await response.text();
  if (response.status !== 204) throw new Error('github_workflow_dispatch_failed_' + response.status + ': ' + raw.slice(0, 500));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  if (/^Bearer\s+/i.test(String(req.headers.authorization || '')) && req.body?.mode === 'setup') {
    try {
      return await setupWebhook(req, res);
    } catch (error) {
      return res.status(500).json({ ok: false, error: 'telegram_setup_failed', detail: String(error.message || error) });
    }
  }

  const expectedSecret = webhookSecret();
  const providedSecret = req.headers['x-telegram-bot-api-secret-token'];
  if (!expectedSecret || !safeEqual(providedSecret, expectedSecret)) {
    return res.status(401).json({ ok: false, error: 'telegram_webhook_auth_failed' });
  }

  const update = req.body;
  if (!update || !Number.isInteger(update.update_id)) {
    return res.status(400).json({ ok: false, error: 'invalid_telegram_update' });
  }

  const message = update.message;
  if (!message || message.from?.is_bot || !String(message.text || '').trim()) {
    return res.status(200).json({ ok: true, status: 'ignored_non_text_or_bot_update', update_id: update.update_id });
  }

  try {
    await dispatchUpdate(update);
    return res.status(200).json({ ok: true, status: 'workflow_dispatched', update_id: update.update_id });
  } catch (error) {
    console.error('[telegram-webhook]', String(error?.message || error).slice(0, 800));
    return res.status(503).json({ ok: false, error: 'telegram_dispatch_failed' });
  }
}
