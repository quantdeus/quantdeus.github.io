import crypto from 'node:crypto';

const GITHUB_OIDC_ISSUER = 'https://token.actions.githubusercontent.com';
const GITHUB_JWKS_URL = 'https://token.actions.githubusercontent.com/.well-known/jwks';
const EXPECTED_AUDIENCE = 'quantdeus-vercel-llm';
const EXPECTED_REPOSITORY = 'quantdeus/quantdeus.github.io';
const PROVIDER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = String(process.env.SITE_AGENT_MODEL || process.env.QD_LLM_MODEL || 'openrouter/free').trim();

let jwksCache = null;
let jwksFetchedAt = 0;

function decodeJsonPart(value) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

async function getJwks() {
  const now = Date.now();
  if (jwksCache && now - jwksFetchedAt < 60 * 60 * 1000) return jwksCache;
  const r = await fetch(GITHUB_JWKS_URL, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error('github_jwks_fetch_failed_' + r.status);
  const data = await r.json();
  jwksCache = Array.isArray(data.keys) ? data.keys : [];
  jwksFetchedAt = now;
  return jwksCache;
}

function audienceMatches(aud) {
  return Array.isArray(aud) ? aud.includes(EXPECTED_AUDIENCE) : aud === EXPECTED_AUDIENCE;
}

async function verifyGitHubOidc(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('invalid_github_oidc_format');

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeJsonPart(encodedHeader);
  const claims = decodeJsonPart(encodedPayload);

  if (header.alg !== 'RS256' || !header.kid) throw new Error('invalid_github_oidc_header');

  const keys = await getJwks();
  const jwk = keys.find(key => key.kid === header.kid);
  if (!jwk) throw new Error('github_oidc_unknown_key');

  const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const validSignature = crypto.verify(
    'RSA-SHA256',
    Buffer.from(encodedHeader + '.' + encodedPayload),
    publicKey,
    Buffer.from(encodedSignature, 'base64url')
  );
  if (!validSignature) throw new Error('github_oidc_bad_signature');

  const now = Math.floor(Date.now() / 1000);
  if (claims.iss !== GITHUB_OIDC_ISSUER) throw new Error('github_oidc_bad_issuer');
  if (!audienceMatches(claims.aud)) throw new Error('github_oidc_bad_audience');
  if (!claims.exp || claims.exp < now - 15) throw new Error('github_oidc_expired');
  if (claims.nbf && claims.nbf > now + 15) throw new Error('github_oidc_not_yet_valid');
  if (claims.repository !== EXPECTED_REPOSITORY) throw new Error('github_oidc_wrong_repository');

  const eventName = String(claims.event_name || '');
  const workflowRef = String(claims.workflow_ref || claims.job_workflow_ref || '');
  const siteAgentRequest = eventName === 'issue_comment';
  const browserRequest =
    new Set(['issues', 'workflow_dispatch']).has(eventName) &&
    /\.github\/workflows\/browser-homunculus\.yml@/.test(workflowRef);

  if (!siteAgentRequest && !browserRequest) throw new Error('github_oidc_wrong_event_or_workflow');
  return claims;
}

function normalizeMessages(input) {
  if (!Array.isArray(input) || input.length < 1 || input.length > 24) {
    throw new Error('messages_must_have_1_to_24_items');
  }

  let total = 0;
  return input.map((message, index) => {
    const role = String(message?.role || '');
    const content = String(message?.content || '');
    if (!['system', 'user', 'assistant'].includes(role)) {
      throw new Error('unsupported_message_role_at_' + index);
    }
    if (!content || content.length > 16000) {
      throw new Error('invalid_message_content_at_' + index);
    }
    total += content.length;
    if (total > 70000) throw new Error('messages_total_too_large');
    return { role, content };
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  try {
    const auth = String(req.headers?.authorization || '');
    if (!auth.startsWith('Bearer ')) throw new Error('github_oidc_missing');
    const claims = await verifyGitHubOidc(auth.slice(7));
    const messages = normalizeMessages(req.body?.messages);
    const apiKey = String(process.env.OPENROUTER_API_KEY || '').trim();
    if (!apiKey || !MODEL) return res.status(503).json({ ok: false, error: 'no_verified_provider_configured' });
    const response = await fetch(PROVIDER_URL, { method: 'POST', headers: { authorization: 'Bearer ' + apiKey, 'content-type': 'application/json', accept: 'application/json', 'HTTP-Referer': 'https://quantdeus.github.io', 'X-Title': 'QuantDeus' }, body: JSON.stringify({ model: MODEL, messages, temperature: 0.45, max_tokens: 900 }) });
    const raw = await response.text();
    if (!response.ok) throw new Error('provider_' + response.status + ': ' + raw.slice(0, 800));
    let data; try { data = JSON.parse(raw); } catch { throw new Error('provider_non_json: ' + raw.slice(0, 250)); }
    const text = data?.choices?.[0]?.message?.content;
    if (!text || !String(text).trim()) throw new Error('provider_empty_response');
    return res.status(200).json({ ok: true, provider: 'openrouter', model: data?.model || MODEL, text: String(text).trim(), github_run: { actor: claims.actor || null, workflow: claims.workflow || null, event: claims.event_name || null, repository: claims.repository } });
  } catch (error) {
    console.error('QuantDeus LLM bridge error:', error);
    const message = String(error?.message || error);
    const status = /github_oidc|wrong_repository|wrong_event/.test(message) ? 401 : 500;
    return res.status(status).json({ ok: false, error: 'llm_bridge_failed', detail: message.slice(0, 1000) });
  }
}
