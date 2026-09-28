const { execFileSync } = require('child_process');
const crypto = require('crypto');

const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
const hubIssue = Number(process.env.QUANTDEUS_COORDINATION_HUB_ISSUE || 9);
if (!repo || !token) process.exit(1);
const env = { ...process.env, GH_TOKEN: token };

function gh(args) {
  return execFileSync('gh', args, { encoding:'utf8', env, stdio:['ignore','pipe','pipe'] }).trim();
}
function j(args) { const s=gh(args); return s ? JSON.parse(s) : null; }
function labels(i){ return (i.labels||[]).map(x=>typeof x==='string'?x:x.name); }

const issues = j(['issue','list','--state','open','--limit','200','--json','number,title,labels,updatedAt']) || [];
const prs = j(['pr','list','--state','open','--limit','100','--json','number,title,isDraft,reviewDecision,updatedAt']) || [];
const blocked = issues.filter(i=>labels(i).includes('coord:blocked'));
const changesRequested = prs.filter(p=>!p.isDraft && p.reviewDecision==='CHANGES_REQUESTED');

let focus = 'stable';
let assessment = 'Коммуникационный контур стабилен: сохранять предметный dissent и переводить спор в один проверяемый следующий шаг.';
const actions = [];

if (changesRequested.length) {
  const p = changesRequested[0];
  focus = 'review:' + p.number;
  assessment = 'PR #' + p.number + ' требует изменений: отделить предмет разногласия от статуса участников и свести обсуждение к evidence + closure criterion.';
  actions.push('Зафиксировать предмет разногласия одной фразой.');
  actions.push('Назначить одного owner следующего шага и один критерий закрытия.');
} else if (blocked.length) {
  const i = blocked[0];
  focus = 'blocked:' + i.number;
  assessment = 'Blocked-задача #' + i.number + ' может порождать круговые обсуждения. Нужно отделить техническую зависимость от решения человека.';
  actions.push('Указать: technical blocker или human decision.');
  actions.push('Эскалировать человеку только конкретный вопрос.');
} else {
  actions.push('Использовать FACTS → INTERESTS → OPTIONS → OWNER → NEXT STEP.');
}

const state = { blocked: blocked.length, changes_requested: changesRequested.length, focus, assessment, actions };
const digest = crypto.createHash('sha256').update(JSON.stringify(state)).digest('hex').slice(0,12);
const marker = '<!-- qd-emh-digest:' + digest + ' -->';
const hub = j(['issue','view',String(hubIssue),'--json','comments']);
const prev = [...(hub.comments||[])].reverse().find(c=>String(c.body||'').includes('<!-- qd-emh-digest:'));
if ((prev?.body||'').includes(marker)) process.exit(0);

const body = [
  '🩺 **EMH — Swarm Mediation & Diplomacy Officer**',
  '',
  '**Collective climate scan**',
  '- blocked tasks: **' + blocked.length + '**',
  '- reviews with changes requested: **' + changesRequested.length + '**',
  '',
  '**Assessment:** ' + assessment,
  '',
  '**Mediation actions:**',
  ...actions.map(x=>'- ' + x),
  '',
  '_Protocol: FACTS → INTERESTS → OPTIONS → OWNER → NEXT STEP. EMH mediates communication; it does not diagnose people or override human decisions._',
  '',
  marker
].join('\n');

gh(['issue','comment',String(hubIssue),'--body',body]);
console.log('EMH mediation posted:', focus);
