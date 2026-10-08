import test from 'node:test';
import assert from 'node:assert/strict';

process.env.BINGX_VST_SYMBOL_ALLOWLIST = 'BTC-USDT,ETH-USDT,BNB-USDT,SOL-USDT,XRP-USDT';
process.env.QUANTDEUS_BINGX_VST_TRADING_ENABLED = 'true';

const signal = await import('../lib/bingx-vst-signal.js');

function candlesFromCloses(closes) {
  return closes.map((close, index) => {
    const open = index ? closes[index - 1] : close;
    const high = Math.max(open, close) * 1.002;
    const low = Math.min(open, close) * 0.998;
    return [index * 900000, open, high, low, close];
  });
}

test('signal analysis can confirm a coherent uptrend', () => {
  const closes = Array.from({ length: 80 }, (_, index) => 100 + index * 0.22 + Math.sin(index / 3) * 0.08);
  const result = signal.analyzeMarket(candlesFromCloses(closes));
  assert.equal(result.side, 'BUY');
  assert.ok(result.score > 0);
  assert.equal(typeof result.tradable, 'boolean');
});

test('quantity respects precision and minimums', () => {
  const result = signal.computeQuantity({
    price: 60000,
    targetNotionalUsdt: 10,
    quantityPrecision: 4,
    tradeMinQuantity: 0.0001,
    tradeMinUSDT: 2
  });
  assert.equal(result.quantity, '0.0001');
  assert.ok(result.notionalUsdt <= 25);
});

test('protection suggestion has stop and take-profit on the correct sides', () => {
  const long = signal.buildProtectionSuggestion({
    side: 'BUY',
    price: 100,
    atrPct: 0.5,
    pricePrecision: 2
  });
  assert.ok(long.stopPrice < 100);
  assert.ok(long.takeProfitPrice > 100);

  const short = signal.buildProtectionSuggestion({
    side: 'SELL',
    price: 100,
    atrPct: 0.5,
    pricePrecision: 2
  });
  assert.ok(short.stopPrice > 100);
  assert.ok(short.takeProfitPrice < 100);
});

test('ticker prefilter keeps liquid calm markets and rejects storms', () => {
  const calm = signal.assessTicker({
    symbol: 'BTC-USDT',
    lastPrice: '100',
    openPrice: '99',
    highPrice: '102',
    lowPrice: '98',
    quoteVolume: '50000000',
    bidPrice: '99.99',
    askPrice: '100.01',
    priceChangePercent: '1.01'
  }, {
    minQuoteVolumeUsdt: 1_000_000,
    maxRangePct: 10,
    maxChangePct: 8,
    maxSpreadBps: 20
  });
  assert.equal(calm.allowed, true);

  const storm = signal.assessTicker({
    symbol: 'MEME-USDT',
    lastPrice: '100',
    openPrice: '80',
    highPrice: '125',
    lowPrice: '75',
    quoteVolume: '50000000',
    bidPrice: '99',
    askPrice: '101',
    priceChangePercent: '25'
  }, {
    minQuoteVolumeUsdt: 1_000_000,
    maxRangePct: 10,
    maxChangePct: 8,
    maxSpreadBps: 20
  });
  assert.equal(storm.allowed, false);
  assert.ok(storm.reasons.includes('range_storm'));
  assert.ok(storm.reasons.includes('price_change_storm'));
});

test('universe prefilter scans all permitted contracts before deep analysis', () => {
  const contracts = [
    { symbol: 'BTC-USDT', status: 'TRADING' },
    { symbol: 'ETH-USDT', status: 'TRADING' },
    { symbol: 'DOGE-USDT', status: 'TRADING' }
  ];
  const tickers = contracts.map((contract, index) => ({
    symbol: contract.symbol,
    lastPrice: String(100 + index),
    openPrice: '100',
    highPrice: '103',
    lowPrice: '98',
    quoteVolume: String(50_000_000 - index * 5_000_000),
    bidPrice: String(99.99 + index),
    askPrice: String(100.01 + index),
    priceChangePercent: String(index)
  }));
  const universe = signal.buildUniverse(contracts, tickers, {
    minQuoteVolumeUsdt: 1_000_000,
    maxRangePct: 10,
    maxChangePct: 8,
    maxSpreadBps: 20
  });
  assert.equal(universe.scannedSymbols, 3);
  assert.equal(universe.eligibleSymbols, 3);
});

test('upstream telemetry preserves exact BingX failure identity', () => {
  const error = new Error('bingx_vst_remote_broker_failed_502_bingx_vst_business_110500');
  error.brokerHttpStatus = 502;
  error.businessCode = 110500;
  error.upstreamMessage = 'Order system busy. Please retry later';
  const details = signal.upstreamErrorDetails(error);
  assert.equal(details.bingxCode, 110500);
  assert.equal(details.bingxMessage, 'Order system busy. Please retry later');
  assert.equal(details.brokerHttpStatus, 502);
  assert.equal(details.bingxHttpStatus, null);
  assert.match(details.upstreamError, /110500/);
});

