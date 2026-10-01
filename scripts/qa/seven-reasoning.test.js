'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {reason,inputDigest,render} = require('../seven-reasoning');
const context = {snapshot:{timestamp:'now',tasks:{ready:2,active:1,blocked:0},open_non_draft_prs:1},tasks:[{number:12,title:'Portal'}],prs:[],humanComments:[]};
const decision = {analysis:'Two bottlenecks compared from the snapshot',directive:'Finish portal',actions:['Verify acceptance criteria for #12']};
const args = {context,persona:'Seven persona',doctrine:'Preserve QA',repository:'quantdeus/quantdeus.github.io'};
test('briefing actually invokes Seven LLM with supplied state and no tools',async()=>{
  let calls=0;
  const office={configured:()=>true,isTransientError:()=>false,ask:async options=>{
    calls++; assert.equal(options.profile,'seven-of-nine'); assert.equal(options.trusted,false);
    assert.equal(options.retryTransient,true); assert.equal(options.timeoutMs,110000);
    assert.equal(JSON.parse(options.messages[1].content).tasks[0].number,12);
    assert.match(options.messages[0].content,/untrusted data/);
    return {text:JSON.stringify(decision),runtime:'openclaw-agent-exec-no-tools',model:'test-model',assistantTurns:1};
  }};
  const result=await reason({...args,office}); assert.equal(calls,1); assert.equal(result.status,'LLM');
  assert.match(render(context,result,'marker'),/Finish portal/); assert.match(render(context,result,'marker'),/model: `test-model`/);
});
test('missing OIDC is explicit monitoring without fake strategy',async()=>{
  const result=await reason({...args,office:{configured:()=>false}});
  assert.equal(result.status,'DEGRADED'); const body=render(context,result,'marker');
  assert.match(body,/Мониторинг без LLM/); assert.doesNotMatch(body,/Primary directive/);
  assert.equal(result.directive,undefined);
});
test('transient failure degrades without exposing raw provider errors',async()=>{
  const result=await reason({...args,office:{configured:()=>true,isTransientError:()=>true,ask:async()=>{throw Object.assign(new Error('secret provider body'),{code:'OPENCLAW_TIMEOUT'});}}});
  assert.equal(result.error_code,'OPENCLAW_TIMEOUT'); assert.doesNotMatch(JSON.stringify(result),/secret/);
});
test('invalid JSON, empty decisions and unexpected tool runtime fail closed',async()=>{
  for(const result of [{text:'bad',runtime:'openclaw-agent-exec-no-tools'}, {text:'{}',runtime:'openclaw-agent-exec-no-tools'}, {text:JSON.stringify(decision),runtime:'openclaw-agent-exec-trusted-tools'}]) {
    await assert.rejects(reason({...args,office:{configured:()=>true,isTransientError:()=>false,ask:async()=>result}}));
  }
});
test('digest ignores wall clock and ordering but captures new work and CEO intent',()=>{
  assert.equal(inputDigest(context),inputDigest({...context,snapshot:{...context.snapshot,timestamp:'later'}}));
  assert.notEqual(inputDigest(context),inputDigest({...context,tasks:[{number:12,title:'New acceptance'}]}));
  assert.notEqual(inputDigest(context),inputDigest({...context,humanComments:[{id:1,body:'Fix Seven'}]}));
});
test('real Seven script publishes LLM prose once and skips unchanged bot chatter',()=>{
  const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'qd-seven-test-'));
  const root=path.resolve(__dirname,'../..');
  const preload=path.join(dir,'preload.cjs');
  fs.writeFileSync(preload,`
    const fs=require('node:fs');
    const dir=${JSON.stringify(dir)};
    const write=fs.writeFileSync;
    fs.writeFileSync=(p,...args)=>write(p==='/tmp/quantdeus-seven-reasoning.json'?dir+'/evidence.json':p,...args);
    require('node:child_process').execFileSync=(cmd,args)=>{
      if(cmd!=='gh') throw Error('unexpected command');
      if(args[0]==='issue'&&args[1]==='list') return JSON.stringify([{number:12,title:'Portal',labels:['coord:task','coord:ready'],url:'https://github.com/test/issues/12'}]);
      if(args[0]==='pr') return '[]';
      if(args[1]==='view') return JSON.stringify({comments:fs.existsSync(dir+'/posted.txt')?[{author:{login:'github-actions[bot]'},body:fs.readFileSync(dir+'/posted.txt','utf8')}]:[]});
      if(args[1]==='comment') {fs.writeFileSync(dir+'/posted.txt',args[args.indexOf('--body')+1]);return '';}
      throw Error('unexpected gh operation');
    };
    const office=require(${JSON.stringify(path.join(root,'scripts/openclaw-office-client.js'))});
    office.configured=()=>true;
    office.ask=async()=>{fs.appendFileSync(dir+'/calls.txt','call\\n');return {text:${JSON.stringify(JSON.stringify(decision))},runtime:'openclaw-agent-exec-no-tools',model:'integration-model',assistantTurns:1}};
  `);
  try {
    const options={cwd:root,env:{...process.env,GITHUB_REPOSITORY:'quantdeus/quantdeus.github.io',GITHUB_TOKEN:'fixture',GITHUB_EVENT_NAME:'issue_comment',GITHUB_STEP_SUMMARY:''},encoding:'utf8'};
    const run=()=>execFileSync(process.execPath,['--require',preload,'scripts/seven-of-nine.js'],options);
    run(); assert.match(fs.readFileSync(path.join(dir,'posted.txt'),'utf8'),/Finish portal/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'evidence.json'),'utf8')).status,'LLM');
    assert.match(run(),/state unchanged/);
    assert.equal(fs.readFileSync(path.join(dir,'calls.txt'),'utf8'),'call\n');
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
