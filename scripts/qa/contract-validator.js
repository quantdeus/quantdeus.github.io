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
const ids = registry.agents.map(a=>a.id);
const homIds = hom.agents.map(a=>a.id);

check(ids.length === 22, 'coordination/agents.json', 'expected exactly 22 registered agents');
check(new Set(ids).size === ids.length, 'coordination/agents.json', 'agent ids unique');
check(new Set(homIds).size === homIds.length, 'coordination/homunculi.json', 'homunculus ids unique');
check(JSON.stringify([...ids].sort()) === JSON.stringify([...homIds].sort()), 'registries', 'agents.json and homunculi.json contain identical ids');
check(startupOrg.workforce?.ai_agents === 22, 'coordination/startup-org.json', 'startup org declares 22 AI agents');
check(startupOrg.departments?.length === 5, 'coordination/startup-org.json', 'startup org declares 5 departments');
const orgIds = (startupOrg.departments || []).flatMap(d => d.agents || []);
check(orgIds.length === 22 && new Set(orgIds).size === 22, 'coordination/startup-org.json', 'startup org assigns every agent exactly once');
check(JSON.stringify([...orgIds].sort()) === JSON.stringify([...ids].sort()), 'coordination/startup-org.json', 'startup org covers the canonical agent registry');

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

const qaIds = ['qa-syntax','qa-contract','qa-repair'];
for (const id of qaIds) check(ids.includes(id), id, 'QA triad registered');

check(registry.doctrine?.version === doctrine.version, 'coordination/agents.json', 'doctrine version matches canonical doctrine');
check(hom.doctrine?.version === doctrine.version, 'coordination/homunculi.json', 'homunculi doctrine version matches canonical doctrine');
check(registry.doctrine?.inheritance === 'all-agents', 'coordination/agents.json', 'all agents inherit doctrine');

const requiredDoctrineSources = ['thrive-1','thrive-2','venus-project','earth-renovation','gravity-frontiers'];
const doctrineSourceIds = (doctrine.source_streams || []).map(s=>s.id);
for (const id of requiredDoctrineSources) {
  check(doctrineSourceIds.includes(id), 'coordination/civilization-doctrine.json', 'required doctrine source present: '+id);
  check((registry.doctrine?.source_streams || []).includes(id), 'coordination/agents.json', 'all-agent doctrine inheritance includes source: '+id);
  check((hom.doctrine?.source_streams || []).includes(id), 'coordination/homunculi.json', 'homunculi doctrine inheritance includes source: '+id);
}
check(doctrine.inheritance === 'all-agents', 'coordination/civilization-doctrine.json', 'canonical doctrine applies to all agents');
check(Array.isArray(doctrine.transition_protocol) && doctrine.transition_protocol.length >= 6, 'coordination/civilization-doctrine.json', 'post-scarcity transition protocol declared');
check(doctrine.cron_policy?.required_check === 'node scripts/mission-alignment.js', 'coordination/civilization-doctrine.json', 'cron mission guard declared');

const governance = fs.readFileSync(path.join(root,'scripts/governance-gate.js'),'utf8');
for (const id of ids) check(governance.includes("'agent:"+id+"'"), id, 'governance label declared');

const workflowDir = path.join(root,'.github','workflows');
const scheduledMissionWorkflows = new Set(['agent-health-daily.yml','quantdeus-coordinator.yml','quantdeus-pulse.yml','qa-triad.yml']);
for (const name of fs.readdirSync(workflowDir).filter(x=>/\.ya?ml$/.test(x))) {
  const text = fs.readFileSync(path.join(workflowDir,name),'utf8');
  const crons = [...text.matchAll(/cron:\s*['"]([^'"]+)['"]/g)].map(m=>m[1]);
  for (const cron of crons) {
    const parts = cron.trim().split(/\s+/);
    check(parts.length===5, name, 'cron has 5 fields: '+cron);
    if (parts.length===5) {
      check(/^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1]), name, 'scheduled workflow runs no more than once per day: '+cron);
    }
  }
  if (scheduledMissionWorkflows.has(name)) {
    check(text.includes('node scripts/mission-alignment.js'), name, 'scheduled workflow enforces shared mission alignment');
  }
}

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
