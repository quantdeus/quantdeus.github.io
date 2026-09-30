import crypto from 'node:crypto';
import { Sandbox } from '@vercel/sandbox';

const ISSUER = 'https://token.actions.githubusercontent.com';
const JWKS_URL = `${ISSUER}/.well-known/jwks`;
const AUDIENCE = 'quantdeus-vercel-openclaw';
const REPOSITORY = 'quantdeus/quantdeus.github.io';
const EVENTS = new Set(['issue_comment', 'schedule', 'workflow_dispatch', 'push']);
const SANDBOX = 'quantdeus-openclaw-office';
const VERCEL_INTERNAL_AUDIENCE = 'quantdeus-internal-openclaw';
const VERCEL_INTERNAL_ISSUER = 'https://oidc.vercel.com/energotrons-projects-2705eaed';
const VERCEL_INTERNAL_JWKS_URL = 'https://oidc.vercel.com/.well-known/jwks';
const VERCEL_INTERNAL_SUBJECT = 'owner:energotrons-projects-2705eaed:project:quantdeus:environment:production';
let vercelJwksCache = [];
let vercelJwksAt = 0;
const OPENCLAW_RUNTIME_VERSION = '2026.9.6';
let jwksCache = [];
let jwksAt = 0;
const providerProbeCache = new Map();
const PROVIDER_PROBE_OK_TTL_MS = 5 * 60 * 1000;
const PROVIDER_PROBE_FAIL_TTL_MS = 30 * 1000;

function jsonPart(s) { return JSON.parse(Buffer.from(s, 'base64url').toString('utf8')); }
async function jwks() {
  if (jwksCache.length && Date.now() - jwksAt < 3600000) return jwksCache;
  const r = await fetch(JWKS_URL, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`github_jwks_fetch_failed_${r.status}`);
  jwksCache = (await r.json()).keys || [];
  jwksAt = Date.now();
  return jwksCache;
}
async function verify(token) {
  const p = String(token || '').split('.');
  if (p.length !== 3) throw new Error('invalid_github_oidc_format');
  const h = jsonPart(p[0]);
  const c = jsonPart(p[1]);
  if (h.alg !== 'RS256' || !h.kid) throw new Error('invalid_github_oidc_header');
  const key = (await jwks()).find(k => k.kid === h.kid);
  if (!key) throw new Error('github_oidc_unknown_key');
  if (!crypto.verify('RSA-SHA256', Buffer.from(`${p[0]}.${p[1]}`), crypto.createPublicKey({ key, format: 'jwk' }), Buffer.from(p[2], 'base64url'))) throw new Error('github_oidc_bad_signature');
  const now = Math.floor(Date.now() / 1000);
  if (c.iss !== ISSUER || !(Array.isArray(c.aud) ? c.aud.includes(AUDIENCE) : c.aud === AUDIENCE)) throw new Error('github_oidc_bad_issuer_or_audience');
  if (!c.exp || c.exp < now - 15 || c.nbf > now + 15) throw new Error('github_oidc_expired_or_not_yet_valid');
  if (c.repository !== REPOSITORY) throw new Error('github_oidc_wrong_repository');
  if (!EVENTS.has(c.event_name)) throw new Error('github_oidc_wrong_event');
  return c;
}
async function vercelJwks() {
  if (vercelJwksCache.length && Date.now() - vercelJwksAt < 3600000) return vercelJwksCache;
  const r = await fetch(VERCEL_INTERNAL_JWKS_URL, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`vercel_oidc_jwks_fetch_failed_${r.status}`);
  vercelJwksCache = (await r.json()).keys || [];
  vercelJwksAt = Date.now();
  return vercelJwksCache;
}

async function verifyVercelInternal(token) {
  const p = String(token || '').split('.');
  if (p.length !== 3) throw new Error('vercel_oidc_invalid_format');
  const h = jsonPart(p[0]);
  const c = jsonPart(p[1]);
  if (!h.kid || !new Set(['RS256','ES256']).has(h.alg)) throw new Error('vercel_oidc_invalid_header');
  const key = (await vercelJwks()).find(k => k.kid === h.kid);
  if (!key) throw new Error('vercel_oidc_unknown_key');
  const algorithm = h.alg === 'RS256' ? 'RSA-SHA256' : 'SHA256';
  const ok = crypto.verify(
    algorithm,
    Buffer.from(`${p[0]}.${p[1]}`),
    crypto.createPublicKey({ key, format: 'jwk' }),
    Buffer.from(p[2], 'base64url')
  );
  if (!ok) throw new Error('vercel_oidc_bad_signature');
  const now = Math.floor(Date.now() / 1000);
  const audienceOk = Array.isArray(c.aud)
    ? c.aud.includes(VERCEL_INTERNAL_AUDIENCE)
    : c.aud === VERCEL_INTERNAL_AUDIENCE;
  if (c.iss !== VERCEL_INTERNAL_ISSUER || !audienceOk) throw new Error('vercel_oidc_bad_issuer_or_audience');
  if (c.sub !== VERCEL_INTERNAL_SUBJECT) throw new Error('vercel_oidc_bad_subject');
  if (!c.exp || c.exp < now - 15 || (c.nbf && c.nbf > now + 15)) throw new Error('vercel_oidc_expired_or_not_yet_valid');
  return c;
}

