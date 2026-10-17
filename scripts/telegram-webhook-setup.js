'use strict';

const fs = require('fs');
const { getGithubOidcToken } = require('./github-oidc');

const AUDIENCE = 'quantdeus-vercel-telegram';
const ENDPOINT = process.env.TELEGRAM_WEBHOOK_SETUP_URL || 'https://quantdeus.vercel.app/api/quantdeus/telegram';
const DEFAULT_TELEGRAM_WEB_APP_URL = 'https://quantdeus.github.io/telegram/';
const TELEGRAM_PROFILES = {
  agent: {
    description: 'QuantDeus Agent — помощник научной и технической команды. Общайся с 29 агентами: исследования, код, координация и проверка результатов.',
    short_description: 'Команда из 29 агентов: исследования, технологии и помощь.'
  },
  store: {
    description: 'QuantDeus Store — магазин услуг и вход на сайт через Telegram. Узнавай об автоматизации бизнеса, проектах и подписке Pro.',
    short_description: 'Услуги QuantDeus, личный кабинет и вход через Telegram.'
  }
};
const registry = JSON.parse(fs.readFileSync('coordination/agents.json', 'utf8'));
const agents = Array.isArray(registry.agents) ? registry.agents : [];
const BASE_TELEGRAM_COMMANDS = [
  { command: 'start', description: 'Запустить QuantDeus' },
  { command: 'help', description: 'Команды QuantDeus' },
  { command: 'agents', description: 'Показать команду из 29 агентов' },
  { command: 'monkeys', description: 'Познакомиться с агентами QuantDeus' },
  { command: 'pro', description: 'Проверить мой тариф' },
  { command: 'shield', description: 'Проверить защиту бота' },
  { command: 'agent', description: 'Задать вопрос выбранному агенту' },
  { command: 'propose', description: 'Предложить идею для команды' },
  { command: 'status', description: 'Состояние задач и очереди' },
  { command: 'task', description: 'Назначить задачу с правами администратора' }
];

function telegramRoleCommand(agent) {
  return String(agent?.id || '').trim().toLowerCase().replace(/-/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 32);
}

const STORE_TELEGRAM_COMMANDS = [
  { command: 'start', description: 'Открыть магазин QuantDeus' },
  { command: 'help', description: 'Помощь по магазину и входу' },
  { command: 'services', description: 'Посмотреть услуги QuantDeus' },
  { command: 'account', description: 'Открыть личный кабинет' },
  { command: 'login', description: 'Войти на сайт через Telegram' },
  { command: 'pro', description: 'Узнать о подписке Pro' },
  { command: 'agents', description: 'Перейти к команде агентов' }
];

function telegramCommands() {
  const reserved = new Set(BASE_TELEGRAM_COMMANDS.map(item => item.command));
  const roles = agents.map(agent => {
    const command = telegramRoleCommand(agent);
    if (!command || reserved.has(command)) return null;
    reserved.add(command);
    const description = String(agent.telegram_description_ru || agent.role || 'Агент QuantDeus')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 220);
    return { command, description: description || 'Агент QuantDeus' };
  }).filter(Boolean);
  return [...BASE_TELEGRAM_COMMANDS, ...roles].slice(0, 100);
}


async function telegram(botToken, method, payload = {}) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(payload)
  });
  const raw = await response.text();
  let body = {};
  try { body = JSON.parse(raw); } catch {}
  if (!response.ok || body.ok !== true) {
    throw new Error(`telegram_${method}_failed_${response.status}: ${body.description || raw.slice(0, 400)}`);
  }
  return body.result;
}

async function configureTelegramInterface(botToken, role = 'agent') {
  const webAppUrl = role === 'store'
    ? 'https://quantdeus.ru/services/'
    : String(process.env.TELEGRAM_WEB_APP_URL || DEFAULT_TELEGRAM_WEB_APP_URL).trim();
  await telegram(botToken, 'setChatMenuButton', {
    menu_button: {
      type: 'web_app',
      text: role === 'store' ? 'Магазин' : 'Агенты',
      web_app: { url: webAppUrl }
    }
  });
  await telegram(botToken, 'setMyDescription', {
    description: TELEGRAM_PROFILES[role].description
  });
  await telegram(botToken, 'setMyShortDescription', {
    short_description: TELEGRAM_PROFILES[role].short_description
  });
  return { menu_button_url: webAppUrl };
}

