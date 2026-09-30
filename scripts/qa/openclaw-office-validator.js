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
const evolutionBroker = fs.readFileSync('scripts/openclaw-evolution.js', 'utf8');
const evolutionWorkflow = fs.readFileSync('.github/workflows/openclaw-evolution.yml', 'utf8');
const evolutionSkill = fs.readFileSync('.openclaw/skills/quantdeus-self-evolution/SKILL.md', 'utf8');
const evolutionPolicy = JSON.parse(fs.readFileSync('coordination/openclaw-evolution.json', 'utf8'));
const guardedAutomerge = fs.readFileSync('scripts/guarded-automerge.js', 'utf8');
const evolutionGuard = fs.readFileSync('scripts/openclaw-evolution-guard.js', 'utf8');
const evolutionPrGuard = fs.readFileSync('.github/workflows/openclaw-evolution-pr-guard.yml', 'utf8');
const evolutionGate = fs.readFileSync('.github/workflows/openclaw-evolution-gate.yml', 'utf8');

for (const [ok, message] of [
  [route.includes("const AUDIENCE = 'quantdeus-vercel-openclaw'"), 'dedicated GitHub OIDC audience'],
  [route.includes('Sandbox.getOrCreate') && route.includes("runtime: 'openclaw-office'"), 'persistent Vercel Sandbox runtime'],
  [route.includes("openclaw@2026.9.6"), 'pinned OpenClaw install'],
  [route.includes("const publicTools = { deny: ['*'] }"), 'public OpenClaw chat remains no-tools'],
  [route.includes("'github__*'") && route.includes("'playwright__browser_navigate'") && route.includes("'playwright__browser_snapshot'"), 'trusted office exposes scoped GitHub and safe Playwright MCP tools'],
  [route.includes("'playwright__browser_run_code_unsafe'") && route.includes("'playwright__browser_evaluate'"), 'unsafe Playwright code execution tools stay denied'],
  [route.includes("'@playwright/mcp@latest', 'install-browser', 'chrome'") && route.includes("'--browser=chrome'") && route.includes('.quantdeus-playwright-mcp-chrome-ready'), 'trusted office prewarms the exact Playwright MCP Chrome channel in persistent sandbox'],
  [route.includes("https://api.githubcopilot.com/mcp/") && route.includes("@playwright/mcp@latest"), 'trusted office wires GitHub and Playwright MCP'],
  [route.includes("include: smokePhase === 'github' ? ['list_branches', 'get_file_contents'] : hourlyOffice ? [") && route.includes("'create_pull_request', 'update_issue', 'update_pull_request'"), 'GitHub MCP exposes bounded read-only smoke tools, enforced hourly read-only, and bounded interactive write surfaces'],
  [route.includes('function hourlyOfficeRequest') && route.includes('hourly_read_only: hourlyOffice') && route.includes('github_write: !hourlyOffice && !smokePhase'), 'hourly OpenClaw lane is externally marked and enforced read-only'],
  [route.includes("include: smokePhase === 'playwright'") && route.includes("? ['browser_navigate']") && route.includes("['browser_navigate', 'browser_snapshot', 'browser_find', 'browser_close']"), 'Playwright MCP exposes one-tool smoke surface plus scoped navigation, snapshot, find and close tools'],
  [route.includes('trustedOfficeRequest') && route.includes('openclaw-admin-smoke') && route.includes('telegram-bot') && route.includes('site-agent-replies') && route.includes("eventName === 'issue_comment'") && route.includes('metadata.admin_authorized === true'), 'trusted tools are workflow-gated and owner/admin site actions require signed issue-comment metadata'],
  [route.includes('const effectivePrompt = prompt;') && !route.includes('OPENCLAW SELF-EVOLUTION SKILL FROM FRESH MAIN'), 'mutable self-evolution skill is not injected into trusted write-capable Office prompts'],
  [evolutionPolicy.status === 'active' && evolutionPolicy.branch_prefix === 'automation/openclaw-evolution/' && evolutionPolicy.policy?.core_auto_merge === false && evolutionPolicy.policy?.auto_merge === 'tier-a-guarded-only' && evolutionPolicy.policy?.human_review_required === 'tier-b-only' && evolutionPolicy.policy?.analysis_tools === false && evolutionPolicy.policy?.tier_b_mutation === 'proposal-record-only', 'self-evolution policy permits only guarded Tier A auto-merge and keeps Tier B proposal-only'],
  [evolutionWorkflow.includes("cron: '31 2 * * *'") && evolutionWorkflow.includes('node scripts/mission-alignment.js') && evolutionBroker.includes('automation/openclaw-evolution/') && evolutionBroker.includes('trusted: false') && evolutionBroker.includes('delete process.env.GITHUB_TOKEN') && evolutionWorkflow.includes('contents: read'), 'daily evolution analysis is mission-guarded, no-tools and credential-separated'],
  [evolutionBroker.includes("require('./openclaw-evolution-guard')") && evolutionBroker.includes('semanticTierA(proposal)') && evolutionBroker.includes("tier: 'core-proposal'") && evolutionBroker.includes("['qa-triad.yml', 'static-smoke.yml', 'openclaw-evolution-pr-guard.yml']"), 'deterministic broker semantically validates Tier A before mutation, records Tier B only, and dispatches three independent checks'],
  [evolutionSkill.includes('observe → diagnose → hypothesize') && evolutionSkill.includes('Tier A') && evolutionSkill.includes('Tier B') && evolutionSkill.includes('Never weaken or bypass') && evolutionSkill.includes('QD_EVOLUTION_MUTABLE_START'), 'self-evolution skill encodes protected invariants and a bounded mutable section'],
  [evolutionGuard.includes('validateTierAChangeSet') && evolutionGuard.includes('changed outside the bounded mutable section') && evolutionGuard.includes('automated evolution branch may not mutate code/runtime/workflow path'), 'semantic/path guard freezes Tier A control semantics and rejects automated core mutations'],
  [evolutionPrGuard.includes('node scripts/mission-alignment.js') && evolutionPrGuard.includes('node scripts/openclaw-evolution-guard.js --git') && evolutionPrGuard.includes('workflow_dispatch'), 'independent Evolution Guard validates mission plus path/semantic envelope on dispatched PR head'],
  [evolutionGate.includes('QuantDeus QA Triad') && evolutionGate.includes('QuantDeus Static Smoke') && evolutionGate.includes('QuantDeus OpenClaw Evolution PR Guard') && evolutionGate.includes('node scripts/guarded-automerge.js'), 'independent gate reacts to QA, Smoke and Evolution Guard completion'],
  [guardedAutomerge.includes("['qa','smoke','evolution-guard']") && guardedAutomerge.includes("check.conclusion === 'success'") && guardedAutomerge.includes('validateTierAChangeSet') && guardedAutomerge.includes('--match-head-commit'), 'guarded automerge requires exact successful provenance, final semantic revalidation and atomic head match'],
  [client.includes("execution_mode: trusted ? 'trusted-office' : 'chat'") && client.includes('trusted = false'), 'client can request trusted office explicitly'],
  [telegram.includes('trusted: true') && telegram.includes('telegram-admin-task'), 'Telegram admin task lane invokes trusted office only after admin gate'],
  [route.includes("id: localKeyEnv") && route.includes('runtimeEnv[localKeyEnv] = localKey'), 'model key stays env-backed and out of persisted config'],
  [route.includes('quantdeus_probe_step_one') && route.includes('quantdeus_probe_step_two') && route.includes('PROBE_DONE') && route.includes('sequential_tool_roundtrip_ok') && route.includes('probeChatCandidate(candidate, trustedOffice)') && route.includes('const orderedModels = [...healthyRefs]'), 'trusted Office selects only models that pass the required capability probe'],
  [route.includes('const healthyRefs = [];') && route.includes('if (probe.ok) healthyRefs.push(candidate.ref);') && route.includes('const fallbackModels = healthyRefs.slice(1)'), 'all failover routes are restricted to candidates that passed the required probe'],
  [route.includes("const smokePhase = trustedOffice") && route.includes("allow: ['bundle-mcp', 'github__list_branches', 'github__get_file_contents']") && route.includes("allow: ['bundle-mcp', 'playwright__browser_navigate']"), 'live smoke phases expose only bounded read-only GitHub tools or the required Playwright tool'],
  [route.includes("codeMode: false") && route.includes("models: Object.fromEntries(orderedModels.map(ref => [ref, { codeMode: false }]))"), 'OpenClaw Code Mode stays explicitly disabled on compatible-provider trusted MCP routes'],
  [route.includes("tools: trustedOffice ? { ...trustedTools, toolSearch: false } : publicTools"), 'trusted MCP disables automatic Tool Search so bounded GitHub and Playwright schemas are exposed directly'],
  [route.includes('quantdeus-config-') && route.includes('ephemeralFiles = [configPath, promptPath]'), 'request config is isolated and cleaned up'],
  [!route.includes("'--state-dir', statePath"), 'agent exec uses OpenClaw temporary state isolation'],
  [route.includes('OPENROUTER_MODEL') && route.includes('process.env.HERMES_LOCAL_API_KEY') && route.includes('process.env.OPENAI_API_KEY') && route.includes("'https://openrouter.ai/api/v1/chat/completions'"), 'explicit OpenRouter and local credentials are supported only as separately probed routes'],
  [route.includes('validated_fallbacks: fallbackModels') && route.includes('openclaw_no_healthy_model_route'), 'selected fallbacks are observable and routing fails closed when no healthy model exists'],
  [route.includes('const toolSummary = result.toolSummary || null') && route.includes('tool_summary: toolSummary') && route.includes('assistant_turns: result.assistantTurns ?? null'), 'OpenClaw returns machine-readable tool execution evidence'],
  [route.includes('openclaw_trusted_tool_execution_failed') && route.includes('toolFailures > 0') && route.includes("structuredToolEvidence.includes('incomplete_turn')"), 'trusted Office fails closed instead of returning HTTP 200 for structured tool failures or incomplete turns'],
  [route.includes('const repoDir = `${workdir}/repo-${requestId}`') && route.includes("args: ['clone', '--depth', '1', '--branch', 'main'") && !route.includes("'openclaw_repo_fetch'"), 'trusted requests use isolated per-request shallow checkouts with no shared fetch/reset race'],
  [adminSmokeWorkflow.includes('for (let attempt = 1; attempt <= 2; attempt += 1)') && adminSmokeWorkflow.includes('github__get_file_contents') && adminSmokeWorkflow.includes('consecutive_github_mcp_passes') && adminSmokeWorkflow.includes('playwright__browser_navigate') && adminSmokeWorkflow.includes('/branches/main'), 'Admin smoke requires two consecutive real GitHub MCP content reads, Playwright trace, and independent main verification'],
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

