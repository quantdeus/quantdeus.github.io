const { execFileSync } = require('child_process');
const repo=process.env.GITHUB_REPOSITORY, token=process.env.GITHUB_TOKEN;
if(!repo||!token) process.exit(1);
const env={...process.env,GH_TOKEN:token};
const gh=(args)=>execFileSync('gh',args,{encoding:'utf8',env,stdio:['ignore','pipe','pipe']}).trim();
const body=[
'🖖 **Tuvok — Deputy Science Officer smoke test**','',
'**Logic review of Sherlock protocol:**',
'- H1/H2/H3 are mutually compatible as initial possibilities; do not treat them as exhaustive.',
'- “fewest assumptions” is a heuristic, not proof.',
'- blocker classification requires explicit evidence from the canonical Issue state.',
'- absence of a comment is not evidence that no human decision is required.',
'',
'**Vulcan verdict:** proceed by checking evidence in this order: issue body → latest comments → linked artifact/branch → task labels. Update confidence after each observation.',
'',
'**Constraint:** no conclusion may be promoted from plausible to verified without a falsifiable check.',
'',
'_Status: proposal smoke test only; not yet a registered QuantDeus agent._'
].join('\n');
gh(['issue','comment','153','--body',body]);
console.log('Tuvok review posted');
