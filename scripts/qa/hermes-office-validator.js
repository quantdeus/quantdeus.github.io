#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { spawnSync } = require('node:child_process');

const agents = JSON.parse(fs.readFileSync('coordination/agents.json', 'utf8'));
const office = JSON.parse(fs.readFileSync('coordination/hermes-office.json', 'utf8'));
const evolution = JSON.parse(fs.readFileSync('coordination/hermes-evolution.json', 'utf8'));

if (office.runtime !== 'hermes-agent') throw new Error('Hermes office runtime must be hermes-agent');
if (office.registry_source !== 'coordination/agents.json') throw new Error('Hermes office must derive profiles from agents.json');
if (office.profile_strategy !== 'one-hermes-profile-per-canonical-agent') throw new Error('Hermes profile strategy drift');
if (office.office.dispatcher_profile !== 'seven-of-nine') throw new Error('Seven of Nine must own Hermes office dispatch');
if (office.office.orchestrator_profile !== 'seven-of-nine') throw new Error('Seven of Nine must own Hermes office orchestration');
if (office.source_of_truth !== 'github') throw new Error('GitHub must remain source of truth');
if (!String(office.model.default || '').toLowerCase().includes('gpt-oss')) throw new Error('Hermes office default model must be GPT-OSS');
if ((office.model.minimum_context_tokens || 0) < 65536) throw new Error('Hermes requires >=64K context');
if (office.model.provider !== 'custom') throw new Error('Hermes local model provider must be custom');
if (office.execution.hosting !== 'vercel-persistent-sandbox') throw new Error('Hermes office must run on persistent Vercel Sandbox');
if (office.execution.preferred_terminal_backend !== 'local') throw new Error('Hermes terminal must be local inside the Vercel cloud PC');
if (!fs.existsSync('vercel-dispatcher/api/quantdeus/hermes.js')) throw new Error('Missing Vercel Hermes Cloud PC endpoint');

const ids = (agents.agents || []).map(a => a.id);
if (ids.length !== office.canonical_agent_count) {
  throw new Error('Hermes office agent count drift: registry=' + ids.length + ' manifest=' + office.canonical_agent_count);
}
if (new Set(ids).size !== ids.length) throw new Error('Duplicate canonical agent ids');
for (const required of ['seven-of-nine', 'coordinator', 'qa-syntax', 'qa-contract', 'qa-repair']) {
  if (!ids.includes(required)) throw new Error('Missing required Hermes profile source: ' + required);
}

console.log('Hermes Office contract OK:', ids.length, 'profiles, model=' + office.model.default);

if (evolution.chat_bridge.primary_profile !== 'seven-of-nine') throw new Error('Hermes Evolution chat bridge must route through Seven');
if (evolution.capabilities.github.mode !== 'official-mcp') throw new Error('Official GitHub MCP contract missing');
if (!evolution.capabilities.browser.playwright_mcp) throw new Error('Playwright MCP must be enabled');
if (!evolution.capabilities.automation.agents_may_create_cron) throw new Error('Hermes agents must be allowed to create cron jobs');
if (!evolution.capabilities.self_improvement.skill_manage) throw new Error('Hermes skill self-improvement must be enabled');
if (!evolution.capabilities.self_improvement.guard_agent_created) throw new Error('Agent-created skills must be security-scanned');
for (const file of ['scripts/hermes-office-client.js','.hermes/skills/quantdeus-autonomy/SKILL.md','.hermes/skills/quantdeus-playwright-ops/SKILL.md','.hermes/skills/quantdeus-connections-evolution/SKILL.md']) {
  if (!fs.existsSync(file)) throw new Error('Missing Hermes Evolution artifact: ' + file);
}
console.log('Hermes Evolution contract OK: chat bridge + GitHub MCP + Playwright + cron + skills');

const clientSource = fs.readFileSync('scripts/hermes-office-client.js','utf8');
const routeSource = fs.readFileSync('vercel-dispatcher/api/quantdeus/hermes.js','utf8');
if (!clientSource.includes('quantdeus-vercel-hermes')) throw new Error('Hermes client must request dedicated GitHub OIDC audience');
if (!routeSource.includes("Sandbox.getOrCreate")) throw new Error('Hermes route must use persistent Vercel Sandbox');
if (!routeSource.includes("openai/gpt-oss-120b")) throw new Error('Hermes cloud route must default to GPT-OSS 120B');
if (!routeSource.includes("process.env.HERMES_MODEL_PROVIDER || 'custom'")) throw new Error('Hermes route must use the supported custom provider for local GPT-OSS');
if (!routeSource.includes('config set model.base_url')) throw new Error('Hermes route must persist a configured local endpoint in the profile');
if (!routeSource.includes('runtimeEnv.HERMES_LOCAL_BASE_URL = modelBaseUrl')) throw new Error('Hermes route must pass the configured local URL into profile setup');

