import crypto from 'node:crypto';
import { Sandbox } from '@vercel/sandbox';
import { getVercelOidcToken } from '@vercel/oidc';

const GITHUB_OIDC_ISSUER = 'https://token.actions.githubusercontent.com';
const GITHUB_JWKS_URL = 'https://token.actions.githubusercontent.com/.well-known/jwks';
const EXPECTED_AUDIENCE = 'quantdeus-vercel-hermes';
const EXPECTED_REPOSITORY = 'quantdeus/quantdeus.github.io';
const ALLOWED_EVENTS = new Set(['issue_comment', 'schedule', 'workflow_dispatch', 'push']);
const SANDBOX_NAME = 'quantdeus-hermes-office';
const REPO_URL = 'https://github.com/quantdeus/quantdeus.github.io.git';
const MODEL = process.env.HERMES_CLOUD_MODEL || 'openai/gpt-oss-120b';
const OPENROUTER_MODEL = process.env.HERMES_OPENROUTER_MODEL || 'openai/gpt-oss-120b';
const VERCEL_GATEWAY_FALLBACK_MODELS = [...new Set(
  (process.env.HERMES_VERCEL_FALLBACK_MODELS || [
    process.env.AI_GATEWAY_MODEL || 'openai/gpt-5-mini',
    'openai/gpt-oss-120b'
  ].join(','))
    .split(',')
    .map(model => model.trim())
    .filter(Boolean)
)].slice(0, 3);
const MAX_PROMPT = 90000;

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
  if (!ALLOWED_EVENTS.has(String(claims.event_name || ''))) throw new Error('github_oidc_wrong_event');

  return claims;
}

function normalizeProfile(value) {
  const profile = String(value || 'seven-of-nine').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(profile)) throw new Error('invalid_profile');
  return profile;
}

function normalizeMessages(input) {
  if (!Array.isArray(input) || input.length < 1 || input.length > 24) {
    throw new Error('messages_must_have_1_to_24_items');
  }
  let total = 0;
  const rows = input.map((message, index) => {
    const role = String(message?.role || '');
    const content = String(message?.content || '');
    if (!['system', 'user', 'assistant'].includes(role)) throw new Error('unsupported_message_role_at_' + index);
    if (!content || content.length > 20000) throw new Error('invalid_message_content_at_' + index);
    total += content.length;
    if (total > MAX_PROMPT) throw new Error('messages_total_too_large');
    return { role, content };
  });
  return rows;
}

function promptFrom(messages, metadata) {
  const meta = Object.entries(metadata || {})
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .slice(0, 20)
    .map(([key, value]) => key + '=' + String(value).slice(0, 1000))
    .join(' · ');

  const preface = [
    'You are running inside the persistent QuantDeus Hermes AI Office on Vercel Sandbox.',
    'GitHub quantdeus/quantdeus.github.io is the canonical project source of truth.',
    'Use Hermes tools, skills, Kanban, cron, Playwright and MCP connections when materially useful.',
    'Verify every GitHub mutation before claiming it happened.',
    'Safe reversible work may proceed autonomously.',
    'Repository self-improvement must use branch/PR plus QA evidence.',
    'Never expose credentials. Stop and create a human handoff for CAPTCHA, unavailable email/SMS verification, 2FA/passkeys, payments, legal commitments, identity verification or destructive production actions.',
    meta ? 'Source metadata: ' + meta : ''
  ].filter(Boolean).join('\n');

  return [
    preface,
    '',
    ...messages.map(m => '[' + m.role.toUpperCase() + ']\n' + m.content)
  ].join('\n\n');
}

async function out(command) {
  return String(await command.stdout()).trim();
}

async function err(command) {
  return String(await command.stderr()).trim();
}

async function runChecked(sandbox, spec, label) {
  const result = await sandbox.runCommand(spec);
  if (result.exitCode !== 0) {
    const stderr = (await err(result)).slice(0, 4000);
    const stdout = (await out(result)).slice(0, 2000);
    throw new Error(label + '_failed_' + result.exitCode + ': ' + (stderr || stdout || 'no output'));
  }
  return result;
}

