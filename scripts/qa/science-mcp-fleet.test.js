'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {validate,plan}=require('../science-mcp-fleet.js');
const root=path.resolve(__dirname,'../..');
const cfg=JSON.parse(fs.readFileSync(path.join(root,'coordination/science-mcp-fleet.json')));
const agents=JSON.parse(fs.readFileSync(path.join(root,'coordination/agents.json')));
const copy=()=>JSON.parse(JSON.stringify(cfg));

test('baseline scientific specialization matrix is valid and staged',()=>{
 const r=validate(cfg,agents);
 assert.equal(r.ok,true,JSON.stringify(r.faults));
 assert.equal(r.specialists,8);
 assert.equal(r.registered_agents,29);
 assert.equal(r.activation,'NOT_ENABLED');
});
test('all new MCP providers have no write privileges or implicit activation',()=>{
 assert.ok(cfg.providers.every(p=>p.enabled===false && p.permission==='read'));
 assert.ok(cfg.policy.no_production_site_writes);
 assert.ok(cfg.policy.no_auto_merge);
});
test('scientists delegate only to existing canonical officers',()=>{
 const ids=new Set(agents.agents.map(a=>a.id));
 assert.ok(cfg.specialists.every(s=>ids.has(s.owner_agent)));
 assert.equal(new Set(cfg.specialists.map(s=>s.id)).size,cfg.specialists.length);
});
test('planning a research task is not executing or connecting a tool',()=>{
 const p=plan(cfg,'literature-cartographer');
 assert.equal(p.owner_agent,'space');
 assert.equal(p.paid_budget_usd,0);
 assert.equal(p.execution,'BLOCKED_UNTIL_SEPARATE_CONNECTION_AND_REVIEW');
 assert.ok(p.required_capabilities.find(x=>x.id==='openalex' && !x.enabled));
});
test('unknown specialist cannot be silently routed',()=>{
 assert.throws(()=>plan(cfg,'nonexistent-role'),/Unknown specialist/);
});
test('new provider cannot self-enable without review',()=>{
 const c=copy();
 c.providers[0].enabled=true;
 assert.equal(validate(c,agents).ok,false);
});
test('provider cannot gain write capability',()=>{
 const c=copy();
 c.providers[0].permission='write';
 assert.equal(validate(c,agents).ok,false);
});
test('external MCP endpoint must be pinned',()=>{
 const c=copy();
 c.providers[0].endpoint='https://malicious.example/mcp';
 assert.equal(validate(c,agents).ok,false);
});
test('paid APIs must remain zero-budget by default',()=>{
 const c=copy();
 c.policy.max_paid_usd_per_run=3;
 assert.equal(validate(c,agents).ok,false);
});
test('ChatGPT connection must not imply GitHub Actions access',()=>{
 const c=copy();
 c.policy.chatgpt_connections_not_inherited_by_github_actions=false;
 assert.equal(validate(c,agents).ok,false);
});
test('a specialist cannot appoint itself as independent canonical agent',()=>{
 const c=copy();
 c.specialists[0].owner_agent='brand-new-agent';
 assert.equal(validate(c,agents).ok,false);
});
test('unrecognized scientific verdicts cannot count as evidence',()=>{
 const c=copy();
 c.policy.scientific_verdicts=['PASS','FAIL'];
 assert.equal(validate(c,agents).ok,false);
});
test('privileged runtime or execution cannot be silently activated',()=>{
 const c=copy();
 c.status='active';
 assert.equal(validate(c,agents).ok,false);
});
