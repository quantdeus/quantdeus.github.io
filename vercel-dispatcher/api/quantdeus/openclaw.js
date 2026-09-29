import crypto from 'node:crypto';
import { Sandbox } from '@vercel/sandbox';
import { getVercelOidcToken } from '@vercel/oidc';

const ISSUER = 'https://token.actions.githubusercontent.com';
const JWKS_URL = `${ISSUER}/.well-known/jwks`;
const AUDIENCE = 'quantdeus-vercel-openclaw';
const REPOSITORY = 'quantdeus/quantdeus.github.io';
const EVENTS = new Set(['issue_comment', 'schedule', 'workflow_dispatch', 'push']);
const SANDBOX = 'quantdeus-openclaw-office';
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
async function text(result) { return (await result.stdout()).trim(); }
async function checked(sandbox, args, label) {
  const r = await sandbox.runCommand(args);
  if (r.exitCode !== 0) throw new Error(`${label}_failed: ${(await r.stderr()).slice(0, 1000)}`);
  return r;
}

async function probeChatCandidate(candidate) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(candidate.endpoint, {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + candidate.key,
        'content-type': 'application/json',
        accept: 'application/json'
      },
      body: JSON.stringify({
        model: candidate.model,
        messages: [{ role: 'user', content: 'Reply with exactly OK.' }],
        temperature: 0,
        max_tokens: 8
      }),
      signal: controller.signal
    });
    const raw = await response.text();
    return {
      ref: candidate.ref,
      ok: response.ok,
      status: response.status,
      detail: response.ok ? 'ok' : raw.slice(0, 300)
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
    const claims = await verify(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
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
    if (!openRouterKey && !localKey) return res.status(503).json({ ok: false, error: 'openclaw_model_credentials_missing' });
    const providerDefs = {};
    const modelCandidates = [];
    if (vercelOidcToken) {
      providerDefs['vercel-ai-gateway'] = {
        baseUrl: 'https://ai-gateway.vercel.sh/v1',
        api: 'openai-completions',
        apiKey: { source: 'env', provider: 'default', id: 'AI_GATEWAY_API_KEY' },
        models: VERCEL_GATEWAY_MODELS.map(id => ({ id, name: id, input: ['text'], contextWindow: 128000, maxTokens: 8192 }))
      };
      for (const gatewayModel of VERCEL_GATEWAY_MODELS) modelCandidates.push(`vercel-ai-gateway/${gatewayModel}`);
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
    providerDefs.pollinations = {
      baseUrl: 'https://text.pollinations.ai/openai',
      api: 'openai-completions',
      apiKey: { source: 'env', provider: 'default', id: 'POLLINATIONS_API_KEY' },
      models: [{ id: 'openai-fast', name: 'openai-fast', input: ['text'], contextWindow: 32768, maxTokens: 4096 }]
    };
    modelCandidates.push('pollinations/openai-fast');
    const probeCandidates = [];
    if (vercelOidcToken) {
      for (const gatewayModel of VERCEL_GATEWAY_MODELS) {
        probeCandidates.push({
          ref: `vercel-ai-gateway/${gatewayModel}`,
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
    probeCandidates.push({
      ref: 'pollinations/openai-fast',
      endpoint: 'https://text.pollinations.ai/openai/chat/completions',
      key: 'anonymous',
      model: 'openai-fast'
    });

    const probeResults = [];
    let healthyRef = null;
    for (const candidate of probeCandidates) {
      const probe = await probeChatCandidate(candidate);
      probeResults.push(probe);
      if (probe.ok) {
        healthyRef = candidate.ref;
        break;
      }
    }
    const orderedModels = healthyRef
      ? [healthyRef, ...modelCandidates.filter(ref => ref !== healthyRef)]
      : modelCandidates;
    const model = orderedModels[0];
    const fallbackModels = orderedModels.slice(1);
    const modelConfig = { mode: 'replace', providers: providerDefs };
    const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const prompt = messages.map(m => `${String(m.role || 'user').toUpperCase()}: ${String(m.content || '')}`).join('\n\n').slice(0, 90000);
    if (!prompt) return res.status(400).json({ ok: false, error: 'messages_required' });

    sandbox = await Sandbox.getOrCreate({ name: SANDBOX, image: 'vercel/sandbox/universal', resources: { vcpus: 2 }, timeout: 15 * 60 * 1000, persistent: true, snapshotExpiration: 30 * 24 * 60 * 60 * 1000, keepLastSnapshots: { count: 2 }, resume: true, tags: { app: 'quantdeus', runtime: 'openclaw-office' } });
    const home = await text(await sandbox.runCommand({ cmd: 'bash', args: ['-lc', 'printf %s "$HOME"'] }));
    const workdir = `${home}/quantdeus`;
    const install = await sandbox.runCommand({ cmd: 'bash', args: ['-lc', 'command -v openclaw >/dev/null 2>&1 || npm install --global openclaw@2026.9.6 --allow-scripts=openclaw'] });
    if (install.exitCode !== 0) throw new Error(`openclaw_install_failed: ${(await install.stderr()).slice(0, 1000)}`);
    await sandbox.runCommand({ cmd: 'mkdir', args: ['-p', workdir] });
    const requestId = crypto.randomUUID();
    const configPath = `${home}/.openclaw/quantdeus-smoke.json`;
    const requestsDir = `${home}/.openclaw/requests`;
    const promptPath = `${requestsDir}/quantdeus-prompt-${requestId}.txt`;
    ephemeralFiles = [promptPath];
    const statePath = `${home}/.openclaw/quantdeus-state`;
    for (const dir of [`${home}/.openclaw`, requestsDir, statePath, workdir]) await sandbox.runCommand({ cmd: 'mkdir', args: ['-p', dir] });
    const config = {
      models: modelConfig,
      memory: { search: { enabled: false } },
      tools: { deny: ['*'] },
      agents: { defaults: { workspace: workdir, model: { primary: model, fallbacks: fallbackModels } } }
    };
    await sandbox.writeFiles([{ path: configPath, content: Buffer.from(JSON.stringify(config)) }, { path: promptPath, content: Buffer.from(prompt) }]);
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
      has_vercel_oidc: Boolean(vercelOidcToken),
      local_key_env: localKeyEnv || null,
      has_local_key: Boolean(localKey),
      has_openrouter_key: Boolean(openRouterKey)
    }));
    if (!healthyRef) {
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
      args: ['-w', '45', agentLock, 'openclaw', 'agent', 'exec', '--config', configPath, '--state-dir', statePath, '--cwd', workdir, ...modelArgs, '--timeout', '180', '--json', '--message-file', promptPath],
      cwd: workdir,
      env: runtimeEnv
    });
    const raw = await text(run);
    await sandbox.runCommand({ cmd: 'rm', args: ['-f', promptPath] });
    if (run.exitCode !== 0) throw new Error(`openclaw_agent_failed: ${raw.slice(-1800)}`);
    const result = JSON.parse(raw);
    if (!result.ok || !String(result.final || '').trim()) throw new Error(`openclaw_empty_response: ${JSON.stringify(result.error || {}).slice(0, 1000)}`);
    await sandbox.stop();
    return res.status(200).json({ ok: true, provider: 'quantdeus-openclaw-vercel-sandbox', runtime: 'openclaw', model: result.model || model, configured_primary: model, configured_fallbacks: fallbackModels, execution_mode: 'openclaw-agent-exec-no-tools', doctor, text: result.final.trim(), github_run: { actor: claims.actor || null, workflow: claims.workflow || null, event: claims.event_name, repository: claims.repository } });
  } catch (error) {
    const message = String(error?.message || error);
    console.error('QuantDeus OpenClaw error:', message);
    const status = /github_oidc|wrong_repository|wrong_event/.test(message) ? 401 : 502;
    return res.status(status).json({ ok: false, error: 'openclaw_office_failed', detail: message.slice(0, 2000) });
  } finally {
    if (sandbox) {
      if (ephemeralFiles.length) { try { await sandbox.runCommand({ cmd: 'rm', args: ['-f', ...ephemeralFiles] }); } catch {} }
      try { await sandbox.stop(); } catch {}
    }
  }
}
