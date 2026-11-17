'use strict';

(async () => {
  const apiKey = String(process.env.OPENROUTER_API_KEY || '').trim();
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is required');

  const response = await fetch('https://openrouter.ai/api/v1/key', {
    method: 'GET',
    headers: { authorization: 'Bearer ' + apiKey, accept: 'application/json' },
    signal: AbortSignal.timeout(15000)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.data) {
    const message = String(payload?.error?.message || 'key status request failed').slice(0, 180);
    throw new Error('OpenRouter quota status HTTP ' + response.status + ': ' + message);
  }

  const data = payload.data;
  const daily = data.free_model_daily_requests || null;
  console.log(JSON.stringify({
    ok: true,
    is_free_tier: Boolean(data.is_free_tier),
    free_model_daily_requests: daily ? {
      used: Number(daily.used),
      limit: Number(daily.limit),
      remaining: Number(daily.remaining)
    } : null,
    usage_daily_usd: Number.isFinite(Number(data.usage_daily)) ? Number(data.usage_daily) : null,
    note: 'Read-only key status; no inference request was sent.'
  }));
})().catch(error => {
  console.error(String(error?.message || error));
  process.exit(1);
});
