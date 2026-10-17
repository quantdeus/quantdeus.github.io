#!/usr/bin/env node
'use strict';
const fs = require('fs');
const assert = require('node:assert/strict');
const registry = JSON.parse(fs.readFileSync('coordination/agents.json', 'utf8'));
const setup = fs.readFileSync('scripts/telegram-webhook-setup.js', 'utf8');
const webhook = fs.readFileSync('vercel-dispatcher/api/quantdeus/telegram.js', 'utf8');
const auth = fs.readFileSync('vercel-dispatcher/lib/telegram-bot-auth.js', 'utf8');
const broker = fs.readFileSync('vercel-dispatcher/api/quantdeus/bot-auth.js', 'utf8');
const federation = fs.readFileSync('vercel-dispatcher/lib/telegram-federation.js', 'utf8');
const workflow = fs.readFileSync('.github/workflows/telegram-bot.yml', 'utf8');

assert.equal(registry.agents.length, 29, 'Реестр должен содержать 29 агентов');
for (const agent of registry.agents) {
  assert.ok(typeof agent.telegram_description_ru === 'string' && /[А-Яа-яЁё]/.test(agent.telegram_description_ru), 'Нет русского описания: ' + agent.id);
  assert.ok(agent.telegram_description_ru.length <= 200, 'Слишком длинное описание: ' + agent.id);
}
assert.ok(setup.includes("setupBot(storeBotToken, 'store')"), 'Для Store не настроен отдельный вебхук');
assert.ok(setup.includes("telegram-store-public.json"), 'Не публикуется открытый username магазина');
assert.ok(setup.includes("storeBotToken === botToken"), 'Нет защиты от совпадения токенов');
assert.ok(webhook.includes("webhookSecret(botRole)"), 'Секреты должны быть разными');
assert.ok(webhook.includes("storeWebhookUrl.searchParams.set('bot', 'store')"), 'Не разделены вебхуки');
assert.ok(webhook.includes("const botToken = role === 'store' ? '' : runtimeTokenForRole(role)"), 'Нельзя отвечать Store токеном Agent');
assert.ok(webhook.includes("botRole !== 'store'"), 'Только Store подтверждает вход');
assert.ok(webhook.includes("fastStoreCommandReply(rawText)"), 'Нет отдельного диалога Store');
assert.ok(federation.includes("botRole + ':' + String(update.update_id)"), 'У двух ботов не разделены номера событий');
assert.ok(federation.includes("botRole + ':' + chatType"), 'Не разделены лимиты обращений');
assert.ok(auth.includes("https://quantdeus.ru"), 'Обратный адрес должен вести на рабочий домен');
assert.ok(auth.includes("telegram-store-public.json"), 'Имя магазина должно определяться автоматически');
assert.ok(broker.includes("await issueTelegramLoginRequest()"), 'Не дождались имени магазина');
assert.ok(workflow.includes("QUANTDEUS_STORE_TELEGRAM_BOT_TOKEN"), 'Не настроен токен магазина');
console.log('PASS — раздельные боты, русские описания и Telegram-вход');
