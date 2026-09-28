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
function ageHours(iso) {
  return (Date.now() - Date.parse(iso)) / 36e5;
}

const issues = ghJson(['issue','list','--state','open','--limit','200','--json','number,title,url,labels,updatedAt']) || [];
const prs = ghJson(['pr','list','--state','open','--limit','100','--json','number,title,url,isDraft,updatedAt']) || [];
const tasks = issues.filter(i => labelsOf(i).includes('coord:task'));
const blocked = tasks.filter(i => labelsOf(i).includes('coord:blocked')).sort((a,b)=>Date.parse(a.updatedAt)-Date.parse(b.updatedAt));
const active = tasks.filter(i => labelsOf(i).includes('coord:active'));
const ready = tasks.filter(i => labelsOf(i).includes('coord:ready'));
const staleActive = active.filter(i => ageHours(i.updatedAt) >= 36).sort((a,b)=>Date.parse(a.updatedAt)-Date.parse(b.updatedAt));
const reviewQueue = prs.filter(p => !p.isDraft);

let primary = 'flow-stable';
let directive = 'Рой стабилен: сохранять ограниченный WIP, закрывать начатое и не ослаблять QA ради скорости.';
const actions = [];

if (blocked.length) {
  const x = blocked[0];
  primary = `blocked:#${x.number}`;
  directive = `Главный bottleneck — заблокированная задача #${x.number}: ${x.title}`;
  actions.push(`Сначала снять блокер у #${x.number} или явно зафиксировать, что нужно от человека.`);
  actions.push('Не открывать дублирующую реализацию того же результата.');
} else if (staleActive.length) {
  const x = staleActive[0];
  primary = `stale-active:#${x.number}`;
  directive = `Активная задача #${x.number} давно не менялась; рой должен либо дать следующий артефакт, либо вернуть её в ready/blocked.`;
  actions.push(`Проверить owner/acceptance у #${x.number} и потребовать один следующий проверяемый шаг.`);
} else if (reviewQueue.length > 6) {
  primary = 'review-queue';
  directive = `Review queue = ${reviewQueue.length}; узкое место сейчас не создание работы, а её верификация и завершение.`;
  actions.push('Сначала добить P1/P2 и зелёные проверки по открытым PR.');
  actions.push('Новые ветки создавать только для независимых P1-задач.');
} else if (ready.length > Math.max(6, active.length * 2 + 2)) {
  primary = 'ready-backlog';
  directive = `Ready backlog = ${ready.length} при active = ${active.length}; фокус смещается на throughput, а не генерацию новых задач.`;
  actions.push('Взять 1–3 наиболее приоритетных ready-задачи и довести их до QA.');
  actions.push('Не считать новый Issue прогрессом без артефакта.');
} else {
  actions.push('Продолжать цикл FIND → VERIFY → OWNER → PATCH/TRACK → RECHECK → DONE.');
}

const snapshot = {
  agent:'seven-of-nine',
  timestamp:new Date().toISOString(),
  role:'QuantDeus Coordinator / AI Chief of Staff',
  tasks:{total:tasks.length,ready:ready.length,active:active.length,blocked:blocked.length,stale_active:staleActive.length},
  open_non_draft_prs:reviewQueue.length,
  primary,
  directive,
  actions
};
const hash = crypto.createHash('sha256').update(JSON.stringify({
  tasks:snapshot.tasks,
  open_non_draft_prs:snapshot.open_non_draft_prs,
  primary:snapshot.primary,
  directive:snapshot.directive,
  actions:snapshot.actions
})).digest('hex').slice(0,12);
const marker = `<!-- qd-seven-of-nine-digest:${hash} -->`;

const hub = ghJson(['issue','view',String(hubIssue),'--json','comments,title,url']);
const previous = [...(hub.comments || [])].reverse().find(c => String(c.body || '').includes('<!-- qd-seven-of-nine-digest:'));
if ((previous?.body || '').includes(marker)) {
  console.log('Seven of Nine: efficiency state unchanged.');
  process.exit(0);
}

const body = [
  '🖖 **Seven of Nine — QuantDeus Coordinator / AI Chief of Staff**',
  '',
  '**Swarm efficiency scan**',
  `- ready: **${ready.length}**`,
  `- active: **${active.length}**`,
  `- blocked: **${blocked.length}**`,
  `- stale active (36h+): **${staleActive.length}**`,
  `- open review PRs: **${reviewQueue.length}**`,
  '',
  '**Primary directive:** ' + directive,
  '',
  '**Actions:**',
  ...actions.slice(0,3).map(x => '- ' + x),
  '',
  '_Borg efficiency, human agency: Seven оптимизирует поток, но не отменяет human override, QA и добровольный EXIT._',
  '',
  marker
].join('\n');

gh(['issue','comment',String(hubIssue),'--body',body]);
console.log(JSON.stringify(snapshot,null,2));
