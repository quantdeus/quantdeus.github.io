const fs = require('fs');
const path = require('path');

const root = process.cwd();
const failures = [];
const checks = [];
function check(ok, target, message) {
  checks.push({ ok:Boolean(ok), target, message });
  if (!ok) failures.push({ target, message });
}
function readJson(p){ return JSON.parse(fs.readFileSync(path.join(root,p),'utf8')); }

const registry = readJson('coordination/agents.json');
const hom = readJson('coordination/homunculi.json');
const doctrine = readJson('coordination/civilization-doctrine.json');
const startupOrg = readJson('coordination/startup-org.json');
const agentCron = readJson('coordination/agent-cron-map.json');
const ids = registry.agents.map(a=>a.id);
const homIds = hom.agents.map(a=>a.id);

check(ids.length === 26, 'coordination/agents.json', 'expected exactly 26 registered agents');
check(new Set(ids).size === ids.length, 'coordination/agents.json', 'agent ids unique');
check(new Set(homIds).size === homIds.length, 'coordination/homunculi.json', 'homunculus ids unique');
check(JSON.stringify([...ids].sort()) === JSON.stringify([...homIds].sort()), 'registries', 'agents.json and homunculi.json contain identical ids');
const cognitionVersion = 'borg-collective-v1';
check(registry.collective_cognition?.version === cognitionVersion && registry.collective_cognition?.inheritance === 'all-26-agents', 'coordination/agents.json', 'Borg collective cognition protocol declared for all 26 agents');
check(hom.collective_cognition?.version === cognitionVersion && hom.collective_cognition?.inheritance === 'all-26-agents', 'coordination/homunculi.json', 'homunculi registry mirrors Borg collective cognition protocol');
check((registry.agents || []).every(a => a.cognitive_protocol === cognitionVersion), 'coordination/agents.json', 'all 26 agents inherit borg-collective-v1');
check((hom.agents || []).every(a => a.cognitive_protocol === cognitionVersion), 'coordination/homunculi.json', 'all 26 homunculi inherit borg-collective-v1');
check(startupOrg.workforce?.ai_agents === 26, 'coordination/startup-org.json', 'startup org declares 26 AI agents');
check(startupOrg.departments?.length === 5, 'coordination/startup-org.json', 'startup org declares 5 departments');
const orgIds = (startupOrg.departments || []).flatMap(d => d.agents || []);
check(orgIds.length === 26 && new Set(orgIds).size === 26, 'coordination/startup-org.json', 'startup org assigns every agent exactly once');
check(JSON.stringify([...orgIds].sort()) === JSON.stringify([...ids].sort()), 'coordination/startup-org.json', 'startup org covers the canonical agent registry');

const cronIds = (agentCron.agents || []).map(a=>a.id);
check(agentCron.schema_version === 1, 'coordination/agent-cron-map.json', 'agent cron map schema version 1');
check(cronIds.length === 26 && new Set(cronIds).size === 26, 'coordination/agent-cron-map.json', 'agent cron map assigns exactly 26 unique agents');
check(JSON.stringify([...cronIds].sort()) === JSON.stringify([...ids].sort()), 'coordination/agent-cron-map.json', 'agent cron map covers the canonical registry');
for (const slot of agentCron.agents || []) {
  check(Boolean(slot.workflow && slot.cadence && Array.isArray(slot.utc_hours) && slot.utc_hours.length && slot.mission), slot.id || 'cron-slot', 'agent cron slot has workflow/cadence/hours/mission');
}
const emhCron = (agentCron.agents || []).find(a=>a.id==='emh');
check(Boolean(emhCron && /AGENTS\.md/.test(emhCron.mission) && /QA Triad/.test(emhCron.mission) && /Static Smoke/.test(emhCron.mission)), 'emh', 'EMH cron mission binds treatment to AGENTS.md and independent QA/Smoke');

