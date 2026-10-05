const fs = require('fs');
const openclawOffice = require('./openclaw-office-client');
const { getGithubOidcToken } = require('./github-oidc');
const { QUANTDEUS_SHIELD_VERSION, shieldInput } = require('./prompt-shield');
const { execFileSync } = require('child_process');

const repo = process.env.GITHUB_REPOSITORY;
const githubToken = process.env.GITHUB_TOKEN;
const telegramToken =
  process.env.TELEGRAM_BOT_TOKEN ||
  process.env.QUANTDEUS_TELEGRAM_BOT_TOKEN ||
  process.env.TELEGRAM_TOKEN ||
  process.env.TELEGRAM;
const telegramIdSet = (...values) => new Set(
  values
    .flatMap(value => String(value || '').split(','))
    .map(x => x.trim())
    .filter(Boolean)
);
const ownerIds = telegramIdSet(
  process.env.QUANTDEUS_OWNER_TELEGRAM_IDS,
  process.env.QUANTDEUS_OWNER_TELEGRAM_ID
);
const adminIds = telegramIdSet(
  process.env.QUANTDEUS_ADMIN_TELEGRAM_IDS,
  process.env.QUANTDEUS_ADMIN_TELEGRAM_ID,
  process.env.TELEGRAM_ADMIN_USER_IDS,
  process.env.TELEGRAM_ADMIN_USER_ID
);
const moderatorIds = telegramIdSet(
  process.env.QUANTDEUS_MODERATOR_TELEGRAM_IDS,
  process.env.QUANTDEUS_MODERATOR_TELEGRAM_ID
);

function localTelegramRole(userId) {
  const id = String(userId || '');
  if (ownerIds.has(id)) return 'owner';
  if (adminIds.has(id)) return 'admin';
  if (moderatorIds.has(id)) return 'moderator';
  return 'member';
}

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

function resolveActiveAgentId(agentId) {
  const agent = byId.get(agentId);
  if (agent?.operational_status === 'medbay' && agent.temporary_delegate && byId.has(agent.temporary_delegate)) {
    return agent.temporary_delegate;
  }
  return agentId;
}

const ghEnv = { ...process.env, GH_TOKEN: githubToken };

const QUANTDEUS_PRO_URL = 'https://quantdeus.whf.bz/ai-fleet/pro/';
const QUANTDEUS_ACCOUNT_URL = 'https://quantdeus.whf.bz/account/';
const WORDPRESS_TELEGRAM_PLAN_URL = 'https://quantdeus.whf.bz/wp-json/quantdeus/v1/ai-fleet/telegram-plan';
const RETRY_SMOKE_AUDIENCE = 'quantdeus-vercel-telegram';
const RETRY_SMOKE_ENDPOINT = process.env.TELEGRAM_RETRY_SMOKE_URL || 'https://quantdeus.vercel.app/api/quantdeus/telegram';
const PUBLIC_BOT_USERNAME = String(process.env.QUANTDEUS_TELEGRAM_BOT_USERNAME || 'QuantDeus_bot').replace(/^@/, '').trim();

async function reportRetrySmoke(payload) {
  const oidc = await getGithubOidcToken(RETRY_SMOKE_AUDIENCE);
  const response = await fetch(RETRY_SMOKE_ENDPOINT, {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + oidc,
      'content-type': 'application/json',
      accept: 'application/json'
    },
    body: JSON.stringify({ mode: 'retry_smoke_complete', ...payload })
  });
  const raw = await response.text();
  if (!response.ok) throw new Error('retry smoke callback ' + response.status + ': ' + raw.slice(0, 500));
}

