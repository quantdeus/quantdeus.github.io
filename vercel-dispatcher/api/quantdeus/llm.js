import crypto from 'node:crypto';
import { generateText } from 'ai';

const GITHUB_OIDC_ISSUER = 'https://token.actions.githubusercontent.com';
const GITHUB_JWKS_URL = 'https://token.actions.githubusercontent.com/.well-known/jwks';
const EXPECTED_AUDIENCE = 'quantdeus-vercel-llm';
const EXPECTED_REPOSITORY = 'quantdeus/quantdeus.github.io';
const GATEWAY_MODEL = String(
  process.env.LLM_BRIDGE_MODEL ||
  process.env.BROWSER_PLANNER_MODEL ||
  'google/gemini-3.6-flash'
).trim();

let jwksCache = null;
let jwksFetchedAt = 0;

function decodeJsonPart(value) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

async function getJwks() {
  const now = Date.now();
  if (jwksCache && now - jwksFetchedAt < 60 * 60 * 1000) return jwksCache;
  const response = await fetch(GITHUB_JWKS_URL, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error('github_jwks_fetch_failed_' + response.status);
  const data = await response.json();
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

  const jwk = (await getJwks()).find(key => key.kid === header.kid);
  if (!jwk) throw new Error('github_oidc_unknown_key');

  const valid = crypto.verify(
    'RSA-SHA256',
    Buffer.from(encodedHeader + '.' + encodedPayload),
    crypto.createPublicKey({ key: jwk, format: 'jwk' }),
    Buffer.from(encodedSignature, 'base64url')
  );
  if (!valid) throw new Error('github_oidc_bad_signature');

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
    const perMessageLimit = role === 'system' ? 50000 : 16000;
    if (!content || content.length > perMessageLimit) throw new Error('invalid_message_content_at_' + index);
    total += content.length;
    if (total > 90000) throw new Error('messages_total_too_large');
    return { role, content };
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  try {
    const auth = String(req.headers?.authorization || '');
    if (!auth.startsWith('Bearer ')) throw new Error('github_oidc_missing');
    const claims = await verifyGitHubOidc(auth.slice(7));
    const normalized = normalizeMessages(req.body?.messages);
    const instructions = normalized
      .filter(message => message.role === 'system')
      .map(message => message.content)
      .join('\n\n')
      .trim();
    const messages = normalized.filter(message => message.role !== 'system');
    if (!messages.length) throw new Error('messages_require_non_system_turn');

    const result = await generateText({
      model: GATEWAY_MODEL,
      ...(instructions ? { instructions } : {}),
      messages,
      temperature: 0,
      maxOutputTokens: 900
    });

    const answer = String(result?.text || '').trim();
    if (!answer) throw new Error('gateway_empty_response');

    return res.status(200).json({
      ok: true,
      provider: 'vercel-ai-gateway-oidc',
      model: GATEWAY_MODEL,
      text: answer,
      github_run: {
        actor: claims.actor || null,
        workflow: claims.workflow || null,
        event: claims.event_name || null,
        repository: claims.repository
      }
    });
  } catch (error) {
    const message = String(error?.message || error);
    console.error('QuantDeus LLM bridge error:', message);
    const status = /github_oidc|wrong_repository|wrong_event/.test(message) ? 401 : 502;
    return res.status(status).json({
      ok: false,
      error: 'llm_bridge_failed',
      detail: message.slice(0, 1200)
    });
  }
}
