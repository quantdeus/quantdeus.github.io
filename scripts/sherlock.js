'use strict';
const { execFileSync } = require('child_process');
const {issueContext,digest:stateDigest,skipDialogue} = require('./dialogue-state');
const fs = require('fs');
const { reasonRole, renderRole } = require('./openclaw-role-dialogue');

const repo=process.env.GITHUB_REPOSITORY, token=process.env.GITHUB_TOKEN;
const hubIssue=Number(process.env.QUANTDEUS_COORDINATION_HUB_ISSUE||9);
if(!repo||!token) process.exit(1);
const env={...process.env,GH_TOKEN:token};
const gh=a=>execFileSync('gh',a,{encoding:'utf8',env,stdio:['ignore','pipe','pipe']}).trim();
const j=a=>{const s=gh(a);return s?JSON.parse(s):null};
const labels=i=>(i.labels||[]).map(x=>typeof x==='string'?x:x.name);
const targetAgent=i=>labels(i).find(x=>x.startsWith('agent:'))?.slice(6)||String(i.body||'').match(/quantdeus-target-agent:([a-z0-9-]+)/i)?.[1]||'';

(async()=>{
 const issues=j(['issue','list','--state','open','--limit','200','--json','number,title,body,labels,updatedAt'])||[];
 const explicit=issues.filter(i=>targetAgent(i)==='sherlock'&&labels(i).includes('coord:task'));
 const researchLabels=new Set(['pillar-01-energy','pillar-02-justice','pillar-04-space','pillar-05-potential']);
 const research=issues.filter(i=>labels(i).some(l=>researchLabels.has(l)));
 const target=explicit.find(i=>!labels(i).includes('coord:blocked'))||explicit[0]||research.find(i=>labels(i).includes('coord:blocked'))||research[0];
 if(!target){console.log('Sherlock: no evidence case.');return;}
 const destination=targetAgent(target)==='sherlock'?target.number:hubIssue;
 const context={issue:issueContext(target)};
 const digest=stateDigest(context);
 const marker='<!-- qd-sherlock-digest:'+digest+' -->';
 const thread=j(['issue','view',String(destination),'--json','comments']);
 if(skipDialogue(thread.comments,marker)) return;
 const result=await reasonRole({profile:'sherlock',role:'Sherlock Holmes — Science Officer / Scientific Investigation Lead',context,repository:repo,protocol:'Use OBSERVE → competing hypotheses → falsification → root cause → smallest decisive test. Do not decide from labels alone.'});
 const body=renderRole({heading:'🕵️ **Sherlock Holmes — OpenClaw Science Officer**',result,marker});
 fs.writeFileSync('/tmp/quantdeus-sherlock-reasoning.json',JSON.stringify({context,result},null,2));
 if (result.status !== 'DEGRADED' || !skipDialogue(thread.comments,marker,'issue_comment')) gh(['issue','comment',String(destination),'--body',body]);
})().catch(e=>{console.error(e);process.exitCode=1});
