'use strict';
const {test}=require('node:test'), assert=require('node:assert/strict');
const {turnBudget,issueContext,digest,isEmhComment,skipDialogue}=require('../dialogue-state');
const {reasonRole}=require('../openclaw-role-dialogue');
const {parseDecision}=require('../seven-reasoning');
const decision={summary:'Observed delay; provider and contract failures are alternatives.',findings:['No completed artifact observed'],next_step:'Verify one bounded run'};
const valid={text:JSON.stringify(decision),runtime:'openclaw-agent-exec-no-tools',model:'model-a',assistantTurns:1};
const args={profile:'sherlock',role:'Science Officer',context:{issue:{number:1}},protocol:'Use facts',repository:'quantdeus/quantdeus.github.io'};
test('four serial role turns stay inside shared four-minute inference budget',()=>{
  const env={QUANTDEUS_DIALOGUE_DEADLINE_MS:'241000'}; let now=1000;
  for(const requested of [75000,60000,60000,60000]) {
    const b=turnBudget(requested,true,env,now); assert.equal(b.retryTransient,false); now+=b.timeoutMs;
  }
  assert.equal(now,241000); assert.equal(turnBudget(60000,false,env,now).timeoutMs,0);
});
test('Sherlock and Tuvok digest ignores own timestamp update and label ordering',()=>{
  const issue={number:7,title:'Investigate',body:'Evidence',labels:['coord:task','agent:sherlock'],updatedAt:'now'};
  assert.equal(digest(issueContext(issue)),digest(issueContext({...issue,updatedAt:'later',labels:[...issue.labels].reverse()})));
  assert.notEqual(digest(issueContext(issue)),digest(issueContext({...issue,body:'New evidence'})));
});
test('EMH excludes both legacy and new self comments from pressure inputs',()=>{
  for(const body of ['🩺 **EMH — OpenClaw Swarm Health Officer**\nDEGRADED','old <!-- qd-emh-digest:abc -->','old <!-- qd-emh-health:abc -->']) assert.equal(isEmhComment({body}),true);
  assert.equal(isEmhComment({body:'Actual provider incident from QA'}),false);
});
test('dedupe uses latest role output and allows scheduled degraded recovery only',()=>{
  const m='<!-- qd-sherlock-digest:a -->';
  const comments=[{body:m+' Runtime status: **DEGRADED**'}];
  assert.equal(skipDialogue(comments,m,'issue_comment'),true);
  assert.equal(skipDialogue(comments,m,'schedule'),false);
  const previousForce=process.env.QUANTDEUS_DIALOGUE_FORCE_RETRY;
  process.env.QUANTDEUS_DIALOGUE_FORCE_RETRY='1';
  assert.equal(skipDialogue(comments,m),false);
  if(previousForce===undefined) delete process.env.QUANTDEUS_DIALOGUE_FORCE_RETRY;
  else process.env.QUANTDEUS_DIALOGUE_FORCE_RETRY=previousForce;
  assert.equal(skipDialogue([...comments,{body:'<!-- qd-sherlock-digest:b -->'}],m,'issue_comment'),false);
});
test('line protocols survive quotes and avoid JSON escaping failures',async()=>{
  const line={...valid,text:'SUMMARY: Evidence includes "quoted" terms without JSON escaping.\nFINDING: One bounded fact remains testable.\nNEXT_STEP: Run one explicit retry.'};
  const result=await reasonRole({...args,client:{configured:()=>true,isTransientError:()=>false,ask:async()=>line}});
  assert.equal(result.status,'LLM');
  assert.match(result.summary,/quoted/);
  const seven=parseDecision('ANALYSIS: Compare "A" and "B" using observed fields.\nDIRECTIVE: Prioritize the bounded blocker.\nACTION: Verify one issue.\nACTION 2: Record the result.');
  assert.equal(seven.actions.length,2);
  assert.match(seven.analysis,/observed fields/);
});
test('role line protocol accepts single-line labelled output',async()=>{
  const line={...valid,text:'SUMMARY: Sherlock is alive; FINDING: One concrete issue remains; NEXT_STEP: Verify the issue comment'};
  const result=await reasonRole({...args,client:{configured:()=>true,isTransientError:()=>false,ask:async()=>line}});
  assert.equal(result.status,'LLM');
  assert.equal(result.findings.length,1);
  assert.match(result.next_step,/Verify/);
});
test('role dialogue verifies real assistant turn, model and no-tools runtime',async()=>{
  let calls=0;
  const result=await reasonRole({...args,client:{configured:()=>true,isTransientError:()=>false,ask:async opts=>{
    calls++; assert.equal(opts.retryTransient,false); assert.equal(opts.timeoutMs,100000); assert.equal(opts.trusted,false);
    assert.match(opts.messages[0].content,/untrusted data/); return valid;
  }}});
  assert.equal(calls,1); assert.equal(result.status,'LLM'); assert.equal(result.assistant_turns,1);
  for(const invalid of [{...valid,assistantTurns:0},{...valid,model:null},{...valid,runtime:'openclaw-agent-exec-trusted-tools'}]) {
    await assert.rejects(reasonRole({...args,client:{configured:()=>true,isTransientError:()=>false,ask:async()=>invalid}}),/UNVERIFIED/);
  }
});
test('transient outages degrade once, contract errors fail, oversized prose fails',async()=>{
  const client={configured:()=>true,isTransientError:e=>e.transient,ask:async()=>{throw {transient:true,code:'OPENCLAW_TIMEOUT'};}};
  assert.equal((await reasonRole({...args,client})).status,'DEGRADED');
  client.ask=async()=>({...valid,text:JSON.stringify({...decision,summary:'x'.repeat(4001)})});
  await assert.rejects(reasonRole({...args,client}),/INVALID_SUMMARY/);
});
test('actual role scripts do not trigger themselves through posted comments',()=>{
  const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
  const root=path.resolve(__dirname,'../..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'qd-role-test-'));
  const preload=path.join(dir,'preload.cjs');
  fs.writeFileSync(preload,`
    const fs=require('node:fs'), dir=${JSON.stringify(dir)}, role=process.env.TEST_ROLE;
    const write=fs.writeFileSync;fs.writeFileSync=(p,...a)=>write(String(p).startsWith('/tmp/quantdeus-')?dir+'/'+role+'-evidence.json':p,...a);
    require('node:child_process').execFileSync=(cmd,a)=>{
      if(cmd!=='gh')throw Error('unexpected command');
      if(a[1]==='list'&&a[0]==='issue') return JSON.stringify([{number:7,title:'Case',body:'Evidence',labels:['coord:task','coord:ready','agent:'+role],updatedAt:new Date().toISOString()}]);
      if(a[0]==='pr')return '[]';
      if(a[1]==='view')return JSON.stringify({comments:fs.existsSync(dir+'/'+role+'-posted.txt')?[{body:fs.readFileSync(dir+'/'+role+'-posted.txt','utf8'),createdAt:new Date().toISOString()}]:[]});
      if(a[1]==='comment'){fs.writeFileSync(dir+'/'+role+'-posted.txt',a[a.indexOf('--body')+1]);return '';}
      throw Error('unexpected gh');
    };
    const office=require(${JSON.stringify(path.join(root,'scripts/openclaw-office-client.js'))});
    office.configured=()=>true;office.ask=async()=>{fs.appendFileSync(dir+'/'+role+'-calls.txt','call\\n');return ${JSON.stringify(valid)}};
  `);
  try {
    for(const role of ['emh','sherlock','tuvok']) {
      const options={cwd:root,encoding:'utf8',env:{...process.env,TEST_ROLE:role,GITHUB_REPOSITORY:'quantdeus/quantdeus.github.io',GITHUB_TOKEN:'fixture',GITHUB_EVENT_NAME:'issue_comment',QUANTDEUS_DIALOGUE_DEADLINE_MS:''}};
      const run=()=>execFileSync(process.execPath,['--require',preload,'scripts/'+role+'.js'],options);
      run();run();assert.equal(fs.readFileSync(path.join(dir,role+'-calls.txt'),'utf8'),'call\n',role);
      assert.match(fs.readFileSync(path.join(dir,role+'-posted.txt'),'utf8'),/Runtime status: \*\*LLM\*\*/);
    }
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('normal role cron and HTTP success require completed turn evidence',()=>{
  const fs=require('node:fs'),path=require('node:path');
  const root=path.resolve(__dirname,'../..');
  const workflow=fs.readFileSync(path.join(root,'.github/workflows/agent-role-cron.yml'),'utf8');
  const route=fs.readFileSync(path.join(root,'vercel-dispatcher/api/quantdeus/openclaw.js'),'utf8');
  assert.match(workflow,/turnEvidence\(result,true\)/);
  assert.ok(workflow.indexOf('turnEvidence(result,true)')<workflow.indexOf('const decision=parse(result.text)'));
  assert.match(route,/openclaw_unverified_llm_turn/);
  assert.ok(route.indexOf('openclaw_unverified_llm_turn')<route.lastIndexOf('return res.status(200)'));
});
