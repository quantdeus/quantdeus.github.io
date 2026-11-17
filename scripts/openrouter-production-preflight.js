'use strict';

(async () => {
  const requestUrl = String(process.env.ACTIONS_ID_TOKEN_REQUEST_URL || '').trim();
  const requestToken = String(process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN || '').trim();
  if (!requestUrl || !requestToken) throw new Error('GitHub OIDC request context missing');

  const oidcUrl = new URL(requestUrl);
  oidcUrl.searchParams.set('audience', 'quantdeus-vercel-openclaw');
  const tokenResponse = await fetch(oidcUrl, {
    headers: { authorization: 'Bearer ' + requestToken },
    signal: AbortSignal.timeout(15000)
  });
  if (!tokenResponse.ok) throw new Error('GitHub OIDC token request failed: ' + tokenResponse.status);
  const tokenData = await tokenResponse.json();
  const oidc = String(tokenData?.value || '').trim();
  if (!oidc) throw new Error('GitHub OIDC token missing from response');

  const endpoint = new URL('https://quantdeus.vercel.app/api/quantdeus/openclaw');
  endpoint.searchParams.set('qd_route', 'openrouter-free-capability');
  const response = await fetch(endpoint, {
    method: 'GET',
    headers: { authorization: 'Bearer ' + oidc, accept: 'application/json' },
    signal: AbortSignal.timeout(15000)
  });
  let data = null;
  try { data = await response.json(); } catch {}
  if (!response.ok || data?.ok !== true || data?.free_only_supported !== true || data?.contract_version !== 1) {
    throw new Error('Production free-only OIDC preflight failed: HTTP ' + response.status + ' ' + JSON.stringify(data).slice(0, 400));
  }
  console.log(JSON.stringify({
    ok: true,
    endpoint: 'quantdeus.vercel.app',
    signed_github_oidc: true,
    free_only_supported: true,
    contract_version: data.contract_version,
    inference_requests: 0,
    api_key_forwarded: false
  }));
})().catch(error => {
  console.error(String(error?.message || error));
  process.exit(1);
});
