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
const research = issues.filter(i => labels(i).some(l=>researchLabels.has(l)));
const blocked = research.filter(i=>labels(i).includes('coord:blocked'));
const target = blocked[0] || research[0];

if (!target) {
  console.log('Tuvok: no open research case.');
  process.exit(0);
}

const text = String(target.body||'');
const checks = {
  explicit_premises: /Outcome|Acceptance|Current evidence|Blocker/i.test(text),
  human_boundary: /approval|human/i.test(text),
  evidence_reference: /commit|branch|artifact|coordination\//i.test(text),
  falsifiable_next_step: /falsifiable|verify|test/i.test(text)
};

const digest = crypto.createHash('sha256').update(JSON.stringify({issue:target.number,checks})).digest('hex').slice(0,12);
const marker = '<!-- qd-tuvok-digest:' + digest + ' -->';
const hub = j(['issue','view',String(hubIssue),'--json','comments']);
const prev = [...(hub.comments||[])].reverse().find(c=>String(c.body||'').includes('<!-- qd-tuvok-digest:'));
if ((prev?.body||'').includes(marker)) process.exit(0);

const cautions = [];
if (!checks.explicit_premises) cautions.push('Premises are not explicit enough; state assumptions before inferring cause.');
if (!checks.evidence_reference) cautions.push('No concrete evidence reference detected; confidence must remain provisional.');
if (!checks.falsifiable_next_step) cautions.push('No clearly falsifiable next step detected; add one before execution.');
if (!cautions.length) cautions.push('Argument structure is sufficiently explicit for a bounded next test; do not confuse workflow labels with proof of root cause.');

const body = [
  '🖖 **Tuvok — Deputy Science Officer / Logic & Epistemic Integrity Officer**',
  '',
  '**Logic review:** #' + target.number + ' ' + target.title,
  '',
  '**Checks:**',
  '- explicit premises: **' + (checks.explicit_premises ? 'yes' : 'no') + '**',
  '- human-decision boundary: **' + (checks.human_boundary ? 'yes' : 'no') + '**',
  '- concrete evidence reference: **' + (checks.evidence_reference ? 'yes' : 'no') + '**',
  '- falsifiable/testable next step: **' + (checks.falsifiable_next_step ? 'yes' : 'no') + '**',
  '',
  '**Vulcan review:**',
  ...cautions.map(x=>'- ' + x),
  '',
  '_Protocol: PREMISES → LOGIC CHECK → ASSUMPTIONS → CONSISTENCY → UNCERTAINTY → VERDICT / REVISION. Plausible is not verified._',
  '',
  marker
].join('\n');

gh(['issue','comment',String(hubIssue),'--body',body]);
console.log('Tuvok logic audit:', target.number);
