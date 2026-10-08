import test from 'node:test';
import assert from 'node:assert/strict';

process.env.BINGX_TRADING_ENV = 'prod-vst';
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



test('real-funded perpetual trading remains locked until independent live opt-in', () => {
  const previous = {
    env: process.env.BINGX_TRADING_ENV,
    enabled: process.env.QUANTDEUS_BINGX_LIVE_TRADING_ENABLED,
    key: process.env.BINGX_LIVE_API_KEY,
    secret: process.env.BINGX_LIVE_SECRET_KEY
  };
  try {
    process.env.BINGX_TRADING_ENV = 'prod-live';
    delete process.env.QUANTDEUS_BINGX_LIVE_TRADING_ENABLED;
    delete process.env.BINGX_LIVE_API_KEY;
    delete process.env.BINGX_LIVE_SECRET_KEY;
    const locked = broker.publicStatus();
    assert.equal(locked.environment, 'prod-live');
    assert.equal(locked.tradingEnabled, false);
    assert.equal(locked.liveApiAllowed, false);
    assert.equal(locked.credentialsConfigured, false);
    assert.equal(locked.primaryBase, 'https://open-api.bingx.com');
    assert.equal(locked.universe, 'all-live-usdt');
    assert.equal(broker.assertTrustedBingxBase('https://open-api.bingx.com'), true);
    assert.throws(() => broker.assertTrustedBingxBase('https://open-api-vst.bingx.com'), /blocked/);
    process.env.QUANTDEUS_BINGX_LIVE_TRADING_ENABLED = 'true';
    assert.equal(broker.publicStatus().liveApiAllowed, true);
  } finally {
    for (const [key, name] of Object.entries({
      env: 'BINGX_TRADING_ENV',
      enabled: 'QUANTDEUS_BINGX_LIVE_TRADING_ENABLED',
      key: 'BINGX_LIVE_API_KEY',
      secret: 'BINGX_LIVE_SECRET_KEY'
    })) {
      if (previous[key] === undefined) delete process.env[name];
      else process.env[name] = previous[key];
    }
  }
});

test('live orders require and sign exchange-attached stop-loss and take-profit', async () => {
  const keys = [
    'BINGX_TRADING_ENV', 'QUANTDEUS_BINGX_LIVE_TRADING_ENABLED',
    'BINGX_LIVE_API_KEY', 'BINGX_LIVE_SECRET_KEY'
  ];
  const before = new Map(keys.map(key => [key, process.env[key]]));
  const previousFetch = global.fetch;
  try {
    process.env.BINGX_TRADING_ENV = 'prod-live';
    process.env.QUANTDEUS_BINGX_LIVE_TRADING_ENABLED = 'true';
    process.env.BINGX_LIVE_API_KEY = 'live-test-key';
    process.env.BINGX_LIVE_SECRET_KEY = 'live-test-secret';
    const order = {
      symbol: 'BTC-USDT', side: 'BUY', positionSide: 'LONG',
      quantity: '0.0002', stopPrice: 62000, takeProfitPrice: 64000
    };
    const metrics = {
      lastPrice: 63000, maxReturnPct: 0.2, maxRangePct: 0.3
    };
    assert.equal(broker.evaluateRisk(order, metrics, { enabled: true }).allowed, true);
    assert.ok(broker.evaluateRisk({ ...order, stopPrice: null }, metrics, { enabled: true }).reasons.includes('live_protection_required'));
    const wrongDirection = broker.evaluateRisk({ ...order, stopPrice: 64000 }, metrics, { enabled: true });
    assert.ok(wrongDirection.reasons.includes('live_protection_invalid'));
    const token = broker.signRiskApproval(order, {
      maxReturnPct: 0.2, notionalUsdt: 12.6,
      indicators: { '5m': { direction: 'bullish', matchingConsensus: 0.9 }, '15m': { direction: 'bullish', matchingConsensus: 0.9 } }
    });
    assert.throws(() => broker.verifyRiskApproval(token, { ...order, stopPrice: 61000 }), /mismatch/);
    process.env.BINGX_TRADING_ENV = 'prod-vst';
    assert.throws(() => broker.verifyRiskApproval(token, order), /environment/);
    process.env.BINGX_TRADING_ENV = 'prod-live';
    let submitted = 0;
    global.fetch = async (url, init = {}) => {
      submitted += 1;
      assert.ok(String(url).startsWith('https://open-api.bingx.com/openApi/swap/v2/trade/order'));
      assert.equal(init.headers['X-BX-APIKEY'], 'live-test-key');
      const params = new URLSearchParams(String(init.body));
      assert.equal(params.get('symbol'), 'BTC-USDT');
      assert.equal(JSON.parse(params.get('stopLoss')).stopPrice, 62000);
      assert.equal(JSON.parse(params.get('takeProfit')).stopPrice, 64000);
      return new Response(JSON.stringify({ code: 0, msg: '', data: { orderId: 'mock-only' } }), { status: 200 });
    };
    const result = await broker.placeMarketOrder({ ...order, approval_token: token });
    assert.equal(result.environment, 'prod-live');
    assert.equal(result.response.data.orderId, 'mock-only');
    assert.equal(submitted, 1);
  } finally {
    global.fetch = previousFetch;
    for (const [key, value] of before) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('production live unknown-order busy response fails closed without duplicate POST', async () => {
  const keys = ['BINGX_TRADING_ENV', 'QUANTDEUS_BINGX_LIVE_TRADING_ENABLED', 'BINGX_LIVE_API_KEY', 'BINGX_LIVE_SECRET_KEY', 'BINGX_VST_ORDER_BUSY_RETRY_DELAY_MS'];
  const previous = new Map(keys.map(key => [key, process.env[key]]));
  const oldFetch = global.fetch;
  let postCount = 0;
  try {
    process.env.BINGX_TRADING_ENV = 'prod-live';
    process.env.QUANTDEUS_BINGX_LIVE_TRADING_ENABLED = 'true';
    process.env.BINGX_LIVE_API_KEY = 'live-test-key';
    process.env.BINGX_LIVE_SECRET_KEY = 'live-test-secret';
    process.env.BINGX_VST_ORDER_BUSY_RETRY_DELAY_MS = '1';
    const order = {
      symbol: 'BTC-USDT', side: 'BUY', positionSide: 'LONG',
      quantity: '0.0002', stopPrice: 62000, takeProfitPrice: 64000
    };
    const token = broker.signRiskApproval(order, { notionalUsdt: 12.6, maxReturnPct: 0.2 });
    global.fetch = async (_url, init = {}) => {
      if (init.method === 'POST') {
        postCount += 1;
        return new Response(JSON.stringify({ code: 100500, msg: 'System busy' }), { status: 200 });
      }
      return new Response(JSON.stringify({ code: 109421, msg: 'Order not found' }), { status: 200 });
    };
    await assert.rejects(
      broker.placeMarketOrder({ ...order, approval_token: token }),
      /bingx_live_order_state_uncertain_no_retry/
    );
    assert.equal(postCount, 1);
  } finally {
    global.fetch = oldFetch;
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
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
