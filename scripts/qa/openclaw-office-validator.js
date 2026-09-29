'use strict';

const fs = require('node:fs');
const route = fs.readFileSync('vercel-dispatcher/api/quantdeus/openclaw.js', 'utf8');
const client = fs.readFileSync('scripts/openclaw-office-client.js', 'utf8');
const site = fs.readFileSync('scripts/site-agent-reply.js', 'utf8');
const telegram = fs.readFileSync('scripts/telegram-bot.js', 'utf8');
const vercel = JSON.parse(fs.readFileSync('vercel-dispatcher/vercel.json', 'utf8'));
const adminSmokeWorkflow = fs.readFileSync('.github/workflows/openclaw-admin-smoke.yml', 'utf8');
const siteWorkflow = fs.readFileSync('.github/workflows/site-agent-replies.yml', 'utf8');
const qaSelfHealWorkflow = fs.readFileSync('.github/workflows/qa-self-heal.yml', 'utf8');
const qaFailureRadarWorkflow = fs.readFileSync('.github/workflows/qa-failure-radar.yml', 'utf8');
const evolutionWorkflow = fs.readFileSync('.github/workflows/openclaw-evolution.yml', 'utf8');
const evolutionSkill = fs.readFileSync('.openclaw/skills/quantdeus-self-evolution/SKILL.md', 'utf8');
const evolutionPolicy = JSON.parse(fs.readFileSync('coordination/openclaw-evolution.json', 'utf8'));
const guardedAutomerge = fs.readFileSync('scripts/guarded-automerge.js', 'utf8');

