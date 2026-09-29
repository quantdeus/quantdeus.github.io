import crypto from 'node:crypto';
import { Sandbox } from '@vercel/sandbox';

const ISSUER = 'https://token.actions.githubusercontent.com';
const JWKS_URL = `${ISSUER}/.well-known/jwks`;
const AUDIENCE = 'quantdeus-vercel-openclaw';
const REPOSITORY = 'quantdeus/quantdeus.github.io';
const EVENTS = new Set(['issue_comment', 'schedule', 'workflow_dispatch', 'push']);
const SANDBOX = 'quantdeus-openclaw-office';
const OPENROUTER_MODEL = process.env.OPENCLAW_OPENROUTER_MODEL || 'openai/gpt-oss-120b:free';
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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  let sandbox;
  let ephemeralFiles = [];
  try {
    const claims = await verify(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
    const openRouterKey = String(req.headers['x-quantdeus-openrouter-key'] || process.env.OPENROUTER_API_KEY || '');
    const localKeyEnv = process.env.HERMES_LOCAL_API_KEY ? 'HERMES_LOCAL_API_KEY' : (process.env.OPENAI_API_KEY ? 'OPENAI_API_KEY' : (process.env.MISTRAL_API_KEY ? 'MISTRAL_API_KEY' : ''));
    const localKey = localKeyEnv ? String(process.env[localKeyEnv]) : '';
    const localBaseUrl = String(process.env.HERMES_LOCAL_BASE_URL || process.env.OPENAI_BASE_URL || (localKeyEnv === 'OPENAI_API_KEY' ? 'https://api.openai.com/v1' : 'https://api.mistral.ai/v1')).replace(/\/+$/, '');
    const localModel = process.env.OPENCLAW_LOCAL_MODEL || process.env.HERMES_LOCAL_MODEL || (localKeyEnv === 'OPENAI_API_KEY' ? (process.env.HERMES_CLOUD_MODEL || 'gpt-5-mini') : 'mistral-small-latest');
    if (!openRouterKey && !localKey) return res.status(503).json({ ok: false, error: 'openclaw_model_credentials_missing' });
    const providerId = openRouterKey ? 'openrouter' : 'quantdeus-local';
    const model = openRouterKey ? `openrouter/${OPENROUTER_MODEL}` : `${providerId}/${localModel}`;
    const modelConfig = openRouterKey
      ? { providers: { openrouter: { apiKey: { source: 'env', provider: 'default', id: 'OPENROUTER_API_KEY' }, baseUrl: 'https://openrouter.ai/api/v1' } } }
      : { mode: 'merge', providers: { [providerId]: { baseUrl: localBaseUrl, api: 'openai-completions', apiKey: { source: 'env', provider: 'default', id: localKeyEnv }, models: [{ id: localModel, name: localModel, input: ['text'], contextWindow: 32768, maxTokens: 8192 }] } } };
    const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const prompt = messages.map(m => `${String(m.role || 'user').toUpperCase()}: ${String(m.content || '')}`).join('\n\n').slice(0, 90000);
    if (!prompt) return res.status(400).json({ ok: false, error: 'messages_required' });

    sandbox = await Sandbox.getOrCreate({ name: SANDBOX, image: 'vercel/sandbox/universal', resources: { vcpus: 2 }, timeout: 15 * 60 * 1000, persistent: true, snapshotExpiration: 30 * 24 * 60 * 60 * 1000, keepLastSnapshots: { count: 2 }, resume: true, tags: { app: 'quantdeus', runtime: 'openclaw-office' } });
    const home = await text(await sandbox.runCommand({ cmd: 'bash', args: ['-lc', 'printf %s "$HOME"'] }));
    const workdir = `${home}/quantdeus`;
    const install = await sandbox.runCommand({ cmd: 'bash', args: ['-lc', 'command -v openclaw >/dev/null 2>&1 || npm install --global openclaw@2026.9.6 --allow-scripts=openclaw'] });
    if (install.exitCode !== 0) throw new Error(`openclaw_install_failed: ${(await install.stderr()).slice(0, 1000)}`);
    await sandbox.runCommand({ cmd: 'mkdir', args: ['-p', workdir] });
    const configPath = `${home}/.openclaw/quantdeus-smoke.json`;
    const promptPath = `${home}/.openclaw/quantdeus-prompt.txt`;
    ephemeralFiles = [configPath, promptPath];
    const statePath = `${home}/.openclaw/quantdeus-state`;
    for (const dir of [`${home}/.openclaw`, statePath, workdir]) await sandbox.runCommand({ cmd: 'mkdir', args: ['-p', dir] });
    const config = {
      models: modelConfig,
      tools: { deny: ['*'] },
      agents: { defaults: { workspace: workdir, model: { primary: model } } }
    };
    await sandbox.writeFiles([{ path: configPath, content: Buffer.from(JSON.stringify(config)) }, { path: promptPath, content: Buffer.from(prompt) }]);
    const runtimeKeyEnv = openRouterKey ? 'OPENROUTER_API_KEY' : localKeyEnv;
    const runtimeKey = openRouterKey || localKey;
    const run = await sandbox.runCommand({ cmd: 'openclaw', args: ['agent', 'exec', '--config', configPath, '--state-dir', statePath, '--cwd', workdir, '--model', model, '--timeout', '240', '--json', '--message-file', promptPath], cwd: workdir, env: { [runtimeKeyEnv]: runtimeKey } });
    const raw = await text(run);
    await sandbox.runCommand({ cmd: 'rm', args: ['-f', configPath, promptPath] });
    if (run.exitCode !== 0) throw new Error(`openclaw_agent_failed: ${raw.slice(-1800)}`);
    const result = JSON.parse(raw);
    if (!result.ok || !String(result.final || '').trim()) throw new Error(`openclaw_empty_response: ${JSON.stringify(result.error || {}).slice(0, 1000)}`);
    await sandbox.stop();
    return res.status(200).json({ ok: true, provider: 'quantdeus-openclaw-vercel-sandbox', runtime: 'openclaw', model: result.model || model, execution_mode: 'openclaw-agent-exec-no-tools', text: result.final.trim(), github_run: { actor: claims.actor || null, workflow: claims.workflow || null, event: claims.event_name, repository: claims.repository } });
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
