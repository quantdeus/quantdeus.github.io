const { execFileSync } = require('child_process');
const repo=process.env.GITHUB_REPOSITORY, token=process.env.GITHUB_TOKEN;
if(!repo||!token) process.exit(1);
const env={...process.env,GH_TOKEN:token};
const gh=(args)=>execFileSync('gh',args,{encoding:'utf8',env,stdio:['ignore','pipe','pipe']}).trim();
const body=[
'🩺 **EMH — Swarm Mediation & Diplomacy smoke test**','',
'**Council mediation:**',
'- Seven identified the bottleneck.',
'- Sherlock generated competing explanations.',
'- Tuvok challenged the reasoning structure instead of rubber-stamping it.',
'',
'**Shared interests:**',
'- avoid duplicate work;',
'- preserve evidence quality;',
'- resolve only the concrete blocker;',
'- keep human approval boundaries intact.',
'',
'**Mediated next step:** verify the canonical Issue evidence, identify the exact human decision if one is required, then return one owner + one falsifiable next action to the swarm.',
'',
'**Diplomatic note:** disagreement is useful when it changes the next test; repetition without new evidence is noise.',
'',
'_Status: proposal smoke test only; not yet a registered QuantDeus agent._'
].join('\n');
gh(['issue','comment','152','--body',body]);
console.log('EMH mediation posted');
