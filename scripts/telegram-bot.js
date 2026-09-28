const fs = require('fs');
const hermesOffice = require('./hermes-office-client');
const path = require('path');
const { execFileSync } = require('child_process');

const repo = process.env.GITHUB_REPOSITORY;
const githubToken = process.env.GITHUB_TOKEN;
const telegramToken = process.env.TELEGRAM_BOT_TOKEN || process.env.QUANTDEUS_TELEGRAM_BOT_TOKEN;
const statePath = process.env.TELEGRAM_STATE_PATH || '.telegram-state/offset';
const adminIds = new Set(
  String(process.env.TELEGRAM_ADMIN_USER_IDS || '')
    .split(',')
    .map(x => x.trim())
    .filter(Boolean)
);

if (!repo || !githubToken) {
  console.error('GITHUB_REPOSITORY and GITHUB_TOKEN are required');
  process.exit(1);
}

if (!telegramToken) {
  console.error('TELEGRAM_BOT_TOKEN is not available to this workflow. Add it as a repository Actions secret.');
  process.exit(1);
}

const registry = JSON.parse(fs.readFileSync('coordination/agents.json', 'utf8'));
const agents = registry.agents || [];
const byId = new Map(agents.map(agent => [agent.id, agent]));
const ghEnv = { ...process.env, GH_TOKEN: githubToken };

function gh(args) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    env: ghEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function ghJson(args) {
  const out = gh(args);
  return out ? JSON.parse(out) : null;
}

function labelsOf(issue) {
  return (issue.labels || []).map(label => typeof label === 'string' ? label : label.name);
}

function shortText(text, max = 72) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : clean.slice(0, max - 1).trimEnd() + '…';
}