const agentsReadme = fs.readFileSync(path.join(root,'AGENTS.md'),'utf8');
check(agentsReadme.includes('### EMH operational treatment loop'), 'AGENTS.md', 'EMH AGENTS.md treatment lane is declared');
check(agentsReadme.includes('QA watches the doctor'), 'AGENTS.md', 'independent QA oversight of EMH treatment is declared');
check(agentsReadme.includes('The treatment PR must change **`AGENTS.md` only**'), 'AGENTS.md', 'EMH treatment document scope is AGENTS.md only');
check(agentsReadme.includes('## Collective cognition — Borg efficiency protocol') && agentsReadme.includes('OBSERVE → DEDUCE → INDUCE → ABDUCE → FALSIFY'), 'AGENTS.md', 'all-agent Borg cognition protocol and reasoning loop are documented');
const cognitiveSitePrompt = fs.readFileSync(path.join(root,'scripts','site-agent-reply.js'),'utf8');
const cognitiveOpenClawClient = fs.readFileSync(path.join(root,'scripts','openclaw-office-client.js'),'utf8');
const cognitiveTelegram = fs.readFileSync(path.join(root,'vercel-dispatcher','api','quantdeus','telegram.js'),'utf8');
check(cognitiveSitePrompt.includes('registry.collective_cognition?.runtime_directive') && cognitiveSitePrompt.includes('Collective cognition:'), 'scripts/site-agent-reply.js', 'website agent prompt consumes canonical collective cognition directive');
check(cognitiveOpenClawClient.includes('agentRegistry.collective_cognition?.runtime_directive') && cognitiveOpenClawClient.includes('Collective cognition:'), 'scripts/openclaw-office-client.js', 'OpenClaw Office consumes canonical collective cognition directive');
check(cognitiveTelegram.includes('data.collective_cognition?.runtime_directive') && cognitiveTelegram.includes('Collective cognition:'), 'vercel-dispatcher/api/quantdeus/telegram.js', 'Telegram homunculus prompt consumes canonical collective cognition directive');

check(
  cognitiveTelegram.includes('quantdeusSnapshot(agentId)') &&
  cognitiveTelegram.includes('CURRENT_QUANTDEUS_REPOSITORY_GROUNDING') &&
  cognitiveTelegram.includes('Never invent operational metrics') &&
  cognitiveTelegram.includes("githubRead('/actions/runs?branch=main&per_page=20')"),
  'vercel-dispatcher/api/quantdeus/telegram.js',
  'all Telegram homunculi receive live read-only QuantDeus commit/Issue/PR/Actions grounding with anti-fabrication contract'
);
check(
  cognitiveSitePrompt.includes("gh('/actions/runs?branch=main&per_page=20')") &&
  cognitiveSitePrompt.includes("gh('/commits/main')") &&
  cognitiveSitePrompt.includes('UNKNOWN / not measured'),
  'scripts/site-agent-reply.js',
  'website agents ground operational reports in current main, Issues, PRs and Actions instead of invented KPIs'
);


for (const department of startupOrg.departments || []) {
  for (const id of department.agents || []) {
    const agent = registry.agents.find(a => a.id === id);
    const h = hom.agents.find(a => a.id === id);
    check(Boolean(agent), id, 'organization member exists in canonical registry');
    if (agent) {
      check(agent.group === department.id, id, 'registry group matches startup organization department id');
      check(agent.department === department.name, id, 'registry department matches startup organization department name');
    }
    if (h) {
      check(h.group === department.id, id, 'homunculi group matches startup organization department id');
      check(h.department === department.name, id, 'homunculi department matches startup organization department name');
    }
  }
}

for (const agent of registry.agents) {
  const src = path.join(root, agent.source || '');
  check(Boolean(agent.id && agent.name && agent.role && agent.source && agent.group), agent.id || 'unknown', 'required metadata present');
  check(Boolean(agent.startup_title && agent.department && agent.kpi), agent.id || 'unknown', 'startup title, department and KPI present');
  check(fs.existsSync(src), agent.id, 'source exists: ' + agent.source);
  const h = hom.agents.find(x=>x.id===agent.id);
  check(Boolean(h), agent.id, 'present in homunculi registry');
  if (h) {
    check(h.source===agent.source && h.group===agent.group, agent.id, 'registry source/group consistent');
    check(h.startup_title===agent.startup_title && h.department===agent.department && h.kpi===agent.kpi, agent.id, 'startup role metadata consistent');
    check(h.command === '/agent ' + agent.id, agent.id, 'agent command canonical');
    check(h.proposal_command === '/propose ' + agent.id, agent.id, 'proposal command canonical');
  }
}

const ledgerSchemaPath = path.join(root,'coordination','ledger','agent-activity-ledger.schema.json');
if (fs.existsSync(ledgerSchemaPath)) {
  const ledgerSchema = JSON.parse(fs.readFileSync(ledgerSchemaPath,'utf8'));
  const ledgerAgentIds = ledgerSchema?.$defs?.event?.properties?.agent_id?.enum || [];
  check(
    JSON.stringify([...ledgerAgentIds].sort()) === JSON.stringify([...ids].sort()),
    'coordination/ledger/agent-activity-ledger.schema.json',
    'ledger agent_id enum matches canonical agent registry'
  );
}