async function text(result) { return (await result.stdout()).trim(); }
async function checked(sandbox, args, label) {
  const r = await sandbox.runCommand(args);
  if (r.exitCode !== 0) throw new Error(`${label}_failed: ${(await r.stderr()).slice(0, 1000)}`);
  return r;
}

function trustedOfficeRequest(req, claims) {
  if (req.body?.execution_mode !== 'trusted-office') return false;
  const workflowRef = String(claims.workflow_ref || claims.job_workflow_ref || claims.workflow || '');
  const eventName = String(claims.event_name || '');
  const metadata = req.body?.metadata || {};
  // Evolution proposals are inference-only; never grant tools to this signed workflow.
  if (/\.github\/workflows\/openclaw-evolution\.yml(?:@|$)/.test(workflowRef)) return false;

  const trustedWorkflow = /\.github\/workflows\/(?:telegram-bot|openclaw-admin-smoke|quantdeus-hourly-openclaw|qa-self-heal|agent-role-cron|seven-priority-cycle|news-manifest-cycle|growth-site-cycle)\.yml(?:@|$)/.test(workflowRef);
  if (trustedWorkflow && new Set(['schedule', 'workflow_dispatch', 'push']).has(eventName)) return true;

  const siteOwnerAction =
    /\.github\/workflows\/site-agent-replies\.yml(?:@|$)/.test(workflowRef) &&
    eventName === 'issue_comment' &&
    metadata.source === 'github-command-center' &&
    metadata.admin_authorized === true &&
    String(metadata.actor_login || '').toLowerCase() === String(claims.actor || '').toLowerCase();

  return siteOwnerAction;
}

function hourlyOfficeRequest(req, claims) {
  if (!trustedOfficeRequest(req, claims)) return false;
  const workflowRef = String(claims.workflow_ref || claims.job_workflow_ref || claims.workflow || '');
  return /\.github\/workflows\/quantdeus-hourly-openclaw\.yml(?:@|$)/.test(workflowRef) &&
    req.body?.metadata?.source === 'quantdeus-hourly-openclaw' &&
    new Set(['schedule', 'workflow_dispatch']).has(String(claims.event_name || ''));
}

