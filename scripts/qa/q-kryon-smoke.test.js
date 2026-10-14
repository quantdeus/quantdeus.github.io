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
  assert.equal(c.workflow,'q-kryon-github-native.yml');
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
  assert.equal(response.dispatcher,'.github/workflows/q-kryon-github-native.yml');
  assert.deepEqual(response.output,role.output);
  assert.ok(response.rules.includes('human override'));
  assert.ok(response.rules.includes('QA review'));
 });
}

test('old OpenClaw role workflow excludes Q/Kryon; GitHub native owns 16/17 UTC',()=>{
 const wf=read('.github/workflows/agent-role-cron.yml');
 assert.ok(wf.includes("cron: '23 0-15 * * *'"));
 assert.ok(wf.includes('INPUT_AGENT_ID'));
 assert.ok(wf.includes('agent-role-cron.yml'));
 assert.ok(wf.includes("due.length > 1"));
 assert.ok(wf.includes("result.runtime!=='openclaw-agent-exec-trusted-tools'"));
 assert.ok(wf.includes('Do not merge your own PR'));
 assert.ok(wf.includes("if (manual === 'q' || manual === 'kryon')"));
 const native=read('.github/workflows/q-kryon-github-native.yml');
 assert.ok(native.includes("cron: '23 16 * * *'"));
 assert.ok(native.includes("cron: '23 17 * * *'"));
 assert.ok(native.includes('node scripts/q-kryon-github-native.js'));
 assert.ok(native.includes('node scripts/mission-alignment.js'));
 assert.ok(native.includes('contents: read'));
 assert.ok(native.includes('issues: read'));
 assert.ok(!native.includes('OPENCLAW_VERCEL_URL'));
 assert.ok(!native.includes('id-token: write'));
});

test('GitHub governance and Telegram carry both canonical agent commands',()=>{
 const gov=read('scripts/governance-gate.js');
 const tg=read('vercel-dispatcher/api/quantdeus/telegram.js');
 for(const id of ['q','kryon']) assert.ok(gov.includes("'agent:"+id+"'"));
 assert.ok(tg.includes('agents.length < 29'));
 const tgrbac=read('scripts/telegram-rbac-contract.js');
 assert.ok(tgrbac.includes('29 agents'));
});

test('Q and Kryon create traceable issue-based analyses without model or server calls',()=>{
 const {buildReport}=require('../q-kryon-github-native.js');
 const issues=[
  {state:'open',number:42,title:'API outage error',html_url:'https://github.com/quantdeus/quantdeus.github.io/issues/42',labels:[{name:'priority'}],assignees:[]},
  {state:'open',number:43,title:'Community contributor onboarding',html_url:'https://github.com/quantdeus/quantdeus.github.io/issues/43',labels:[{name:'community'}],assignees:[{login:'volunteer'}]},
  {state:'open',number:44,title:'Normal issue',html_url:'https://github.com/quantdeus/quantdeus.github.io/issues/44',labels:[],assignees:[]}
 ];
 const q=buildReport('q',issues,[]);
 const kryon=buildReport('kryon',issues,[]);
 assert.equal(q.issue_number,42);
 assert.equal(kryon.issue_number,43);
 for(const result of [q,kryon]){
   assert.match(result.markdown,/GitHub-native evidence scan/);
   assert.match(result.markdown,/not executed/);
   assert.match(result.markdown,/Changes performed: \*\*none\*\*/);
 }
});

console.log('Q_KRYON_SMOKE_PASS: native GitHub evidence logic tested; no LLM execution asserted.');
