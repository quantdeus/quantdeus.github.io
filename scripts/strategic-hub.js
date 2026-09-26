const fs = require('fs');
const { execFileSync } = require('child_process');
const crypto = require('crypto');
const { doctrineSummary } = require('./doctrine');
const doctrine = doctrineSummary();

const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
const HUB_TITLE = '🧭 QuantDeus Strategic Navigation Hub';

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

function ensureStrategicLabels() {
  const labels = [
    ['evidence:A', '1a7f37', 'Сильные независимо проверяемые доказательства'],
    ['evidence:B', 'bf8700', 'Перспективные данные, требующие дополнительной проверки'],
    ['evidence:C', '6e7781', 'Исследовательский сигнал или ранняя гипотеза'],
    ['publish:wix-ready', '8250df', 'Проверено и одобрено для выборочной публичной публикации'],
  ];

  for (const [name, color, description] of labels) {
    try {
      gh(['label', 'create', name, '--color', color, '--description', description, '--force']);
    } catch (e) {
      console.error(`Label ${name}: ${e.stderr?.toString() || e.message}`);
    }
  }
}

function labelsOf(issue) {
  return (issue.labels || []).map(label => typeof label === 'string' ? label : label.name);
}

function kindOf(issue) {
  if (/^\[SIGNAL\]/i.test(issue.title)) return 'SIGNAL';
  if (/^\[STRATEGY\]/i.test(issue.title)) return 'STRATEGY';
  return null;
}

function evidenceOf(issue) {
  const labels = labelsOf(issue).map(label => label.toLowerCase());
  if (labels.some(label => /evidence[: -]?a|evidence-strong/.test(label))) return 'A — сильные';
  if (labels.some(label => /evidence[: -]?b|evidence-promising/.test(label))) return 'B — перспективные';
  if (labels.some(label => /evidence[: -]?c|evidence-exploratory/.test(label))) return 'C — исследовательские';

  const text = issue.body || '';
  const checkedGrade = text.match(/^\s*[-*]\s*\[[xX]\]\s*([ABC])\s*(?:—|-|:)/m);
  if (checkedGrade) {
    const names = { A: 'сильные', B: 'перспективные', C: 'исследовательские' };
    const grade = checkedGrade[1].toUpperCase();
    return `${grade} — ${names[grade]}`;
  }

  const match = text.match(/(?:evidence|доказательств[ао]?|уровень уверенности)\s*[:—-]\s*([ABC])\b/i);
  return match ? `${match[1].toUpperCase()} — заявлено` : '—';
}

function pillarOf(issue) {
  const labels = labelsOf(issue);
  const label = labels.find(name => /^pillar[-:]/i.test(name));
  if (label) return label.replace(/^pillar[-:]?(?:0[1-6][-:]?)?/i, '') || label;

  const text = `${issue.title} ${issue.body || ''}`.toLowerCase();
  if (/warp|uap|space|orbit|moon|mars|косм|варп/.test(text)) return 'space';
  if (/energy|fusion|solar|энерг|термояд/.test(text)) return 'energy';
  if (/metamaterial|метаматериал/.test(text)) return 'space/materials';
  if (/human|longevity|biohack|человек|долголет/.test(text)) return 'potential';
  if (/justice|ubi|algorithm|справедлив/.test(text)) return 'justice';
  if (/climate|unity|planet|эколог|планет/.test(text)) return 'unity';
  if (/art|culture|music|эстет|культур|музык/.test(text)) return 'synthesis';
  return 'general';
}

function wixTargetOf(issue) {
  const pillar = pillarOf(issue);
  if (/warp|uap|material/i.test(`${issue.title} ${issue.body || ''}`)) return '🌀 Лаборатория варп-пузыря';
  const targets = {
    energy: '⚡ Энергетика будущего',
    justice: '⚖️ Алгоритмическая справедливость',
    unity: '🌍 Планетарное единство',
    space: '🚀 Космическая экспансия',
    potential: '🧬 Человеческий потенциал',
    synthesis: '✨ Эстетика синтеза',
  };
  return targets[pillar] || 'Публичная публикация / разбор';
}

function isPublicCandidate(issue) {
  const labels = labelsOf(issue).map(label => label.toLowerCase());
  return labels.some(label => ['publish:wix-ready', 'publish-wix-ready', 'public:ready'].includes(label));
}