async function runRetrySmoke(update) {
  const me = await telegram('getMe');
  await reportRetrySmoke({
    phase: 'actions_received',
    update_id: update.update_id,
    telegram_api_ok: Boolean(me?.id),
    llm_ok: false,
    llm_detail: 'actions_lane_received'
  });

  let llmOk = false;
  let llmDetail = '';
  try {
    const result = await openclawOffice.ask({
      profile: 'control-tower',
      messages: [{ role: 'user', content: 'Reply exactly TELEGRAM_ACTIONS_RETRY_OK.' }],
      metadata: { source: 'telegram-retry-smoke', update_id: update.update_id, repository: repo },
      retryTransient: true
    });
    llmDetail = String(result.text || '').replace(/\s+/g, ' ').slice(0, 200);
    llmOk = /TELEGRAM_ACTIONS_RETRY_OK/.test(llmDetail);
  } catch (error) {
    llmDetail = String(error?.message || error).replace(/\s+/g, ' ').slice(0, 200);
  }

  await reportRetrySmoke({
    phase: 'complete',
    update_id: update.update_id,
    telegram_api_ok: Boolean(me?.id),
    llm_ok: llmOk,
    llm_detail: llmDetail || 'empty'
  });
  console.log('Telegram retry smoke completed:', JSON.stringify({
    update_id: update.update_id,
    telegram_api_ok: Boolean(me?.id),
    llm_ok: llmOk,
    llm_detail: llmDetail
  }));
}


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

async function send(chatId, text, replyToMessageId = null, replyMarkup = null) {
  const payload = {
    chat_id: chatId,
    text: String(text).slice(0, 4096),
    disable_web_page_preview: true,
  };
  if (replyToMessageId) payload.reply_parameters = { message_id: replyToMessageId };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  return telegram('sendMessage', payload);
}

function explicitAgent(text) {
  const value = String(text || '');
  const patterns = [
    /^\/agent(?:@[A-Za-z0-9_]+)?\s+([a-z0-9_-]+)/i,
    /^\/propose(?:@[A-Za-z0-9_]+)?\s+([a-z0-9_-]+)/i,
    /^\/task(?:@[A-Za-z0-9_]+)?\s+([a-z0-9_-]+)/i,
    /^\/start(?:@[A-Za-z0-9_]+)?\s+agent_([a-z0-9_-]+)/i,
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match && byId.has(match[1].toLowerCase())) return match[1].toLowerCase();
  }
  const direct = value.match(/^\/([a-z0-9_]+)(?:@[A-Za-z0-9_]+)?(?:\s|$)/i);
  if (direct) {
    const id = direct[1].toLowerCase().replace(/_/g, '-');
    if (byId.has(id)) return id;
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
    ['data', /(?:лейтенант\s+коммандер\s+)?дейт(?:а|у|ой)?|lieutenant commander data|positronic|позитронн|операционно-аналитическ/],
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
  const value = String(text || '');
  if (explicitAgent(value)) {
    const direct = value.match(/^\/[a-z0-9_]+(?:@[A-Za-z0-9_]+)?(?:\s+|$)/i);
    if (direct && !/^\/(?:agent|propose|task)(?:@|\s)/i.test(value) && !/^\/start(?:@|\s)/i.test(value)) {
      return value.slice(direct[0].length).trim();
    }
  }
  return value
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
  if (ownerIds.has(userId) || adminIds.has(userId)) return true;
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

async function wordpressTelegramPlan(userId) {
  const id = String(userId || '').trim();
  if (!id) return { role: 'guest', plan: 'free', source: 'unknown', verified: false };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    let response;
    try {
      response = await fetch(WORDPRESS_TELEGRAM_PLAN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ telegram_id: id }),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }
    const data = await response.json().catch(() => ({}));
    const role = ['owner', 'admin', 'moderator', 'member'].includes(String(data?.role || '').toLowerCase())
      ? String(data.role).toLowerCase()
      : 'member';
    return response.ok && data?.ok === true
      ? {
          role,
          plan: data.plan === 'pro' || ['owner', 'admin'].includes(role) ? 'pro' : 'free',
          source: String(data.source || 'wordpress'),
          verified: true
        }
      : { role: 'member', plan: 'free', source: 'unavailable', verified: false };
  } catch {
    return { role: 'member', plan: 'free', source: 'unavailable', verified: false };
  }
}

