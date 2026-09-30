import crypto from 'node:crypto';

const GITHUB_OIDC_ISSUER = 'https://token.actions.githubusercontent.com';
const GITHUB_JWKS_URL = 'https://token.actions.githubusercontent.com/.well-known/jwks';
const EXPECTED_AUDIENCE = 'quantdeus-vercel-llm';
const EXPECTED_REPOSITORY = 'quantdeus/quantdeus.github.io';
const PROVIDER_PROBE_OK_TTL_MS = 5 * 60 * 1000;
const PROVIDER_PROBE_FAIL_TTL_MS = 30 * 1000;

let jwksCache = null;
let jwksFetchedAt = 0;
const providerProbeCache = new Map();

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

function configuredProviders() {
  const providers = [];
  const openRouterKey = String(process.env.OPENROUTER_API_KEY || '').trim();
  if (openRouterKey) {
    providers.push({
      id: 'openrouter',
      endpoint: 'https://openrouter.ai/api/v1/chat/completions',
      key: openRouterKey,
      model: String(process.env.SITE_AGENT_MODEL || process.env.QD_LLM_MODEL || process.env.OPENROUTER_MODEL || 'openrouter/free').trim(),
      priority: 10,
      extraHeaders: { 'HTTP-Referer': 'https://quantdeus.github.io', 'X-Title': 'QuantDeus' }
    });
  }

  providers.push({
    id: 'pollinations',
    endpoint: 'https://text.pollinations.ai/openai',
    key: String(process.env.POLLINATIONS_API_KEY || 'anonymous').trim(),
    model: String(process.env.POLLINATIONS_MODEL || 'openai').trim(),
    priority: 100,
    extraHeaders: {}
  });

  return providers.filter(provider => provider.key && provider.model);
}

function providerCacheKey(provider) {
  const fingerprint = crypto.createHash('sha256').update(provider.key).digest('hex').slice(0, 12);
  return provider.id + ':' + provider.model + ':' + fingerprint;
}

async function probeProvider(provider) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(provider.endpoint, {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + provider.key,
        'content-type': 'application/json',
        accept: 'application/json',
        ...provider.extraHeaders
      },
      body: JSON.stringify({
        model: provider.model,
        messages: [{ role: 'user', content: 'Reply with exactly OK.' }],
        temperature: 0,
        max_tokens: 8
      }),
      signal: controller.signal
    });
    const raw = await response.text();
    let data = null;
    try { data = JSON.parse(raw); } catch {}
    const finalText = typeof data?.choices?.[0]?.message?.content === 'string'
      ? data.choices[0].message.content.trim()
      : '';
    return {
      ok: response.ok && finalText === 'OK',
      status: response.status,
      detail: response.ok ? (finalText === 'OK' ? 'http_200_exact_ok' : 'exact_ok_missing') : raw.slice(0, 300)
    };
  } catch (error) {
    return { ok: false, status: 0, detail: String(error?.message || error).slice(0, 300) };
  } finally {
    clearTimeout(timer);
  }
}

async function cachedProbeProvider(provider) {
  const key = providerCacheKey(provider);
  const now = Date.now();
  const cached = providerProbeCache.get(key);
  if (cached && cached.expiresAt > now) return { ...cached.result, cached: true };

  const result = await probeProvider(provider);
  providerProbeCache.set(key, {
    expiresAt: now + (result.ok ? PROVIDER_PROBE_OK_TTL_MS : PROVIDER_PROBE_FAIL_TTL_MS),
    result
  });
  return { ...result, cached: false };
}

async function selectProvider() {
  const providers = configuredProviders();
  const rows = await Promise.all(providers.map(async provider => ({
    provider,
    probe: await cachedProbeProvider(provider)
  })));
  const healthy = rows
    .filter(row => row.probe.ok)
    .sort((a, b) => a.provider.priority - b.provider.priority);

  if (!healthy.length) {
    const error = new Error('no_verified_provider_configured');
    error.probes = rows.map(row => ({ provider: row.provider.id, model: row.provider.model, ...row.probe }));
    throw error;
  }
  return { selected: healthy[0].provider, probes: rows.map(row => ({ provider: row.provider.id, model: row.provider.model, ...row.probe })) };
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
    const { selected, probes } = await selectProvider();
    const response = await fetch(selected.endpoint, {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + selected.key,
        'content-type': 'application/json',
        accept: 'application/json',
        ...selected.extraHeaders
      },
      body: JSON.stringify({ model: selected.model, messages, temperature: 0.2, max_tokens: 900 })
    });
    const raw = await response.text();
    if (!response.ok) throw new Error('provider_' + selected.id + '_' + response.status + ': ' + raw.slice(0, 800));
    let data; try { data = JSON.parse(raw); } catch { throw new Error('provider_non_json: ' + raw.slice(0, 250)); }
    const text = data?.choices?.[0]?.message?.content;
    if (!text || !String(text).trim()) throw new Error('provider_empty_response');
    return res.status(200).json({
      ok: true,
      provider: selected.id,
      model: data?.model || selected.model,
      text: String(text).trim(),
      probes,
      github_run: { actor: claims.actor || null, workflow: claims.workflow || null, event: claims.event_name || null, repository: claims.repository }
    });
  } catch (error) {
    console.error('QuantDeus LLM bridge error:', error);
    const message = String(error?.message || error);
    const status = /github_oidc|wrong_repository|wrong_event/.test(message)
      ? 401
      : message === 'no_verified_provider_configured' ? 503 : 500;
    return res.status(status).json({
      ok: false,
      error: message === 'no_verified_provider_configured' ? message : 'llm_bridge_failed',
      detail: message.slice(0, 1000),
      ...(error?.probes ? { probes: error.probes } : {})
    });
  }
}
