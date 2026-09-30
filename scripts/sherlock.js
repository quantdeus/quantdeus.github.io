const { execFileSync } = require('child_process');
const crypto = require('crypto');

const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
const hubIssue = Number(process.env.QUANTDEUS_COORDINATION_HUB_ISSUE || 9);
if (!repo || !token) process.exit(1);
const env = { ...process.env, GH_TOKEN: token };

function gh(args){ return execFileSync('gh',args,{encoding:'utf8',env,stdio:['ignore','pipe','pipe']}).trim(); }
function j(args){ const s=gh(args); return s?JSON.parse(s):null; }
function labels(i){ return (i.labels||[]).map(x=>typeof x==='string'?x:x.name); }

const researchLabels = new Set(['pillar-01-energy','pillar-02-justice','pillar-04-space','pillar-05-potential']);
const issues = j(['issue','list','--state','open','--limit','200','--json','number,title,body,labels,updatedAt']) || [];
function targetAgent(issue) {
  const labelTarget = labels(issue).find(l => l.startsWith('agent:'));
  if (labelTarget) return labelTarget.slice('agent:'.length);
  const marker = String(issue.body || '').match(/<!--\s*quantdeus-target-agent:([a-z0-9-]+)\s*-->/i);
  return marker ? marker[1] : '';
}
const explicit = issues.filter(i => targetAgent(i) === 'sherlock' && labels(i).includes('coord:task'));
const actionableExplicit = explicit.filter(i => !labels(i).includes('coord:blocked'));
const research = issues.filter(i => labels(i).some(l=>researchLabels.has(l)));
const blocked = research.filter(i=>labels(i).includes('coord:blocked'));
const target = actionableExplicit[0] || explicit[0] || blocked[0] || research[0];

if (!target) {
  console.log('Sherlock: no open research case.');
  process.exit(0);
}

const bodyText = String(target.body||'');
const explicitHuman = /explicit (production|human)|requires separate approval|human approval|explicit approval/i.test(bodyText);
const artifact = /commit|branch|artifact|coordination\//i.test(bodyText);

const hypotheses = [
  'H1 — human decision/approval dependency',
  'H2 — technical dependency',
  'H3 — stale workflow state',
  'H4 — ownership/routing mismatch'
];

const observation = {
  issue: target.number,
  title: target.title,
  blocked: labels(target).includes('coord:blocked'),
  explicitHuman,
  artifact
};
const digest = crypto.createHash('sha256').update(JSON.stringify(observation)).digest('hex').slice(0,12);
const marker = '<!-- qd-sherlock-digest:' + digest + ' -->';
const explicitTarget = targetAgent(target) === 'sherlock';
const destinationIssue = explicitTarget ? target.number : hubIssue;
const thread = j(['issue','view',String(destinationIssue),'--json','comments']);
const prev = [...(thread.comments||[])].reverse().find(c=>String(c.body||'').includes('<!-- qd-sherlock-digest:'));
if ((prev?.body||'').includes(marker)) process.exit(0);

const evidence = [];
if (explicitHuman) evidence.push('Issue text contains an explicit human/production approval dependency.');
if (artifact) evidence.push('Issue text references an existing artifact, commit, branch or coordination contract.');
if (!evidence.length) evidence.push('No decisive root-cause evidence detected from the Issue body alone.');

const body = [
  '🕵️ **Sherlock Holmes — Science Officer / Scientific Investigation Lead**',
  '',
  '**Scientific case:** #' + target.number + ' ' + target.title,
  '',
  '**Observation:** ' + (observation.blocked ? 'task is open and blocked.' : 'task is open.'),
  '**Competing hypotheses:**',
  ...hypotheses.map(x=>'- ' + x),
  '',
  '**Evidence already visible:**',
  ...evidence.map(x=>'- ' + x),
  '',
  '**Next discriminating tests:**',
  '- inspect latest comments and linked artifacts;',
  '- identify which hypothesis gains positive support and which can be falsified;',
  '- distinguish observed fact, inference, working hypothesis and speculation;',
  '',
  '_Method: deduction + induction + abduction + anomaly detection + adversarial falsification. Elegance never upgrades evidence._',
  '',
  marker
].join('\n');

gh(['issue','comment',String(destinationIssue),'--body',body]);
console.log('Sherlock case:', target.number);