async function configureTelegramCommands(botToken, label) {
  const me = await telegram(botToken, 'getMe');
  const expectedCommands = label === 'store' ? STORE_TELEGRAM_COMMANDS : telegramCommands();
  await telegram(botToken, 'setMyCommands', { commands: expectedCommands });
  const commands = await telegram(botToken, 'getMyCommands');
  const commandNames = Array.isArray(commands) ? commands.map(item => item.command) : [];
  const expectedNames = expectedCommands.map(item => item.command);
  const missing = expectedNames.filter(command => !commandNames.includes(command));
  if (missing.length) throw new Error('telegram_commands_missing:' + missing.join(','));
  console.log('Telegram commands configured:', JSON.stringify({
    label,
    username: me?.username || null,
    id: me?.id || null,
    command_count: Array.isArray(commands) ? commands.length : null,
    agent_count: agents.length,
    data_command: commandNames.includes('data'),
    commands: commandNames
  }));
  return {
    username: me?.username || null,
    command_count: Array.isArray(commands) ? commands.length : null,
    agent_count: agents.length,
    data_command: commandNames.includes('data')
  };
}

async function main() {
  // A setup run also refreshes Bot API commands (including /pro) after runtime deploys.
  const botToken =
    process.env.TELEGRAM_BOT_TOKEN ||
    process.env.QUANTDEUS_TELEGRAM_BOT_TOKEN ||
    process.env.TELEGRAM_TOKEN ||
    process.env.TELEGRAM;
  if (!botToken) throw new Error('TELEGRAM_BOT_TOKEN_missing');
  const storeBotToken = String(process.env.TELEGRAM_STORE_BOT_TOKEN || '').trim();
  if (storeBotToken && storeBotToken === botToken) throw new Error('telegram_store_and_agent_tokens_identical');

  // Не настраиваем Store через старую Vercel-функцию: иначе старый код
  // ошибочно назначит магазинному боту адрес Agent.
  const handshakeUrl = new URL(ENDPOINT);
  handshakeUrl.searchParams.set('bot_config', '1');
  const handshakeResponse = await fetch(handshakeUrl, { headers: { accept: 'application/json' } });
  const handshake = await handshakeResponse.json().catch(() => null);
  if (!handshakeResponse.ok || handshake?.telegram_multi_bot_version !== 2) {
    throw new Error('telegram_vercel_multi_bot_not_deployed: сначала обнови сервер Vercel, потом повтори настройку');
  }

  const oidc = await getGithubOidcToken(AUDIENCE);
  const setupBot = async (token, role) => {
    const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + oidc,
      'content-type': 'application/json',
      accept: 'application/json'
    },
    body: JSON.stringify({ mode: 'setup', bot_role: role, bot_token: token })
  });
    const raw = await response.text();
    if (!response.ok) throw new Error(role + ' Telegram webhook setup ' + response.status + ': ' + raw.slice(0, 1200));
    return JSON.parse(raw);
  };
  const data = await setupBot(botToken, 'agent');
  const botInterface = await configureTelegramInterface(botToken, 'agent');
  const primaryCommands = await configureTelegramCommands(botToken, 'agent');
  let storeData = null, storeInterface = null, storeCommands = null;
  if (storeBotToken) {
    storeData = await setupBot(storeBotToken, 'store');
    storeInterface = await configureTelegramInterface(storeBotToken, 'store');
    storeCommands = await configureTelegramCommands(storeBotToken, 'store');
    if (storeData?.bot?.username && /^[A-Za-z0-9_]{5,32}$/.test(storeData.bot.username)) {
      fs.writeFileSync('telegram-store-public.json', JSON.stringify({
        configured: true,
        bot_id: storeData.bot.id,
        username: storeData.bot.username,
        name: 'QuantDeus Store'
      }, null, 2) + '\n');
    }
  } else {
    console.warn('Telegram Store: отдельный токен не настроен; вебхук магазина не изменён.');
  }
  console.log('Telegram webhook configured:', JSON.stringify({
    bot_username: data.bot?.username || null,
    can_read_all_group_messages: data.bot?.can_read_all_group_messages ?? null,
    auth_mode: data.auth_mode || null,
    llm_smoke_ok: data.llm_smoke?.ok ?? null,
    llm_smoke_preview: data.llm_smoke?.preview || null,
    role_smoke_ok: data.role_smoke?.ok ?? null,
    role_smoke_preview: data.role_smoke?.preview || null,
    research_smoke_ok: data.research_smoke?.ok ?? null,
    research_smoke_items: data.research_smoke?.item_count ?? null,
    research_smoke_preview: data.research_smoke?.preview || null,
    interface: botInterface,
    primary_commands: primaryCommands,
    store_commands: storeCommands,
    store_bot: storeData?.bot || null,
    store_webhook: storeData?.webhook?.url || null,
    store_interface: storeInterface,
    url: data.webhook?.url || null,
    pending_update_count: data.webhook?.pending_update_count ?? null,
    last_error_message: data.webhook?.last_error_message || null
  }));
}

main().catch(error => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
