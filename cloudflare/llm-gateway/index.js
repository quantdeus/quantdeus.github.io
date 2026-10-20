const ISSUER = 'https://token.actions.githubusercontent.com';
const JWKS_URL = ISSUER + '/.well-known/jwks';
const REPOSITORY = 'quantdeus/quantdeus.github.io';
const AUDIENCE = 'quantdeus-cloudflare-llm';

let jwksCache;
let jwksAt = 0;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}
function decodePart(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')));
}
async function jwks() {
  if (jwksCache && Date.now() - jwksAt < 3600000) return jwksCache;
  const response = await fetch(JWKS_URL, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error('github_jwks_fetch_failed');
  const data = await response.json();
  jwksCache = Array.isArray(data.keys) ? data.keys : [];
  jwksAt = Date.now();
  return jwksCache;
}
async function verify(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('github_oidc_invalid_format');
  const header = decodePart(parts[0]);
  const claims = decodePart(parts[1]);
  if (header.alg !== 'RS256' || !header.kid) throw new Error('github_oidc_invalid_header');
  const keyData = (await jwks()).find(key => key.kid === header.kid);
  if (!keyData) throw new Error('github_oidc_unknown_key');
  const key = await crypto.subtle.importKey('jwk', keyData, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const signature = Uint8Array.from(atob(parts[2].replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(parts[2].length / 4) * 4, '=')), c => c.charCodeAt(0));
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, new TextEncoder().encode(parts[0] + '.' + parts[1]));
  const now = Math.floor(Date.now() / 1000);
  const aud = Array.isArray(claims.aud) ? claims.aud.includes(AUDIENCE) : claims.aud === AUDIENCE;
  if (!valid || claims.iss !== ISSUER || !aud || claims.repository !== REPOSITORY ||
      !claims.exp || claims.exp < now - 15 || (claims.nbf && claims.nbf > now + 15)) {
    throw new Error('github_oidc_claims_rejected');
  }
  const event = String(claims.event_name || '');
  const workflow = String(claims.workflow_ref || claims.job_workflow_ref || '');
  const allowed = event === 'issue_comment' ||
    (['issues', 'workflow_dispatch'].includes(event) && /\.github\/workflows\/browser-homunculus\.yml@/.test(workflow));
  if (!allowed) throw new Error('github_oidc_wrong_event_or_workflow');
  return claims;
}
function normalizeMessages(input) {
  if (!Array.isArray(input) || input.length < 1 || input.length > 24) throw new Error('messages_must_have_1_to_24_items');
  let total = 0;
  return input.map((m, i) => {
    const role = String(m?.role || '');
    const content = String(m?.content || '');
    if (!['system', 'user', 'assistant'].includes(role) || !content || content.length > (role === 'system' ? 50000 : 16000)) {
      throw new Error('invalid_message_' + i);
    }
    total += content.length;
    if (total > 90000) throw new Error('messages_total_too_large');
    return { role, content };
  });
}
async function generate(env, messages) {
  const model = env.CF_MODEL || '@cf/google/gemma-4-26b-a4b-it';
  try {
    const result = await env.AI.run(model, { messages, temperature: 0, max_tokens: 900 });
    const text = String(result?.response || result?.choices?.[0]?.message?.content || '').trim();
    if (text) return { text, model, provider: 'cloudflare-workers-ai' };
    throw new Error('cloudflare_ai_empty_response');
  } catch (cfError) {
    if (!env.GITHUB_MODELS_TOKEN) throw cfError;
    const response = await fetch('https://models.github.ai/inference/chat/completions', {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + env.GITHUB_MODELS_TOKEN,
        'content-type': 'application/json',
        accept: 'application/json'
      },
      body: JSON.stringify({
        model: env.GITHUB_MODELS_MODEL || 'openai/gpt-4.1-mini',
        messages,
        temperature: 0,
        max_tokens: 900
      }),
      signal: AbortSignal.timeout(40000)
    });
    if (!response.ok) throw new Error('cloudflare_and_github_models_unavailable');
    const data = await response.json();
    const text = String(data?.choices?.[0]?.message?.content || '').trim();
    if (!text) throw new Error('github_models_empty_response');
    return { text, model: String(data.model || env.GITHUB_MODELS_MODEL || 'openai/gpt-4.1-mini'), provider: 'github-models-fallback' };
  }
}
export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname === '/health') return json({ ok: true, service: 'quantdeus-llm-gateway', provider_order: ['cloudflare-workers-ai', 'github-models'] });
    if (request.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);
    try {
      const authorization = request.headers.get('authorization') || '';
      if (!authorization.startsWith('Bearer ')) throw new Error('github_oidc_missing');
      const claims = await verify(authorization.slice(7));
      const body = await request.json();
      const messages = normalizeMessages(body?.messages);
      const result = await generate(env, messages);
      return json({ ok: true, ...result, github_run: { actor: claims.actor || null, workflow: claims.workflow || null, event: claims.event_name, repository: claims.repository } });
    } catch (error) {
      const message = String(error?.message || error);
      const authError = /github_oidc/.test(message);
      return json({ ok: false, error: authError ? 'unauthorized' : 'llm_gateway_failed', detail: message.slice(0, 300) }, authError ? 401 : 502);
    }
  }
};
