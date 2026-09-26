const fs = require('fs');
const path = require('path');

const root = process.cwd();
const doctrine = JSON.parse(fs.readFileSync(path.join(root,'coordination','civilization-doctrine.json'),'utf8'));
const agents = JSON.parse(fs.readFileSync(path.join(root,'coordination','agents.json'),'utf8'));
const homunculi = JSON.parse(fs.readFileSync(path.join(root,'coordination','homunculi.json'),'utf8'));
const cronContext = fs.readFileSync(path.join(root,'coordination','cron-context.md'),'utf8');

const requiredSources = ['thrive-1','thrive-2','venus-project','earth-renovation','gravity-frontiers'];
const requiredPrinciples = [
  'resource-census-before-abundance-claims',
  'needs-to-resources-matching',
  'evidence-before-narrative',
  'voluntary-decentralized-cooperation',
  'prototype-before-scale',
  'space-capability-must-also-create-earthside-value'
];
const scheduledWorkflows = ['agent-health-daily.yml','quantdeus-coordinator.yml','quantdeus-pulse.yml','qa-triad.yml'];

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
for(const p of requiredPrinciples) check((doctrine.principles||[]).includes(p),'doctrine','principle present: '+p);
check(Array.isArray(doctrine.transition_protocol)&&doctrine.transition_protocol.length>=6,'doctrine','transition protocol is operational');
check(doctrine.cron_policy?.required_check==='node scripts/mission-alignment.js','doctrine','cron guard points to mission alignment');

for(const [name,registry] of [['agents',agents],['homunculi',homunculi]]){
  check(registry.doctrine?.version===doctrine.version,name,'inherits canonical doctrine version');
  check(registry.doctrine?.inheritance==='all-agents',name,'inheritance is all-agents');
  for(const id of requiredSources) check((registry.doctrine?.source_streams||[]).includes(id),name,'inherits source stream: '+id);
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
check(cronContext.includes('QuantDeus 2-Step GPT Bridge'),'cron-context','Zapier bridge recorded');

const report={timestamp:new Date().toISOString(),doctrine_version:doctrine.version,agent_count:(agents.agents||[]).length,source_streams:sourceIds,scheduled_workflows:scheduledWorkflows,failures,checks};
fs.writeFileSync('/tmp/quantdeus-mission-alignment.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if(failures.length) process.exit(1);