const qaIds = ['qa-syntax','qa-contract','qa-repair'];
for (const id of qaIds) check(ids.includes(id), id, 'QA triad registered');

check(registry.doctrine?.version === doctrine.version, 'coordination/agents.json', 'doctrine version matches canonical doctrine');
check(hom.doctrine?.version === doctrine.version, 'coordination/homunculi.json', 'homunculi doctrine version matches canonical doctrine');
check(registry.doctrine?.inheritance === 'all-agents', 'coordination/agents.json', 'all agents inherit doctrine');

const requiredDoctrineSources = ['thrive-1','thrive-2','venus-project','earth-renovation','gravity-frontiers'];
const doctrineSourceIds = (doctrine.source_streams || []).map(s=>s.id);
const requiredManifestSources = ['neon-horizon-v4','epidemiya-dobra-2y'];
const doctrineManifestIds = (doctrine.manifest_sources || []).map(s=>s.id);
for (const id of requiredDoctrineSources) {
  check(doctrineSourceIds.includes(id), 'coordination/civilization-doctrine.json', 'required doctrine source present: '+id);
  check((registry.doctrine?.source_streams || []).includes(id), 'coordination/agents.json', 'all-agent doctrine inheritance includes source: '+id);
  check((hom.doctrine?.source_streams || []).includes(id), 'coordination/homunculi.json', 'homunculi doctrine inheritance includes source: '+id);
}
for (const id of requiredManifestSources) {
  check(doctrineManifestIds.includes(id), 'coordination/civilization-doctrine.json', 'required manifesto present: '+id);
  check((registry.doctrine?.manifest_sources || []).includes(id), 'coordination/agents.json', 'all-agent inheritance includes manifesto: '+id);
  check((hom.doctrine?.manifest_sources || []).includes(id), 'coordination/homunculi.json', 'homunculi inheritance includes manifesto: '+id);
}
check((doctrine.constitutional_core?.eight_pillars || []).length === 8, 'coordination/civilization-doctrine.json', 'eight Neon Horizon pillars preserved');
check(Boolean(doctrine.constitutional_core?.exit_principle?.rule), 'coordination/civilization-doctrine.json', 'EXIT principle preserved');
check((doctrine.epidemic_of_good?.replication_loop || []).length >= 6, 'coordination/civilization-doctrine.json', 'Epidemic of Good replication loop preserved');
check(Object.keys(doctrine.kpis || {}).length >= 10, 'coordination/civilization-doctrine.json', 'acceleration KPI set preserved');
check((doctrine.acceleration_plan?.phases || []).length === 4, 'coordination/civilization-doctrine.json', 'four six-month phase gates preserved');
check(doctrine.horizon_architecture?.short?.period === '2026-2028', 'coordination/civilization-doctrine.json', 'v4 short horizon 2026-2028 declared');
check(doctrine.horizon_architecture?.middle?.period === '2026-2041', 'coordination/civilization-doctrine.json', 'v4 middle horizon 2026-2041 declared');
check(doctrine.horizon_architecture?.century?.period === '2026-2126', 'coordination/civilization-doctrine.json', 'v4 century compass 2026-2126 declared');
check((doctrine.federation_of_nodes?.interface_v1?.fields || []).includes('EXIT'), 'coordination/civilization-doctrine.json', 'Federation Interface v1 preserves EXIT');
check((doctrine.federation_of_nodes?.interface_v1?.fields || []).includes('Human override'), 'coordination/civilization-doctrine.json', 'Federation Interface v1 preserves human override');
check(Boolean(doctrine.kpis?.Federation_Score), 'coordination/civilization-doctrine.json', 'Federation Score KPI declared');
check(Boolean(doctrine.kpis?.Replication_Success), 'coordination/civilization-doctrine.json', 'Replication Success KPI declared');
check(doctrine.inheritance === 'all-agents', 'coordination/civilization-doctrine.json', 'canonical doctrine applies to all agents');
check(doctrine.adaptive_manifest?.source === 'coordination/manifesto-living.md', 'coordination/civilization-doctrine.json', 'living manifesto adaptive layer declared');
check(doctrine.agent_cron?.registry === 'coordination/agent-cron-map.json', 'coordination/civilization-doctrine.json', 'role cron registry declared');
check(Array.isArray(doctrine.transition_protocol) && doctrine.transition_protocol.length >= 6, 'coordination/civilization-doctrine.json', 'post-scarcity transition protocol declared');
check(doctrine.cron_policy?.required_check === 'node scripts/mission-alignment.js', 'coordination/civilization-doctrine.json', 'cron mission guard declared');