if (!routeSource.includes("import { getVercelOidcToken } from '@vercel/oidc'")) throw new Error('Hermes Vercel fallback must use project OIDC authentication');
if (!routeSource.includes('https://ai-gateway.vercel.sh/v1/chat/completions')) throw new Error('Hermes route must include Vercel AI Gateway model fallback');
if (!routeSource.includes('VERCEL_GATEWAY_FALLBACK_MODELS')) throw new Error('Hermes route must include configured Vercel model fallbacks');
if (!routeSource.includes("executionMode = 'vercel-ai-gateway-fallback'")) throw new Error('Hermes route must report Vercel AI Gateway fallback mode');
if (!routeSource.includes('model: responseModel')) throw new Error('Hermes route must return the model used by the successful fallback');
if (!routeSource.includes("x-quantdeus-github-token")) throw new Error('Hermes route must accept ephemeral repo token handoff');
const siteReplySource = fs.readFileSync('scripts/site-agent-reply.js','utf8');
if (!siteReplySource.includes("result.runtime === 'vercel-ai-gateway-fallback'")) throw new Error('Site agent must identify Vercel AI Gateway fallback accurately');
if (!siteReplySource.includes("result.runtime === 'hermes-ai-gateway-fallback'")) throw new Error('Site agent must identify native Hermes AI Gateway fallback accurately');
if (!siteReplySource.includes("result.runtime === 'hermes-openrouter-fallback'")) throw new Error('Site agent must identify Hermes OpenRouter fallback accurately');
if (!routeSource.includes('Provider fallback:')) throw new Error('Hermes route must parse native fallback notice for actual provider/model attribution');
console.log('Hermes Cloud PC contract OK: keyless OIDC + persistent Sandbox + GPT-OSS');

const bootstrapSource = fs.readFileSync('scripts/hermes-office-bootstrap.js','utf8');
const vercelPackage = JSON.parse(fs.readFileSync('vercel-dispatcher/package.json','utf8'));
if (!vercelPackage.dependencies?.['@vercel/oidc']) throw new Error('Vercel Hermes route must include the OIDC helper dependency');
if (!bootstrapSource.includes("['hermes-cli', 'connections']")) throw new Error('Every Hermes profile must receive the connections toolset');
if (!bootstrapSource.includes("['hermes-cli', 'kanban', 'connections']")) throw new Error('Seven must keep Kanban and receive the connections toolset');
if (!bootstrapSource.includes('const BOOTSTRAP_SCHEMA = 6')) throw new Error('Hermes bootstrap schema must refresh every profile with the updated toolsets');
if (!bootstrapSource.includes('fallback_providers: fallbackProviders')) throw new Error('Hermes profile must declare its native provider fallback chain');
if (!routeSource.includes('runtimeEnv.AI_GATEWAY_API_KEY = await getVercelOidcToken()')) throw new Error('Hermes native AI Gateway fallback requires ephemeral Vercel OIDC credentials');
if (!bootstrapSource.includes("provider: 'ai-gateway'")) throw new Error('Hermes native fallback must include Vercel AI Gateway');
if (!bootstrapSource.includes("provider: 'openrouter'")) throw new Error('Hermes profile must preserve OpenRouter fallback policy');
if (routeSource.includes('hermes_fallback_config_write_failed')) throw new Error('Hermes route must not rewrite YAML profile config as JSON');
if (!routeSource.includes('primary.fallback.model')) throw new Error('Hermes route must report the model used by native provider failover');
if (!bootstrapSource.includes('modelBaseUrl') || !bootstrapSource.includes('modelKeyEnv')) throw new Error('Every profile must receive runtime model endpoint and key-env references');

const cronRunner = spawnSync(process.execPath, ['scripts/hermes-office-cron.js', '--dry-run'], { encoding: 'utf8' });
if (cronRunner.status !== 0) throw new Error('Hermes cron fleet dry-run failed: ' + String(cronRunner.stderr || '').slice(0, 500));
const cronSummary = JSON.parse(cronRunner.stdout);
if (!cronSummary.ok || cronSummary.profiles_checked !== ids.length || cronSummary.profiles_failed !== 0) {
  throw new Error('Hermes cron pulse dry-run must cover every canonical profile');
}