for (const [ok, message] of [
  [route.includes("const AUDIENCE = 'quantdeus-vercel-openclaw'"), 'dedicated GitHub OIDC audience'],
  [route.includes('Sandbox.getOrCreate') && route.includes("runtime: 'openclaw-office'"), 'persistent Vercel Sandbox runtime'],
  [route.includes("openclaw@2026.9.6"), 'pinned OpenClaw install'],
  [route.includes("const publicTools = { deny: ['*'] }"), 'public OpenClaw chat remains no-tools'],
  [route.includes("'github__*'") && route.includes("'playwright__browser_navigate'") && route.includes("'playwright__browser_snapshot'"), 'trusted office exposes scoped GitHub and safe Playwright MCP tools'],
  [route.includes("'playwright__browser_run_code_unsafe'") && route.includes("'playwright__browser_evaluate'"), 'unsafe Playwright code execution tools stay denied'],
  [route.includes("'@playwright/mcp@latest', 'install-browser', 'chrome'") && route.includes("'--browser=chrome'") && route.includes('.quantdeus-playwright-mcp-chrome-ready'), 'trusted office prewarms the exact Playwright MCP Chrome channel in persistent sandbox'],
  [route.includes("https://api.githubcopilot.com/mcp/") && route.includes("@playwright/mcp@latest"), 'trusted office wires GitHub and Playwright MCP'],
  [route.includes("include: smokePhase === 'github' ? ['list_branches'] : hourlyOffice ? [") && route.includes("'create_pull_request', 'update_issue', 'update_pull_request'"), 'GitHub MCP exposes one-tool smoke, enforced hourly read-only, and bounded interactive write surfaces'],
  [route.includes('function hourlyOfficeRequest') && route.includes('hourly_read_only: hourlyOffice') && route.includes('github_write: !hourlyOffice && !smokePhase'), 'hourly OpenClaw lane is externally marked and enforced read-only'],
  [route.includes("include: smokePhase === 'playwright'") && route.includes("? ['browser_navigate']") && route.includes("['browser_navigate', 'browser_snapshot', 'browser_find', 'browser_close']"), 'Playwright MCP exposes one-tool smoke surface plus scoped navigation, snapshot, find and close tools'],
  [route.includes('trustedOfficeRequest') && route.includes('openclaw-admin-smoke') && route.includes('telegram-bot') && route.includes('site-agent-replies') && route.includes("eventName === 'issue_comment'") && route.includes('metadata.admin_authorized === true'), 'trusted tools are workflow-gated and owner/admin site actions require signed issue-comment metadata'],
  [route.includes('.openclaw/skills/quantdeus-self-evolution/SKILL.md') && route.includes('OPENCLAW SELF-EVOLUTION SKILL FROM FRESH MAIN') && route.includes('effectivePrompt'), 'trusted OpenClaw loads the fresh repository self-evolution skill into execution context'],
  [evolutionPolicy.status === 'active' && evolutionPolicy.branch_prefix === 'automation/openclaw-evolution/' && evolutionPolicy.policy?.core_auto_merge === false, 'self-evolution policy is active, branch-scoped and forbids core auto-merge'],
  [evolutionWorkflow.includes("cron: '31 2 * * *'") && evolutionWorkflow.includes('node scripts/mission-alignment.js') && evolutionWorkflow.includes('automation/openclaw-evolution/') && evolutionWorkflow.includes('tier') && evolutionWorkflow.includes('openclaw-skill'), 'daily evolution workflow is mission-guarded and separates skill/core tiers'],
  [evolutionSkill.includes('observe → diagnose → hypothesize') && evolutionSkill.includes('Tier A') && evolutionSkill.includes('Tier B') && evolutionSkill.includes('Never weaken or bypass'), 'self-evolution skill encodes evidence loop, tiers and protected invariants'],
  [guardedAutomerge.includes("'openclaw-skill'") && guardedAutomerge.includes('.openclaw/skills/quantdeus-self-evolution/SKILL.md') && guardedAutomerge.includes('OpenClaw skill PR touches core/runtime paths'), 'guarded automerge permits only the low-risk OpenClaw evolution layer'],
  [client.includes("execution_mode: trusted ? 'trusted-office' : 'chat'") && client.includes('trusted = false'), 'client can request trusted office explicitly'],
  [telegram.includes('trusted: true') && telegram.includes('telegram-admin-task'), 'Telegram admin task lane invokes trusted office only after admin gate'],
  [route.includes("id: localKeyEnv") && route.includes('runtimeEnv[localKeyEnv] = localKey'), 'model key stays env-backed and out of persisted config'],
  [route.includes("providerDefs['quantdeus-pollinations']") && route.includes("['openai', 'mistral', 'gemini-fast', 'openai-fast']") && route.includes('quantdeus_probe_step_one') && route.includes('quantdeus_probe_step_two') && route.includes('PROBE_DONE') && route.includes('sequential_tool_roundtrip_ok') && route.includes('probeChatCandidate(candidate, trustedOffice)'), 'trusted Office selects a model using a sequential two-tool round-trip capability gate'],
  [route.includes('const healthyRefs = [];') && route.includes('if (probe.ok) healthyRefs.push(candidate.ref);') && route.includes('healthyRefs.filter(ref => ref !== model)'), 'trusted MCP failover is restricted to every candidate that passed the sequential two-tool probe'],
  [route.includes("const smokePhase = trustedOffice") && route.includes("allow: ['bundle-mcp', 'github__list_branches']") && route.includes("allow: ['bundle-mcp', 'playwright__browser_navigate']"), 'live smoke phases expose only their required MCP server and tools'],
  [route.includes("codeMode: false") && route.includes("models: Object.fromEntries(orderedModels.map(ref => [ref, { codeMode: false }]))"), 'OpenClaw Code Mode stays explicitly disabled on compatible-provider trusted MCP routes'],
  [route.includes("tools: trustedOffice ? { ...trustedTools, toolSearch: false } : publicTools"), 'trusted MCP disables automatic Tool Search so bounded GitHub and Playwright schemas are exposed directly'],
  [route.includes('quantdeus-config-') && route.includes('ephemeralFiles = [configPath, promptPath]'), 'request config is isolated and cleaned up'],
  [!route.includes("'--state-dir', statePath"), 'agent exec uses OpenClaw temporary state isolation'],
  [route.includes("'openai/gpt-oss-120b:free'") && route.includes('process.env.HERMES_LOCAL_API_KEY') && route.includes('process.env.MISTRAL_API_KEY') && route.includes("'https://openrouter.ai/api/v1/chat/completions'"), 'existing OpenRouter and local model credentials are supported as separately probed routes'],
  [!route.includes("baseUrl: 'https://api.mistral.ai/v1'") && !route.includes('has_independent_mistral_key') && route.includes('validated_fallbacks: fallbackModels'), 'no duplicate Mistral fallback is advertised; selected MCP fallbacks are observable'],
  [route.includes('tool_summary: result.toolSummary || null') && route.includes('assistant_turns: result.assistantTurns ?? null'), 'OpenClaw returns machine-readable tool execution evidence'],
  [adminSmokeWorkflow.includes("result.raw?.tool_summary") && adminSmokeWorkflow.includes("github__list_branches") && adminSmokeWorkflow.includes("playwright__browser_navigate") && adminSmokeWorkflow.includes("/branches/main"), 'Admin smoke verifies MCP tool traces and independently verifies main branch existence'],
  [route.includes("cmd: 'rm'") && route.includes('finally'), 'ephemeral credential/prompt cleanup'],
  [client.includes('quantdeus-vercel-openclaw') && client.includes('/api/quantdeus/openclaw'), 'client wired to OpenClaw endpoint'],
  [site.includes("require('./openclaw-office-client')") && site.includes('trusted: trustedAction') && site.includes('admin_authorized: trustedAction'), 'GitHub site agent promotes only owner/admin repository actions to trusted OpenClaw'],
  [siteWorkflow.includes('QUANTDEUS_ADMIN_GITHUB_USERS') && siteWorkflow.includes('issue_comment:'), 'site agent workflow passes the repository admin allowlist on comment turns'],
  [qaSelfHealWorkflow.includes('trigger_run_id:') && qaSelfHealWorkflow.includes('Verify claimed repair PR exists') && qaFailureRadarWorkflow.includes('trigger_run_id') && qaFailureRadarWorkflow.includes('qa-self-heal.yml'), 'QA failure radar hands concrete failed-run evidence to self-heal, which verifies claimed repair artifacts'],
  [telegram.includes("require('./openclaw-office-client')") && telegram.includes('createAdminTask(agentId, task, username)'), 'Telegram chat migrated and admin task path retained'],
  [vercel.functions['api/quantdeus/openclaw.js']?.maxDuration === 300, 'OpenClaw function has adequate timeout']
]) {
  if (!ok) throw new Error(`OpenClaw Office contract failed: ${message}`);
}

console.log('OpenClaw Office contract OK: public no-tools chat, owner/admin trusted site actions, reactive QA repair, GitHub/Playwright MCP, isolated state and ephemeral secrets.');
