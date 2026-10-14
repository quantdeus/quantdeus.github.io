#!/usr/bin/env node
'use strict';
/* Q/Kryon executable smoke: source CLIs, canonical registration,
 * scheduling, routing and governance. Does NOT claim an LLM/Sandbox run. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');
const json = p => JSON.parse(read(p));
const agents = json('coordination/agents.json').agents;
const hom = json('coordination/homunculi.json').agents;
const org = json('coordination/startup-org.json');
const cron = json('coordination/agent-cron-map.json').agents;
const hermes = json('coordination/hermes-office.json');
const roles = [
 {id:'q',script:'scripts/q.js',persona:'coordination/q-persona.md',hour:16,
  output:['observed_facts','untested_premise','three_scenarios','risk_and_stop_condition','next_reversible_test']},
 {id:'kryon',script:'scripts/kryon.js',persona:'coordination/kryon-persona.md',hour:17,
  output:['shared_purpose','stakeholder_positions','two_noncoercive_options','consent_and_exit','one_measured_next_step']}
];

test('Canonical 29-agent fleet has no duplicated IDs',()=>{
 assert.equal(agents.length,29);
 assert.equal(new Set(agents.map(a=>a.id)).size,29);
 assert.equal(hom.length,29);
 assert.equal(new Set(hom.map(a=>a.id)).size,29);
 assert.equal(hermes.canonical_agent_count,29);
});

for (const role of roles) {
 test(role.id+' correctly registered, routed and scheduled',()=>{
  const a=agents.find(a=>a.id===role.id);
  const h=hom.find(a=>a.id===role.id);
  const c=cron.find(a=>a.id===role.id);
  assert.ok(a&&h&&c,role.id+' missing entry');
  assert.equal(a.source,role.script);
  assert.equal(h.source,role.script);
  assert.equal(a.persona,role.persona);
  assert.equal(h.command,'/agent '+role.id);
  assert.equal(h.proposal_command,'/propose '+role.id);
  assert.equal(c.workflow,'agent-role-cron.yml');
  assert.deepEqual(c.utc_hours,[role.hour]);
  assert.equal(c.operational_status,'active');
  assert.equal(agents.filter(a=>a.id===role.id).length,1);
  assert.equal(cron.filter(c=>c.id===role.id).length,1);
  assert.equal(org.departments.flatMap(d=>d.agents).filter(id=>id===role.id).length,1);
  assert.ok(read(role.persona).length>250);
  assert.match(read(role.persona),/QA|Human Override|human approval/i);
 });
 test(role.id+' executable CLI produces correct bounded JSON brief',()=>{
  const longInput='x'.repeat(4100);
  const out=execFileSync(process.execPath,[path.join(root,role.script),longInput],
   {cwd:root,encoding:'utf8',timeout:4000});
  const response=JSON.parse(out);
  assert.equal(response.agent_id,role.id);
  assert.equal(response.profile,role.id);
  assert.equal(response.task.length,4000);
  assert.equal(response.dispatcher,'.github/workflows/agent-role-cron.yml');
  assert.deepEqual(response.output,role.output);
  assert.ok(response.rules.includes('human override'));
  assert.ok(response.rules.includes('QA review'));
 });
}

test('role workflow reserves independent 16/17 UTC slots and strict execution gates',()=>{
 const wf=read('.github/workflows/agent-role-cron.yml');
 assert.ok(wf.includes("cron: '23 0-17 * * *'"));
 assert.ok(wf.includes('INPUT_AGENT_ID'));
 assert.ok(wf.includes('agent-role-cron.yml'));
 assert.ok(wf.includes("due.length > 1"));
 assert.ok(wf.includes("result.runtime!=='openclaw-agent-exec-trusted-tools'"));
 assert.ok(wf.includes('Do not merge your own PR'));
});

test('GitHub governance and Telegram carry both canonical agent commands',()=>{
 const gov=read('scripts/governance-gate.js');
 const tg=read('vercel-dispatcher/api/quantdeus/telegram.js');
 for(const id of ['q','kryon']) assert.ok(gov.includes("'agent:"+id+"'"));
 assert.ok(tg.includes('agents.length < 29'));
 const tgrbac=read('scripts/telegram-rbac-contract.js');
 assert.ok(tgrbac.includes('29 agents'));
});

console.log('Q_KRYON_SMOKE_PASS: static/executable contracts only; LLM runtime needs separate live execution.');