async function telegram(method, payload = {}) {
  const response = await fetch(`https://api.telegram.org/bot${telegramToken}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok !== true) {
    throw new Error(`Telegram ${method} failed: ${response.status} ${body.description || 'unknown error'}`);
  }
  return body.result;
}

async function send(chatId, text, replyToMessageId = null) {
  const payload = {
    chat_id: chatId,
    text: String(text).slice(0, 4096),
    disable_web_page_preview: true,
  };
  if (replyToMessageId) payload.reply_parameters = { message_id: replyToMessageId };
  return telegram('sendMessage', payload);
}

function explicitAgent(text) {
  const patterns = [
    /^\/agent(?:@[A-Za-z0-9_]+)?\s+([a-z0-9_-]+)/i,
    /^\/propose(?:@[A-Za-z0-9_]+)?\s+([a-z0-9_-]+)/i,
    /^\/task(?:@[A-Za-z0-9_]+)?\s+([a-z0-9_-]+)/i,
    /^\/start(?:@[A-Za-z0-9_]+)?\s+agent_([a-z0-9_-]+)/i,
  ];
  for (const pattern of patterns) {
    const match = String(text || '').match(pattern);
    if (match && byId.has(match[1].toLowerCase())) return match[1].toLowerCase();
  }
  return null;
}

function autoAgent(text) {
  const explicit = explicitAgent(text);
  if (explicit) return explicit;
  const value = String(text || '').toLowerCase();

  const routes = [
    // Product/engineering specialists first: their terms can overlap with Control Tower.
    ['qa-syntax', /syntax|синтакс|lint|eslint|парсинг|parse error|json error|валидност.*json/],
    ['qa-contract', /contract validator|контракт.*агент|инвариант|schema|схем[аы]|compliance|совместимост.*реестр/],
    ['qa-repair', /\bqa\b|smoke|регресс|сломал|сломано|repair|почин.*тест|ошибка проверки|validator/],
    ['guardian', /security|секрет|secret|token|токен|permission|права|oauth|уязвим|privileged|безопасност.*код/],
    ['tasksmith', /реализ|implement|напис.*код|кодир|patch|фикс|fix|refactor|рефактор|commit|коммит/],
    ['verifier', /acceptance|критери.*при[её]м|requirements|требован|проверь.*тз|верифиц.*задач/],
    ['analyst', /impact|blast radius|dependency|зависимост|архитектурн.*влиян|risk analysis|анализ.*изменен/],
    ['strategist', /architecture|архитектур|план реализац|solution design|стратег.*реализац|roadmap.*тех/],
    ['scout', /discovery|развед|контекст.*продукт|исслед.*репо|repo scout|найди.*в.*репо/],

    // Research and public pillars.
    ['space', /\bwarp\b|варп|космос|space|propulsion|двигател|isru|марс|луна|orbit/],
    ['energy', /энерг|energy|fusion|термояд|battery|аккумулятор|grid|электрич/],
    ['potential', /здоров|health|biohack|долголет|education|образован|accessibility|human potential/],
    ['justice', /privacy|приват|governance|этик|justice|справедлив|resource governance|алгоритмич.*справедлив/],
    ['orchestrator', /research pipeline|evidence pipeline|r&d|ниокр|исследовательск.*операц|оркестр.*исслед/],
    ['sherlock', /расслед|research|science|наук|гипотез|hypothesis|evidence|доказатель|аномал/],
    ['tuvok', /логик|logic|противореч|assumption|эпистем|premise|предпосыл/],

    // Growth / communications.
    ['herald', /\bpr\b|пресс|media|медиа|релиз|outreach|коммуникац|публикац/],
    ['archivist', /seo|документац|docs|каталог|discoverability|индексац|онбординг.*док/],
    ['unity', /маркетинг|marketing|community|сообществ|recruit|набор|партн[её]р|contributor|коллаборац/],
    ['synthesis', /бренд|brand|дизайн|design|визуал|контент|creative|музык|эстетик|кампан/],

    // Executive / orchestration.
    ['emh', /конфликт|спор|медиац|mediat|diplom|деэскал/],
    ['seven-of-nine', /bottleneck|узк.*мест|приоритет|backlog|эффективност|wip|дубли.*задач/],
    ['pillar-executor', /столп|pillar|портфел.*задач|execution board|шесть направлен/],
    ['strategic-hub', /стратегическ.*сигнал|strategy signal|приоритет.*портфел|strategic hub/],
    ['control-tower', /github|action|workflow|верцел|vercel|telegram|бот|bot|api|deploy|сайт|app|автоматизац/],
    ['seven-of-nine', /координ|dispatcher|диспетчер|назнач.*агент|маршрутиз|общ.*статус|что делать дальше/],
  ];
  for (const [id, pattern] of routes) if (pattern.test(value) && byId.has(id)) return id;
  return 'seven-of-nine';
}

function stripCommand(text) {
  return String(text || '')
    .replace(/^\/(?:agent|propose|task)(?:@[A-Za-z0-9_]+)?\s+[a-z0-9_-]+\s*/i, '')
    .replace(/^\/start(?:@[A-Za-z0-9_]+)?\s+agent_[a-z0-9_-]+\s*/i, '')
    .trim();
}

function queueSnapshot(agentId) {
  const issues = ghJson(['issue', 'list', '--state', 'open', '--limit', '100', '--json', 'number,title,url,labels']) || [];
  const tasks = issues.filter(issue => labelsOf(issue).includes('coord:task'));
  const related = issues
    .filter(issue => labelsOf(issue).includes('agent:' + agentId))
    .slice(0, 4);
  const stats = {
    ready: tasks.filter(issue => labelsOf(issue).includes('coord:ready')).length,
    active: tasks.filter(issue => labelsOf(issue).includes('coord:active')).length,
    blocked: tasks.filter(issue => labelsOf(issue).includes('coord:blocked')).length,
  };
  return { issues, tasks, related, stats };
}

function advisory(agentId, query = '') {
  const agent = byId.get(agentId) || byId.get('coordinator');
  const { related, stats } = queueSnapshot(agent.id);
  const lines = [
    `${agent.emoji || '🤖'} ${agent.name}`,
    `Роль: ${agent.role}`,
  ];
  if (query) lines.push(`Маршрут запроса: ${shortText(query, 240)}`);
  lines.push(`Очередь QuantDeus: 🟢 ${stats.ready} ready · 🟡 ${stats.active} active · 🚧 ${stats.blocked} blocked`);
  if (related.length) {
    lines.push('', 'Связанные Issues:');
    for (const issue of related) lines.push(`#${issue.number} — ${issue.title}\n${issue.url}`);
  } else {
    lines.push('', 'Открытых Issues для этой роли сейчас нет.');
  }
  lines.push('', `Команда роли: /agent ${agent.id} <вопрос>`);
  lines.push(`Предложить работу: /propose ${agent.id} <идея>`);
  return lines.join('\n');
}

function ensureAgentLabel(agent) {
  const label = 'agent:' + agent.id;
  try {
    gh(['label', 'create', label, '--color', '55d8ff', '--description', 'Target: ' + agent.name, '--force']);
  } catch (error) {
    console.error('label ensure failed:', error.stderr?.toString() || error.message);
  }
}

