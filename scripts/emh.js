const { execFileSync } = require('child_process');
const crypto = require('crypto');

const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
const hubIssue = Number(process.env.QUANTDEUS_COORDINATION_HUB_ISSUE || 9);
if (!repo || !token) {
  console.error('GITHUB_REPOSITORY and GITHUB_TOKEN are required');
  process.exit(1);
}
const ghEnv = { ...process.env, GH_TOKEN: token };

function gh(args) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    env: ghEnv,
    stdio: ['ignore','pipe','pipe'],
  }).trim();
}
function ghJson(args) {
  const out = gh(args);
  return out ? JSON.parse(out) : null;
}
function labelsOf(issue) {
  return (issue.labels || []).map(x => typeof x === 'string' ? x : x.name);
}

const prs = ghJson(['pr','list','--state','open','--limit','100','--json','number,title,url,isDraft,reviewDecision,updatedAt']) || [];
const issues = ghJson(['issue','list','--state','open','--limit','200','--json','number,title,url,labels,updatedAt']) || [];
const changesRequested = prs.filter(p => p.reviewDecision === 'CHANGES_REQUESTED');
const reviewQueue = prs.filter(p => !p.isDraft);
const blocked = issues.filter(i => labelsOf(i).includes('coord:blocked'));

let focus = 'collective-stable';
let assessment = 'Communication loop looks stable: keep reviews factual, preserve dissent, and convert disagreement into one testable next step.';
const actions = [];

if (changesRequested.length) {
  const p = changesRequested[0];
  focus = 'review-disagreement:#' + p.number;
  assessment = 'PR #' + p.number + ' has requested changes. Mediate the substance: identify the disputed invariant, evidence, owner and closure criterion.';
  actions.push('For #' + p.number + ': summarize the disagreement in one sentence and attach verifiable evidence.');
  actions.push('Assign one owner for the next step and one closure criterion.');
} else if (reviewQueue.length > 6) {
  focus = 'review-load';
  assessment = 'High review load: ' + reviewQueue.length + ' open non-draft PRs. Risk: repeated arguments and context loss.';
  actions.push('Collapse duplicate findings into one canonical thread or Issue.');
  actions.push('Record what is accepted, what is rejected with evidence, and what needs human decision.');
} else if (blocked.length > 2) {
  focus = 'blocked-friction';
  assessment = blocked.length + ' blocked tasks can create circular discussion. Separate technical dependencies from human decisions.';
  actions.push('For each blocker, state whether it is technical or needs a human decision.');
  actions.push('Escalate one concrete question instead of forwarding the whole dispute.');
} else {
  actions.push('Use: FACTS -> INTERESTS -> OPTIONS -> OWNER -> NEXT STEP.');
}

const snapshot = {
  agent:'emh',
  timestamp:new Date().toISOString(),
  role:'Emergency Mediation Hologram / Swarm Mediation & Diplomacy Officer',
  signals:{open_review_prs:reviewQueue.length,changes_requested:changesRequested.length,blocked_tasks:blocked.length},
  focus,
  assessment,
  actions
};
const hash = crypto.createHash('sha256').update(JSON.stringify({
  signals:snapshot.signals,focus,assessment,actions
})).digest('hex').slice(0,12);
const marker = '<!-- qd-emh-digest:' + hash + ' -->';

const hub = ghJson(['issue','view',String(hubIssue),'--json','comments,title,url']);
const previous = [...(hub.comments || [])].reverse().find(c => String(c.body || '').includes('<!-- qd-emh-digest:'));
if ((previous?.body || '').includes(marker)) {
  console.log('EMH: mediation state unchanged.');
  process.exit(0);
}

const body = [
  '🩺 **EMH — Swarm Mediation & Diplomacy Officer**',
  '',
  '**Collective climate scan**',
  '- open review PRs: **' + reviewQueue.length + '**',
  '- changes requested: **' + changesRequested.length + '**',
  '- blocked tasks: **' + blocked.length + '**',
  '',
  '**Assessment:** ' + assessment,
  '',
  '**Mediation actions:**',
  ...actions.slice(0,3).map(x => '- ' + x),
  '',
  '_Protocol: FACTS -> INTERESTS -> OPTIONS -> OWNER -> NEXT STEP. EMH mediates team communication and does not override human decisions._',
  '',
  marker
].join('\n');

gh(['issue','comment',String(hubIssue),'--body',body]);
console.log(JSON.stringify(snapshot,null,2));
