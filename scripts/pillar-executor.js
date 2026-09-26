const fs = require('fs');
const { execFileSync } = require('child_process');
const crypto = require('crypto');
const { doctrineSummary } = require('./doctrine');
const doctrine = doctrineSummary();

const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
const BOARD_TITLE = '🧭 QuantDeus Six-Pillar Execution Board';

if (!repo || !token) {
  console.error('GITHUB_REPOSITORY and GITHUB_TOKEN are required');
  process.exit(1);
}

const ghEnv = { ...process.env, GH_TOKEN: token };

function gh(args) {
  return execFileSync('gh', args, {
    encoding: 'utf-8',
    env: ghEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
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

function ensureLabel(name, color, description) {
  try {
    gh(['label', 'create', name, '--color', color, '--description', description, '--force']);
  } catch (err) {
    console.error(`label ${name}: ${err.stderr?.toString() || err.message}`);
  }
}

const PILLARS = [
  {
    id: '01',
    key: 'energy-evidence-register-v1',
    slug: 'energy',
    label: 'pillar-01-energy',
    emoji: '⚡',
    name: 'Энергетика будущего',
    title: '[TASK][Энергия] Создать доказательный реестр энергетических возможностей',
    body: `## Результат
Create a small evidence-first register of future-energy opportunities that QuantDeus can actually act on.

## Артефакт
Add \`coordination/pillars/energy.md\` with **3 concrete opportunities**. Each item must include:
- claim;
- primary or high-quality source URL + date;
- evidence grade A/B/C;
- what would falsify or weaken the claim;
- one next executable action for QuantDeus.

## Критерии приёмки
- [ ] File exists in GitHub.
- [ ] Exactly 3 opportunities are evaluated.
- [ ] Every opportunity has source, evidence grade, falsifier and next action.
- [ ] No "breakthrough" language without evidence.

## Исполнение
Предпочтительный исполнитель: **коннектор GitHub / Control Tower**.
Safe scope: research + repository docs only; no spending, outreach or production deployment.

<!-- qd-task-key:energy-evidence-register-v1 -->`
  },
  {
    id: '02',
    key: 'justice-autonomy-audit-v1',
    slug: 'justice',
    label: 'pillar-02-justice',
    emoji: '⚖️',
    name: 'Алгоритмическая справедливость',
    title: '[TASK][Справедливость] Добавить контракт аудита автономных действий',
    body: `## Результат
Turn "algorithmic justice" into an operational rule for QuantDeus agents instead of a slogan.

## Артефакт
Add \`coordination/pillars/justice.md\` containing a reusable decision record with:
- goal and affected people;
- evidence/provenance;
- privacy impact;
- reversibility;
- money/credit cost;
- required human approval;
- red-team/failure condition;
- final verified outcome.

Use the template on **one real QuantDeus action**.

## Критерии приёмки
- [ ] Reusable decision template exists.
- [ ] One real action is logged end-to-end.
- [ ] Human override and rollback are explicit.
- [ ] Proxy metrics are not presented as outcomes.

## Исполнение
Предпочтительный исполнитель: **коннектор GitHub / Control Tower**.

<!-- qd-task-key:justice-autonomy-audit-v1 -->`
  },
  {
    id: '03',
    key: 'unity-collaboration-intake-v1',
    slug: 'unity',
    label: 'pillar-03-unity',
    emoji: '🌍',
    name: 'Планетарное единство',
    title: '[TASK][Единство] Создать добровольную форму сотрудничества',
    body: `## Результат
Create a concrete collaboration path for researchers, builders and creators.

## Артефакт
Add a GitHub Issue template for collaboration proposals with fields for:
- contribution / need;
- relevant pillar(s);
- public evidence or portfolio;
- expected deliverable;
- dependencies;
- privacy/safety constraints;
- opt-in contact method.

## Критерии приёмки
- [ ] Collaboration issue template is committed.
- [ ] Template avoids requesting secrets or private personal data.
- [ ] A contributor can understand the next step without private chat.
- [ ] Coordination Hub can classify the resulting issue.

## Исполнение
Предпочтительный исполнитель: **коннектор GitHub / Control Tower**.

<!-- qd-task-key:unity-collaboration-intake-v1 -->`
  },
  {
    id: '04',
    key: 'space-warp-gates-v1',
    slug: 'space',
    label: 'pillar-04-space',
    emoji: '🚀',
    name: 'Космическое развитие',
    title: '[TASK][Космос] Подключить Warp-buble к доказательным воротам',
    body: `## Результат
Make the Warp track actionable and falsifiable from the central coordination layer.

## Артефакт
Add \`coordination/pillars/space.md\` with the current \`quantdeus/Warp-buble\` checkpoint and explicit status for:
geometry, EOM, residual, NEC, energy, curvature/tidal, horizon, causality, stability and EFT.

Each gate must be **PASS / FAIL / UNKNOWN** with a repository evidence link.

## Критерии приёмки
- [ ] Latest checked Warp SHA is recorded.
- [ ] All ten gates have explicit status and evidence.
- [ ] UNKNOWN is used when evidence is absent.
- [ ] No physical-breakthrough claim unless all required gates justify it.

## Исполнение
Предпочтительный исполнитель: **коннектор GitHub / Control Tower**.

<!-- qd-task-key:space-warp-gates-v1 -->`
  },
  {
    id: '05',
    key: 'potential-miniapp-feedback-v1',
    slug: 'potential',
    label: 'pillar-05-potential',
    emoji: '🧬',
    name: 'Человеческий потенциал',
    title: '[TASK][Потенциал] Добавить измеримый цикл обратной связи Mini App',
    body: `## Результат
Turn the Telegram Mini App into a measurable user loop rather than a static surface.

## Артефакт
Add a small, privacy-preserving feedback action to the Mini App (for example "useful / not useful" plus optional short note), stored locally unless a separate backend is explicitly approved.

## Критерии приёмки
- [ ] User can submit feedback from the Mini App.
- [ ] No health diagnosis or medical inference is made.
- [ ] No private data is transmitted by default.
- [ ] One observable completion event can be verified locally.
- [ ] README documents how to test it.

## Исполнение
Предпочтительный исполнитель: **коннектор GitHub / Control Tower**.
Production publication requires separate approval.

<!-- qd-task-key:potential-miniapp-feedback-v1 -->`
  },
  {
    id: '06',
    key: 'synthesis-design-tokens-v1',
    slug: 'synthesis',
    label: 'pillar-06-synthesis',
    emoji: '✨',
    name: 'Эстетика синтеза',
    title: '[TASK][Синтез] Описать дизайн-токены Synthwave × Frutiger Aero',
    body: `## Результат
Convert the culture pillar into reusable implementation assets.

## Артефакт
Add \`docs/design-system.md\` and a small set of reusable CSS variables/tokens for the Telegram Mini App:
- typography hierarchy;
- spacing/radius;
- neon/night tokens;
- light/water/green Frutiger Aero tokens;
- accessibility/contrast rule.

## Критерии приёмки
- [ ] Tokens are documented.
- [ ] Tokens are implemented in code or a dedicated stylesheet.
- [ ] Existing UI can adopt them without a full rewrite.
- [ ] Culture language is kept separate from scientific claims.

## Исполнение
Предпочтительный исполнитель: **коннектор GitHub / Control Tower**.
Production publication requires separate approval.

<!-- qd-task-key:synthesis-design-tokens-v1 -->`
  },
];

function ensureLabels() {
  const common = [
    ['coord:task', '1f6feb', 'Координационная задача QuantDeus'],
    ['coord:ready', '2da44e', 'Готово к исполнению'],
    ['coord:active', 'bf8700', 'Исполнение идёт'],
    ['coord:blocked', 'd1242f', 'Заблокировано, требуется вмешательство'],
    ['coord:done', '8250df', 'Завершено и проверено'],
    ['exec:connector', '5319e7', 'Предпочтительный исполнитель: коннектор GitHub / Control Tower'],
    ['priority:p1', 'b60205', 'Наивысший текущий приоритет исполнения'],
  ];
  const pillarLabels = [
    ['pillar-01-energy', 'f9d71c', 'Энергетика будущего'],
    ['pillar-02-justice', '6f42c1', 'Алгоритмическая справедливость'],
    ['pillar-03-unity', '0e8a16', 'Планетарное сотрудничество'],
    ['pillar-04-space', '1d76db', 'Космическое развитие'],
    ['pillar-05-potential', 'd93f0b', 'Человеческий потенциал'],
    ['pillar-06-synthesis', 'c5def5', 'Эстетика синтеза'],
  ];
  for (const args of [...common, ...pillarLabels]) ensureLabel(...args);
}

function taskState(issue) {
  if (hasLabel(issue, 'coord:blocked')) return '🚧 ЗАБЛОКИРОВАНО';
  if (hasLabel(issue, 'coord:active')) return '🟡 АКТИВНО';
  if (hasLabel(issue, 'coord:done')) return '✅ ГОТОВО';
  return '🟢 ГОТОВО';
}

function seedTasks() {
  const all = ghJson(['issue', 'list', '--state', 'all', '--limit', '200', '--json', 'number,title,body,url,state,labels']) || [];

  for (const pillar of PILLARS) {
    const marker = `<!-- qd-task-key:${pillar.key} -->`;
    const existing = all.find(i => (i.body || '').includes(marker));
    if (existing) {
      if (String(existing.state).toLowerCase() === 'open') {
        const wanted = ['coord:task', 'exec:connector', 'priority:p1', pillar.label];
        const existingLabels = labelNames(existing);
        const args = ['issue', 'edit', String(existing.number)];
        let changed = false;
        for (const label of wanted) {
          if (!existingLabels.includes(label)) {
            args.push('--add-label', label);
            changed = true;
          }
        }
        const hasState = ['coord:ready', 'coord:active', 'coord:blocked', 'coord:done']
          .some(label => existingLabels.includes(label));
        if (!hasState) {
          args.push('--add-label', 'coord:ready');
          changed = true;
        }
        if (changed) gh(args);
      }
      continue;
    }

    fs.writeFileSync('/tmp/qd-task.md', pillar.body + '\n');
    gh([
      'issue', 'create',
      '--title', pillar.title,
      '--body-file', '/tmp/qd-task.md',
      '--label', 'coord:task',
      '--label', 'coord:ready',
      '--label', 'exec:connector',
      '--label', 'priority:p1',
      '--label', pillar.label,
    ]);
    console.log(`создана начальная задача ${pillar.slug}`);
  }
}

function refreshBoard() {
  const open = ghJson(['issue', 'list', '--state', 'open', '--limit', '200', '--json', 'number,title,body,url,labels,updatedAt']) || [];
  const tasks = open.filter(i => hasLabel(i, 'coord:task'));

  const rows = PILLARS.map(pillar => {
    const items = tasks
      .filter(i => hasLabel(i, pillar.label))
      .sort((a, b) => {
        const rank = x => hasLabel(x, 'coord:active') ? 0 : hasLabel(x, 'coord:blocked') ? 2 : 1;
        return rank(a) - rank(b) || a.number - b.number;
      });
    const current = items[0];
    return current
      ? `| ${pillar.emoji} ${pillar.name} | ${taskState(current)} | [#${current.number} ${current.title}](${current.url}) | connector | `
      : `| ${pillar.emoji} ${pillar.name} | ⚪ ПУСТО | Создать следующую исполнимую задачу | — |`;
  });

  const digestSource = rows.join('\n');
  const digest = crypto.createHash('sha256').update(digestSource).digest('hex').slice(0, 16);

  const allBoards = ghJson(['issue', 'list', '--state', 'all', '--search', `${BOARD_TITLE} in:title`, '--limit', '10', '--json', 'number,title,body,state,url']) || [];
  let board = allBoards.find(i => i.title === BOARD_TITLE);
  const oldDigest = board?.body?.match(/<!--\s*pillar-exec-digest:([a-f0-9]+)\s*-->/i)?.[1];

  const body = `# 🧭 Доска исполнения шести столпов QuantDeus

Эта доска — **очередь исполнения**, а не новостная сводка.

**Доктрина:** ${doctrine.version}  
**Цель:** ${doctrine.objective}

Правила:
1. Каждый столп должен указывать на конкретную задачу с наблюдаемым артефактом.
2. Предпочтительно иметь одну задачу P1 на столп одновременно.
3. Коннектор GitHub / Control Tower может напрямую выполнять безопасную обратимую работу в репозитории.
4. Публикация в production, расходы, секреты, необратимые действия и чувствительные контакты требуют одобрения человека.
5. Задача считается ГОТОВОЙ только после проверки критериев приёмки.
6. Периодический Pulse Issue не создаётся только ради факта сканирования.
7. Каждая задача должна уменьшать измеримый дефицит/узкое место или создавать повторно используемую возможность; вдохновение не заменяет доказательства.

| Столп | Состояние | Текущая исполнимая задача | Предпочтительный исполнитель |
|---|---|---|---|
${rows.join('\n')}

## Исполнение protocol

- **coord:ready** — можно исполнять сейчас.
- **coord:active** — работа действительно выполняется.
- **coord:blocked** — есть конкретная блокировка.
- **coord:done** — критерии приёмки проверены.
- **exec:connector** — подходит для исполнения через коннектор GitHub / Control Tower.

Coordinator может сводить состояние доски, но **доска существует ради изменений файлов, Issues, ревью, тестов и проверенных артефактов, а не ради генерации отчётов по шести столпам**.

<!-- pillar-exec-digest:${digest} -->
`;

  fs.writeFileSync('/tmp/qd-board.md', body);

  if (!board) {
    gh(['issue', 'create', '--title', BOARD_TITLE, '--body-file', '/tmp/qd-board.md']);
    console.log('доска исполнения создана');
  } else if (oldDigest !== digest) {
    if (String(board.state).toLowerCase() !== 'open') gh(['issue', 'reopen', String(board.number)]);
    gh(['issue', 'edit', String(board.number), '--body-file', '/tmp/qd-board.md']);
    console.log('доска исполнения обновлена');
  } else {
    console.log('доска исполнения без изменений');
  }
}

function main() {
  ensureLabels();
  seedTasks();
  refreshBoard();
}

main();