const governance = fs.readFileSync(path.join(root,'scripts/governance-gate.js'),'utf8');
for (const id of ids) check(governance.includes("'agent:"+id+"'"), id, 'governance label declared');

const issuePublisherPath = path.join(root,'scripts','publish-agent-issue.js');
check(fs.existsSync(issuePublisherPath), 'scripts/publish-agent-issue.js', 'deterministic agent Issue publisher exists');
if (fs.existsSync(issuePublisherPath)) {
  const issuePublisher = fs.readFileSync(issuePublisherPath,'utf8');
  check(issuePublisher.includes("method: 'POST'") && issuePublisher.includes("'/repos/' + repo + '/issues'") && issuePublisher.includes("status: 'duplicate'") && issuePublisher.includes('Created Issue failed verification'), 'scripts/publish-agent-issue.js', 'Issue publisher creates, deduplicates and verifies GitHub Issues');
  check(issuePublisher.includes("coord:task") && issuePublisher.includes("coord:ready") && issuePublisher.includes('quantdeus-target-agent:'), 'scripts/publish-agent-issue.js', 'Issue publisher preserves coordination labels and target-agent routing');
  const publisherTest = path.join(root, 'scripts', 'qa', 'publish-agent-issue.test.js');
  const publisherResult = require('child_process').spawnSync(process.execPath, [publisherTest], {
    cwd: root, encoding: 'utf8', timeout: 15000
  });
  check(!publisherResult.error && publisherResult.status === 0, 'scripts/publish-agent-issue.js',
    'Mock publisher contracts: medbay delegation, duplicate reuse, pinned labels and single state' +
    (publisherResult.status === 0 ? '' : ': ' + String(publisherResult.error || publisherResult.stderr || publisherResult.stdout).slice(0, 2000)));
}

const sevenPriorityWorkflow = fs.readFileSync(path.join(root,'.github','workflows','seven-priority-cycle.yml'),'utf8');
check(sevenPriorityWorkflow.includes('unfinished coord:active/coord:ready') && sevenPriorityWorkflow.includes('agent-role-cron.yml') && sevenPriorityWorkflow.includes('to wake that homunculus'), 'seven-priority-cycle.yml', 'Seven prioritizes unfinished work and can wake the owning homunculus');
check(sevenPriorityWorkflow.includes('action=open_issue') && sevenPriorityWorkflow.includes('scripts/publish-agent-issue.js') && sevenPriorityWorkflow.includes('body,labels'), 'seven-priority-cycle.yml', 'Seven new-Issue path is deterministic and receives Issue body/ownership context');

const roleCronWorkflow = fs.readFileSync(path.join(root,'.github','workflows','agent-role-cron.yml'),'utf8');
check(roleCronWorkflow.includes("agent.id==='emh'") && roleCronWorkflow.includes('EMH TREATMENT LANE') && roleCronWorkflow.includes('AGENTS.md only') && roleCronWorkflow.includes('/pulls/') && roleCronWorkflow.includes("names[0] !== 'AGENTS.md'"), 'agent-role-cron.yml', 'EMH treatment cron is runtime-guarded to AGENTS.md-only PRs');
check(roleCronWorkflow.includes("pr.head?.ref !== expectedBranch") && roleCronWorkflow.includes("pr.head?.repo?.full_name !== process.env.GITHUB_REPOSITORY") && roleCronWorkflow.includes("pr.base?.ref !== 'main'"), 'agent-role-cron.yml', 'EMH treatment PR number is bound to the declared canonical branch targeting main');
check(roleCronWorkflow.includes('action=open_issue') && roleCronWorkflow.includes('scripts/publish-agent-issue.js') && roleCronWorkflow.includes('issue_proposal='), 'agent-role-cron.yml', 'role-agent new-Issue proposals use the deterministic publisher instead of relying on an LLM MCP mutation');
check(agentsReadme.includes('Seven of Nine (\`seven-of-nine\`)'), 'AGENTS.md', 'Seven is explicitly named as stress-test authority');
const qaTriadWorkflow = fs.readFileSync(path.join(root,'.github','workflows','qa-triad.yml'),'utf8');
const staticSmokeWorkflow = fs.readFileSync(path.join(root,'.github','workflows','static-smoke.yml'),'utf8');
check(qaTriadWorkflow.includes('pull_request:') && staticSmokeWorkflow.includes('pull_request:'), 'EMH QA oversight', 'QA Triad and Static Smoke independently run on treatment PRs');