function createProposal(agentId, idea, sourceUser = '') {
  const agent = byId.get(agentId);
  ensureAgentLabel(agent);
  const body = [
    '## Telegram proposal',
    '',
    idea,
    '',
    `Target agent: \`${agent.id}\``,
    sourceUser ? `Source: QuantDeus Telegram @${sourceUser} (public-safe handoff).` : 'Source: QuantDeus Telegram bot (public-safe handoff).',
    '',
    `<!-- qd-target-agent:${agent.id} -->`,
  ].join('\n');
  return gh([
    'issue', 'create',
    '--title', '[PROPOSAL] ' + shortText(idea),
    '--body', body,
    '--label', 'governance:proposal',
    '--label', 'governance:voting',
    '--label', 'agent:' + agent.id,
  ]);
}

function createAdminTask(agentId, task, sourceUser = '') {
  const agent = byId.get(agentId);
  ensureAgentLabel(agent);
  const body = [
    '## Telegram admin task',
    '',
    task,
    '',
    `Target agent: \`${agent.id}\``,
    sourceUser ? `Approved by Telegram admin @${sourceUser}.` : 'Approved by a Telegram chat admin.',
    '',
    `<!-- qd-target-agent:${agent.id} -->`,
  ].join('\n');
  return gh([
    'issue', 'create',
    '--title', '[TASK] ' + shortText(task),
    '--body', body,
    '--label', 'governance:passed',
    '--label', 'coord:task',
    '--label', 'coord:ready',
    '--label', 'agent:' + agent.id,
  ]);
}

async function isTelegramAdmin(message) {
  const userId = String(message.from?.id || '');
  if (adminIds.has(userId)) return true;
  if (!message.chat || !message.from || message.chat.type === 'private') return false;
  try {
    const member = await telegram('getChatMember', {
      chat_id: message.chat.id,
      user_id: message.from.id,
    });
    return ['creator', 'administrator'].includes(member.status);
  } catch (error) {
    console.error('getChatMember:', error.message);
    return false;
  }
}

function agentsText() {
  const groups = new Map();
  for (const agent of agents) {
    if (!groups.has(agent.group)) groups.set(agent.group, []);
    groups.get(agent.group).push(agent);
  }
  const lines = ['🤖 QuantDeus: 26 ролей'];
  for (const [group, members] of groups) {
    lines.push('', '[' + group + ']');
    for (const agent of members) lines.push(`/${agent.id.replace(/-/g, '_')} — ${agent.startup_title || agent.name}`);
  }
  lines.push('', 'Используй /agent <id> <вопрос> или просто напиши сообщение — роль выберется автоматически.');
  return lines.join('\n');
}