async function probeChatCandidate(candidate, requireTools = false) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requireTools ? 30000 : 10000);
  try {
    const headers = {
      authorization: 'Bearer ' + candidate.key,
      'content-type': 'application/json',
      accept: 'application/json'
    };
    const request = async body => {
      const response = await fetch(candidate.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      });
      const raw = await response.text();
      let data = null;
      try { data = JSON.parse(raw); } catch {}
      return { response, raw, data };
    };

    if (!requireTools) {
      const { response, raw, data } = await request({
        model: candidate.model,
        messages: [{ role: 'user', content: 'Reply with exactly OK.' }],
        temperature: 0,
        max_tokens: 8
      });
      const finalText = typeof data?.choices?.[0]?.message?.content === 'string'
        ? data.choices[0].message.content.trim()
        : '';
      const ok = response.ok && finalText === 'OK';
      return {
        ref: candidate.ref,
        ok,
        status: response.status,
        detail: ok
          ? 'http_200_exact_ok'
          : (response.ok ? 'http_200_but_exact_ok_missing' : raw.slice(0, 300))
      };
    }

    const probeTools = [
      {
        type: 'function',
        function: {
          name: 'quantdeus_probe_step_one',
          description: 'Sequential capability probe, first step. Call this first and exactly once.',
          parameters: { type: 'object', properties: {}, additionalProperties: false }
        }
      },
      {
        type: 'function',
        function: {
          name: 'quantdeus_probe_step_two',
          description: 'Sequential capability probe, second step. Call this only after step one returns.',
          parameters: { type: 'object', properties: {}, additionalProperties: false }
        }
      }
    ];
    const probePrompt = {
      role: 'user',
      content: 'Call quantdeus_probe_step_one exactly once. After its tool result, call quantdeus_probe_step_two exactly once. After the second tool result, reply exactly PROBE_DONE and do not call any more tools.'
    };
    const normalizeToolCall = (message, expectedName) => {
      const calls = message?.tool_calls;
      if (!Array.isArray(calls) || calls.length !== 1) return null;
      const call = calls[0];
      if (
        call?.type !== 'function' ||
        call?.function?.name !== expectedName ||
        typeof call?.function?.arguments !== 'string' ||
        typeof call?.id !== 'string' ||
        !call.id
      ) return null;
      return {
        id: call.id,
        type: 'function',
        function: { name: expectedName, arguments: call.function.arguments }
      };
    };

    const first = await request({
      model: candidate.model,
      messages: [probePrompt],
      temperature: 0,
      max_tokens: 64,
      tools: probeTools,
      tool_choice: 'required'
    });
    if (!first.response.ok) {
      return { ref: candidate.ref, ok: false, status: first.response.status, detail: first.raw.slice(0, 300) };
    }
    const firstMessage = first.data?.choices?.[0]?.message;
    const firstCall = normalizeToolCall(firstMessage, 'quantdeus_probe_step_one');
    if (!firstCall) {
      return { ref: candidate.ref, ok: false, status: first.response.status, detail: 'first_tool_call_missing_or_malformed' };
    }
    const assistantFirst = {
      role: 'assistant',
      content: typeof firstMessage?.content === 'string' ? firstMessage.content : null,
      tool_calls: [firstCall]
    };

    const second = await request({
      model: candidate.model,
      messages: [
        probePrompt,
        assistantFirst,
        { role: 'tool', tool_call_id: firstCall.id, content: 'STEP_ONE_OK' }
      ],
      temperature: 0,
      max_tokens: 64,
      tools: probeTools,
      tool_choice: 'required'
    });
    if (!second.response.ok) {
      return { ref: candidate.ref, ok: false, status: second.response.status, detail: second.raw.slice(0, 300) };
    }
    const secondMessage = second.data?.choices?.[0]?.message;
    const secondCall = normalizeToolCall(secondMessage, 'quantdeus_probe_step_two');
    if (!secondCall) {
      return { ref: candidate.ref, ok: false, status: second.response.status, detail: 'second_tool_call_missing_or_malformed' };
    }
    const assistantSecond = {
      role: 'assistant',
      content: typeof secondMessage?.content === 'string' ? secondMessage.content : null,
      tool_calls: [secondCall]
    };

    const third = await request({
      model: candidate.model,
      messages: [
        probePrompt,
        assistantFirst,
        { role: 'tool', tool_call_id: firstCall.id, content: 'STEP_ONE_OK' },
        assistantSecond,
        { role: 'tool', tool_call_id: secondCall.id, content: 'STEP_TWO_OK' },
        { role: 'user', content: 'The second tool result is complete. Reply with exactly PROBE_DONE and do not call any tool.' }
      ],
      temperature: 0,
      max_tokens: 32,
      tools: probeTools,
      tool_choice: 'none'
    });
    const thirdMessage = third.data?.choices?.[0]?.message;
    const finalText = typeof thirdMessage?.content === 'string' ? thirdMessage.content.trim() : '';
    const extraToolCalls = Array.isArray(thirdMessage?.tool_calls) && thirdMessage.tool_calls.length > 0;
    const ok = third.response.ok && finalText === 'PROBE_DONE' && !extraToolCalls;
    return {
      ref: candidate.ref,
      ok,
      status: third.response.status,
      detail: ok
        ? 'sequential_tool_roundtrip_ok'
        : (third.response.ok ? 'sequential_tool_roundtrip_incomplete_or_malformed' : third.raw.slice(0, 300))
    };
  } catch (error) {
    return {
      ref: candidate.ref,
      ok: false,
      status: 0,
      detail: String(error?.message || error).slice(0, 300)
    };
  } finally {
    clearTimeout(timer);
  }
}
function providerProbeCacheKey(candidate, requireTools) {
  const keyFingerprint = crypto
    .createHash('sha256')
    .update(String(candidate.key || ''))
    .digest('hex')
    .slice(0, 12);
  return (requireTools ? 'tools' : 'text') + ':' + candidate.ref + ':' + keyFingerprint;
}