async function telegramEntitlement(message) {
  const localRole = localTelegramRole(message?.from?.id);
  if (['owner', 'admin'].includes(localRole)) {
    return { role: localRole, plan: 'pro', source: 'telegram-' + localRole, verified: true };
  }

  const wordpress = await wordpressTelegramPlan(message?.from?.id);
  const role = wordpress.role && wordpress.role !== 'member'
    ? wordpress.role
    : (localRole || wordpress.role || 'member');

  if (['owner', 'admin'].includes(role)) {
    return { ...wordpress, role, plan: 'pro', verified: true };
  }
  if (wordpress.plan === 'pro') return { ...wordpress, role };
  if (await isTelegramAdmin(message)) {
    return { role: 'admin', plan: 'pro', source: 'telegram-group-admin', verified: true };
  }
  return { ...wordpress, role };
}

function httpsUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

function proPaymentProviders() {
  const raw = String(process.env.QUANTDEUS_PRO_PAYMENT_PROVIDERS_JSON || '').trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, 6).map((item, index) => {
      const label = String(item?.label || item?.name || `Касса ${index + 1}`)
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 40);
      const monthUrl = httpsUrl(item?.month_url);
      const yearUrl = httpsUrl(item?.year_url);
      return monthUrl || yearUrl ? { label, monthUrl, yearUrl } : null;
    }).filter(Boolean);
  } catch {
    return [];
  }
}

function proReplyMarkupForEntitlement(entitlement = { plan: 'free' }) {
  const rows = [];
  if (entitlement.plan !== 'pro') {
    for (const provider of proPaymentProviders()) {
      if (provider.monthUrl) {
        rows.push([{ text: `💳 ${provider.label} · 990 ₽/мес`, url: provider.monthUrl }]);
      }
      if (provider.yearUrl) {
        rows.push([{ text: `💳 ${provider.label} · 9 900 ₽/год`, url: provider.yearUrl }]);
      }
    }
  }
  rows.push([
    { text: '👤 Мой аккаунт', url: QUANTDEUS_ACCOUNT_URL },
    { text: 'ℹ️ О Pro', url: QUANTDEUS_PRO_URL }
  ]);
  return { inline_keyboard: rows };
}

function proReplyMarkup() {
  return proReplyMarkupForEntitlement({ plan: 'free' });
}

function mainMenuReplyMarkup() {
  const bot = PUBLIC_BOT_USERNAME || 'QuantDeus_bot';
  return {
    inline_keyboard: [
      [{ text: '🐒 Мартышки · AI Fleet', url: `https://t.me/${bot}?start=agents` }],
      [{ text: '⭐ QuantDeus Pro', url: `https://t.me/${bot}?start=pro` }],
      [{ text: '🌐 QuantDeus', url: 'https://quantdeus.whf.bz/' }]
    ]
  };
}

function proText(entitlement = { role: 'member', plan: 'free', verified: true }) {
  const role = String(entitlement.role || 'member').toLowerCase();
  const labels = {
    owner: 'OWNER / FOUNDER / CEO',
    admin: 'ADMIN',
    moderator: 'MODERATOR',
    member: 'MEMBER',
    guest: 'GUEST'
  };
  const status = entitlement.plan === 'pro'
    ? '✅ Ваш тариф: PRO — активен.'
    : entitlement.verified === false
      ? '⚠️ Тариф временно не подтверждён; безопасный runtime остаётся Free до повторной проверки, но роль не понижается.'
      : '🆓 Ваш тариф: Free.';
  const note = entitlement.plan === 'pro' && ['owner', 'admin'].includes(role)
    ? '👑 Pro закреплён за ролью автоматически и не требует оплаты.'
    : entitlement.plan === 'pro'
      ? '⭐ Pro активирован для этой учётной записи.'
      : 'Покупка Pro расширяет тариф, но не выдаёт административную роль.';

  return [
    '⭐ QuantDeus Pro',
    '',
    '🪪 Роль: ' + (labels[role] || role.toUpperCase()),
    status,
    note,
    '',
    'Free — базовая пользовательская очередь AI Fleet и стандартный приоритет.',
    'Pro — 990 ₽/месяц или 9 900 ₽/год: приоритетная очередь, multi-agent, Research + QA и рабочие артефакты.',
    '',
    'Тариф и условия:',
    QUANTDEUS_PRO_URL
  ].join('\n');
}