async function handleMessage(message) {
  if (!message || !message.chat || !message.from || message.from.is_bot) return;
  const text = String(message.text || '').trim();
  if (!text) return;

  const chatId = message.chat.id;
  const replyId = message.message_id;
  const username = String(message.from.username || '').replace(/[^A-Za-z0-9_]/g, '');

  if (/^\/start(?:@[A-Za-z0-9_]+)?(?:\s|$)/i.test(text)) {
    const chosen = explicitAgent(text);
    if (chosen) {
      await send(chatId, advisory(chosen, 'Роль выбрана через Telegram deep-link.'), replyId);
      return;
    }
    await send(chatId,
      '🖖 QuantDeus GitHub Bot online.\n\n' +
      'Пиши обычным текстом — я автоматически выберу роль гомункула по теме.\n' +
      '/agents — список ролей\n' +
      '/agent <id> <вопрос> — обратиться к конкретной роли\n' +
      '/propose <id> <идея> — создать proposal в GitHub\n' +
      '/status — состояние очереди\n' +
      '/task <id> <задача> — прямой task только для Telegram admin',
      replyId
    );
    return;
  }

  if (/^\/help(?:@[A-Za-z0-9_]+)?(?:\s|$)/i.test(text)) {
    await send(chatId,
      'Команды QuantDeus:\n/agents\n/agent <id> <вопрос>\n/propose <id> <идея>\n/status\n/task <id> <задача> (admin)\n\nОбычный текст маршрутизируется автоматически.',
      replyId
    );
    return;
  }

  if (/^\/agents(?:@[A-Za-z0-9_]+)?(?:\s|$)/i.test(text)) {
    await send(chatId, agentsText(), replyId);
    return;
  }

  if (/^\/status(?:@[A-Za-z0-9_]+)?(?:\s|$)/i.test(text)) {
    const snapshot = queueSnapshot('coordinator');
    await send(chatId,
      `🧭 QuantDeus queue\n🟢 ready: ${snapshot.stats.ready}\n🟡 active: ${snapshot.stats.active}\n🚧 blocked: ${snapshot.stats.blocked}\n\nSource of truth: https://github.com/${repo}/issues`,
      replyId
    );
    return;
  }

  if (/^\/propose(?:@[A-Za-z0-9_]+)?\s+/i.test(text)) {
    const agentId = explicitAgent(text);
    const idea = stripCommand(text);
    if (!agentId || !idea) {
      await send(chatId, 'Формат: /propose <agent-id> <идея>', replyId);
      return;
    }
    const url = createProposal(agentId, idea, username);
    await send(chatId, `🗳️ Proposal создан для ${agentId}:\n${url}`, replyId);
    return;
  }

  if (/^\/task(?:@[A-Za-z0-9_]+)?\s+/i.test(text)) {
    const agentId = explicitAgent(text);
    const task = stripCommand(text);
    if (!agentId || !task) {
      await send(chatId, 'Формат: /task <agent-id> <задача>', replyId);
      return;
    }
    if (!(await isTelegramAdmin(message))) {
      await send(chatId, 'Прямой /task доступен только Telegram admin. Используй /propose для обычного предложения.', replyId);
      return;
    }
    const url = createAdminTask(agentId, task, username);
    await send(chatId, `🚀 Task отправлен гомункулу ${agentId}:\n${url}`, replyId);
    return;
  }

  if (/^\/agent(?:@[A-Za-z0-9_]+)?\s+/i.test(text)) {
    const agentId = explicitAgent(text);
    if (!agentId) {
      await send(chatId, 'Не знаю такой роли. /agents покажет канонические ID.', replyId);
      return;
    }
    const query = stripCommand(text);
    if (hermesOffice.configured()) {
      try {
        const result = await hermesOffice.ask({
          profile: agentId,
          messages: [{ role: 'user', content: query }],
          metadata: { source: 'telegram', chat_id: chatId, message_id: replyId, username: username || 'unknown', repository: repo }
        });
        await send(chatId, result.text, replyId);
        return;
      } catch (error) {
        console.error('Hermes Office /agent fallback:', error.message || error);
      }
    }
    await send(chatId, advisory(agentId, query), replyId);
    return;
  }

  const agentId = autoAgent(text);
  if (hermesOffice.configured()) {
    try {
      const result = await hermesOffice.ask({
        profile: agentId,
        messages: [{ role: 'user', content: text }],
        metadata: { source: 'telegram', chat_id: chatId, message_id: replyId, username: username || 'unknown', repository: repo }
      });
      await send(chatId, result.text, replyId);
      return;
    } catch (error) {
      console.error('Hermes Office auto-route fallback:', error.message || error);
    }
  }
  await send(chatId, '🔀 Авто-роль: ' + agentId + '\n\n' + advisory(agentId, text), replyId);
}

function readOffset() {
  try {
    const value = Number(fs.readFileSync(statePath, 'utf8').trim());
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function writeOffset(value) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, String(value) + '\n');
}

async function main() {
  // GitHub Actions polling is now the canonical Telegram transport.
  // Removing a legacy webhook is idempotent and prevents getUpdates conflicts.
  await telegram('deleteWebhook', { drop_pending_updates: false });

  const offset = readOffset();
  const updates = await telegram('getUpdates', offset
    ? { offset, limit: 100, timeout: 0, allowed_updates: ['message'] }
    : { offset: -25, limit: 25, timeout: 0, allowed_updates: ['message'] }
  );

  let nextOffset = offset;
  const firstRunCutoff = Math.floor(Date.now() / 1000) - 15 * 60;

  for (const update of updates) {
    nextOffset = Math.max(nextOffset, Number(update.update_id || 0) + 1);
    const message = update.message;
    if (!offset && message?.date && message.date < firstRunCutoff) continue;
    try {
      await handleMessage(message);
    } catch (error) {
      console.error('message handling failed:', error.stack || error.message || error);
      if (message?.chat?.id) {
        await send(message.chat.id, '⚠️ QuantDeus bot: не удалось завершить этот маршрут. GitHub Actions сохранил ошибку в run log.', message.message_id).catch(() => {});
      }
    }
  }

  if (nextOffset > 0) writeOffset(nextOffset);
  console.log(`Telegram poll complete: updates=${updates.length}, next_offset=${nextOffset || 0}`);
}

main().catch(error => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
