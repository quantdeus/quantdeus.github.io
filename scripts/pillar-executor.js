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
Создать небольшой доказательный реестр энергетических возможностей, по которым QuantDeus может выполнить конкретную работу.

## Артефакт
Добавить \`coordination/pillars/energy.md\` с **3 конкретными возможностями**. Каждая должна содержать:
- утверждение;
- URL первичного или качественного источника + дату;
- уровень доказательности A/B/C;
- условие, которое опровергнет или ослабит утверждение;
- одно следующее исполнимое действие QuantDeus.

## Критерии приёмки
- [ ] Файл существует в GitHub.
- [ ] Оценены ровно 3 возможности.
- [ ] У каждой есть источник, уровень доказательности, условие опровержения и следующее действие.
- [ ] Слово «прорыв» не используется без соответствующих доказательств.

## Исполнение
Предпочтительный исполнитель: **коннектор GitHub / Control Tower**.
Безопасная область: исследования + документация репозитория; без расходов, внешних контактов и публикации в production.

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
Превратить «алгоритмическую справедливость» из лозунга в операционное правило для агентов QuantDeus.

## Артефакт
Добавить \`coordination/pillars/justice.md\` с повторно используемой записью решения:
- цель и затронутые люди;
- доказательства и происхождение;
- влияние на приватность;
- обратимость;
- денежная/кредитная стоимость;
- требуемое человеческое одобрение;
- условие неуспеха красной команды;
- окончательный проверенный результат.

Применить шаблон к **одному реальному действию QuantDeus**.

## Критерии приёмки
- [ ] Есть повторно используемый шаблон решения.
- [ ] Одно реальное действие записано от начала до конца.
- [ ] Человеческий контроль и откат указаны явно.
- [ ] Прокси-метрики не выдаются за реальные результаты.

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
Создать конкретный путь сотрудничества для исследователей, разработчиков и авторов.

## Артефакт
Добавить шаблон GitHub Issue для предложений о сотрудничестве с полями:
- вклад / потребность;
- связанные столпы;
- публичные доказательства или портфолио;
- ожидаемый результат;
- зависимости;
- ограничения приватности и безопасности;
- добровольный способ связи.

## Критерии приёмки
- [ ] Шаблон сотрудничества добавлен в репозиторий.
- [ ] Он не просит секреты или закрытые персональные данные.
- [ ] Участник понимает следующий шаг без приватного чата.
- [ ] Центр координации может классифицировать новый Issue.

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
Сделать варп-направление исполнимым и фальсифицируемым из центрального координационного слоя.

## Артефакт
Добавить \`coordination/pillars/space.md\` с текущей контрольной точкой \`quantdeus/Warp-buble\` и явным состоянием для:
геометрии, EOM, остатка, NEC, энергии, кривизны/приливных сил, горизонта, причинности, устойчивости и EFT.

Каждые ворота должны иметь явный статус и ссылку на доказательства репозитория.

## Критерии приёмки
- [ ] Записан последний проверенный SHA Warp.
- [ ] Все десять ворот имеют явное состояние и доказательства.
- [ ] При отсутствии доказательств используется статус НЕИЗВЕСТНО.
- [ ] Физический прорыв не заявляется без прохождения требуемых ворот.

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
Превратить Telegram Mini App из статической поверхности в измеримый пользовательский цикл.

## Артефакт
Добавить небольшое сохраняющее приватность действие обратной связи в Mini App (например «полезно / не полезно» и необязательную короткую заметку), сохраняемое локально, пока отдельный бэкенд не одобрен явно.

## Критерии приёмки
- [ ] Пользователь может отправить обратную связь из Mini App.
- [ ] Медицинский диагноз или вывод не производится.
- [ ] Закрытые данные по умолчанию не передаются.
- [ ] Одно наблюдаемое событие завершения можно проверить локально.
- [ ] README описывает способ тестирования.

## Исполнение
Предпочтительный исполнитель: **коннектор GitHub / Control Tower**.
Публикация в production требует отдельного одобрения.

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
Превратить культурный столп в повторно используемые артефакты реализации.

## Артефакт
Добавить \`docs/design-system.md\` и небольшой набор CSS-переменных/токенов для Telegram Mini App:
- иерархия типографики;
- отступы и радиусы;
- ночные/неоновые токены;
- светлые/водные/зелёные токены Frutiger Aero;
- правила доступности и контраста.

## Критерии приёмки
- [ ] Токены документированы.
- [ ] Токены реализованы в коде или отдельном stylesheet.
- [ ] Существующий UI может внедрять их без полной переписи.
- [ ] Культурный язык не смешивается с научными утверждениями.

## Исполнение
Предпочтительный исполнитель: **коннектор GitHub / Control Tower**.
Публикация в production требует отдельного одобрения.

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