const workflowDir = path.join(root,'.github','workflows');
const scheduledMissionWorkflows = new Set(['agent-health-daily.yml','quantdeus-coordinator.yml','quantdeus-pulse.yml','contributor-growth.yml','qa-triad.yml','telegram-bot.yml','quantdeus-hourly-openclaw.yml','qa-self-heal.yml','agent-role-cron.yml','seven-priority-cycle.yml','news-manifest-cycle.yml','growth-site-cycle.yml','openclaw-evolution.yml','qa-failure-radar.yml']);
for (const name of fs.readdirSync(workflowDir).filter(x=>/\.ya?ml$/.test(x))) {
  const text = fs.readFileSync(path.join(workflowDir,name),'utf8');
  const crons = [...text.matchAll(/cron:\s*['"]([^'"]+)['"]/g)].map(m=>m[1]);
  for (const cron of crons) {
    const parts = cron.trim().split(/\s+/);
    check(parts.length===5, name, 'cron has 5 fields: '+cron);
    if (parts.length===5) {
      if (name === 'quantdeus-hourly-openclaw.yml') {
        check(parts[0] === '0' && parts[1] === '*', name, 'OpenClaw swarm runs at the approved hourly cadence: '+cron);
      } else if (name === 'agent-health-daily.yml') {
        check(parts[0] === '19' && parts[1] === '*/2', name, 'crew health uses the approved two-hour cadence: '+cron);
      } else if (name === 'qa-self-heal.yml') {
        const approvedQaSelfHeal =
          (parts[0] === '17' && parts[1] === '*/6') ||
          (parts[0] === '47' && parts[1] === '3-23/6');
        check(approvedQaSelfHeal, name, 'QA self-heal uses the approved staggered six-hour lanes: '+cron);
      } else if (name === 'qa-failure-radar.yml') {
        check(parts[0] === '7' && parts[1] === '*/2', name, 'QA failure radar uses the approved two-hour cadence: '+cron);
      } else if (name === 'agent-role-cron.yml') {
        check(parts[0] === '23' && parts[1] === '0-14', name, 'role cron uses the approved daily hourly window: '+cron);
      } else if (name === 'seven-priority-cycle.yml') {
        check(parts[0] === '11' && parts[1] === '*/2', name, 'Seven priority cycle uses the approved two-hour cadence: '+cron);
      } else if (name === 'news-manifest-cycle.yml') {
        check(parts[0] === '41' && parts[1] === '*/6', name, 'news/manifest cycle uses the approved six-hour cadence: '+cron);
      } else if (name === 'growth-site-cycle.yml') {
        check(parts[0] === '53' && parts[1] === '*/4', name, 'growth/site cycle uses the approved four-hour cadence: '+cron);
      } else {
        check(/^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1]), name, 'scheduled workflow runs no more than once per day: '+cron);
      }
    }
  }
  if (name === 'quantdeus-coordinator.yml') {
    check(/group:\s*quantdeus-coordinator\s/.test(text) && /cancel-in-progress:\s*false/.test(text), name, 'Coordinator command events share a non-cancelling FIFO lane');
    check(text.includes("issue_comment:\n    types: [created]"), name, 'Coordinator receives every new Issue comment for command draining');
    check(/id-token:\s*write/.test(text) && text.includes('/tmp/quantdeus-seven-reasoning.json'), name, 'Seven Hub briefing receives OIDC and preserves inference evidence');
    check(text.indexOf('node scripts/seven-of-nine.js') < text.indexOf('node scripts/coordinator.js'), name, 'Seven of Nine runs before the Swarm Secretary');
    check(text.includes('bridge_fail=0') && text.includes('run_stage emh node scripts/emh.js') && text.includes('run_stage sherlock node scripts/sherlock.js') && text.includes('run_stage tuvok node scripts/tuvok.js') && text.includes('exit "$bridge_fail"'), name, 'Bridge crew stages continue after one role-contract failure while preserving a failing final job status');
  }
  if (scheduledMissionWorkflows.has(name)) {
    check(text.includes('node scripts/mission-alignment.js'), name, 'scheduled workflow enforces shared mission alignment');
  }
}

