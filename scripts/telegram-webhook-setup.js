'use strict';

const fs = require('fs');
const { getGithubOidcToken } = require('./github-oidc');

const AUDIENCE = 'quantdeus-vercel-telegram';
const ENDPOINT = process.env.TELEGRAM_WEBHOOK_SETUP_URL || 'https://quantdeus.vercel.app/api/quantdeus/telegram';
const DEFAULT_TELEGRAM_WEB_APP_URL = 'https://quantdeus.github.io/telegram/';
const TELEGRAM_BOT_DESCRIPTION =
  'QuantDeus Store Bot: AI Fleet, мартышки, Pro-доступ, Telegram Login и быстрые команды QuantDeus.';
const TELEGRAM_BOT_SHORT_DESCRIPTION = 'QuantDeus AI Fleet, Store Bot и Mini App.';
const registry = JSON.parse(fs.readFileSync('coordination/agents.json', 'utf8'));
const agents = Array.isArray(registry.agents) ? registry.agents : [];
const BASE_TELEGRAM_COMMANDS = [
  { command: 'start', description: 'Запустить QuantDeus' },
  { command: 'help', description: 'Команды QuantDeus' },
  { command: 'agents', description: 'Мартышки · AI Fleet' },
  { command: 'monkeys', description: 'Мартышки · AI Fleet' },
  { command: 'pro', description: 'QuantDeus Free / Pro' },
  { command: 'shield', description: 'Статус защиты QuantDeus Shield' },
  { command: 'agent', description: 'Обратиться к конкретной роли AI Fleet' },
  { command: 'propose', description: 'Предложить идею для admin-публикации' },
  { command: 'status', description: 'Состояние очереди QuantDeus' },
  { command: 'task', description: 'Прямой task для Telegram admin' }
];

function telegramRoleCommand(agent) {
  return String(agent?.id || '').trim().toLowerCase().replace(/-/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 32);
}

function telegramCommands() {
  const reserved = new Set(BASE_TELEGRAM_COMMANDS.map(item => item.command));
  const roles = agents.map(agent => {
    const command = telegramRoleCommand(agent);
    if (!command || reserved.has(command)) return null;
    reserved.add(command);
    const description = String(agent.startup_title || agent.name || agent.role || agent.id || 'QuantDeus agent')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 220);
    return { command, description: description || 'QuantDeus agent' };
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

async function configureTelegramInterface(botToken) {
  const webAppUrl = String(process.env.TELEGRAM_WEB_APP_URL || DEFAULT_TELEGRAM_WEB_APP_URL).trim();
  await telegram(botToken, 'setChatMenuButton', {
    menu_button: {
      type: 'web_app',
      text: 'QuantDeus',
      web_app: { url: webAppUrl }
    }
  });
  await telegram(botToken, 'setMyDescription', {
    description: TELEGRAM_BOT_DESCRIPTION
  });
  await telegram(botToken, 'setMyShortDescription', {
    short_description: TELEGRAM_BOT_SHORT_DESCRIPTION
  });
  return { menu_button_url: webAppUrl };
}

async function configureTelegramCommands(botToken, label) {
  const me = await telegram(botToken, 'getMe');
  const expectedCommands = telegramCommands();
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

  const oidc = await getGithubOidcToken(AUDIENCE);
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + oidc,
      'content-type': 'application/json',
      accept: 'application/json'
    },
    body: JSON.stringify({ mode: 'setup', bot_token: botToken })
  });
  const raw = await response.text();
  if (!response.ok) throw new Error('Telegram webhook setup ' + response.status + ': ' + raw.slice(0, 1200));
  const data = JSON.parse(raw);
  const botInterface = await configureTelegramInterface(botToken);
  const primaryCommands = await configureTelegramCommands(botToken, 'primary');
  const storeCommands = storeBotToken && storeBotToken !== botToken
    ? await configureTelegramCommands(storeBotToken, 'store')
    : null;
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
    url: data.webhook?.url || null,
    pending_update_count: data.webhook?.pending_update_count ?? null,
    last_error_message: data.webhook?.last_error_message || null
  }));
}

main().catch(error => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