async function resolveSandboxPaths(sandbox) {
  const probe = await runChecked(sandbox, {
    cmd: 'bash',
    args: ['-lc', 'printf "%s\\n%s\\n" "$PWD" "$HOME"']
  }, 'sandbox_path_probe');

  const lines = (await out(probe)).split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const pwd = lines[0] || '/tmp';
  const homeCandidate = lines[1] || pwd;
  const home = homeCandidate.startsWith('/') ? homeCandidate : pwd;
  const workdir = home.replace(/\/+$/, '') + '/quantdeus';

  const verify = await sandbox.runCommand({
    cmd: 'bash',
    args: ['-lc', 'test -d "$1" && test -w "$1"', 'bash', home]
  });
  if (verify.exitCode !== 0) {
    throw new Error('sandbox_home_not_writable:' + home);
  }

  return { pwd, home, workdir };
}

async function ensureRepo(sandbox, paths) {
  const exists = await sandbox.runCommand({
    cmd: 'bash',
    args: ['-lc', 'test -d "$1/.git"', 'bash', paths.workdir]
  });
  if (exists.exitCode !== 0) {
    await runChecked(sandbox, {
      cmd: 'git',
      args: ['clone', '--depth', '1', '--branch', 'main', REPO_URL, paths.workdir],
      cwd: paths.home
    }, 'repo_clone');
    return;
  }

  await runChecked(sandbox, {
    cmd: 'git',
    args: ['fetch', '--prune', 'origin', 'main'],
    cwd: paths.workdir
  }, 'repo_fetch');

  const dirty = await sandbox.runCommand({
    cmd: 'git',
    args: ['status', '--porcelain'],
    cwd: paths.workdir
  });
  const dirtyText = await out(dirty);
  if (!dirtyText) {
    await runChecked(sandbox, {
      cmd: 'git',
      args: ['checkout', '-q', 'main'],
      cwd: paths.workdir
    }, 'repo_checkout_main');
    await runChecked(sandbox, {
      cmd: 'git',
      args: ['reset', '--hard', 'origin/main'],
      cwd: paths.workdir
    }, 'repo_reset_main');
  }
}

async function ensureHermesInstalled(sandbox) {
  const check = await sandbox.runCommand({
    cmd: 'bash',
    args: ['-lc', 'test -x "$HOME/.local/bin/hermes" && "$HOME/.local/bin/hermes" --version >/dev/null 2>&1']
  });
  if (check.exitCode === 0) return;

  await runChecked(sandbox, {
    cmd: 'bash',
    args: ['-lc', 'python3 -m pip install --user -U "hermes-agent[vercel]"'],
  }, 'hermes_install');
}

async function bootstrapFingerprint(sandbox, paths) {
  const result = await runChecked(sandbox, {
    cmd: 'bash',
    args: ['-lc', 'sha256sum scripts/hermes-office-bootstrap.js coordination/agents.json coordination/hermes-office.json coordination/hermes-evolution.json | sha256sum | cut -d" " -f1'],
    cwd: paths.workdir
  }, 'bootstrap_fingerprint');
  return out(result);
}

async function ensureBootstrap(sandbox, runtimeEnv, paths) {
  const fingerprint = await bootstrapFingerprint(sandbox, paths);
  const markerPath = paths.home + '/.quantdeus-hermes-bootstrap';
  const marker = await sandbox.runCommand({
    cmd: 'bash',
    args: ['-lc', 'cat "$1" 2>/dev/null || true', 'bash', markerPath]
  });
  if ((await out(marker)) === fingerprint) return;

  await runChecked(sandbox, {
    cmd: 'node',
    args: ['scripts/hermes-office-bootstrap.js'],
    cwd: paths.workdir,
    env: runtimeEnv
  }, 'hermes_bootstrap');

  await runChecked(sandbox, {
    cmd: 'bash',
    args: ['-lc', 'printf "%s\\n" "$1" > "$2"', 'bash', fingerprint, markerPath]
  }, 'bootstrap_marker');
}

async function configureLocalModel(sandbox, profile, runtimeEnv, paths) {
  const baseUrl = String(runtimeEnv.HERMES_LOCAL_BASE_URL || runtimeEnv.OPENAI_BASE_URL || '').trim();
  const apiKey = String(runtimeEnv.HERMES_LOCAL_API_KEY || runtimeEnv.OPENAI_API_KEY || '');
  if (!baseUrl && !apiKey) return;

  if (baseUrl) {
    await runChecked(sandbox, {
      cmd: 'bash',
      args: ['-lc', '"$HOME/.local/bin/hermes" -p "$1" config set model.base_url "$2"', 'bash', profile, baseUrl],
      cwd: paths.workdir,
      env: runtimeEnv
    }, 'hermes_local_base_url_config');
  }
  if (apiKey) {
    await runChecked(sandbox, {
      cmd: 'bash',
      args: ['-lc', '"$HOME/.local/bin/hermes" -p "$1" config set model.key_env HERMES_LOCAL_API_KEY', 'bash', profile],
      cwd: paths.workdir,
      env: runtimeEnv
    }, 'hermes_local_key_config');
  }
  await runChecked(sandbox, {
    cmd: 'bash',
    args: ['-lc', '"$HOME/.local/bin/hermes" -p "$1" config set model.provider custom', 'bash', profile],
    cwd: paths.workdir,
    env: runtimeEnv
  }, 'hermes_local_provider_config');
}

