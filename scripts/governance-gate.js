const { execFileSync } = require('child_process');

const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
const repoOwner = (repo || '').split('/')[0];
const adminUsers = new Set(
  (process.env.QUANTDEUS_ADMIN_GITHUB_USERS || '')
    .split(',')
    .map(x => x.trim().toLowerCase())
    .filter(Boolean)
);

if (!repo || !token) {
  console.error('GITHUB_REPOSITORY and GITHUB_TOKEN are required');
  process.exit(1);
}

const ghEnv = { ...process.env, GH_TOKEN: token };
const TASK_STATES = ['coord:task','coord:ready','coord:active','coord:blocked','coord:stale','coord:done'];

function gh(args) {
  return execFileSync('gh', args, {
    encoding: 'utf-8',
    env: ghEnv,
    stdio: ['ignore','pipe','pipe'],
  }).trim();
}

function ghJson(args) {
  const out = gh(args);
  return out ? JSON.parse(out) : null;
}

function labelNames(issue) {
  return (issue.labels || []).map(l => typeof l === 'string' ? l : l.name);
}

function hasLabel(issue, label) {
  return labelNames(issue).includes(label);
}

function privileged(login) {
  const user = String(login || '').toLowerCase();
  return Boolean(user && (user === repoOwner.toLowerCase() || adminUsers.has(user)));
}

function targetAgent(body = '') {
  return body.match(/<!--\s*qd-target-agent:([a-z0-9_-]+)\s*-->/i)?.[1]?.toLowerCase() || null;
}

function ensureLabel(name, color, description) {
  try {
    gh(['label','create',name,'--color',color,'--description',description,'--force']);
  } catch (err) {
    console.error('label ' + name + ': ' + (err.stderr?.toString() || err.message));
  }
}

function ensureLabels() {
  const labels = [
    ['governance:proposal','fbca04','Предложение сообщества ожидает рассмотрения'],
    ['governance:voting','0e8a16','Голосование сообщества открыто'],
    ['governance:passed','8250df','Предложение прошло голосование и повышение администратором'],
    ['governance:rejected','d1242f','Предложение отклонено или закрыто правилами управления'],
    ['agent:coordinator','55d8ff','Цель: Координатор QuantDeus'],
    ['agent:pillar-executor','55d8ff','Цель: Исполнитель шести столпов'],
    ['agent:strategic-hub','55d8ff','Цель: Стратегический навигационный центр'],
    ['agent:orchestrator','55d8ff','Цель: Оркестратор исследований'],
    ['agent:energy','55d8ff','Цель: Агент энергетики'],
    ['agent:justice','55d8ff','Цель: Агент справедливости'],
    ['agent:unity','55d8ff','Цель: Агент единства'],
    ['agent:space','55d8ff','Цель: Агент космоса / варпа'],
    ['agent:potential','55d8ff','Цель: Агент человеческого потенциала'],
    ['agent:synthesis','55d8ff','Цель: Агент синтеза'],
    ['agent:control-tower','55d8ff','Цель: Control Tower'],
    ['agent:scout','55d8ff','Цель: Разведчик репозитория / Squad B'],
    ['agent:verifier','55d8ff','Цель: Проверяющий задач / Squad B'],
    ['agent:analyst','55d8ff','Цель: Аналитик изменений / Squad B'],
    ['agent:strategist','55d8ff','Цель: Стратег исполнения / Squad B'],
    ['agent:guardian','55d8ff','Цель: Страж / Squad B'],
    ['agent:tasksmith','55d8ff','Цель: Кузнец задач / Squad B'],
    ['agent:archivist','55d8ff','Цель: Архивариус исполнения / Squad B'],
    ['agent:herald','55d8ff','Цель: Вестник PR / Squad B'],
    ['agent:qa-syntax','0e8a16','Цель: QA-валидатор синтаксиса'],
    ['agent:qa-contract','0e8a16','Цель: QA-валидатор контрактов'],
    ['agent:qa-repair','d93f0b','Цель: Координатор QA-исправлений'],
    ['qa:repair','d93f0b','QA обнаружил необходимость исправления'],
    ['squad-b:ready','2da44e','Готово для исполнения Octet Squad B'],
    ['squad-b:active','bf8700','Octet Squad B выполняет задачу'],
    ['squad-b:review','1f6feb','Octet Squad B передал PR на ревью'],
    ['squad-b:blocked','d1242f','Исполнение Octet Squad B заблокировано'],
    ['squad-b:done','8250df','Исполнение Octet Squad B завершено/слито'],
    ['squad-b:privileged','b60205','Разрешает одобренные изменения чувствительных зон репозитория'],
    ['team:octet-b','5319e7','Вторая исполнительная команда QuantDeus'],
  ];
  for (const args of labels) ensureLabel(...args);
}

function editLabels(number, add = [], remove = []) {
  const args = ['issue','edit',String(number)];
  for (const label of add) args.push('--add-label',label);
  for (const label of remove) args.push('--remove-label',label);
  if (args.length > 3) gh(args);
}

function normalizeProposal(issue) {
  const add = ['governance:proposal','governance:voting'];
  const agent = targetAgent(issue.body || '');
  if (agent) add.push('agent:' + agent);
  const remove = TASK_STATES.filter(x => hasLabel(issue,x));
  editLabels(issue.number, add.filter(x => !hasLabel(issue,x)), remove);
}

function taskAuthorized(issue) {
  if (hasLabel(issue,'governance:passed')) return true;
  return privileged(issue.author?.login || issue.user?.login);
}

function normalizeAuthorizedTask(issue) {
  const agent = targetAgent(issue.body || '');
  if (agent && !hasLabel(issue,'agent:' + agent)) {
    editLabels(issue.number,['agent:' + agent],[]);
  }
}

function downgradeTask(issue) {
  const oldBody = String(issue.body || '');
  const already = oldBody.includes('<!-- qd-governance-downgraded -->');
  const title = String(issue.title || '').startsWith('[TASK]')
    ? String(issue.title).replace(/^\[TASK\]/,'[PROPOSAL]')
    : '[PROPOSAL] ' + String(issue.title || '');
  const body = already
    ? oldBody
    : oldBody.trimEnd() + '\n\n<!-- qd-governance-downgraded -->\n';
  gh(['issue','edit',String(issue.number),'--title',title,'--body',body]);
  const add = ['governance:proposal','governance:voting'];
  const agent = targetAgent(body);
  if (agent) add.push('agent:' + agent);
  editLabels(issue.number,add,TASK_STATES);
  if (!already) {
    gh([
      'issue','comment',String(issue.number),
      '--body',
      '🗳️ Правила управления: прямое создание задач доступно только администраторам QuantDeus. Этот Issue преобразован в предложение сообщества. После голосования администратор может повысить его до реальной очереди coord:task.'
    ]);
  }
}

function main() {
  ensureLabels();
  const issues = ghJson([
    'issue','list','--state','open','--limit','200',
    '--json','number,title,body,labels,author,url'
  ]) || [];

  for (const issue of issues) {
    const title = String(issue.title || '');
    const isProposal = title.startsWith('[PROPOSAL]') || hasLabel(issue,'governance:proposal');
    const isTask = title.startsWith('[TASK]') || hasLabel(issue,'coord:task');

    if (isProposal) {
      normalizeProposal(issue);
      continue;
    }
    if (!isTask) continue;

    if (taskAuthorized(issue)) normalizeAuthorizedTask(issue);
    else downgradeTask(issue);
  }
}

main();
