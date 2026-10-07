import test from 'node:test';
import assert from 'node:assert/strict';

process.env.BINGX_VST_SYMBOL_ALLOWLIST = 'BTC-USDT,ETH-USDT';
process.env.QUANTDEUS_BINGX_VST_TRADING_ENABLED = 'true';
process.env.QUANTDEUS_BINGX_VST_BROKER_TOKEN = 'test-broker-secret-that-is-long-enough';

const broker = await import('../lib/bingx-vst-broker.js');

function trendingCandles(direction = 1) {
  const rows = [];
  let price = 100;
  for (let index = 0; index < 120; index += 1) {
    const open = price;
    const drift = direction * 0.18 + Math.sin(index / 4) * 0.03;
    const close = Math.max(5, open + drift);
    const high = Math.max(open, close) + 0.12;
    const low = Math.min(open, close) - 0.12;
    const volume = 1000 + index * 7;
    rows.push([index * 300_000, open, high, low, close, volume]);
    price = close;
  }
  return rows;
}


test('BingX broker contains only VST hosts', () => {
  for (const base of broker.BINGX_VST_BASES) assert.equal(broker.assertVstOnlyBase(base), true);
  assert.throws(() => broker.assertVstOnlyBase('https://open-api.bingx.com'), /blocked/);
});

test('canonical signature params are deterministic and sorted', () => {
  assert.equal(broker.canonicalParams({ timestamp: 3, symbol: 'BTC-USDT', recvWindow: 5000 }), 'recvWindow=5000&symbol=BTC-USDT&timestamp=3');
});

test('signed parameter pollution is rejected', () => {
  assert.throws(
    () => broker.canonicalParams({ symbol: 'BTC-USDT&side=SELL', timestamp: 3 }),
    /forbidden_param_symbol/
  );
});

test('risk gate blocks storms and over-notional orders', () => {
  const storm = broker.evaluateRisk(
    { symbol: 'BTC-USDT', side: 'BUY', positionSide: 'LONG', quantity: '0.001' },
    { lastPrice: 60000, maxReturnPct: 3, maxRangePct: 1 },
    { enabled: true, stormPct: 2.5, maxNotionalUsdt: 100 }
  );
  assert.equal(storm.allowed, false);
  assert.ok(storm.reasons.includes('market_storm'));

  const oversized = broker.evaluateRisk(
    { symbol: 'BTC-USDT', side: 'BUY', positionSide: 'LONG', quantity: '0.01' },
    { lastPrice: 60000, maxReturnPct: 0.3, maxRangePct: 0.6 },
    { enabled: true, stormPct: 2.5, maxNotionalUsdt: 100 }
  );
  assert.equal(oversized.allowed, false);
  assert.ok(oversized.reasons.includes('max_notional_exceeded'));
});


test('indicator engine calculates 14 signals across four independent groups', () => {
  const bullish = broker.indicatorConsensus(trendingCandles(1));
  const bearish = broker.indicatorConsensus(trendingCandles(-1));

  assert.equal(bullish.indicatorCount, 14);
  assert.equal(bearish.indicatorCount, 14);
  assert.equal(new Set(bullish.signals.map(signal => signal.group)).size, 4);
  assert.equal(new Set(bearish.signals.map(signal => signal.group)).size, 4);
  assert.equal(bullish.direction, 'bullish');
  assert.equal(bearish.direction, 'bearish');
  assert.ok(bullish.directional >= 8);
  assert.ok(bearish.directional >= 8);
});

test('indicator gate requires consensus aligned with requested side', () => {
  const bullish = broker.indicatorConsensus(trendingCandles(1));
  const buy = broker.evaluateIndicatorGate(
    { symbol: 'BTC-USDT', side: 'BUY', positionSide: 'LONG', quantity: '0.001' },
    bullish,
    { minIndicators: 10, minDirectional: 8, minConsensus: 0.65, minGroups: 3 }
  );
  const sell = broker.evaluateIndicatorGate(
    { symbol: 'BTC-USDT', side: 'SELL', positionSide: 'SHORT', quantity: '0.001' },
    bullish,
    { minIndicators: 10, minDirectional: 8, minConsensus: 0.65, minGroups: 3 }
  );

  assert.equal(buy.allowed, true);
  assert.equal(sell.allowed, false);
  assert.ok(sell.reasons.includes('indicator_direction_mismatch'));
});

