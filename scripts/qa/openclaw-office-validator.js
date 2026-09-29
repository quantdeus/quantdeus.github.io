'use strict';

const fs = require('node:fs');
const route = fs.readFileSync('vercel-dispatcher/api/quantdeus/openclaw.js', 'utf8');
const client = fs.readFileSync('scripts/openclaw-office-client.js', 'utf8');
const site = fs.readFileSync('scripts/site-agent-reply.js', 'utf8');
const telegram = fs.readFileSync('scripts/telegram-bot.js', 'utf8');
const vercel = JSON.parse(fs.readFileSync('vercel-dispatcher/vercel.json', 'utf8'));
const smokeWorkflow = fs.readFileSync('.github/workflows/openclaw-smoke.yml', 'utf8');

for (const [ok, message] of [
  [route.includes("const AUDIENCE = 'quantdeus-vercel-openclaw'"), 'dedicated GitHub OIDC audience'],
  [route.includes('Sandbox.getOrCreate') && route.includes("runtime: 'openclaw-office'"), 'persistent Vercel Sandbox runtime'],
  [route.includes("openclaw@2026.9.6"), 'pinned OpenClaw install'],
  [route.includes("const publicTools = { deny: ['*'] }"), 'public OpenClaw chat remains no-tools'],
  [route.includes("'github__*'") && route.includes("'playwright__browser_navigate'") && route.includes("'playwright__browser_snapshot'"), 'trusted office exposes scoped GitHub and safe Playwright MCP tools'],
  [route.includes("'playwright__browser_run_code_unsafe'") && route.includes("'playwright__browser_evaluate'"), 'unsafe Playwright code execution tools stay denied'],
  [route.includes("'playwright@latest', 'install', 'chromium'") && route.includes('.quantdeus-playwright-chromium-ready'), 'trusted office prewarms Chromium in persistent sandbox'],
  [route.includes("https://api.githubcopilot.com/mcp/") && route.includes("@playwright/mcp@latest"), 'trusted office wires GitHub and Playwright MCP'],
  [route.includes('trustedOfficeRequest') && route.includes('openclaw-admin-smoke') && route.includes('telegram-bot'), 'trusted tools are gated to approved GitHub workflows'],
  [client.includes("execution_mode: trusted ? 'trusted-office' : 'chat'") && client.includes('trusted = false'), 'client can request trusted office explicitly'],
  [telegram.includes('trusted: true') && telegram.includes('telegram-admin-task'), 'Telegram admin task lane invokes trusted office only after admin gate'],
  [route.includes("id: localKeyEnv") && route.includes('runtimeEnv[localKeyEnv] = localKey'), 'model key stays env-backed and out of persisted config'],
  [route.includes("providerDefs['quantdeus-pollinations']") && route.includes("['openai', 'qwen-coder', 'openai-fast']") && route.includes('quantdeus_probe_ping') && route.includes('probeChatCandidate(candidate, trustedOffice)'), 'trusted Office selects a tool-capable Pollinations model using a live function-call probe'],
  [route.includes('quantdeus-config-') && route.includes('ephemeralFiles = [configPath, promptPath]'), 'request config is isolated and cleaned up'],
  [!route.includes("'--state-dir', statePath"), 'agent exec uses OpenClaw temporary state isolation'],
  [route.includes("'openai/gpt-oss-120b:free'") && route.includes('process.env.HERMES_LOCAL_API_KEY') && route.includes('process.env.MISTRAL_API_KEY'), 'existing Vercel OpenRouter and Mistral model credentials are supported'],
  [route.includes("cmd: 'rm'") && route.includes('finally'), 'ephemeral credential/prompt cleanup'],
  [client.includes('quantdeus-vercel-openclaw') && client.includes('/api/quantdeus/openclaw'), 'client wired to OpenClaw endpoint'],
  [site.includes("require('./openclaw-office-client')") && site.includes('openclaw-office'), 'GitHub site agent wired to OpenClaw'],
  [telegram.includes("require('./openclaw-office-client')") && telegram.includes('createAdminTask(agentId, task, username)'), 'Telegram chat migrated and admin task path retained'],
  [smokeWorkflow.includes('workflow_dispatch') && smokeWorkflow.includes('OPENCLAW_SMOKE_OK') && smokeWorkflow.includes('id-token: write'), 'manual live smoke calls deployed OpenClaw with GitHub OIDC'],
  [vercel.functions['api/quantdeus/openclaw.js']?.maxDuration === 300, 'OpenClaw function has adequate timeout']
]) {
  if (!ok) throw new Error(`OpenClaw Office contract failed: ${message}`);
}

console.log('OpenClaw Office contract OK: public no-tools chat plus workflow-gated Admin Office with GitHub/Playwright MCP, isolated state and ephemeral secrets.');
