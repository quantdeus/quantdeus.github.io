'use strict';

const { getGithubOidcToken } = require('./github-oidc');

const AUDIENCE = 'quantdeus-vercel-telegram';
const ENDPOINT = process.env.TELEGRAM_WEBHOOK_SETUP_URL || 'https://quantdeus.vercel.app/api/quantdeus/telegram';

async function main() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN || process.env.QUANTDEUS_TELEGRAM_BOT_TOKEN;
  if (!botToken) throw new Error('TELEGRAM_BOT_TOKEN_missing');

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
    url: data.webhook?.url || null,
    pending_update_count: data.webhook?.pending_update_count ?? null,
    last_error_message: data.webhook?.last_error_message || null
  }));
}

main().catch(error => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