async function runHermes(sandbox, profile, prompt, runtimeEnv, paths, model = MODEL, provider = runtimeEnv.HERMES_MODEL_PROVIDER) {
  const result = await sandbox.runCommand({
    cmd: 'bash',
    args: [
      '-lc',
      'exec flock -w 240 "$HOME/.quantdeus-hermes.lock" "$HOME/.local/bin/hermes" "$@"',
      'hermes',
      '-p',
      profile,
      '--provider',
      provider,
      '-m',
      model,
      '-t',
      'all',
      '-z',
      prompt
    ],
    cwd: paths.workdir,
    env: runtimeEnv
  });

  const stdout = await out(result);
  const stderr = await err(result);
  if (result.exitCode !== 0) {
    throw new Error('hermes_run_failed_' + result.exitCode + ': ' + (stderr || stdout || 'no output').slice(0, 4000));
  }
  const fallbackNotice = (stdout + '\n' + stderr).match(/Provider fallback:\s*([^/\s]+)\/([^\s;]+)\s+unavailable;\s+using\s+([^/\s]+)\/([^\s]+?)\s+for this response\./i);
  return {
    text: stdout.slice(0, 30000),
    fallback: fallbackNotice ? { provider: fallbackNotice[3], model: fallbackNotice[4] } : null
  };
}

async function runModelFallback(prompt, baseUrl, apiKey, model) {
  const root = String(baseUrl || '').trim().replace(/\/+$/, '');
  const endpoint = root.endsWith('/v1') ? root + '/chat/completions' : root + '/v1/chat/completions';
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + apiKey,
      'content-type': 'application/json',
      accept: 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.45,
      max_tokens: 900
    })
  });
  const raw = await response.text();
  if (!response.ok) throw new Error('model_fallback_failed_' + response.status + ': ' + raw.slice(0, 1200));
  let data;
  try { data = JSON.parse(raw); }
  catch { throw new Error('model_fallback_non_json: ' + raw.slice(0, 400)); }
  const text = String(data?.choices?.[0]?.message?.content || '').trim();
  if (!text) throw new Error('model_fallback_empty_response');
  return text.slice(0, 30000);
}

async function runVercelAIGatewayFallback(messages, oidcToken) {
  const token = String(oidcToken || '').trim();
  if (!token) throw new Error('vercel_oidc_token_unavailable');
  const fallbackMessages = [
    {
      role: 'system',
      content: [
        'You are the text-only fallback for QuantDeus Hermes Office.',
        'Hermes tools and MCP are unavailable in this fallback turn.',
        'Do not claim to have performed GitHub, browser, Kanban, cron, or other external actions.',
        'Use only the facts and instructions in the conversation; explain when an external action still needs Hermes.'
      ].join(' ')
    },
    ...messages
  ];
  const failures = [];

  for (const model of VERCEL_GATEWAY_FALLBACK_MODELS) {
    try {
      const response = await fetch('https://ai-gateway.vercel.sh/v1/chat/completions', {
        method: 'POST',
        headers: {
          authorization: 'Bearer ' + token,
          'content-type': 'application/json',
          accept: 'application/json'
        },
        body: JSON.stringify({
          model,
          messages: fallbackMessages,
          temperature: 0.45,
          max_tokens: 900
        })
      });
      const raw = await response.text();
      if (!response.ok) throw new Error('ai_gateway_fallback_failed_' + response.status + ': ' + raw.slice(0, 500));

      let data;
      try { data = JSON.parse(raw); }
      catch { throw new Error('ai_gateway_fallback_non_json'); }

      const text = String(data?.choices?.[0]?.message?.content || '').trim();
      if (!text) throw new Error('ai_gateway_fallback_empty_response');
      return { text: text.slice(0, 30000), model: data.model || model };
    } catch (error) {
      failures.push(String(error?.message || error).slice(0, 300));
      console.warn('Vercel AI Gateway fallback failed for', model + ':', failures[failures.length - 1]);
    }
  }

  throw new Error('vercel_ai_gateway_fallback_exhausted: ' + failures.join(' | '));
}

