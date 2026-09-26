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

check(ids.length === 22, 'coordination/agents.json', 'ожидается ровно 22 зарегистрированных агента');
check(new Set(ids).size === ids.length, 'coordination/agents.json', 'ID агентов уникальны');
check(new Set(homIds).size === homIds.length, 'coordination/homunculi.json', 'ID гомункулов уникальны');
check(JSON.stringify([...ids].sort()) === JSON.stringify([...homIds].sort()), 'registries', 'agents.json и homunculi.json содержат одинаковые ID');
check(startupOrg.workforce?.ai_agents === 22, 'coordination/startup-org.json', 'оргструктура объявляет 22 ИИ-агента');
check(startupOrg.departments?.length === 5, 'coordination/startup-org.json', 'оргструктура объявляет 5 отделов');
const orgIds = (startupOrg.departments || []).flatMap(d => d.agents || []);
check(orgIds.length === 22 && new Set(orgIds).size === 22, 'coordination/startup-org.json', 'оргструктура назначает каждого агента ровно один раз');
check(JSON.stringify([...orgIds].sort()) === JSON.stringify([...ids].sort()), 'coordination/startup-org.json', 'оргструктура покрывает канонический реестр агентов');

for (const agent of registry.agents) {
  const src = path.join(root, agent.source || '');
  check(Boolean(agent.id && agent.name && agent.role && agent.source && agent.group), agent.id || 'unknown', 'обязательные метаданные присутствуют');
  check(Boolean(agent.startup_title && agent.department && agent.kpi), agent.id || 'unknown', 'стартап-роль, отдел и KPI присутствуют');
  check(fs.existsSync(src), agent.id, 'исходный файл существует: ' + agent.source);
  const h = hom.agents.find(x=>x.id===agent.id);
  check(Boolean(h), agent.id, 'присутствует в реестре гомункулов');
  if (h) {
    check(h.source===agent.source && h.group===agent.group, agent.id, 'source/group согласованы между реестрами');
    check(h.startup_title===agent.startup_title && h.department===agent.department && h.kpi===agent.kpi, agent.id, 'метаданные стартап-роли согласованы');
    check(h.command === '/agent ' + agent.id, agent.id, 'команда агента канонична');
    check(h.proposal_command === '/propose ' + agent.id, agent.id, 'команда предложения канонична');
  }
}

const qaIds = ['qa-syntax','qa-contract','qa-repair'];
for (const id of qaIds) check(ids.includes(id), id, 'QA-триада зарегистрирована');

check(registry.doctrine?.version === doctrine.version, 'coordination/agents.json', 'версия доктрины совпадает с канонической');
check(hom.doctrine?.version === doctrine.version, 'coordination/homunculi.json', 'homunculi версия доктрины совпадает с канонической');
check(registry.doctrine?.inheritance === 'all-agents', 'coordination/agents.json', 'все агенты наследуют доктрину');

const governance = fs.readFileSync(path.join(root,'scripts/governance-gate.js'),'utf8');
for (const id of ids) check(governance.includes("'agent:"+id+"'"), id, 'метка управления объявлена');

const workflowDir = path.join(root,'.github','workflows');
for (const name of fs.readdirSync(workflowDir).filter(x=>/\.ya?ml$/.test(x))) {
  const text = fs.readFileSync(path.join(workflowDir,name),'utf8');
  const crons = [...text.matchAll(/cron:\s*['"]([^'"]+)['"]/g)].map(m=>m[1]);
  for (const cron of crons) {
    const parts = cron.trim().split(/\s+/);
    check(parts.length===5, name, 'Cron содержит 5 полей: '+cron);
    if (parts.length===5) {
      check(/^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1]), name, 'плановый workflow запускается не чаще раза в сутки: '+cron);
    }
  }
}

const activeText = [
  fs.readFileSync(path.join(root,'coordination/agents.json'),'utf8'),
  fs.readFileSync(path.join(root,'coordination/homunculi.json'),'utf8'),
  fs.readFileSync(path.join(root,'coordination/civilization-doctrine.json'),'utf8')
].join('\n');
check(!/microsoft\s+teams/i.test(activeText), 'active QuantDeus registries', 'Microsoft Teams отсутствует');

const report={agent:'qa-contract',timestamp:new Date().toISOString(),agent_count:ids.length,failures,checks};
fs.writeFileSync('/tmp/quantdeus-qa-contract.json', JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if (failures.length) process.exit(1);
