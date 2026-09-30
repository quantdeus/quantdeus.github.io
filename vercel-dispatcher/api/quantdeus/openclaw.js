import crypto from 'node:crypto';
import { Sandbox } from '@vercel/sandbox';
import { getVercelOidcToken } from '@vercel/oidc';

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
const OPENROUTER_MODEL = process.env.OPENCLAW_OPENROUTER_MODEL || 'openai/gpt-oss-120b:free';
const OPENCLAW_RUNTIME_VERSION = '2026.9.6';
const VERCEL_GATEWAY_MODELS = [...new Set((process.env.OPENCLAW_VERCEL_GATEWAY_MODELS || ['inclusionai/ling-3.0-flash-sante-free', 'openai/gpt-oss-120b'].join(',')).split(',').map(v => v.trim()).filter(Boolean))].slice(0, 3);
let jwksCache = [];
let jwksAt = 0;

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

function evolutionOfficeRequest(req, claims) {
  if (!trustedOfficeRequest(req, claims)) return false;
  const workflowRef = String(claims.workflow_ref || claims.job_workflow_ref || claims.workflow || '');
  return /\.github\/workflows\/openclaw-evolution\.yml(?:@|$)/.test(workflowRef) &&
    req.body?.metadata?.source === 'quantdeus-openclaw-evolution' &&
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
      const { response, raw } = await request({
        model: candidate.model,
        messages: [{ role: 'user', content: 'Reply with exactly OK.' }],
        temperature: 0,
        max_tokens: 8
      });
      return {
        ref: candidate.ref,
        ok: response.ok,
        status: response.status,
        detail: response.ok ? 'ok' : raw.slice(0, 300)
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
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  let sandbox;
  let ephemeralFiles = [];
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
    const evolutionOffice = !vercelInternal && trustedOffice && evolutionOfficeRequest(req, claims);
    const readOnlyGitHubOffice = hourlyOffice || evolutionOffice;
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
    const openRouterKey = String(req.headers['x-quantdeus-openrouter-key'] || process.env.OPENROUTER_API_KEY || '');
    let vercelOidcToken = String(req.headers['x-vercel-oidc-token'] || process.env.VERCEL_OIDC_TOKEN || '').trim();
    try {
      if (!vercelOidcToken) vercelOidcToken = await getVercelOidcToken();
    } catch (error) {
      console.warn('[openclaw-gateway] Vercel OIDC unavailable:', String(error?.message || error).slice(0, 300));
    }
    const localKeyEnv = process.env.HERMES_LOCAL_API_KEY ? 'HERMES_LOCAL_API_KEY' : (process.env.OPENAI_API_KEY ? 'OPENAI_API_KEY' : (process.env.MISTRAL_API_KEY ? 'MISTRAL_API_KEY' : ''));
    const localKey = localKeyEnv ? String(process.env[localKeyEnv]) : '';
    const localBaseUrl = String(process.env.HERMES_LOCAL_BASE_URL || process.env.OPENAI_BASE_URL || (localKeyEnv === 'OPENAI_API_KEY' ? 'https://api.openai.com/v1' : 'https://api.mistral.ai/v1')).replace(/\/+$/, '');
    const localModel = process.env.OPENCLAW_LOCAL_MODEL || process.env.HERMES_LOCAL_MODEL || (localKeyEnv === 'OPENAI_API_KEY' ? (process.env.HERMES_CLOUD_MODEL || 'gpt-5-mini') : 'mistral-small-latest');
    const providerDefs = {};
    const modelCandidates = [];
    if (vercelOidcToken) {
      providerDefs['quantdeus-vercel-gateway'] = {
        baseUrl: 'https://ai-gateway.vercel.sh/v1',
        api: 'openai-completions',
        apiKey: { source: 'env', provider: 'default', id: 'AI_GATEWAY_API_KEY' },
        models: VERCEL_GATEWAY_MODELS.map(id => ({ id, name: id, input: ['text'], contextWindow: 128000, maxTokens: 8192 }))
      };
      for (const gatewayModel of VERCEL_GATEWAY_MODELS) modelCandidates.push(`quantdeus-vercel-gateway/${gatewayModel}`);
    }
    if (localKey) {
      providerDefs['quantdeus-local'] = {
        baseUrl: localBaseUrl,
        api: 'openai-completions',
        apiKey: { source: 'env', provider: 'default', id: localKeyEnv },
        models: [{ id: localModel, name: localModel, input: ['text'], contextWindow: 32768, maxTokens: 8192 }]
      };
      modelCandidates.push(`quantdeus-local/${localModel}`);
    }
    if (openRouterKey) {
      providerDefs.openrouter = {
        apiKey: { source: 'env', provider: 'default', id: 'OPENROUTER_API_KEY' },
        baseUrl: 'https://openrouter.ai/api/v1'
      };
      modelCandidates.push(`openrouter/${OPENROUTER_MODEL}`);
    }

    // Keyless emergency inference remains INSIDE OpenClaw: the agent runtime,
    // state, prompt handling and execution contract are still OpenClaw.
    // Trusted Office prefers models that reliably emit OpenAI-compatible tool_calls.
    const pollinationsModels = trustedOffice
      ? ['openai', 'mistral', 'gemini-fast', 'openai-fast']
      : ['openai-fast', 'openai'];
    providerDefs['quantdeus-pollinations'] = {
      baseUrl: 'https://text.pollinations.ai/openai',
      api: 'openai-completions',
      apiKey: { source: 'env', provider: 'default', id: 'POLLINATIONS_API_KEY' },
      models: pollinationsModels.map(id => ({ id, name: id, input: ['text'], contextWindow: 131072, maxTokens: 8192 }))
    };
    for (const pollinationsModel of pollinationsModels) {
      modelCandidates.push(`quantdeus-pollinations/${pollinationsModel}`);
    }
    const probeCandidates = [];
    if (vercelOidcToken) {
      for (const gatewayModel of VERCEL_GATEWAY_MODELS) {
        probeCandidates.push({
          ref: `quantdeus-vercel-gateway/${gatewayModel}`,
          endpoint: 'https://ai-gateway.vercel.sh/v1/chat/completions',
          key: vercelOidcToken,
          model: gatewayModel
        });
      }
    }
    if (localKey) {
      const localEndpoint = localBaseUrl.endsWith('/v1')
        ? localBaseUrl + '/chat/completions'
        : localBaseUrl + '/v1/chat/completions';
      probeCandidates.push({
        ref: `quantdeus-local/${localModel}`,
        endpoint: localEndpoint,
        key: localKey,
        model: localModel
      });
    }
    if (openRouterKey) {
      probeCandidates.push({
        ref: `openrouter/${OPENROUTER_MODEL}`,
        endpoint: 'https://openrouter.ai/api/v1/chat/completions',
        key: openRouterKey,
        model: OPENROUTER_MODEL
      });
    }
    for (const pollinationsModel of pollinationsModels) {
      probeCandidates.push({
        ref: `quantdeus-pollinations/${pollinationsModel}`,
        endpoint: 'https://text.pollinations.ai/openai/chat/completions',
        key: 'anonymous',
        model: pollinationsModel
      });
    }

    const probeResults = [];
    const healthyRefs = [];
    for (const candidate of probeCandidates) {
      const probe = await probeChatCandidate(candidate, trustedOffice);
      probeResults.push(probe);
      if (probe.ok) healthyRefs.push(candidate.ref);
    }
    const orderedModels = healthyRefs.length
      ? [...healthyRefs, ...modelCandidates.filter(ref => !healthyRefs.includes(ref))]
      : modelCandidates;
    const model = orderedModels[0];
    // Trusted MCP can fail over only to routes that passed the same sequential
    // two-tool round-trip as the primary. Unhealthy/unprobed models stay excluded.
    const fallbackModels = trustedOffice
      ? healthyRefs.filter(ref => ref !== model)
      : orderedModels.slice(1);
    const modelConfig = { mode: 'replace', providers: providerDefs };
    const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const prompt = messages.map(m => `${String(m.role || 'user').toUpperCase()}: ${String(m.content || '')}`).join('\n\n').slice(0, 90000);
    if (!prompt) return res.status(400).json({ ok: false, error: 'messages_required' });

    sandbox = await Sandbox.getOrCreate({ name: SANDBOX, image: 'vercel/sandbox/universal', resources: { vcpus: 2 }, timeout: 15 * 60 * 1000, persistent: true, snapshotExpiration: 30 * 24 * 60 * 60 * 1000, keepLastSnapshots: { count: 2 }, resume: true, tags: { app: 'quantdeus', runtime: 'openclaw-office' } });
    const home = await text(await sandbox.runCommand({ cmd: 'bash', args: ['-lc', 'printf %s "$HOME"'] }));
    const workdir = `${home}/quantdeus`;
    const repoDir = `${workdir}/repo`;
    const install = await sandbox.runCommand({ cmd: 'bash', args: ['-lc', 'command -v openclaw >/dev/null 2>&1 || npm install --global openclaw@2026.9.6 --allow-scripts=openclaw'] });
    if (install.exitCode !== 0) throw new Error(`openclaw_install_failed: ${(await install.stderr()).slice(0, 1000)}`);
    await sandbox.runCommand({ cmd: 'mkdir', args: ['-p', workdir] });
    if (trustedOffice && !smokePhase) {
      const gitCheck = await sandbox.runCommand({ cmd: 'test', args: ['-d', `${repoDir}/.git`] });
      if (gitCheck.exitCode !== 0) {
        await checked(sandbox, {
          cmd: 'git',
          args: ['clone', '--depth', '1', 'https://github.com/quantdeus/quantdeus.github.io.git', repoDir]
        }, 'openclaw_repo_clone');
      } else {
        await checked(sandbox, { cmd: 'git', args: ['-C', repoDir, 'fetch', 'origin', 'main', '--depth', '1'] }, 'openclaw_repo_fetch');
        await checked(sandbox, { cmd: 'git', args: ['-C', repoDir, 'reset', '--hard', 'origin/main'] }, 'openclaw_repo_reset');
        await sandbox.runCommand({ cmd: 'git', args: ['-C', repoDir, 'clean', '-fd'] });
      }
    }
    const agentCwd = trustedOffice && !smokePhase ? repoDir : workdir;
    const requestId = crypto.randomUUID();
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
      allow: ['bundle-mcp', 'github__list_branches'],
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
        include: smokePhase === 'github' ? ['list_branches'] : readOnlyGitHubOffice ? [
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
    let effectivePrompt = prompt;
    if (evolutionOffice && !smokePhase) {
      const evolutionSkillPath = `${repoDir}/.openclaw/skills/quantdeus-self-evolution/SKILL.md`;
      const evolutionSkill = await sandbox.runCommand({ cmd: 'cat', args: [evolutionSkillPath] });
      if (evolutionSkill.exitCode === 0) {
        const skillText = (await evolutionSkill.stdout()).trim();
        if (skillText) {
          effectivePrompt = [
            'OPENCLAW SELF-EVOLUTION SKILL FROM FRESH MAIN:',
            skillText.slice(0, 12000),
            '',
            'ACTIVE REQUEST:',
            prompt
          ].join('\n').slice(0, 98000);
        }
      }
    }
    await sandbox.writeFiles([{ path: configPath, content: Buffer.from(JSON.stringify(config)) }, { path: promptPath, content: Buffer.from(effectivePrompt) }]);
    const runtimeEnv = {};
    if (vercelOidcToken) runtimeEnv.AI_GATEWAY_API_KEY = vercelOidcToken;
    if (localKeyEnv && localKey) runtimeEnv[localKeyEnv] = localKey;
    if (openRouterKey) runtimeEnv.OPENROUTER_API_KEY = openRouterKey;
    runtimeEnv.POLLINATIONS_API_KEY = 'anonymous';
    runtimeEnv.OPENCLAW_SDK_RETRY_MAX_WAIT_SECONDS = '5';
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
      evolution_read_only: evolutionOffice,
      github_read_only: readOnlyGitHubOffice,
      has_vercel_oidc: Boolean(vercelOidcToken),
      local_key_env: localKeyEnv || null,
      has_local_key: Boolean(localKey),
      has_openrouter_key: Boolean(openRouterKey),
      vercel_internal: vercelInternal,
      validated_fallbacks: fallbackModels
    }));
    if (!healthyRefs.length) {
      return res.status(503).json({
        ok: false,
        error: 'openclaw_no_healthy_model_route',
        probes: probeResults
      });
    }

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
    await sandbox.stop();
    return res.status(200).json({
      ok: true,
      provider: 'quantdeus-openclaw-vercel-sandbox',
      runtime: 'openclaw',
      model: result.model || model,
      configured_primary: model,
      configured_fallbacks: fallbackModels,
      execution_mode: trustedOffice ? 'openclaw-agent-exec-trusted-tools' : 'openclaw-agent-exec-no-tools',
      tools: trustedOffice ? { filesystem: true, github_mcp: true, github_write: !readOnlyGitHubOffice && !smokePhase, playwright_mcp: true, shell: false } : { filesystem: false, github_mcp: false, github_write: false, playwright_mcp: false, shell: false },
      doctor,
      tool_summary: result.toolSummary || null,
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
      try { await sandbox.stop(); } catch {}
    }
  }
}

