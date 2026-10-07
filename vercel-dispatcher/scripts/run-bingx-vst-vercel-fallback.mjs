import { appendFile } from 'node:fs/promises';

function safeResult(data) {
  return {
    ok: true,
    execution_path: 'vercel-fallback',
    environment: data?.environment ?? null,
    action: data?.action ?? null,
    reason: data?.reason || null,
    symbol: data?.symbol || data?.strongestSymbol || null,
    side: data?.side || null,
    score: data?.score ?? data?.strongestScore ?? null,
    confidence: data?.confidence ?? null,
    estimated_notional_usdt: data?.estimatedNotionalUsdt ?? null,
    risk_pct: data?.riskPct ?? null,
    reward_pct: data?.rewardPct ?? null,
    universe_scanned: data?.universeScanned ?? null,
    eligible_universe: data?.eligibleUniverse ?? null,
    deep_scanned_symbols: data?.deepScannedSymbols ?? null,
    order_id: data?.orderId ?? null
  };
}

async function oidcToken() {
  const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!requestUrl || !requestToken) throw new Error('github_oidc_request_context_missing');

  const oidcUrl = new URL(requestUrl);
  oidcUrl.searchParams.set('audience', 'quantdeus-vercel-openclaw');
  const response = await fetch(oidcUrl, {
    headers: {
      authorization: 'Bearer ' + requestToken,
      accept: 'application/json'
    }
  });
  if (!response.ok) throw new Error('github_oidc_token_request_failed_' + response.status);
  const data = await response.json();
  const token = String(data?.value || '');
  if (!token) throw new Error('github_oidc_token_missing');
  return token;
}

async function writeSummary(safe) {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  await appendFile(
    process.env.GITHUB_STEP_SUMMARY,
    '### BingX VST fallback\n\n' +
    '- execution path: Vercel fallback\n' +
    '- primary outcome: failure\n' +
    '- environment: ' + (safe.environment || 'n/a') + '\n' +
    '- action: ' + (safe.action || 'n/a') + '\n' +
    '- reason: ' + (safe.reason || 'n/a') + '\n' +
    '- symbol: ' + (safe.symbol || 'n/a') + '\n' +
    '- side: ' + (safe.side || 'n/a') + '\n' +
    '- score: ' + (safe.score ?? 'n/a') + '\n' +
    '- universe scanned: ' + (safe.universe_scanned ?? 'n/a') + '\n' +
    '- eligible universe: ' + (safe.eligible_universe ?? 'n/a') + '\n' +
    '- deep scanned: ' + (safe.deep_scanned_symbols ?? 'n/a') + '\n' +
    '- order id: ' + (safe.order_id ?? 'n/a') + '\n'
  );
}

try {
  const token = await oidcToken();
  const response = await fetch('https://quantdeus.vercel.app/api/quantdeus/bingx-vst-signal', {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + token,
      accept: 'application/json',
      'content-type': 'application/json'
    },
    body: '{}'
  });

  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch {}

  if (!response.ok || data?.ok !== true) {
    throw new Error(
      'vercel_vst_fallback_failed_http_' + response.status + '_' +
      String(data?.error || '').slice(0, 180)
    );
  }

  const safe = safeResult(data);
  console.log(JSON.stringify(safe));
  await writeSummary(safe);
} catch (error) {
  console.error(String(error?.message || error));
  process.exit(1);
}
