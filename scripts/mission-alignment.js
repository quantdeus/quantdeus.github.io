const fs = require('fs');
const path = require('path');

const root = process.cwd();
const doctrine = JSON.parse(fs.readFileSync(path.join(root,'coordination','civilization-doctrine.json'),'utf8'));
const agents = JSON.parse(fs.readFileSync(path.join(root,'coordination','agents.json'),'utf8'));
const homunculi = JSON.parse(fs.readFileSync(path.join(root,'coordination','homunculi.json'),'utf8'));
const cronContext = fs.readFileSync(path.join(root,'coordination','cron-context.md'),'utf8');

const requiredSources = ['thrive-1','thrive-2','venus-project','earth-renovation','gravity-frontiers'];
const requiredManifests = ['neon-horizon-v3','epidemiya-dobra-2y'];
const requiredPrinciples = [
  'resource-census-before-abundance-claims',
  'needs-to-resources-matching',
  'evidence-before-narrative',
  'voluntary-decentralized-cooperation',
  'prototype-before-scale',
  'space-capability-must-also-create-earthside-value'
];
const scheduledWorkflows = ['agent-health-daily.yml','quantdeus-coordinator.yml','quantdeus-pulse.yml','contributor-growth.yml','qa-triad.yml','telegram-bot.yml','quantdeus-hourly-openclaw.yml'];

const failures = [];
const checks = [];
function check(ok,target,message){
  checks.push({ok:Boolean(ok),target,message});
  if(!ok) failures.push({target,message});
}

check(doctrine.schema_version===1,'doctrine','schema version 1');
check(doctrine.inheritance==='all-agents','doctrine','applies to all agents');
const sourceIds=(doctrine.source_streams||[]).map(s=>s.id);
for(const id of requiredSources) check(sourceIds.includes(id),'doctrine','source stream present: '+id);
const manifestIds=(doctrine.manifest_sources||[]).map(s=>s.id);
for(const id of requiredManifests) check(manifestIds.includes(id),'doctrine','canonical manifesto present: '+id);
for(const p of requiredPrinciples) check((doctrine.principles||[]).includes(p),'doctrine','principle present: '+p);
check(Array.isArray(doctrine.transition_protocol)&&doctrine.transition_protocol.length>=6,'doctrine','transition protocol is operational');
check((doctrine.constitutional_core?.eight_pillars||[]).length===8,'doctrine','eight constitutional pillars preserved');
check(Boolean(doctrine.constitutional_core?.exit_principle?.rule),'doctrine','EXIT principle preserved');
check((doctrine.epidemic_of_good?.replication_loop||[]).length>=6,'doctrine','Epidemic of Good replication loop declared');
check(Object.keys(doctrine.kpis||{}).length>=10,'doctrine','acceleration KPI set declared');
check((doctrine.acceleration_plan?.phases||[]).length===4,'doctrine','four acceleration phase gates declared');
check((doctrine.future_fund?.instruments||[]).length>=4,'doctrine','Future Fund instruments declared');
check(Boolean(doctrine.cultural_layer?.aesthetics?.synthwave),'doctrine','Synthwave cultural layer declared');
check(Boolean(doctrine.cultural_layer?.aesthetics?.frutiger_aero),'doctrine','Frutiger Aero cultural layer declared');
check(doctrine.cultural_layer?.status==='cultural-and-design-layer-not-evidence-source','doctrine','culture cannot substitute for evidence');
check(doctrine.cron_policy?.required_check==='node scripts/mission-alignment.js','doctrine','cron guard points to mission alignment');

for(const [name,registry] of [['agents',agents],['homunculi',homunculi]]){
  check(registry.doctrine?.version===doctrine.version,name,'inherits canonical doctrine version');
  check(registry.doctrine?.inheritance==='all-agents',name,'inheritance is all-agents');
  for(const id of requiredSources) check((registry.doctrine?.source_streams||[]).includes(id),name,'inherits source stream: '+id);
  for(const id of requiredManifests) check((registry.doctrine?.manifest_sources||[]).includes(id),name,'inherits manifesto: '+id);
}

for(const name of scheduledWorkflows){
  const file=path.join(root,'.github','workflows',name);
  check(fs.existsSync(file),name,'scheduled workflow exists');
  if(!fs.existsSync(file)) continue;
  const text=fs.readFileSync(file,'utf8');
  check(/schedule:\s*[\s\S]*cron:/m.test(text),name,'has cron schedule');
  check(text.includes('node scripts/mission-alignment.js'),name,'runs shared mission guard');
}

check(cronContext.includes('canonical_repo: `quantdeus/quantdeus.github.io`'),'cron-context','canonical repository current');
check(cronContext.includes('doctrine_version: `'+doctrine.version+'`'),'cron-context','cron context doctrine version current');
check(cronContext.includes('telegram_transport: `GitHub Actions → Telegram Bot API`'),'cron-context','GitHub-native Telegram transport recorded');
check(cronContext.includes('Манифест Неонового Горизонта'),'cron-context','Neon Horizon manifest recorded');
check(cronContext.includes('Эпидемия Добра'),'cron-context','Epidemic of Good recorded');

const report={timestamp:new Date().toISOString(),doctrine_version:doctrine.version,agent_count:(agents.agents||[]).length,source_streams:sourceIds,manifest_sources:manifestIds,scheduled_workflows:scheduledWorkflows,failures,checks};
fs.writeFileSync('/tmp/quantdeus-mission-alignment.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if(failures.length) process.exit(1);
