const { execFileSync } = require('child_process');
const repo=process.env.GITHUB_REPOSITORY, token=process.env.GITHUB_TOKEN;
if(!repo||!token) process.exit(1);
const env={...process.env,GH_TOKEN:token};
const gh=(args)=>execFileSync('gh',args,{encoding:'utf8',env,stdio:['ignore','pipe','pipe']}).trim();
const body=[
'🖖 **Tuvok — Deputy Science Officer smoke test #2**','',
'**Logic review:**',
'- H1-H4 are hypotheses, not findings.',
'- ownership mismatch and human approval may co-exist.',
'- labels are evidence about workflow state, not proof of root cause.',
'- confidence must be revised after reading the canonical Issue and linked artifacts.',
'',
'**Verdict:** do not select a cause until at least one hypothesis is falsified or positively supported.',
'',
'_Proposal smoke test only._'
].join('\n');
gh(['issue','comment','153','--body',body]);
console.log('Tuvok review posted');
