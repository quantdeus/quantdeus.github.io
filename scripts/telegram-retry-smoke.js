'use strict';

const { getGithubOidcToken } = require('./github-oidc');

const AUDIENCE = 'quantdeus-vercel-telegram';
const ENDPOINT = process.env.TELEGRAM_RETRY_SMOKE_URL || 'https://quantdeus.vercel.app/api/quantdeus/telegram';

async function main() {
  const oidc = await getGithubOidcToken(AUDIENCE);
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + oidc,
      'content-type': 'application/json',
      accept: 'application/json'
    },
    body: JSON.stringify({ mode: 'retry_smoke' })
  });
  const raw = await response.text();
  if (!response.ok) throw new Error('Telegram retry smoke start ' + response.status + ': ' + raw.slice(0, 800));
  const data = JSON.parse(raw);
  if (!data?.ok || !new Set(['dispatched', 'redelivery_fallback']).has(data.status)) {
    throw new Error('Telegram retry smoke returned unexpected status: ' + String(data?.status || 'missing'));
  }
  console.log('Telegram retry smoke transport:', JSON.stringify({ status: data.status, update_id: data.update_id }));
}

main().catch(error => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