async function runHermesCronTicks(sandbox, runtimeEnv, paths) {
  const result = await runChecked(sandbox, {
    cmd: 'node',
    args: ['scripts/hermes-office-cron.js'],
    cwd: paths.workdir,
    env: runtimeEnv
  }, 'hermes_cron_tick');

  const raw = await out(result);
  let summary;
  try { summary = JSON.parse(raw); }
  catch { throw new Error('hermes_cron_tick_invalid_summary'); }
  if (!summary?.ok) throw new Error('hermes_cron_tick_failed');
  return summary;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  let sandbox = null;
  try {
    const auth = String(req.headers?.authorization || '');
    if (!auth.startsWith('Bearer ')) throw new Error('github_oidc_missing');
    const claims = await verifyGitHubOidc(auth.slice(7));
    const mode = String(req.body?.mode || 'chat');
    if (!['chat', 'cron_tick'].includes(mode)) throw new Error('unsupported_hermes_mode');
    const cronTick = mode === 'cron_tick';
    if (cronTick && String(claims.event_name || '') !== 'workflow_dispatch') {
      throw new Error('hermes_cron_manual_only');
    }

    const profile = cronTick ? null : normalizeProfile(req.body?.profile);
    const messages = cronTick ? [] : normalizeMessages(req.body?.messages);
    const prompt = cronTick ? '' : promptFrom(messages, req.body?.metadata || {});

    const modelBaseUrl = String(
      process.env.HERMES_LOCAL_BASE_URL || process.env.OPENAI_BASE_URL || ''
    ).trim().replace(/\/+$/, '');
    const modelApiKey = String(
      process.env.HERMES_LOCAL_API_KEY || process.env.OPENAI_API_KEY || ''
    );

    const githubToken = String(req.headers?.['x-quantdeus-github-token'] || '');
    const openRouterApiKey = String(req.headers?.['x-quantdeus-openrouter-key'] || '');
    let vercelOidcToken = String(
      req.headers?.['x-vercel-oidc-token'] || process.env.VERCEL_OIDC_TOKEN || ''
    ).trim();
    const runtimeEnv = {
      HERMES_MODEL_PROVIDER: process.env.HERMES_MODEL_PROVIDER || 'custom',
      HERMES_MODEL: MODEL,
      HERMES_OPENROUTER_MODEL: OPENROUTER_MODEL,
      AI_GATEWAY_MODEL: process.env.AI_GATEWAY_MODEL || 'openai/gpt-5-mini',
      HERMES_VERCEL_FALLBACK_MODELS: process.env.HERMES_VERCEL_FALLBACK_MODELS || [
        process.env.AI_GATEWAY_MODEL || 'openai/gpt-5-mini',
        'openai/gpt-oss-120b'
      ].join(','),
      HERMES_TERMINAL_BACKEND: 'local',
      GITHUB_TOOLSETS: 'all'
    };
    try {
      // Reuse Vercel's short-lived request token; only resolve through the helper if the injected header is absent.
      if (!vercelOidcToken) vercelOidcToken = await getVercelOidcToken();
      runtimeEnv.AI_GATEWAY_API_KEY = vercelOidcToken;
    } catch (error) {
      console.warn('Hermes AI Gateway credentials unavailable:', String(error?.message || error).slice(0, 300));
    }
    if (modelBaseUrl) runtimeEnv.HERMES_LOCAL_BASE_URL = modelBaseUrl;
    if (modelApiKey) runtimeEnv.HERMES_LOCAL_API_KEY = modelApiKey;
    if (openRouterApiKey) runtimeEnv.OPENROUTER_API_KEY = openRouterApiKey;
    if (githubToken) {
      runtimeEnv.GITHUB_TOKEN = githubToken;
      runtimeEnv.GH_TOKEN = githubToken;
      runtimeEnv.GITHUB_PERSONAL_ACCESS_TOKEN = githubToken;
      runtimeEnv.MCP_GITHUB_API_KEY = githubToken;
    }

    sandbox = await Sandbox.getOrCreate({
      name: SANDBOX_NAME,
      image: 'vercel/sandbox/universal',
      resources: { vcpus: 2 },
      timeout: 15 * 60 * 1000,
      persistent: true,
      snapshotExpiration: 30 * 24 * 60 * 60 * 1000,
      keepLastSnapshots: { count: 2 },
      resume: true,
      tags: { app: 'quantdeus', runtime: 'hermes-office' }
    });

    const paths = await resolveSandboxPaths(sandbox);
    await ensureRepo(sandbox, paths);
    await ensureHermesInstalled(sandbox);
    await ensureBootstrap(sandbox, runtimeEnv, paths);
    if (cronTick) {
      const summary = await runHermesCronTicks(sandbox, runtimeEnv, paths);
      await sandbox.stop();
      return res.status(200).json({
        ok: true,
        mode: 'cron_tick',
        provider: 'quantdeus-hermes-vercel-sandbox',
        profiles_checked: summary.profiles_checked,
        profiles_succeeded: summary.profiles_succeeded,
        profiles_failed: summary.profiles_failed,
        cloud_pc: {
          name: SANDBOX_NAME,
          persistent: true,
          home: paths.home,
          workdir: paths.workdir
        },
        github_run: {
          actor: claims.actor || null,
          workflow: claims.workflow || null,
          event: claims.event_name || null,
          repository: claims.repository
        }
      });
    }

    await configureLocalModel(sandbox, profile, runtimeEnv, paths);
    let text = '';
    let executionMode = 'hermes-agent';
    let responseModel = MODEL;
    let primaryError = null;
    try {
      const primary = await runHermes(sandbox, profile, prompt, runtimeEnv, paths);
      text = primary.text;
      if (primary.fallback?.provider === 'ai-gateway') {
        executionMode = 'hermes-ai-gateway-fallback';
        responseModel = primary.fallback.model;
      } else if (primary.fallback?.provider === 'openrouter') {
        executionMode = 'hermes-openrouter-fallback';
        responseModel = primary.fallback.model;
      }
      if (!text) throw new Error('hermes_empty_response');
    } catch (error) {
      primaryError = error;
      console.warn('Primary Hermes inference failed:', String(error?.message || error).slice(0, 500));
    }

    if (!text && openRouterApiKey) {
      try {
        const openRouterEnv = {
          ...runtimeEnv,
          HERMES_MODEL_PROVIDER: 'openrouter',
          HERMES_MODEL: OPENROUTER_MODEL,
          OPENROUTER_API_KEY: openRouterApiKey
        };
        const openRouterResult = await runHermes(
          sandbox,
          profile,
          prompt,
          openRouterEnv,
          paths,
          OPENROUTER_MODEL,
          'openrouter'
        );
        text = openRouterResult.text;
        if (text) {
          executionMode = 'hermes-openrouter-fallback';
          responseModel = openRouterResult.fallback?.model || OPENROUTER_MODEL;
        }
      } catch (error) {
        console.warn('Hermes OpenRouter fallback failed:', String(error?.message || error).slice(0, 500));
      }
    }

    if (!text) {
      try {
        const fallback = await runVercelAIGatewayFallback(messages, vercelOidcToken);
        text = fallback.text;
        responseModel = fallback.model;
        executionMode = 'vercel-ai-gateway-fallback';
      } catch (error) {
        console.warn('Vercel AI Gateway fallback exhausted:', String(error?.message || error).slice(0, 800));
      }
    }

    if (!text && modelBaseUrl && modelApiKey) {
      console.warn('Hermes providers returned no answer; using direct configured model fallback.');
      executionMode = 'mistral-direct-fallback';
      text = await runModelFallback(prompt, modelBaseUrl, modelApiKey, MODEL);
      responseModel = MODEL;
    }

    if (!text) throw primaryError || new Error('hermes_empty_response');

    await sandbox.stop();

    return res.status(200).json({
      ok: true,
      mode: 'chat',
      provider: 'quantdeus-hermes-vercel-sandbox',
      model: responseModel,
      profile,
      execution_mode: executionMode,
      text,
      cloud_pc: {
        name: SANDBOX_NAME,
        persistent: true,
        home: paths.home,
        workdir: paths.workdir
      },
      github_run: {
        actor: claims.actor || null,
        workflow: claims.workflow || null,
        event: claims.event_name || null,
        repository: claims.repository
      }
    });
  } catch (error) {
    console.error('QuantDeus Hermes Cloud PC error:', error);
    if (sandbox) {
      try { await sandbox.stop(); } catch {}
    }
    const message = String(error?.message || error);
    const status = /github_oidc|wrong_repository|wrong_event/.test(message) ? 401 : 500;
    return res.status(status).json({
      ok: false,
      error: 'hermes_cloud_pc_failed',
      detail: message.slice(0, 2000)
    });
  }
}