function agentsText() {
  const groups = new Map();
  for (const agent of agents) {
    if (!groups.has(agent.group)) groups.set(agent.group, []);
    groups.get(agent.group).push(agent);
  }
  const lines = [`🤖 QuantDeus: ${agents.length} ролей`];
  for (const [group, members] of groups) {
    lines.push('', '[' + group + ']');
    for (const agent of members) lines.push(`/${agent.id.replace(/-/g, '_')} — ${agent.startup_title || agent.name}`);
  }
  lines.push('', 'Нажми команду роли, используй /agent <id> <вопрос> или просто напиши сообщение — роль выберется автоматически.');
  return lines.join('\n');
}

function publicMessageAddressed(message) {
  const chatType = String(message?.chat?.type || 'private');
  if (chatType === 'private') return true;
  const text = String(message?.text || '');
  if (/^\//.test(text.trim())) return true;
  const safeUsername = PUBLIC_BOT_USERNAME.replace(/[^A-Za-z0-9_]/g, '');
  if (safeUsername && new RegExp('@' + safeUsername + '\\b', 'i').test(text)) return true;
  const replyUsername = String(message?.reply_to_message?.from?.username || '').replace(/^@/, '');
  return Boolean(replyUsername && safeUsername && replyUsername.toLowerCase() === safeUsername.toLowerCase());
}
async function handleMessage(message) {
  if (!message || !message.chat || !message.from || message.from.is_bot) return;
  const text = String(message.text || '').trim();
  if (!text) return;
  if (!publicMessageAddressed(message)) return;

  const chatId = message.chat.id;
  const replyId = message.message_id;
  const username = String(message.from.username || '').replace(/[^A-Za-z0-9_]/g, '');

  if (/^\/start(?:@[A-Za-z0-9_]+)?\s+pro(?:\s|$)/i.test(text)) {
    const entitlement = await telegramEntitlement(message);
    await send(chatId, proText(entitlement), replyId, proReplyMarkupForEntitlement(entitlement));
    return;
  }

  if (/^\/start(?:@[A-Za-z0-9_]+)?\s+(?:agents|monkeys)(?:\s|$)/i.test(text)) {
    await send(chatId, agentsText(), replyId, mainMenuReplyMarkup());
    return;
  }

  if (/^\/start(?:@[A-Za-z0-9_]+)?(?:\s|$)/i.test(text)) {
    const chosen = explicitAgent(text);
    if (chosen) {
      await send(chatId, advisory(chosen, 'Роль выбрана через Telegram deep-link.'), replyId);
      return;
    }
    await send(chatId,
      '🖖 QuantDeus Store Bot online. Публичный чат открыт для всех.\n\n' +
      '🐒 Мартышки AI Fleet работают прямо в этом боте.\n' +
      '⭐ QuantDeus Pro доступен здесь же; админам и создателю — автоматически.\n\n' +
      `🛡️ QuantDeus Shield ${QUANTDEUS_SHIELD_VERSION}: public tools BROKERED READ/QUERY; prompt-injection и secret-exfiltration блокируются до LLM.\n\n` +
      'Пиши обычным текстом — я автоматически выберу роль гомункула по теме.\n' +
      '/monkeys или /agents — мартышки AI Fleet\n' +
      '/pro — QuantDeus Free / Pro\n' +
      '/shield — статус защиты\n' +
      '/agent <id> <вопрос> — обратиться к конкретной роли\n' +
      '/propose <id> <идея> — proposal для admin-публикации\n' +
      '/status — состояние очереди\n' +
      '/task <id> <задача> — прямой task только для Telegram admin',
      replyId,
      mainMenuReplyMarkup()
    );
    return;
  }

  if (/^\/help(?:@[A-Za-z0-9_]+)?(?:\s|$)/i.test(text)) {
    await send(chatId,
      'Команды QuantDeus:\n/monkeys или /agents — 🐒 мартышки AI Fleet\n/pro — ⭐ Free / Pro\n/shield — защита публичного бота\n/agent <id> <вопрос>\n/propose <id> <идея> (admin publish)\n/status\n/task <id> <задача> (admin)\n\nЧат открыт всем; публичные пользователи не получают GitHub/WordPress/Vercel write-доступ.',
      replyId,
      mainMenuReplyMarkup()
    );
    return;
  }

  if (/^\/pro(?:@[A-Za-z0-9_]+)?(?:\s|$)/i.test(text)) {
    const entitlement = await telegramEntitlement(message);
    await send(chatId, proText(entitlement), replyId, proReplyMarkupForEntitlement(entitlement));
    return;
  }
  if (/^\/shield(?:@[A-Za-z0-9_]+)?(?:\s|$)/i.test(text)) {
    await send(chatId, `🛡️ QuantDeus Shield ${QUANTDEUS_SHIELD_VERSION}\nPublic access: OPEN\nPublic tools: BROKERED READ / QUERY\nPrivileged writes: OWNER/ADMIN BROKER ONLY\nPrompt injection: PRE-FILTER + SYSTEM FIREWALL + UNTRUSTED TOOL OUTPUT\nSecret leakage: OUTPUT FILTER\nGroups: COMMANDS / MENTIONS / REPLIES ONLY`, replyId);
    return;
  }

  if (/^\/(?:agents|monkeys)(?:@[A-Za-z0-9_]+)?(?:\s|$)/i.test(text)) {
    await send(chatId, agentsText(), replyId, mainMenuReplyMarkup());
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
    const requestedAgentId = explicitAgent(text);
    const agentId = requestedAgentId ? resolveActiveAgentId(requestedAgentId) : null;
    const idea = stripCommand(text);
    if (!agentId || !idea) {
      await send(chatId, 'Формат: /propose <agent-id> <идея>', replyId);
      return;
    }
    const ideaShield = shieldInput(idea);
    if (ideaShield.blocked) {
      console.warn('[quantdeus-shield] channel=telegram-actions-propose status=blocked reasons=' + ideaShield.reasons.join(','));
      await send(chatId, ideaShield.response, replyId);
      return;
    }
    if (!(await isTelegramAdmin(message))) {
      await send(chatId, '🛡️ Public mode — brokered read-tools. Proposal можно исследовать и обсудить здесь, но публикация/мутация GitHub доступна только администратору.', replyId);
      return;
    }
    const url = createProposal(agentId, ideaShield.normalized, username);
    await send(chatId, `🗳️ Proposal создан для ${agentId}:\n${url}`, replyId);
    return;
  }

  if (/^\/task(?:@[A-Za-z0-9_]+)?\s+/i.test(text)) {
    const requestedAgentId = explicitAgent(text);
    const agentId = requestedAgentId ? resolveActiveAgentId(requestedAgentId) : null;
    const task = stripCommand(text);
    if (!agentId || !task) {
      await send(chatId, 'Формат: /task <agent-id> <задача>', replyId);
      return;
    }
    if (!(await isTelegramAdmin(message))) {
      await send(chatId, 'Прямой /task доступен только Telegram admin. Используй /propose для обычного предложения.', replyId);
      return;
    }
    const taskShield = shieldInput(task, { allowToolRequests: true });
    if (taskShield.blocked) {
      console.warn('[quantdeus-shield] channel=telegram-admin-task status=blocked reasons=' + taskShield.reasons.join(','));
      await send(chatId, taskShield.response, replyId);
      return;
    }
    const safeTask = taskShield.normalized;
    const url = createAdminTask(agentId, safeTask, username);
    await send(chatId, `🚀 Task отправлен гомункулу ${agentId}:\n${url}`, replyId);
    if (openclawOffice.configured()) {
      try {
        const result = await openclawOffice.ask({
          profile: agentId,
          trusted: true,
          messages: [{ role: 'user', content: `Execute this approved QuantDeus admin task. Audit Issue: ${url}\n\n${safeTask}` }],
          metadata: { source: 'telegram-admin-task', chat_id: chatId, message_id: replyId, username: username || 'unknown', repository: repo, audit_issue: url }
        });
        await send(chatId, '🦞 OpenClaw Admin Office:\n' + result.text, replyId);
      } catch (error) {
        console.error('OpenClaw Admin Office /task:', error.message || error);
        await send(chatId, '⚠️ Task записан в GitHub, но OpenClaw Admin Office не смог выполнить live-run: ' + String(error.message || error).slice(0, 700), replyId);
      }
    }
    return;
  }

  if (/^\/agent(?:@[A-Za-z0-9_]+)?\s+/i.test(text)) {
    const requestedAgentId = explicitAgent(text);
    const agentId = requestedAgentId ? resolveActiveAgentId(requestedAgentId) : null;
    if (!agentId) {
      await send(chatId, 'Не знаю такой роли. /agents покажет канонические ID.', replyId);
      return;
    }
    const query = stripCommand(text);
    if (openclawOffice.configured()) {
      try {
        const result = await openclawOffice.ask({
          profile: agentId,
          messages: [{ role: 'user', content: query }],
          metadata: { source: 'telegram', chat_id: chatId, message_id: replyId, username: username || 'unknown', repository: repo, requested_agent_id: requestedAgentId || agentId, delegated_from: requestedAgentId && requestedAgentId !== agentId ? requestedAgentId : '' },
          retryTransient: true
        });
        await send(chatId, result.text, replyId);
        return;
      } catch (error) {
        console.error('OpenClaw Office /agent fallback:', error.message || error);
      }
    }
    await send(chatId, advisory(agentId, query), replyId);
    return;
  }

  const requestedAgentId = autoAgent(text);
  const agentId = resolveActiveAgentId(requestedAgentId);
  if (openclawOffice.configured()) {
    try {
      const result = await openclawOffice.ask({
        profile: agentId,
        messages: [{ role: 'user', content: text }],
        metadata: { source: 'telegram', chat_id: chatId, message_id: replyId, username: username || 'unknown', repository: repo, requested_agent_id: requestedAgentId, delegated_from: requestedAgentId !== agentId ? requestedAgentId : '' },
        retryTransient: true
      });
      await send(chatId, result.text, replyId);
      return;
    } catch (error) {
      console.error('OpenClaw Office auto-route fallback:', error.message || error);
    }
  }
  await send(chatId, '🔀 Авто-роль: ' + agentId + (requestedAgentId !== agentId ? ' (временно за ' + requestedAgentId + ')' : '') + '\n\n' + advisory(agentId, text), replyId);
}

function decodeWebhookUpdate() {
  const encoded = String(process.env.TELEGRAM_UPDATE_B64 || '').trim();
  const rawJson = String(process.env.TELEGRAM_UPDATE_JSON || '').trim();
  if (!encoded && !rawJson) throw new Error('TELEGRAM_UPDATE_B64 or TELEGRAM_UPDATE_JSON is required');
  const raw = rawJson || Buffer.from(encoded, 'base64url').toString('utf8');
  const update = JSON.parse(raw);
  if (!Number.isInteger(update.update_id)) throw new Error('telegram update_id is required');
  if (!update.message) return { update, message: null };
  return { update, message: update.message };
}

async function main() {
  const { update, message } = decodeWebhookUpdate();
  if (update.quantdeus_retry_smoke === true) {
    await runRetrySmoke(update);
    return;
  }
  if (!message) {
    console.log(`Telegram webhook update ignored: update_id=${update.update_id}, reason=no_message`);
    return;
  }

  try {
    await handleMessage(message);
    console.log(`Telegram webhook handled: update_id=${update.update_id}, chat_id=${message.chat?.id || 'unknown'}, message_id=${message.message_id || 'unknown'}`);
  } catch (error) {
    console.error('message handling failed:', error.stack || error.message || error);
    if (message?.chat?.id) {
      await send(
        message.chat.id,
        '⚠️ QuantDeus bot: не удалось завершить этот маршрут. GitHub Actions сохранил ошибку в run log.',
        message.message_id
      ).catch(() => {});
    }
    throw error;
  }
}

main().catch(error => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