test('approval token is short-lived and bound to the exact order', () => {
  const order = { symbol: 'BTC-USDT', side: 'BUY', positionSide: 'LONG', quantity: '0.001' };
  const metrics = { maxReturnPct: 0.2, notionalUsdt: 60 };
  const token = broker.signRiskApproval(order, metrics, 1_000, 'secret');
  const claims = broker.verifyRiskApproval(token, order, 2_000, 'secret');
  assert.equal(claims.env, 'prod-vst');
  assert.throws(() => broker.verifyRiskApproval(token, { ...order, quantity: '0.002' }, 2_000, 'secret'), /mismatch/);
  assert.throws(() => broker.verifyRiskApproval(token, order, 100_000, 'secret'), /expired/);
});

test('client order id is deterministic and bounded for idempotent busy recovery', () => {
  const token = 'approval-token-for-test';
  const first = broker.clientOrderIdFromApproval(token);
  const second = broker.clientOrderIdFromApproval(token);
  assert.equal(first, second);
  assert.match(first, /^qdvst[a-f0-9]+$/);
  assert.ok(first.length <= 40);
});

test('VST order busy recovery queries clientOrderId before one retry', async () => {
  const previousFetch = global.fetch;
  const previousApiKey = process.env.BINGX_VST_API_KEY;
  const previousSecretKey = process.env.BINGX_VST_SECRET_KEY;
  const previousDelay = process.env.BINGX_VST_ORDER_BUSY_RETRY_DELAY_MS;

  process.env.BINGX_VST_API_KEY = 'test-api-key';
  process.env.BINGX_VST_SECRET_KEY = 'test-secret-key';
  process.env.BINGX_VST_ORDER_BUSY_RETRY_DELAY_MS = '1';

  const order = { symbol: 'BTC-USDT', side: 'BUY', positionSide: 'LONG', quantity: '0.001' };
  const token = broker.signRiskApproval(
    order,
    {
      maxReturnPct: 0.2,
      notionalUsdt: 60,
      indicators: {
        '5m': { direction: 'bullish', matchingConsensus: 0.9 },
        '15m': { direction: 'bullish', matchingConsensus: 0.9 }
      }
    }
  );

  const calls = [];
  let postCount = 0;
  global.fetch = async (url, init = {}) => {
    const method = String(init.method || 'GET').toUpperCase();
    calls.push({ url: String(url), method, body: String(init.body || '') });

    if (method === 'POST') {
      postCount += 1;
      if (postCount === 1) {
        return new Response(JSON.stringify({
          code: 100500,
          msg: 'The current system is busy, please try again later'
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        code: 0,
        msg: '',
        data: {
          orderID: '1234567890123456789',
          clientOrderId: broker.clientOrderIdFromApproval(token)
        }
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    if (method === 'GET') {
      return new Response(JSON.stringify({
        code: 109421,
        msg: 'The specified order does not exist'
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    throw new Error('unexpected_method_' + method);
  };

  try {
    const result = await broker.placeMarketOrder({ ...order, approval_token: token });
    assert.equal(result.response.data.orderID, '1234567890123456789');
    assert.equal(result.busyRecovery, 'retried-after-not-found');
    assert.equal(postCount, 2);

    const postBodies = calls.filter(call => call.method === 'POST').map(call => call.body);
    const getCalls = calls.filter(call => call.method === 'GET');
    assert.equal(getCalls.length, 1);
    assert.ok(getCalls[0].url.includes('clientOrderId='));
    assert.ok(postBodies.every(body => body.includes('clientOrderId=')));
    assert.equal(
      new URLSearchParams(postBodies[0]).get('clientOrderId'),
      new URLSearchParams(postBodies[1]).get('clientOrderId')
    );
  } finally {
    global.fetch = previousFetch;
    if (previousApiKey === undefined) delete process.env.BINGX_VST_API_KEY;
    else process.env.BINGX_VST_API_KEY = previousApiKey;
    if (previousSecretKey === undefined) delete process.env.BINGX_VST_SECRET_KEY;
    else process.env.BINGX_VST_SECRET_KEY = previousSecretKey;
    if (previousDelay === undefined) delete process.env.BINGX_VST_ORDER_BUSY_RETRY_DELAY_MS;
    else process.env.BINGX_VST_ORDER_BUSY_RETRY_DELAY_MS = previousDelay;
  }
});

test('public status never advertises live API, withdrawals, or transfers', () => {
  const status = broker.publicStatus();
  assert.equal(status.environment, 'prod-vst');
  assert.equal(status.liveApiAllowed, false);
  assert.equal(status.withdrawalsExposed, false);
  assert.equal(status.transfersExposed, false);
  assert.equal(status.universe, 'all-vst-usdt');
  assert.equal(status.indicatorGate.indicatorCount, 14);
  assert.deepEqual(status.indicatorGate.timeframes, ['5m', '15m']);
  assert.ok(status.indicatorGate.minIndicators >= 10);
});


test('trusted OpenClaw allow-list exposes VST tools', async () => {
  const fs = await import('node:fs/promises');
  const source = await fs.readFile(new URL('../api/quantdeus/openclaw.js', import.meta.url), 'utf8');
  for (const tool of [
    'bingxvst__bingx_vst_status',
    'bingxvst__bingx_vst_balance',
    'bingxvst__bingx_vst_contracts',
    'bingxvst__bingx_vst_tickers',
    'bingxvst__bingx_vst_klines',
    'bingxvst__bingx_vst_risk_check',
    'bingxvst__bingx_vst_place_market_order'
  ]) {
    assert.match(source, new RegExp(tool));
  }
});


test('OpenClaw VST cron is retired while the guarded full-cycle tool remains unavailable to the model allow-list', async () => {
  const fs = await import('node:fs/promises');
  const handlerSource = await fs.readFile(new URL('../lib/bingx-vst-mcp-handler.js', import.meta.url), 'utf8');
  const openclawSource = await fs.readFile(new URL('../api/quantdeus/openclaw.js', import.meta.url), 'utf8');
  const bootstrapSource = await fs.readFile(new URL('../../scripts/openclaw-vst-cron-bootstrap.js', import.meta.url), 'utf8');

  assert.match(handlerSource, /name: 'bingx_vst_autotrade_cycle'/);
  assert.match(handlerSource, /case 'bingx_vst_autotrade_cycle': return runVstSignalCycle\(\)/);
  assert.doesNotMatch(openclawSource, /bingxvst__bingx_vst_autotrade_cycle/);

  assert.match(bootstrapSource, /scheduler: 'github-actions-primary'/);
  assert.match(bootstrapSource, /openclaw_scheduler: 'retired'/);
  assert.match(bootstrapSource, /'automations', 'remove'/);
  assert.doesNotMatch(bootstrapSource, /'automations', 'create'/);
  assert.doesNotMatch(bootstrapSource, /2,17,32,47 \* \* \* \*/);
  assert.doesNotMatch(bootstrapSource, /QUANTDEUS_BINGX_VST_BROKER_TOKEN/);

  assert.match(openclawSource, /async function retireLegacyVstScheduler/);
  assert.match(openclawSource, /args: \['automations', 'list', '--all', '--json'\]/);
  assert.match(openclawSource, /args: \['automations', 'remove', id, '--json'\]/);
  assert.match(openclawSource, /quantdeus-vst-cycle\.cjs/);
  assert.match(openclawSource, /runtime_maintenance: \{ vst_scheduler_retirement: vstSchedulerRetirement \}/);
  // This ordering is the safety boundary: retirement must finish before any model/tool turn.
  assert.ok(
    openclawSource.indexOf('const vstSchedulerRetirement = await retireLegacyVstScheduler') <
      openclawSource.indexOf('run = await runOfficeAgent'),
    'legacy VST retirement must complete before agent execution'
  );
});
