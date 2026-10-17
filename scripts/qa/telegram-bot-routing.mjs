#!/usr/bin/env node
// Regression checks: Bot API replies must never cross from Agent to Store,
// and the text-only model fallback must never require Sandbox or tool privileges.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { telegramDirectModelReply } from '../../vercel-dispatcher/lib/telegram-direct-llm.js';

const route = fs.readFileSync('vercel-dispatcher/api/quantdeus/telegram.js', 'utf8');
const setup = fs.readFileSync('scripts/telegram-webhook-setup.js', 'utf8');
const federation = fs.readFileSync('vercel-dispatcher/lib/telegram-federation.js', 'utf8');

const checks = [
  ['store webhook uses its own URL', route.includes("DEFAULT_WEBHOOK_URL + '?bot=store'")],
  ['store inbound checks token-derived secret', route.includes("webhookSecret(botKind)") && route.includes("botKind === 'agent'")],
  ['bot-specific outbound token', route.includes("runtimeTelegramBotToken(message?.__qdBotKind)")],
  ['store setup actually calls setWebhook', setup.includes("setupBot(storeBotToken, 'store')")],
  ['store UI description is Russian', setup.includes('Магазин услуг QuantDeus')],
  ['agent UI description is Russian', setup.includes('интеллектуальный помощник')],
  ['distinct update-id namespaces', federation.includes("botKind + ':' + String(update.update_id)")],
  ['distinct chat rate-limits', federation.includes("botKind + ':' + chatType + ':' + chatId")],
  ['LLM fallback on agent chat', route.includes('telegramDirectModelReply({ system, user: groundedQuery, agentId })')],
  ['LLM fallback on site chat', route.includes('telegramDirectModelReply({ system, user: siteShield.normalized, agentId })')],
  ['no Telegram polling', !route.includes('getUpdates(') && !setup.includes('getUpdates(')]
];
for (const [label, ok] of checks) {
  console.log((ok ? 'PASS' : 'FAIL') + ' — ' + label);
  assert.ok(ok, label);
}

const names = ['HERMES_LOCAL_BASE_URL','HERMES_LOCAL_API_KEY','HERMES_CLOUD_MODEL','HERMES_MODEL','CEREBRAS_API_KEY','GROQ_API_KEY','OPENROUTER_API_KEY'];
const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
try {
  for (const name of names) delete process.env[name];
  assert.equal(await telegramDirectModelReply({
    system: 'Безопасный чат', user: 'Привет', agentId: 'seven-of-nine',
    fetchImpl: () => { throw Error('no external fetch expected'); }
  }), '', 'unconfigured must fail closed');

  process.env.HERMES_LOCAL_BASE_URL = 'https://llm.example.test/v1';
  process.env.HERMES_LOCAL_API_KEY = 'mock-credential-only';
  process.env.HERMES_CLOUD_MODEL = 'mock-model';
  let calls = 0;
  const text = await telegramDirectModelReply({
    system: 'Ответь на русском', user: 'Привет', agentId: 'seven-of-nine',
    fetchImpl: async (url, options) => {
      calls++;
      assert.equal(url, 'https://llm.example.test/v1/chat/completions');
      assert.deepEqual(JSON.parse(options.body).messages.map(x => x.role), ['system','user']);
      assert.equal(JSON.parse(options.body).tools, undefined, 'no tools in fallback');
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'Привет, капитан!' } }] }) };
    }
  });
  assert.equal(text, 'Привет, капитан!');
  assert.equal(calls, 1, 'single usable model route');
  console.log('PASS — mock fallback sends text-only authorized chat');
} finally {
  for (const name of names) {
    if (previous[name] === undefined) delete process.env[name];
    else process.env[name] = previous[name];
  }
}
console.log('Telegram bot isolation and text LLM fallback: OK');
