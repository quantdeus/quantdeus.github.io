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
'🕵️ **Sherlock Holmes — Science Officer smoke test**','',
'**Case:** #'+target.number+' '+target.title,
'',
'**Observed fact:** task is open'+(blocked.includes(target)?' and blocked.':'.'),
'**Working hypotheses:**',
'- H1: progress is blocked by a missing human decision.',
'- H2: progress is blocked by a technical dependency.',
'- H3: the task state is stale and the blocker has already changed.',
'',
'**Discriminating tests:**',
'- inspect the latest issue body/comments for an explicit requested human action;',
'- verify whether a concrete artifact/branch already exists;',
'- if neither explains the state, reclassify the blocker instead of creating duplicate work.',
'',
'**Abductive preference:** choose the explanation that best fits the current evidence with the fewest unsupported assumptions.',
'',
'_Status: proposal smoke test only; not yet a registered QuantDeus agent._'
].join('\n');
gh(['issue','comment','153','--body',body]);
console.log('Sherlock case',target.number);
