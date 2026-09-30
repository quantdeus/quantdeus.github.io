'use strict';

const AUDIENCE = 'quantdeus-vercel-telegram';
const ENDPOINT = process.env.TELEGRAM_RETRY_SMOKE_URL || 'https://quantdeus.vercel.app/api/quantdeus/telegram';

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
  const oidc = await getGithubOidcToken();
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
  if (!data?.ok || data.status !== 'dispatched') throw new Error('Telegram retry smoke did not dispatch');
  console.log('Telegram retry smoke dispatched:', JSON.stringify({ update_id: data.update_id }));
}

main().catch(error => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