test('locked live perpetual cycle still scans public markets with private read-only checks and never places orders', async () => {
  const keys = ['BINGX_TRADING_ENV', 'QUANTDEUS_BINGX_LIVE_TRADING_ENABLED',
    'BINGX_VST_API_KEY', 'BINGX_VST_SECRET_KEY', 'BINGX_LIVE_API_KEY', 'BINGX_LIVE_SECRET_KEY',
    'QUANTDEUS_BINGX_VST_REMOTE_BROKER_URL'];
  const old = new Map(keys.map(key => [key, process.env[key]]));
  const oldFetch = global.fetch;
  const urls = [];
  try {
    process.env.BINGX_TRADING_ENV = 'prod-live';
    process.env.QUANTDEUS_BINGX_LIVE_TRADING_ENABLED = 'false';
    process.env.BINGX_VST_API_KEY = 'mock-real-account-key';
    process.env.BINGX_VST_SECRET_KEY = 'mock-real-account-secret';
    delete process.env.BINGX_LIVE_API_KEY;
    delete process.env.BINGX_LIVE_SECRET_KEY;
    delete process.env.QUANTDEUS_BINGX_VST_REMOTE_BROKER_URL;
    global.fetch = async (url, init = {}) => {
      urls.push({ url: String(url), method: init.method || 'GET' });
      assert.equal(init.method, 'GET');
      assert.ok(String(url).startsWith('https://open-api.bingx.com/openApi/swap/'));
      return new Response(JSON.stringify({ code: 0, data: [] }), { status: 200 });
    };
    const result = await signal.runVstSignalCycle();
    assert.equal(result.environment, 'prod-live');
    assert.equal(result.reason, 'no_stable_liquid_assets');
    assert.equal(result.signalOnly, true);
    assert.equal(result.orderAttempted, false);
    assert.equal(result.privateAccountAuthenticated, true);
    assert.equal(result.positionsRead, true);
    assert.equal(urls.length, 4);
    assert.ok(urls.some(req => req.url.includes('/user/balance')));
    assert.ok(urls.some(req => req.url.includes('/user/positions')));
    assert.ok(urls.some(req => req.url.includes('/quote/contracts')));
    assert.ok(urls.some(req => req.url.includes('/quote/ticker')));
    assert.ok(urls.every(req => req.method === 'GET'));
  } finally {
    global.fetch = oldFetch;
    for (const [key, value] of old) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('scheduled VST autotrade keeps 15-minute cadence and QA precedes execution', async () => {
  const fs = await import('node:fs/promises');
  const workflow = await fs.readFile(new URL('../../.github/workflows/bingx-vst-signal.yml', import.meta.url), 'utf8');
  const source = await fs.readFile(new URL('../lib/bingx-vst-signal.js', import.meta.url), 'utf8');
  const runner = await fs.readFile(new URL('../scripts/run-bingx-vst-native.mjs', import.meta.url), 'utf8');
  const brokerRoute = await fs.readFile(new URL('../api/quantdeus/openclaw.js', import.meta.url), 'utf8');
  const missionGuard = await fs.readFile(new URL('../../scripts/mission-alignment.js', import.meta.url), 'utf8');
  assert.match(workflow, /cron:\s*'\*\/15 \* \* \* \*'/);
  assert.match(workflow, /node scripts\/mission-alignment\.js/);
  assert.match(missionGuard, /'bingx-vst-signal\.yml'/);
  assert.match(workflow, /id:\s*github_native/);
  assert.match(workflow, /run-bingx-vst-native\.mjs/);
  assert.match(workflow, /QUANTDEUS_BINGX_VST_REMOTE_BROKER_URL:\s*https:\/\/quantdeus\.vercel\.app\/api\/quantdeus\/bingx-vst-private-broker/);
  assert.match(workflow, /if:\s*steps\.github_native\.outcome == 'failure'/);
  assert.match(workflow, /run-bingx-vst-vercel-fallback\.mjs/);
  assert.doesNotMatch(workflow, /secrets\./);
  assert.ok(workflow.indexOf('node scripts/mission-alignment.js') < workflow.indexOf('run-bingx-vst-native.mjs'));
  assert.ok(workflow.indexOf('run-bingx-vst-native.mjs') < workflow.indexOf('run-bingx-vst-vercel-fallback.mjs'));
  assert.match(source, /listContracts\(\)/);
  assert.match(source, /getTickers\(\)/);
  assert.match(source, /remoteBrokerCall\('positions'\)/);
  assert.match(source, /remoteBrokerCall\('risk_check', order\)/);
  assert.match(source, /remoteBrokerCall\('place_order', executionInput\)/);
  // The signal-only return must precede any submission, irrespective of QA.
  assert.match(source, /if \(signalOnly\) \{[\s\S]*action: 'signal_only'/);
  assert.ok(source.indexOf("action: 'signal_only'") < source.indexOf("remoteBrokerCall('place_order', executionInput)"));
  assert.match(workflow, /QUANTDEUS_BINGX_LIVE_TRADING_ENABLED:\s*'false'/);
  assert.match(source, /upstreamErrorDetails\(error\)/);
  assert.match(runner, /bingx_code:/);
  assert.match(runner, /bingx_message:/);
  assert.match(runner, /bingx_http_status:/);
  assert.match(runner, /broker_http_status:/);
  assert.match(brokerRoute, /upstream_code:/);
  assert.match(brokerRoute, /upstream_http_status:/);
  assert.match(brokerRoute, /upstream_message:/);
  assert.doesNotMatch(source, /allowedSymbols\(\)\.slice\(0,\s*5\)/);
  assert.ok(source.indexOf("remoteBrokerCall('risk_check', order)") < source.indexOf("remoteBrokerCall('place_order', executionInput)"));
});