const qaSelfHealWorkflow = fs.readFileSync(path.join(root,'.github','workflows','qa-self-heal.yml'),'utf8');
check(qaSelfHealWorkflow.includes('trigger_run_id:') && qaSelfHealWorkflow.includes('Verify claimed repair PR exists'), 'qa-self-heal.yml', 'QA self-heal receives failure evidence and verifies a real repair PR');
check(qaSelfHealWorkflow.includes('.conclusion=="success"') && !qaSelfHealWorkflow.includes('.conclusion=="skipped"'), 'qa-self-heal.yml', 'QA self-heal merge requires successful independent QA/Smoke checks');

const qaFailureRadarWorkflow = fs.readFileSync(path.join(root,'.github','workflows','qa-failure-radar.yml'),'utf8');
check(qaFailureRadarWorkflow.includes('qa-self-heal.yml') && qaFailureRadarWorkflow.includes('trigger_run_id') && qaFailureRadarWorkflow.includes('trigger_workflow'), 'qa-failure-radar.yml', 'failure radar passes concrete failed-run evidence to QA self-heal');

const siteReplyWorkflow = fs.readFileSync(path.join(root,'.github','workflows','site-agent-replies.yml'),'utf8');
const siteReplySource = fs.readFileSync(path.join(root,'scripts','site-agent-reply.js'),'utf8');
check(siteReplyWorkflow.includes('QUANTDEUS_ADMIN_GITHUB_USERS'), 'site-agent-replies.yml', 'site reply workflow passes admin allowlist');
check(siteReplySource.includes('trusted: trustedAction') && siteReplySource.includes('isAdminCommentAuthor()'), 'scripts/site-agent-reply.js', 'site repository mutations require owner/admin trusted action routing');

