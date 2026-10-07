import crypto from 'node:crypto';
import {
  getPositions,
  placeMarketOrder,
  runRiskCheck
} from '../../lib/bingx-vst-broker.js';

const ISSUER = 'https://token.actions.githubusercontent.com';
const JWKS_URL = ISSUER + '/.well-known/jwks';
const AUDIENCE = 'quantdeus-vercel-openclaw';
const REPOSITORY = 'quantdeus/quantdeus.github.io';
let jwksCache = [];
let jwksAt = 0;

function jsonPart(value) {
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

async function verifyGitHubOidc(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('invalid_github_oidc_format');

  const header = jsonPart(parts[0]);
  const claims = jsonPart(parts[1]);
  if (header.alg !== 'RS256' || !header.kid) throw new Error('invalid_github_oidc_header');

  const key = (await jwks()).find(item => item.kid === header.kid);
  if (!key) throw new Error('github_oidc_unknown_key');

  const verified = crypto.verify(
    'RSA-SHA256',
    Buffer.from(parts[0] + '.' + parts[1]),
    crypto.createPublicKey({ key, format: 'jwk' }),
    Buffer.from(parts[2], 'base64url')
  );
  if (!verified) throw new Error('github_oidc_bad_signature');

  const now = Math.floor(Date.now() / 1000);
  const audienceOk = Array.isArray(claims.aud)
    ? claims.aud.includes(AUDIENCE)
    : claims.aud === AUDIENCE;

  if (claims.iss !== ISSUER || !audienceOk) throw new Error('github_oidc_bad_issuer_or_audience');
  if (!claims.exp || claims.exp < now - 15 || (claims.nbf && claims.nbf > now + 15)) {
    throw new Error('github_oidc_expired_or_not_yet_valid');
  }
  if (claims.repository !== REPOSITORY) throw new Error('github_oidc_wrong_repository');

  const workflowRef = String(claims.workflow_ref || claims.job_workflow_ref || claims.workflow || '');
  const eventName = String(claims.event_name || '');
  const ref = String(claims.ref || '');

  const trusted =
    /\.github\/workflows\/bingx-vst-signal\.yml(?:@|$)/.test(workflowRef) &&
    new Set(['schedule', 'workflow_dispatch']).has(eventName) &&
    ref === 'refs/heads/main';

  if (!trusted) throw new Error('forbidden_vst_broker_identity');
  return claims;
}

function inputObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  try {
    const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    await verifyGitHubOidc(bearer);

    const operation = String(req.body?.operation || '').trim();
    const input = inputObject(req.body?.input);

    if (operation === 'positions') {
      const result = await getPositions(input);
      return res.status(200).json({ ok: true, operation, result });
    }

    if (operation === 'risk_check') {
      const result = await runRiskCheck(input);
      return res.status(200).json({ ok: true, operation, result });
    }

    if (operation === 'place_order') {
      const result = await placeMarketOrder(input);
      return res.status(200).json({ ok: true, operation, result });
    }

    return res.status(400).json({ ok: false, error: 'unsupported_operation' });
  } catch (error) {
    const message = String(error?.message || error).slice(0, 240);
    const forbidden = /oidc|identity|repository|audience|issuer|workflow/i.test(message);
    return res.status(forbidden ? 403 : 502).json({
      ok: false,
      error: message
    });
  }
}
