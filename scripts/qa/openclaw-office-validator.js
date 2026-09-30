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
  [route.includes('CEREBRAS_API_KEY') && route.includes('GROQ_API_KEY') && route.includes('FIREWORKS_API_KEY') && route.includes('DEEPINFRA_API_KEY') && route.includes('TOGETHER_API_KEY') && route.includes('GEMINI_API_KEY') && route.includes('NVIDIA_API_KEY') && route.includes('XAI_API_KEY') && route.includes('CLOUDFLARE_API_KEY') && route.includes('OPENROUTER_API_KEY') && route.includes('POLLINATIONS_API_KEY') && !route.includes('MISTRAL_API_KEY'), 'OpenClaw exposes a broad current provider pool without restoring the retired Mistral route'],
  [route.includes('...providerRuntimeEnv') && route.includes("OPENCLAW_SDK_RETRY_MAX_WAIT_SECONDS: '5'"), 'only configured provider credentials are passed into the OpenClaw sandbox runtime'],
  [route.includes('quantdeus_probe_step_one') && route.includes('quantdeus_probe_step_two') && route.includes('PROBE_DONE') && route.includes('sequential_tool_roundtrip_ok') && route.includes('cachedProbeChatCandidate(candidate, trustedOffice)') && route.includes('const orderedModels = [...healthyRefs]'), 'trusted Office selects only models that pass the required capability probe'],
  [route.includes('Promise.all(probeCandidates.map(async candidate =>') && route.includes('.filter(row => row.probe.ok)') && route.includes('a.candidate.priority - b.candidate.priority') && route.includes('a.probe.latency_ms - b.probe.latency_ms') && route.includes('const fallbackModels = healthyRefs.slice(1)'), 'all failover routes are live-probed in parallel, fail closed, and are ordered by curated route priority with measured latency as tie-breaker'],
  [route.includes('const providerProbeCache = new Map()') && route.includes('PROVIDER_PROBE_OK_TTL_MS = 5 * 60 * 1000') && route.includes('PROVIDER_PROBE_FAIL_TTL_MS = 30 * 1000') && route.includes('cachedProbeChatCandidate(candidate, trustedOffice)') && route.includes("requireTools ? 'tools' : 'text'"), 'provider capability probes are cached briefly by lane/ref/key fingerprint to preserve rate limits without mixing trusted and public health state'],
  [route.includes("const smokePhase = trustedOffice") && route.includes("allow: ['bundle-mcp', 'github__list_branches', 'github__get_file_contents']") && route.includes("allow: ['bundle-mcp', 'playwright__browser_navigate']"), 'live smoke phases expose only bounded read-only GitHub tools or the required Playwright tool'],
  [route.includes("codeMode: false") && route.includes("models: Object.fromEntries(orderedModels.map(ref => [ref, { codeMode: false }]))"), 'OpenClaw Code Mode stays explicitly disabled on compatible-provider trusted MCP routes'],
  [route.includes("tools: trustedOffice ? { ...trustedTools, toolSearch: false } : publicTools"), 'trusted MCP disables automatic Tool Search so bounded GitHub and Playwright schemas are exposed directly'],
  [route.includes('quantdeus-config-') && route.includes('ephemeralFiles = [configPath, promptPath]'), 'request config is isolated and cleaned up'],
  [!route.includes("'--state-dir', statePath"), 'agent exec uses OpenClaw temporary state isolation'],
  [route.includes("'quantdeus-cerebras'") && route.includes("'quantdeus-groq'") && route.includes("'quantdeus-fireworks'") && route.includes("'quantdeus-deepinfra'") && route.includes("'quantdeus-together'") && route.includes("'quantdeus-gemini'") && route.includes("'quantdeus-nvidia'") && route.includes("'quantdeus-xai'") && route.includes("'quantdeus-cloudflare'") && route.includes("'quantdeus-openrouter'") && route.includes("'quantdeus-pollinations'"), 'OpenClaw provider catalog includes keyed high-capacity routes plus a final anonymous emergency route'],
  [route.includes("detail: ok\n          ? 'http_200_exact_ok'") && route.includes("'http_200_but_exact_ok_missing'"), 'no-tools health admission requires both HTTP 200 and an exact OK payload'],
  [route.includes('validated_fallbacks: fallbackModels') && route.includes('openclaw_no_healthy_model_route'), 'selected fallbacks are observable and routing fails closed when no healthy model exists'],
  [route.includes("if (vercelInternal)") && route.includes("[openclaw-internal-fast]") && route.includes("setTimeout(() => controller.abort(), 30000)") && route.includes("mode: 'vercel-internal-fast'"), 'Vercel-internal Telegram chat bypasses sandbox bootstrap after a successful no-tools probe and stays bounded to 30 seconds'],
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