const bootstrapRoot = fs.mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'hermes-office-fallback-'));
try {
  const gatewayOnlyRoot = fs.mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'hermes-office-gateway-'));
  const gatewayOnly = spawnSync(process.execPath, ['scripts/hermes-office-bootstrap.js'], {
    encoding: 'utf8',
    env: { ...process.env, HERMES_HOME: gatewayOnlyRoot }
  });
  try {
    if (gatewayOnly.status !== 0) throw new Error('Hermes Gateway-only bootstrap failed');
    const gatewayProfile = JSON.parse(fs.readFileSync(require('node:path').join(gatewayOnlyRoot, 'profiles', 'seven-of-nine', 'config.yaml'), 'utf8'));
    if (!gatewayProfile.fallback_providers.some(entry => entry.provider === 'ai-gateway')) throw new Error('Hermes Gateway fallback should not depend on an OpenRouter key');
    if (gatewayProfile.fallback_providers.at(-1)?.provider !== 'openrouter') throw new Error('Hermes OpenRouter fallback policy must persist without persisting credentials');
  } finally {
    fs.rmSync(gatewayOnlyRoot, { recursive: true, force: true });
  }

  const boot = spawnSync(process.execPath, ['scripts/hermes-office-bootstrap.js'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      HERMES_HOME: bootstrapRoot,
      AI_GATEWAY_API_KEY: 'test-only-never-persist',
      HERMES_VERCEL_FALLBACK_MODELS: 'openai/gpt-5-mini,openai/gpt-oss-120b',
      HERMES_OPENROUTER_MODEL: 'openai/gpt-oss-120b',
      OPENROUTER_API_KEY: 'test-only-openrouter'
    }
  });
  if (boot.status !== 0) throw new Error('Hermes native fallback bootstrap failed: ' + String(boot.stderr || '').slice(0, 500));
  const profile = JSON.parse(fs.readFileSync(require('node:path').join(bootstrapRoot, 'profiles', 'seven-of-nine', 'config.yaml'), 'utf8'));
  const expected = [
    { provider: 'ai-gateway', model: 'openai/gpt-5-mini' },
    { provider: 'ai-gateway', model: 'openai/gpt-oss-120b' },
    { provider: 'openrouter', model: 'openai/gpt-oss-120b' }
  ];
  if (JSON.stringify(profile.fallback_providers) !== JSON.stringify(expected)) throw new Error('Hermes native fallback providers/order mismatch');
  const configText = fs.readFileSync(require('node:path').join(bootstrapRoot, 'profiles', 'seven-of-nine', 'config.yaml'), 'utf8');
  if (configText.includes('test-only-never-persist') || configText.includes('test-only-openrouter')) throw new Error('Provider credentials must not persist in profile config');
} finally {
  fs.rmSync(bootstrapRoot, { recursive: true, force: true });
}

const cronSource = fs.readFileSync('scripts/hermes-office-cron.js','utf8');
const cronClient = fs.readFileSync('scripts/hermes-office-client.js','utf8');
const cronWorkflow = fs.readFileSync('.github/workflows/hermes-office-cron.yml','utf8');
if (!cronSource.includes("['-p', profile, 'cron', 'tick']")) throw new Error('Cron pulse must tick Hermes scheduler for every profile');
if (!cronClient.includes("mode: 'cron_tick'")) throw new Error('Cron client must call the authenticated Hermes cron mode');
if (!cronWorkflow.includes("cron: '*/15 * * * *'")) throw new Error('Hermes cron pulse must run every 15 minutes');
if (!cronWorkflow.includes('  id-token: write')) throw new Error('Hermes cron workflow requires GitHub OIDC token permission');
const route = fs.readFileSync('vercel-dispatcher/api/quantdeus/hermes.js','utf8');
if (!route.includes("mode === 'cron_tick'")) throw new Error('Vercel Hermes route must expose cron tick mode');
if (!route.includes("!['schedule', 'workflow_dispatch'].includes(String(claims.event_name || ''))")) {
  throw new Error('Cron mode must be limited to authenticated schedule/manual workflow events');
}
if (!route.includes("runHermesCronTicks(sandbox, runtimeEnv, paths)")) throw new Error('Vercel Hermes route must execute saved cron jobs');

const siteReply = fs.readFileSync('scripts/site-agent-reply.js','utf8');
const hermesIssueCall = siteReply.indexOf('const result = await hermesOffice.ask');
const scriptIssueFallback = siteReply.indexOf('return createIssueFromRequest(agent, normalizedQuery, snapshot)');
if (hermesIssueCall < 0 || scriptIssueFallback < hermesIssueCall) throw new Error('Explicit website Issue requests must reach Hermes before the fallback');

const telegramBot = fs.readFileSync('scripts/telegram-bot.js','utf8');
const adminTaskStart = telegramBot.indexOf("if (/^\\/task");
const hermesTaskCall = telegramBot.indexOf("const result = await hermesOffice.ask", adminTaskStart);
const directTaskFallback = telegramBot.indexOf("const url = createAdminTask(agentId, task, username)", adminTaskStart);
if (adminTaskStart < 0 || hermesTaskCall < adminTaskStart || directTaskFallback < hermesTaskCall) {
  throw new Error('Telegram admin tasks must route through Hermes before the direct fallback');
}
console.log('Hermes Evolution live contract OK: all-profile MCP connections + authenticated 15-minute cron pulse + chat mutations');