ensureStrategicLabels();

const issues = ghJson([
  'issue', 'list', '--state', 'open', '--limit', '100',
  '--json', 'number,title,body,url,labels,updatedAt',
]) || [];

const strategic = issues
  .filter(issue => kindOf(issue))
  .map(issue => ({
    number: issue.number,
    title: issue.title,
    url: issue.url,
    kind: kindOf(issue),
    evidence: evidenceOf(issue),
    pillar: pillarOf(issue),
    wixTarget: wixTargetOf(issue),
    publicCandidate: isPublicCandidate(issue),
    updatedAt: issue.updatedAt,
  }))
  .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

const signals = strategic.filter(item => item.kind === 'SIGNAL');
const strategies = strategic.filter(item => item.kind === 'STRATEGY');
const publishReady = strategic.filter(item => item.publicCandidate);
const ungraded = signals.filter(item => item.evidence === '—');

const digest = crypto.createHash('sha256')
  .update(JSON.stringify(strategic.map(({ updatedAt, ...item }) => item)))
  .digest('hex')
  .slice(0, 16);

function rows(items) {
  return items.map(item => `| #${item.number} | ${item.evidence} | ${item.pillar} | ${item.publicCandidate ? '✅' : '—'} | ${item.wixTarget} | [${item.title}](${item.url}) |`).join('\n')
    || '| — | — | — | — | — | Нет открытых элементов |';
}

const body = `# 🧭 Стратегический навигационный центр QuantDeus\n\nОперационная панель цикла **[SIGNAL] → [STRATEGY] → [TASK] → проверенный результат → выборочная публичная публикация**. Источник истины — GitHub; наружу выходят только явно подготовленные и проверенные результаты.

## Цивилизационная доктрина

- Версия: **${doctrine.version}**
- Цель: ${doctrine.objective}
- Правило доказательности: ${doctrine.operating_rule}\n\n## Конвейер\n\n- 📡 Открытые сигналы: **${signals.length}**\n- 🧠 Открытые стратегии: **${strategies.length}**\n- 🧪 Сигналы без уровня доказательности: **${ungraded.length}**\n- 🌐 Явно подготовленные кандидаты на публикацию: **${publishReady.length}**\n\n### Сигналы\n\n| Issue | Доказательства | Столп | Готово к публикации | Публичная цель | Элемент |\n|---|---|---|---|---|---|\n${rows(signals)}\n\n### Стратегии\n\n| Issue | Доказательства | Столп | Готово к публикации | Публичная цель | Элемент |\n|---|---|---|---|---|---|\n${rows(strategies)}\n\n## Правило публикации\n\nПубличная публикация не выводится из самого факта существования Issue. Для публичной публикации кандидат должен пройти проверку источников и получить явную метку \`publish:wix-ready\` (или совместимую \`publish-wix-ready\` / \`public:ready\`). До этого материал остаётся внутри исследовательского/стратегического контура.\n\nДля сильного сигнала без уровня доказательности следующий шаг — **проверка доказательств**, а не изменение дорожной карты. THRIVE I/II и другие мировоззренческие источники могут порождать гипотезы, но не повышают уровень доказательности сами по себе. Для принятой стратегии следующий шаг — конкретный **[TASK]** с наблюдаемым результатом.\n\n_Последнее стратегическое обновление: ${new Date().toISOString()}_\n\n<!-- strategic-digest:${digest} -->\n`;

const hubs = ghJson([
  'issue', 'list', '--state', 'all', '--search', `${HUB_TITLE} in:title`, '--limit', '10',
  '--json', 'number,title,body,state',
]) || [];
const hub = hubs.find(issue => issue.title === HUB_TITLE);
const oldDigest = hub?.body?.match(/<!--\s*strategic-digest:([a-f0-9]+)\s*-->/i)?.[1];

fs.writeFileSync('/tmp/quantdeus-strategic-hub.md', body);
if (!hub) {
  gh(['issue', 'create', '--title', HUB_TITLE, '--body-file', '/tmp/quantdeus-strategic-hub.md']);
} else if (oldDigest !== digest) {
  if (hub.state !== 'OPEN' && hub.state !== 'open') gh(['issue', 'reopen', String(hub.number)]);
  gh(['issue', 'edit', String(hub.number), '--body-file', '/tmp/quantdeus-strategic-hub.md']);
}
