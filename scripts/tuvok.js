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
(async()=>{
 const issues=j(['issue','list','--state','open','--limit','200','--json','number,title,body,labels,updatedAt'])||[];
 const target=issues.find(i=>labels(i).includes('agent:tuvok')&&labels(i).includes('coord:task'))||
   issues.find(i=>labels(i).includes('coord:blocked')&&labels(i).some(l=>l.startsWith('pillar-')))||
   issues.find(i=>labels(i).some(l=>l.startsWith('pillar-')));
 if(!target){console.log('Tuvok: no evidence case.');return;}
 const context={issue:issueContext(target)};
 const digest=stateDigest(context);
 const marker='<!-- qd-tuvok-digest:'+digest+' -->';
 const hub=j(['issue','view',String(hubIssue),'--json','comments']);
 if(skipDialogue(hub.comments,marker)) return;
 const result=await reasonRole({profile:'tuvok',role:'Tuvok — Logic & Epistemic Integrity Officer',context,repository:repo,protocol:'Audit premises, assumptions, contradictions, uncertainty and falsifiability. Plausibility is not verification. Produce a reasoned judgment, not a checklist template.'});
 fs.writeFileSync('/tmp/quantdeus-tuvok-reasoning.json',JSON.stringify({context,result},null,2));
 if (result.status !== 'DEGRADED' || !skipDialogue(hub.comments,marker,'issue_comment')) gh(['issue','comment',String(hubIssue),'--body',renderRole({heading:'🖖 **Tuvok — OpenClaw Logic Officer**',result,marker})]);
})().catch(e=>{console.error(e);process.exitCode=1});
