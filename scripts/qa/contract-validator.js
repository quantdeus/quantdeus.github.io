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
const requiredManifestSources = ['neon-horizon-v3','epidemiya-dobra-2y'];
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
check(doctrine.inheritance === 'all-agents', 'coordination/civilization-doctrine.json', 'canonical doctrine applies to all agents');
check(doctrine.adaptive_manifest?.source === 'coordination/manifesto-living.md', 'coordination/civilization-doctrine.json', 'living manifesto adaptive layer declared');
check(doctrine.agent_cron?.registry === 'coordination/agent-cron-map.json', 'coordination/civilization-doctrine.json', 'role cron registry declared');
check(Array.isArray(doctrine.transition_protocol) && doctrine.transition_protocol.length >= 6, 'coordination/civilization-doctrine.json', 'post-scarcity transition protocol declared');
check(doctrine.cron_policy?.required_check === 'node scripts/mission-alignment.js', 'coordination/civilization-doctrine.json', 'cron mission guard declared');

const governance = fs.readFileSync(path.join(root,'scripts/governance-gate.js'),'utf8');
for (const id of ids) check(governance.includes("'agent:"+id+"'"), id, 'governance label declared');

const workflowDir = path.join(root,'.github','workflows');
const scheduledMissionWorkflows = new Set(['agent-health-daily.yml','quantdeus-coordinator.yml','quantdeus-pulse.yml','contributor-growth.yml','qa-triad.yml','telegram-bot.yml','quantdeus-hourly-openclaw.yml','qa-self-heal.yml','agent-role-cron.yml','seven-priority-cycle.yml','news-manifest-cycle.yml','growth-site-cycle.yml','openclaw-evolution.yml']);
const frequentPollingWorkflows = new Set(['telegram-bot.yml']);
for (const name of fs.readdirSync(workflowDir).filter(x=>/\.ya?ml$/.test(x))) {
  const text = fs.readFileSync(path.join(workflowDir,name),'utf8');
  const crons = [...text.matchAll(/cron:\s*['"]([^'"]+)['"]/g)].map(m=>m[1]);
  for (const cron of crons) {
    const parts = cron.trim().split(/\s+/);
    check(parts.length===5, name, 'cron has 5 fields: '+cron);
    if (parts.length===5) {
      if (frequentPollingWorkflows.has(name)) {
        check(parts[0] === '*/5' && parts[1] === '*', name, 'Telegram polling workflow runs at the approved 5-minute cadence: '+cron);
      } else if (name === 'quantdeus-hourly-openclaw.yml') {
        check(parts[0] === '0' && parts[1] === '*', name, 'OpenClaw swarm runs at the approved hourly cadence: '+cron);
      } else if (name === 'qa-self-heal.yml') {
        const approvedQaSelfHeal =
          (parts[0] === '17' && parts[1] === '*/6') ||
          (parts[0] === '47' && parts[1] === '3-23/6');
        check(approvedQaSelfHeal, name, 'QA self-heal uses the approved staggered six-hour lanes: '+cron);
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
  if (name === 'hermes-office-cron.yml') {
    check(!/^\s*schedule\s*:/m.test(text), name, 'legacy Hermes fleet pulse has no automatic schedule');
    check(/^\s*workflow_dispatch\s*:/m.test(text), name, 'legacy Hermes fleet pulse remains manual-only');
  }
  if (name === 'quantdeus-coordinator.yml') {
    check(/group:\s*quantdeus-coordinator\s/.test(text) && /cancel-in-progress:\s*false/.test(text), name, 'Secretary command events share a non-cancelling FIFO lane');
    check(text.includes("issue_comment:\n    types: [created]"), name, 'Secretary receives every new Issue comment for command draining');
  }
  if (scheduledMissionWorkflows.has(name)) {
    check(text.includes('node scripts/mission-alignment.js'), name, 'scheduled workflow enforces shared mission alignment');
  }
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
