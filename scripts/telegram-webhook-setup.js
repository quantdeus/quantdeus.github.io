'use strict';

const AUDIENCE = 'quantdeus-vercel-telegram';
const ENDPOINT = process.env.TELEGRAM_WEBHOOK_SETUP_URL || 'https://quantdeus.vercel.app/api/quantdeus/telegram';

async function getGithubOidcToken() {
  const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!requestUrl || !requestToken) throw new Error('GITHUB_OIDC_UNAVAILABLE');
  const separator = requestUrl.includes('?') ? '&' : '?';
  const response = await fetch(requestUrl + separator + 'audience=' + encodeURIComponent(AUDIENCE), {
    headers: { authorization: 'Bearer ' + requestToken, accept: 'application/json' }
  });
  const raw = await response.text();
  if (!response.ok) throw new Error('GitHub OIDC ' + response.status + ': ' + raw.slice(0, 500));
  const data = JSON.parse(raw);
  if (!data?.value) throw new Error('GitHub OIDC returned no token');
  return data.value;
}

async function main() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN || process.env.QUANTDEUS_TELEGRAM_BOT_TOKEN;
  if (!botToken) throw new Error('TELEGRAM_BOT_TOKEN_missing');

  const oidc = await getGithubOidcToken();
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
    url: data.webhook?.url || null,
    pending_update_count: data.webhook?.pending_update_count ?? null,
    last_error_message: data.webhook?.last_error_message || null
  }));
}

main().catch(error => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