const telegramWorkflow = fs.readFileSync(path.join(root,'.github','workflows','telegram-bot.yml'),'utf8');
const telegramSource = fs.readFileSync(path.join(root,'scripts','telegram-bot.js'),'utf8');
const telegramSetupSource = fs.readFileSync(path.join(root,'scripts','telegram-webhook-setup.js'),'utf8');
const githubOidcPath = path.join(root,'scripts','github-oidc.js');
check(fs.existsSync(githubOidcPath), 'scripts/github-oidc.js', 'shared GitHub OIDC retry helper exists');
if (fs.existsSync(githubOidcPath)) {
  const githubOidcSource = fs.readFileSync(githubOidcPath,'utf8');
  check(
    githubOidcSource.includes('TRANSIENT_OIDC_STATUS') &&
    githubOidcSource.includes('[429, 500, 502, 503, 504]') &&
    githubOidcSource.includes('attempts || 3') &&
    githubOidcSource.includes('recovered after transient failure'),
    'scripts/github-oidc.js',
    'OIDC helper retries only bounded transient HTTP/network failures'
  );
}
check(
  telegramSource.includes("require('./github-oidc')") &&
  telegramSetupSource.includes("require('./github-oidc')") &&
  fs.readFileSync(path.join(root,'scripts','telegram-retry-smoke.js'),'utf8').includes("require('./github-oidc')") &&
  fs.readFileSync(path.join(root,'scripts','openclaw-office-client.js'),'utf8').includes("require('./github-oidc')"),
  'GitHub OIDC consumers',
  'Telegram and OpenClaw Actions paths share the bounded OIDC retry helper'
);
const telegramBridgePath = path.join(root,'vercel-dispatcher','api','quantdeus','telegram.js');
check(!/^\s*schedule\s*:/m.test(telegramWorkflow), 'telegram-bot.yml', 'Telegram ingress is webhook-driven and has no polling cron');
check(telegramWorkflow.includes('telegram_update_b64') && telegramWorkflow.includes('scripts/telegram-webhook-setup.js'), 'telegram-bot.yml', 'Telegram workflow accepts webhook-dispatched updates and can configure the webhook');
check(
  telegramWorkflow.includes("'scripts/telegram-retry-smoke.js'") &&
  telegramWorkflow.includes('Verify Vercel → Actions retry lane') &&
  telegramWorkflow.includes("github.event_name == 'push'") &&
  telegramWorkflow.includes('node scripts/telegram-retry-smoke.js'),
  'telegram-bot.yml',
  'Telegram runtime pushes automatically exercise the deployed Vercel-to-Actions retry lane'
);
check(!telegramSource.includes("getUpdates") && !telegramSource.includes("deleteWebhook"), 'scripts/telegram-bot.js', 'Telegram bot never polls or deletes the production webhook');
check(telegramSource.includes('TELEGRAM_UPDATE_B64'), 'scripts/telegram-bot.js', 'Telegram bot consumes one dispatched webhook update');
const telegramTransientRetries = (telegramSource.match(/retryTransient:\s*true/g) || []).length;
check(telegramTransientRetries === 3, 'scripts/telegram-bot.js', 'only two read-only Telegram chat lanes plus the isolated synthetic smoke enable one transient OpenClaw retry');
const retrySmokeBlock = telegramSource.slice(telegramSource.indexOf('async function runRetrySmoke'), telegramSource.indexOf('function gh(args)'));
check(retrySmokeBlock.includes('retryTransient: true'), 'scripts/telegram-bot.js', 'synthetic retry smoke uses the same bounded transient retry policy');
const adminTaskBlock = telegramSource.slice(telegramSource.indexOf("if (/^\\/task"), telegramSource.indexOf("if (/^\\/agent"));
check(!adminTaskBlock.includes('retryTransient: true'), 'scripts/telegram-bot.js', 'trusted Telegram admin mutation lane never retries automatically');
check(telegramSetupSource.includes('quantdeus-vercel-telegram'), 'scripts/telegram-webhook-setup.js', 'Webhook setup uses dedicated GitHub OIDC audience');
const telegramRetrySmokePath = path.join(root,'scripts','telegram-retry-smoke.js');
check(fs.existsSync(telegramRetrySmokePath), 'scripts/telegram-retry-smoke.js', 'Telegram retry-lane smoke starter exists');
if (fs.existsSync(telegramRetrySmokePath)) {
  const telegramRetrySmoke = fs.readFileSync(telegramRetrySmokePath,'utf8');
  check(telegramRetrySmoke.includes("mode: 'retry_smoke'") && telegramRetrySmoke.includes('quantdeus-vercel-telegram'), 'scripts/telegram-retry-smoke.js', 'Retry smoke starts through GitHub OIDC and never needs a Telegram chat id');
  check(
    telegramRetrySmoke.includes("'redelivery_fallback'") &&
    telegramRetrySmoke.includes("'dispatched'"),
    'scripts/telegram-retry-smoke.js',
    'Retry smoke accepts either immediate Actions dispatch or event-driven Telegram redelivery transport'
  );
}
check(
  telegramSource.includes('update.quantdeus_retry_smoke === true') &&
  telegramSource.includes("telegram('getMe')") &&
  telegramSource.includes("source: 'telegram-retry-smoke'") &&
  telegramSource.includes("mode: 'retry_smoke_complete'") &&
  telegramSource.indexOf('update.quantdeus_retry_smoke === true') < telegramSource.indexOf('await handleMessage(message)'),
  'scripts/telegram-bot.js',
  'Synthetic retry smoke exits before user-visible Telegram send path while checking Bot API and read-only OpenClaw'
);
check(fs.existsSync(telegramBridgePath), 'vercel-dispatcher/api/quantdeus/telegram.js', 'Vercel Telegram webhook bridge exists');
if (fs.existsSync(telegramBridgePath)) {
  const telegramBridge = fs.readFileSync(telegramBridgePath,'utf8');
  check(telegramBridge.includes('x-telegram-bot-api-secret-token') && telegramBridge.includes("TELEGRAM_CIDRS") && telegramBridge.includes("generateText") && telegramBridge.includes("method: 'sendMessage'"), 'vercel-dispatcher/api/quantdeus/telegram.js', 'Telegram webhook verifies secret/IP source and answers directly through the Vercel AI SDK homunculus lane');
  check(
    telegramBridge.includes('needsLiveResearch') &&
    telegramBridge.includes('news.google.com/rss/search') &&
    telegramBridge.includes('api.gdeltproject.org/api/v2/doc/doc') &&
    telegramBridge.includes('parseJsonFeed') &&
    telegramBridge.includes('LIVE_RESEARCH_UNAVAILABLE') &&
    telegramBridge.includes('groundedResearchFallback') &&
    telegramBridge.includes('research_smoke') &&
    telegramBridge.includes('Never invent current events'),
    'vercel-dispatcher/api/quantdeus/telegram.js',
    'Telegram live-news lane requires fresh source grounding and fails closed instead of hallucinating current events'
  );
  check(
    telegramBridge.includes('TELEGRAM_ROLE_OK') &&
    telegramBridge.includes("const llmProbe = roleProbeHealthy ? 'TELEGRAM_LLM_OK' : ''") &&
    !telegramBridge.includes('const llmProbe = await chatCompletion('),
    'vercel-dispatcher/api/quantdeus/telegram.js',
    'Telegram webhook setup uses one role-aware LLM probe to avoid anonymous-provider burst throttling'
  );
  check(
    telegramBridge.includes('async function openClawInternalReply(agentId, requestedAgentId, system, user)') &&
    telegramBridge.includes('await openClawInternalReply(agentId, requestedAgentId, system, groundedQuery)') &&
    telegramBridge.includes('requested_agent_id: requestedAgentId'),
    'vercel-dispatcher/api/quantdeus/telegram.js',
    'Telegram OpenClaw lane passes the requested agent id explicitly instead of relying on an out-of-scope variable'
  );
  check(
    telegramBridge.includes('async function dispatchTelegramRetry(update)') &&
    telegramBridge.includes("actions/workflows/telegram-bot.yml/dispatches") &&
    telegramBridge.includes('telegram_update_b64') &&
    telegramBridge.includes('telegram_update_id') &&
    telegramBridge.includes('[telegram-retry] status=dispatched') &&
    telegramBridge.includes('await homunculusReply(message, update)'),
    'vercel-dispatcher/api/quantdeus/telegram.js',
    'Telegram bridge hands exhausted non-live chat to the existing GitHub Actions retry lane'
  );
  check(
    telegramBridge.includes("retryable.code = 'TELEGRAM_RETRYABLE'") &&
    telegramBridge.includes("error?.code === 'TELEGRAM_RETRYABLE'") &&
    telegramBridge.includes("res.status(503)") &&
    telegramBridge.includes("'telegram_retryable_upstream_failure'") &&
    telegramBridge.includes("[telegram-redelivery] status=retryable") &&
    telegramBridge.includes("res.setHeader('Retry-After', '5')"),
    'vercel-dispatcher/api/quantdeus/telegram.js',
    'When immediate Actions dispatch is unavailable, authenticated Telegram webhook fails with retryable 503 instead of falsely acknowledging a lost update'
  );
  check(
    telegramBridge.includes('async function retrySmokeStart(req, res)') &&
    telegramBridge.includes('async function retrySmokeComplete(req, res)') &&
    telegramBridge.includes('quantdeus_retry_smoke: true') &&
    telegramBridge.includes('[telegram-retry-smoke] phase=dispatch') &&
    telegramBridge.includes("req.body?.mode === 'retry_smoke_complete'"),
    'vercel-dispatcher/api/quantdeus/telegram.js',
    'OIDC-authenticated retry smoke dispatch and evidence callback are implemented without exposing a public bypass'
  );
  check(
    telegramBridge.includes("status=redelivery_fallback") &&
    telegramBridge.includes("status: 'redelivery_fallback'"),
    'vercel-dispatcher/api/quantdeus/telegram.js',
    'Retry smoke reports redelivery fallback as a valid degraded transport when no Vercel GitHub credential exists'
  );
}

const coordinatorSource = fs.readFileSync(path.join(root,'scripts/coordinator.js'),'utf8');
check(coordinatorSource.includes('function drainCommandComments()') && coordinatorSource.includes('quantdeus-secretary-command:') && coordinatorSource.includes("drainCommandComments();"), 'scripts/coordinator.js', 'Secretary drains and receipts pending task commands so cancelled events are recovered');

const activeText = [
  fs.readFileSync(path.join(root,'coordination/agents.json'),'utf8'),
  fs.readFileSync(path.join(root,'coordination/homunculi.json'),'utf8'),
  fs.readFileSync(path.join(root,'coordination/civilization-doctrine.json'),'utf8')
].join('\n');
check(!/microsoft\s+teams/i.test(activeText), 'active QuantDeus registries', 'Microsoft Teams absent');

const report={agent:'qa-contract',timestamp:new Date().toISOString(),agent_count:ids.length,failures,checks};
fs.writeFileSync('/tmp/quantdeus-qa-contract.json', JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if (failures.length) process.exit(1);
