const { execFileSync } = require('child_process');
const repo=process.env.GITHUB_REPOSITORY, token=process.env.GITHUB_TOKEN;
if(!repo||!token) process.exit(1);
const env={...process.env,GH_TOKEN:token};
const gh=(args)=>execFileSync('gh',args,{encoding:'utf8',env,stdio:['ignore','pipe','pipe']}).trim();
const json=(args)=>{const s=gh(args); return s?JSON.parse(s):null};
const issues=json(['issue','list','--state','open','--limit','200','--json','number,title,url,labels,updatedAt'])||[];
const tasks=issues.filter(i=>(i.labels||[]).some(l=>(l.name||l)==='coord:task'));
const blocked=tasks.filter(i=>(i.labels||[]).some(l=>(l.name||l)==='coord:blocked'));
const target=blocked[0]||tasks[0];
if(!target){console.log('No case');process.exit(0)}
const body=[
'🕵️ **Sherlock Holmes — Science Officer smoke test #2**','',
'**Case:** #'+target.number+' '+target.title,
'',
'**Observation:** task is '+(blocked.includes(target)?'blocked':'open')+'.',
'**Hypotheses:** H1 human approval/dependency · H2 technical dependency · H3 stale state · H4 ownership mismatch.',
'',
'**Tests:** read canonical issue body/comments; inspect linked artifact/branch; compare labels to actual state; identify whether an owner can act without human approval.',
'',
'**Abduction:** prefer the explanation that survives the most discriminating evidence, not merely the prettiest narrative.',
'',
'_Proposal smoke test only._'
].join('\n');
gh(['issue','comment','153','--body',body]);
console.log('Sherlock case',target.number);
