const { execFileSync } = require('child_process');
const crypto = require('crypto');

const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
if (!repo || !token) {
  console.error('GITHUB_REPOSITORY and GITHUB_TOKEN are required');
  process.exit(1);
}
const ghEnv = { ...process.env, GH_TOKEN: token };
function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf-8', env: ghEnv, stdio: ['ignore','pipe','pipe'] }).trim();
}
function ghJson(args) {
  const out = gh(args);
  return out ? JSON.parse(out) : null;
}
function ensureLabel(name,color,description) {
  try { gh(['label','create',name,'--color',color,'--description',description,'--force']); } catch (_) {}
}
function hasLabel(issue,name) {
  return (issue.labels || []).some(l => (typeof l === 'string' ? l : l.name) === name);
}

ensureLabel('growth:recruitment','d946ef','Contributor recruitment / growth sprint');
ensureLabel('agent:unity','55d8ff','Target: Unity Agent');

const all = ghJson(['issue','list','--state','open','--limit','100','--json','number,title,body,url,labels,updatedAt']) || [];
let sprint = all.find(i => /^\[TASK\]\[Growth\] Contributor recruitment sprint/i.test(i.title));
if (!sprint) {
  const today = new Date().toISOString().slice(0,10);
  const body = [
    '## Mission',
    '',
    'Maintain one real contributor-growth cycle for QuantDeus.',
    '',
    '## Acceptance',
    '- qualify public candidates against concrete open QuantDeus tasks;',
    '- prepare personalized invitations, not bulk spam;',
    '- record replies and first useful contributions;',
    '- sensitive external outreach still requires explicit human approval;',
    '- no fake contributors or meaningless commits.',
    '',
    '<!-- quantdeus-target-agent:unity -->'
  ].join('\n');
  gh(['issue','create','--title',`[TASK][Growth] Contributor recruitment sprint — ${today}`,'--body',body,'--label','coord:task','--label','coord:ready','--label','agent:unity','--label','growth:recruitment']);
  const refreshed = ghJson(['issue','list','--state','open','--limit','100','--json','number,title,body,url,labels,updatedAt']) || [];
  sprint = refreshed.find(i => /^\[TASK\]\[Growth\] Contributor recruitment sprint/i.test(i.title));
}
if (!sprint) throw new Error('Unable to resolve active contributor recruitment sprint');

const tasks = (ghJson(['issue','list','--state','open','--limit','100','--json','number,title,url,labels,updatedAt']) || [])
  .filter(i => i.number !== sprint.number)
  .filter(i => hasLabel(i,'coord:ready') || hasLabel(i,'coord:active'))
  .filter(i => !/^🧭/.test(i.title))
  .slice(0,8);

const digestInput = tasks.map(t => ({n:t.number,title:t.title,labels:(t.labels||[]).map(l=>typeof l==='string'?l:l.name).sort()}));
const hash = crypto.createHash('sha256').update(JSON.stringify(digestInput)).digest('hex').slice(0,12);
const full = ghJson(['issue','view',String(sprint.number),'--json','comments,title,url']);
const marker = `<!-- qd-growth-digest:${hash} -->`;
if ((full.comments || []).some(c => (c.body || '').includes(marker))) {
  console.log('Contributor growth digest unchanged.');
  process.exit(0);
}

const rows = tasks.length
  ? tasks.map(t => `- #${t.number} — [${t.title}](${t.url})`).join('\n')
  : '- No open contributor-ready opportunities found; create or clarify one bounded task before outreach.';

const body = `📣 **Contributor Growth Cron**\n\nCurrent concrete contribution opportunities:\n\n${rows}\n\n**Next action:** Unity qualifies candidates against these tasks; Synthesis packages the invitation; Archivist keeps onboarding discoverable; Herald prepares personalized outreach. External invitations are not auto-sent by this Cron.\n\n${marker}`;
gh(['issue','comment',String(sprint.number),'--body',body]);
console.log(`Updated contributor-growth sprint #${sprint.number}`);