async function cachedProbeChatCandidate(candidate, requireTools = false) {
  const cacheKey = providerProbeCacheKey(candidate, requireTools);
  const now = Date.now();
  const cached = providerProbeCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return { ...cached.result, cached: true };
  }

  const result = await probeChatCandidate(candidate, requireTools);
  providerProbeCache.set(cacheKey, {
    expiresAt: now + (result.ok ? PROVIDER_PROBE_OK_TTL_MS : PROVIDER_PROBE_FAIL_TTL_MS),
    result
  });

  if (providerProbeCache.size > 100) {
    for (const [key, value] of providerProbeCache) {
      if (value.expiresAt <= now) providerProbeCache.delete(key);
    }
  }

  return { ...result, cached: false };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  let sandbox;
  let ephemeralFiles = [];
  let ephemeralDirs = [];
  try {
    const authToken = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    let claims;
    let vercelInternal = false;
    try {
      claims = await verify(authToken);
    } catch (githubOidcError) {
      if (req.body?.metadata?.source !== 'telegram-internal') throw githubOidcError;
      const internalClaims = await verifyVercelInternal(authToken);
      vercelInternal = true;
      claims = {
        ...internalClaims,
        actor: 'vercel-telegram',
        workflow: 'vercel-internal-telegram',
        event_name: 'vercel_internal',
        repository: REPOSITORY
      };
    }
    const trustedOffice = vercelInternal ? false : trustedOfficeRequest(req, claims);
    const hourlyOffice = !vercelInternal && trustedOffice && hourlyOfficeRequest(req, claims);
    const smokePhaseRaw = String(req.body?.metadata?.phase || '');
    const smokePhase = trustedOffice && req.body?.metadata?.source === 'openclaw-admin-smoke' && new Set(['github', 'playwright']).has(smokePhaseRaw) ? smokePhaseRaw : null;
    const githubToken = String(req.headers['x-quantdeus-github-token'] || process.env.QUANTDEUS_GITHUB_TOKEN || '').trim();
    if (req.body?.execution_mode === 'trusted-office' && !trustedOffice) {
      return res.status(403).json({ ok: false, error: 'openclaw_trusted_office_not_authorized' });
    }
    if (vercelInternal && req.body?.execution_mode !== 'chat') {
      return res.status(403).json({ ok: false, error: 'openclaw_vercel_internal_chat_only' });
    }
    if (trustedOffice && !githubToken) {
      return res.status(503).json({ ok: false, error: 'openclaw_trusted_github_token_missing' });
    }
    const providerDefs = {};
    const probeCandidates = [];
    const providerRuntimeEnv = {};

    const addProvider = ({
      id,
      keyEnv,
      key,
      model,
      baseUrl,
      contextWindow = 131072,
      maxTokens = 8192,
      priority = 100
    }) => {
      const apiKey = String(key || '').trim();
      const modelId = String(model || '').trim();
      const normalizedBaseUrl = String(baseUrl || '').trim().replace(/\/+$/, '');
      if (!apiKey || !modelId || !normalizedBaseUrl) return;

      providerDefs[id] = {
        baseUrl: normalizedBaseUrl,
        api: 'openai-completions',
        apiKey: { source: 'env', provider: 'default', id: keyEnv },
        models: [{
          id: modelId,
          name: modelId,
          input: ['text'],
          contextWindow,
          maxTokens
        }]
      };
      providerRuntimeEnv[keyEnv] = apiKey;
      probeCandidates.push({
        ref: id + '/' + modelId,
        endpoint: normalizedBaseUrl + '/chat/completions',
        key: apiKey,
        keyEnv,
        model: modelId,
        priority
      });
    };

    // Curated quality/speed/capacity pool. A provider is never admitted merely
    // because it is configured: it must pass the live HTTP/text or tool roundtrip
    // probe below. Model env vars allow hot model swaps without code changes.
    addProvider({
      id: 'quantdeus-cerebras',
      keyEnv: 'CEREBRAS_API_KEY',
      key: process.env.CEREBRAS_API_KEY,
      model: process.env.CEREBRAS_MODEL || 'gpt-oss-120b',
      baseUrl: 'https://api.cerebras.ai/v1',
      contextWindow: 131072,
      priority: 10
    });
    addProvider({
      id: 'quantdeus-groq',
      keyEnv: 'GROQ_API_KEY',
      key: process.env.GROQ_API_KEY,
      model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
      baseUrl: 'https://api.groq.com/openai/v1',
      contextWindow: 131072,
      priority: 20
    });
    addProvider({
      id: 'quantdeus-fireworks',
      keyEnv: 'FIREWORKS_API_KEY',
      key: process.env.FIREWORKS_API_KEY,
      model: process.env.FIREWORKS_MODEL || 'accounts/fireworks/models/glm-5p3-flash',
      baseUrl: 'https://api.fireworks.ai/inference/v1',
      contextWindow: 1048576,
      priority: 30
    });
    addProvider({
      id: 'quantdeus-deepinfra',
      keyEnv: 'DEEPINFRA_API_KEY',
      key: process.env.DEEPINFRA_API_KEY || process.env.DEEPINFRA_TOKEN,
      model: process.env.DEEPINFRA_MODEL || 'XiaomiMiMo/MiMo-V2.6-Flash',
      baseUrl: 'https://api.deepinfra.com/v1/openai',
      contextWindow: 1048576,
      priority: 40
    });
    addProvider({
      id: 'quantdeus-together',
      keyEnv: 'TOGETHER_API_KEY',
      key: process.env.TOGETHER_API_KEY,
      model: process.env.TOGETHER_MODEL || 'MiniMaxAI/MiniMax-M3',
      baseUrl: 'https://api.together.ai/v1',
      contextWindow: 524288,
      priority: 50
    });
    addProvider({
      id: 'quantdeus-gemini',
      keyEnv: 'GEMINI_API_KEY',
      key: process.env.GEMINI_API_KEY,
      model: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      contextWindow: 1048576,
      priority: 60
    });
    addProvider({
      id: 'quantdeus-nvidia',
      keyEnv: 'NVIDIA_API_KEY',
      key: process.env.NVIDIA_API_KEY,
      model: process.env.NVIDIA_MODEL || 'openai/gpt-oss-120b',
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      contextWindow: 131072,
      priority: 70
    });
    addProvider({
      id: 'quantdeus-xai',
      keyEnv: 'XAI_API_KEY',
      key: process.env.XAI_API_KEY,
      model: process.env.XAI_MODEL || 'grok-4.7',
      baseUrl: 'https://api.x.ai/v1',
      contextWindow: 131072,
      priority: 80
    });

    const cloudflareAccount = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
    addProvider({
      id: 'quantdeus-cloudflare',
      keyEnv: 'CLOUDFLARE_API_KEY',
      key: process.env.CLOUDFLARE_API_KEY,
      model: process.env.CLOUDFLARE_MODEL || '@cf/zai-org/glm-4.7-flash',
      baseUrl: cloudflareAccount
        ? 'https://api.cloudflare.com/client/v4/accounts/' + cloudflareAccount + '/ai/v1'
        : '',
      contextWindow: 256000,
      priority: 90
    });
    addProvider({
      id: 'quantdeus-openrouter',
      keyEnv: 'OPENROUTER_API_KEY',
      key: process.env.OPENROUTER_API_KEY,
      model: process.env.OPENROUTER_MODEL || process.env.QD_LLM_MODEL || 'openrouter/free',
      baseUrl: 'https://openrouter.ai/api/v1',
      contextWindow: 131072,
      priority: 100
    });

    // Anonymous emergency route stays last. It still must pass the same live
    // capability gate as every keyed provider.
    addProvider({
      id: 'quantdeus-pollinations',
      keyEnv: 'POLLINATIONS_API_KEY',
      key: process.env.POLLINATIONS_API_KEY || 'anonymous',
      model: process.env.POLLINATIONS_MODEL || 'openai',
      baseUrl: 'https://text.pollinations.ai/openai',
      contextWindow: 131072,
      priority: 1000
    });

    const modelCandidates = probeCandidates.map(candidate => candidate.ref);
    const probeRows = await Promise.all(probeCandidates.map(async candidate => {
      const startedAt = Date.now();
      const probe = await cachedProbeChatCandidate(candidate, trustedOffice);
      return {
        candidate,
        probe: {
          ...probe,
          latency_ms: Date.now() - startedAt,
          routing_priority: candidate.priority
        }
      };
    }));
    const probeResults = probeRows.map(row => row.probe);
    const healthyRefs = probeRows
      .filter(row => row.probe.ok)
      .sort((a, b) =>
        a.candidate.priority - b.candidate.priority ||
        a.probe.latency_ms - b.probe.latency_ms
      )
      .map(row => row.candidate.ref);

    if (!healthyRefs.length) {
      console.warn('[openclaw-routing] no healthy provider passed the required probe');
      return res.status(503).json({ ok: false, error: 'openclaw_no_healthy_model_route', probes: probeResults });
    }
    const orderedModels = [...healthyRefs];
    const model = orderedModels[0];
    const fallbackModels = healthyRefs.slice(1);
    const modelConfig = { mode: 'replace', providers: providerDefs };
    const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const prompt = messages.map(m => `${String(m.role || 'user').toUpperCase()}: ${String(m.content || '')}`).join('\n\n').slice(0, 90000);
    if (!prompt) return res.status(400).json({ ok: false, error: 'messages_required' });

    // Telegram's Vercel-internal lane is chat-only and has no tools. Do not pay the
    // persistent Sandbox/OpenClaw bootstrap cost after a provider already passed
    // the exact-OK capability gate; complete this bounded chat turn directly on the
    // selected healthy OpenAI-compatible route so the webhook stays inside budget.
    if (vercelInternal) {
      const selected = probeCandidates.find(candidate => candidate.ref === model);
      if (!selected) return res.status(503).json({ ok: false, error: 'openclaw_internal_model_missing' });
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);
      try {
        const response = await fetch(selected.endpoint, {
          method: 'POST',
          headers: {
            authorization: 'Bearer ' + selected.key,
            'content-type': 'application/json',
            accept: 'application/json'
          },
          body: JSON.stringify({
            model: selected.model,
            messages: messages.map(message => ({
              role: String(message?.role || 'user'),
              content: String(message?.content || '').slice(0, 16000)
            })),
            temperature: 0.2,
            max_tokens: 1800
          }),
          signal: controller.signal
        });
        const raw = await response.text();
        let data = null;
        try { data = JSON.parse(raw); } catch {}
        const text = typeof data?.choices?.[0]?.message?.content === 'string'
          ? data.choices[0].message.content.trim()
          : '';
        if (!response.ok || !text) {
          console.warn('[openclaw-internal-fast] provider=' + selected.ref + ' status=' + response.status + ' empty=' + !text);
          return res.status(502).json({ ok: false, error: 'openclaw_internal_chat_failed', provider: selected.ref });
        }
        console.log('[openclaw-internal-fast] provider=' + selected.ref + ' status=200 chars=' + text.length);
        return res.status(200).json({
          ok: true,
          text,
          model: selected.ref,
          tool_summary: null,
          assistant_turns: 1,
          mode: 'vercel-internal-fast'
        });
      } catch (error) {
        console.warn('[openclaw-internal-fast] error=' + String(error?.message || error).slice(0, 300));
        return res.status(502).json({ ok: false, error: 'openclaw_internal_chat_failed' });
      } finally {
        clearTimeout(timer);
      }
    }

    sandbox = await Sandbox.getOrCreate({ name: SANDBOX, image: 'vercel/sandbox/universal', resources: { vcpus: 2 }, timeout: 15 * 60 * 1000, persistent: true, snapshotExpiration: 30 * 24 * 60 * 60 * 1000, keepLastSnapshots: { count: 2 }, resume: true, tags: { app: 'quantdeus', runtime: 'openclaw-office' } });
    const home = await text(await sandbox.runCommand({ cmd: 'bash', args: ['-lc', 'printf %s "$HOME"'] }));
    const workdir = `${home}/quantdeus`;
    const requestId = crypto.randomUUID();
    const repoDir = `${workdir}/repo-${requestId}`;
    const install = await sandbox.runCommand({ cmd: 'bash', args: ['-lc', 'command -v openclaw >/dev/null 2>&1 || npm install --global openclaw@2026.9.6 --allow-scripts=openclaw'] });
    if (install.exitCode !== 0) throw new Error(`openclaw_install_failed: ${(await install.stderr()).slice(0, 1000)}`);
    await sandbox.runCommand({ cmd: 'mkdir', args: ['-p', workdir] });
    if (trustedOffice && !smokePhase) {
      // Fresh per-request shallow checkout avoids concurrent mutation of shared
      // .git/shallow metadata inside the persistent Vercel Sandbox.
      await checked(sandbox, {
        cmd: 'git',
        args: ['clone', '--depth', '1', '--branch', 'main', 'https://github.com/quantdeus/quantdeus.github.io.git', repoDir]
      }, 'openclaw_repo_clone');
      ephemeralDirs.push(repoDir);
    }
    const agentCwd = trustedOffice && !smokePhase ? repoDir : workdir;
    const requestsDir = `${home}/.openclaw/requests`;
    const configPath = `${requestsDir}/quantdeus-config-${requestId}.json`;
    const promptPath = `${requestsDir}/quantdeus-prompt-${requestId}.txt`;
    ephemeralFiles = [configPath, promptPath];
    const statePath = `${home}/.openclaw/quantdeus-state`;
    for (const dir of [`${home}/.openclaw`, requestsDir, statePath, workdir]) await sandbox.runCommand({ cmd: 'mkdir', args: ['-p', dir] });
    const publicTools = { deny: ['*'] };
    const trustedDeny = [
      'group:runtime',
      'group:automation',
      'group:messaging',
      'group:nodes',
      'playwright__browser_run_code_unsafe',
      'playwright__browser_evaluate',
      'playwright__browser_file_upload',
      'playwright__browser_drop'
    ];
    const trustedTools = smokePhase === 'github' ? {
      profile: 'full',
      codeMode: false,
      allow: ['bundle-mcp', 'github__list_branches', 'github__get_file_contents'],
      deny: trustedDeny
    } : smokePhase === 'playwright' ? {
      profile: 'full',
      codeMode: false,
      allow: ['bundle-mcp', 'playwright__browser_navigate'],
      deny: trustedDeny
    } : {
      profile: 'full',
      codeMode: false,
      allow: [
        'group:fs',
        'bundle-mcp',
        'github__*',
        'playwright__browser_navigate',
        'playwright__browser_snapshot',
        'playwright__browser_find',
        'playwright__browser_close'
      ],
      deny: trustedDeny
    };
    const githubMcp = {
      transport: 'streamable-http',
      url: 'https://api.githubcopilot.com/mcp/',
      headers: { Authorization: 'Bearer ' + githubToken },
      toolFilter: {
        include: smokePhase === 'github' ? ['list_branches', 'get_file_contents'] : hourlyOffice ? [
          'list_branches', 'get_commit', 'list_commits', 'get_file_contents',
          'search_code', 'search_issues', 'search_pull_requests', 'get_issue',
          'get_pull_request', 'get_pull_request_diff', 'get_pull_request_status'
        ] : [
          'list_branches', 'get_commit', 'list_commits', 'get_file_contents',
          'search_code', 'search_issues', 'search_pull_requests', 'get_issue',
          'get_pull_request', 'get_pull_request_diff', 'get_pull_request_status',
          'create_branch', 'create_or_update_file', 'create_issue',
          'add_issue_comment', 'create_pull_request', 'update_issue', 'update_pull_request'
        ]
      }
    };
    const playwrightMcp = {
      command: 'npx',
      args: ['-y', '@playwright/mcp@latest', '--headless', '--isolated', '--no-sandbox', '--browser=chrome', '--idle-timeout=120000'],
      toolFilter: {
        include: smokePhase === 'playwright'
          ? ['browser_navigate']
          : ['browser_navigate', 'browser_snapshot', 'browser_find', 'browser_close']
      }
    };
    const mcpServers = trustedOffice
      ? (smokePhase === 'github' ? { github: githubMcp }
        : smokePhase === 'playwright' ? { playwright: playwrightMcp }
        : { github: githubMcp, playwright: playwrightMcp })
      : {};
    if (trustedOffice && mcpServers.playwright) {
      const browserMarker = `${statePath}/.quantdeus-playwright-mcp-chrome-ready`;
      const browserCheck = await sandbox.runCommand({ cmd: 'test', args: ['-f', browserMarker] });
      if (browserCheck.exitCode !== 0) {
        const browserInstall = await sandbox.runCommand({
          cmd: 'npx',
          args: ['-y', '@playwright/mcp@latest', 'install-browser', 'chrome'],
          cwd: workdir
        });
        if (browserInstall.exitCode !== 0) {
          throw new Error(`openclaw_playwright_install_failed: ${(await browserInstall.stderr()).slice(-1200)}`);
        }
        await sandbox.runCommand({ cmd: 'touch', args: [browserMarker] });
      }
    }
    const config = {
      models: modelConfig,
      memory: { search: { enabled: false } },
      tools: trustedOffice ? { ...trustedTools, toolSearch: false } : publicTools,
      ...(trustedOffice ? { mcp: { servers: mcpServers } } : {}),
      agents: { defaults: { workspace: agentCwd, timeoutSeconds: 240, models: Object.fromEntries(orderedModels.map(ref => [ref, { codeMode: false }])), model: { primary: model, fallbacks: fallbackModels } } }
    };
    const effectivePrompt = prompt;
    await sandbox.writeFiles([{ path: configPath, content: Buffer.from(JSON.stringify(config)) }, { path: promptPath, content: Buffer.from(effectivePrompt) }]);
    const runtimeEnv = {
      ...providerRuntimeEnv,
      OPENCLAW_SDK_RETRY_MAX_WAIT_SECONDS: '5'
    };
    console.log('[openclaw-routing] ' + JSON.stringify({
      candidates: modelCandidates,
      probes: probeResults,
      chosen: model || null,
      fallbacks: fallbackModels,
      trusted_office: trustedOffice,
      github_mcp: trustedOffice && Boolean(githubToken) && Boolean(mcpServers.github),
      playwright_mcp: trustedOffice && Boolean(mcpServers.playwright),
      smoke_phase: smokePhase,
      hourly_read_only: hourlyOffice,
      vercel_internal: vercelInternal,
      validated_fallbacks: fallbackModels
    }));

    // Bootstrap the persistent workspace once so OpenClaw has canonical identity + memory files.
    const baselineMarker = `${statePath}/.quantdeus-baseline-${OPENCLAW_RUNTIME_VERSION}`;
    const baselineCheck = await sandbox.runCommand({ cmd: 'test', args: ['-f', baselineMarker] });
    if (baselineCheck.exitCode !== 0) {
      const baseline = await sandbox.runCommand({
        cmd: 'openclaw',
        args: ['setup', '--baseline', '--workspace', workdir],
        cwd: workdir,
        env: {
          ...runtimeEnv,
          OPENCLAW_HOME: home,
          OPENCLAW_STATE_DIR: statePath,
          OPENCLAW_CONFIG_PATH: configPath,
          CI: '1'
        }
      });
      console.log('[openclaw-baseline] exit=' + baseline.exitCode + ' tail=' + ((await baseline.stdout()) || (await baseline.stderr())).slice(-1600));
      if (baseline.exitCode === 0) await sandbox.runCommand({ cmd: 'touch', args: [baselineMarker] });
    }

    // Ensure the canonical Markdown memory surface exists even when baseline preserved an authored workspace.
    const memoryDir = `${workdir}/memory`;
    await sandbox.runCommand({ cmd: 'mkdir', args: ['-p', memoryDir] });
    const memoryFiles = [
      { path: `${workdir}/MEMORY.md`, content: Buffer.from('# QuantDeus OpenClaw Memory\n\nPersistent operational memory for the QuantDeus OpenClaw Office.\n') },
      { path: `${workdir}/USER.md`, content: Buffer.from('# User\n\nQuantDeus CEO / human operator. Human instructions override agent preferences.\n') },
      { path: `${workdir}/AGENTS.md`, content: Buffer.from('# QuantDeus OpenClaw Office\n\nUse MEMORY.md and memory/*.md as the canonical workspace memory system. GitHub quantdeus/quantdeus.github.io remains project source of truth.\n') }
    ];
    for (const file of memoryFiles) {
      const exists = await sandbox.runCommand({ cmd: 'test', args: ['-f', file.path] });
      if (exists.exitCode !== 0) await sandbox.writeFiles([file]);
    }

    // One-time self-heal for the persistent Vercel Sandbox state on this OpenClaw release.
    // Official OpenClaw recovery is `doctor --fix`; follow it with structured lint/doctor verification.
    const doctorMarker = `${statePath}/.quantdeus-doctor-${OPENCLAW_RUNTIME_VERSION}`;
    const markerCheck = await sandbox.runCommand({ cmd: 'test', args: ['-f', doctorMarker] });
    let doctor = { ran: false, status: 'already-repaired', version: OPENCLAW_RUNTIME_VERSION };
    if (markerCheck.exitCode !== 0) {
      const doctorEnv = {
        ...runtimeEnv,
        OPENCLAW_HOME: home,
        OPENCLAW_STATE_DIR: statePath,
        OPENCLAW_CONFIG_PATH: configPath,
        CI: '1'
      };
      const fix = await sandbox.runCommand({
        cmd: 'openclaw',
        args: ['doctor', '--fix', '--non-interactive'],
        cwd: workdir,
        env: doctorEnv
      });
      const fixStdout = (await fix.stdout()).trim();
      const fixStderr = (await fix.stderr()).trim();
      const check = await sandbox.runCommand({
        cmd: 'openclaw',
        args: ['doctor', '--lint', '--json'],
        cwd: workdir,
        env: doctorEnv
      });
      const checkStdout = (await check.stdout()).trim();
      const checkStderr = (await check.stderr()).trim();
      doctor = {
        ran: true,
        version: OPENCLAW_RUNTIME_VERSION,
        fix_exit: fix.exitCode,
        doctor_exit: check.exitCode,
        fix_tail: (fixStdout || fixStderr).slice(-1800),
        doctor_tail: (checkStdout || checkStderr).slice(-2600)
      };
      console.log('[openclaw-doctor] ' + JSON.stringify(doctor));
      if (fix.exitCode === 0) {
        await sandbox.runCommand({ cmd: 'touch', args: [doctorMarker] });
        doctor.status = check.exitCode === 0 ? 'healthy' : 'repaired-with-findings';
      } else {
        doctor.status = 'needs-attention';
      }
    }

    const agentLock = `${statePath}/.quantdeus-agent.lock`;
    const modelArgs = ['--model', model, ...fallbackModels.flatMap(ref => ['--fallback', ref])];
    const run = await sandbox.runCommand({
      cmd: 'flock',
      args: ['-w', '45', agentLock, 'openclaw', 'agent', 'exec', '--config', configPath, '--cwd', agentCwd, ...modelArgs, '--timeout', '240', '--json', '--message-file', promptPath],
      cwd: agentCwd,
      env: runtimeEnv
    });
    const raw = await text(run);
    await sandbox.runCommand({ cmd: 'rm', args: ['-f', promptPath] });
    if (run.exitCode !== 0) throw new Error(`openclaw_agent_failed: ${raw.slice(-1800)}`);
    const result = JSON.parse(raw);
    if (!result.ok || !String(result.final || '').trim()) throw new Error(`openclaw_empty_response: ${JSON.stringify(result.error || {}).slice(0, 1000)}`);
    const toolSummary = result.toolSummary || null;
    if (trustedOffice) {
      const structuredToolEvidence = JSON.stringify({
        error: result.error || null,
        toolSummary
      }).toLowerCase();
      const toolFailures = Number(toolSummary?.failures || 0);
      const incompleteToolTurn =
        structuredToolEvidence.includes('incomplete_turn') ||
        structuredToolEvidence.includes('incomplete or malformed tool call');
      if (toolFailures > 0 || incompleteToolTurn) {
        throw new Error(`openclaw_trusted_tool_execution_failed: failures=${toolFailures} evidence=${structuredToolEvidence.slice(0, 1200)}`);
      }
    }
    await sandbox.stop();
    return res.status(200).json({
      ok: true,
      provider: 'quantdeus-openclaw-vercel-sandbox',
      runtime: 'openclaw',
      model: result.model || model,
      configured_primary: model,
      configured_fallbacks: fallbackModels,
      execution_mode: trustedOffice ? 'openclaw-agent-exec-trusted-tools' : 'openclaw-agent-exec-no-tools',
      tools: trustedOffice ? { filesystem: true, github_mcp: true, github_write: !hourlyOffice && !smokePhase, playwright_mcp: true, shell: false } : { filesystem: false, github_mcp: false, github_write: false, playwright_mcp: false, shell: false },
      doctor,
      tool_summary: toolSummary,
      assistant_turns: result.assistantTurns ?? null,
      text: result.final.trim(),
      github_run: { actor: claims.actor || null, workflow: claims.workflow || null, event: claims.event_name, repository: claims.repository }
    });
  } catch (error) {
    const message = String(error?.message || error);
    console.error('QuantDeus OpenClaw error:', message);
    const status = /github_oidc|wrong_repository|wrong_event|vercel_oidc/.test(message) ? 401 : 502;
    return res.status(status).json({ ok: false, error: 'openclaw_office_failed', detail: message.slice(0, 2000) });
  } finally {
    if (sandbox) {
      if (ephemeralFiles.length) { try { await sandbox.runCommand({ cmd: 'rm', args: ['-f', ...ephemeralFiles] }); } catch {} }
      if (ephemeralDirs.length) { try { await sandbox.runCommand({ cmd: 'rm', args: ['-rf', ...ephemeralDirs] }); } catch {} }
      try { await sandbox.stop(); } catch {}
    }
  }
}

