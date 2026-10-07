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

test('scheduled VST autotrade keeps 15-minute cadence and QA precedes execution', async () => {
  const fs = await import('node:fs/promises');
  const workflow = await fs.readFile(new URL('../../.github/workflows/bingx-vst-signal.yml', import.meta.url), 'utf8');
  const source = await fs.readFile(new URL('../lib/bingx-vst-signal.js', import.meta.url), 'utf8');
  assert.match(workflow, /cron:\s*'\*\/15 \* \* \* \*'/);
  assert.match(workflow, /id:\s*github_native/);
  assert.match(workflow, /run-bingx-vst-native\.mjs/);
  assert.match(workflow, /QUANTDEUS_BINGX_VST_REMOTE_BROKER_URL:\s*https:\/\/quantdeus\.vercel\.app\/api\/quantdeus\/bingx-vst-private-broker/);
  assert.match(workflow, /if:\s*steps\.github_native\.outcome == 'failure'/);
  assert.match(workflow, /run-bingx-vst-vercel-fallback\.mjs/);
  assert.doesNotMatch(workflow, /secrets\./);
  assert.ok(workflow.indexOf('run-bingx-vst-native.mjs') < workflow.indexOf('run-bingx-vst-vercel-fallback.mjs'));
  assert.match(source, /listContracts\(\)/);
  assert.match(source, /getTickers\(\)/);
  assert.match(source, /remoteBrokerCall\('positions'\)/);
  assert.match(source, /remoteBrokerCall\('risk_check', order\)/);
  assert.match(source, /remoteBrokerCall\('place_order', executionInput\)/);
  assert.doesNotMatch(source, /allowedSymbols\(\)\.slice\(0,\s*5\)/);
  assert.ok(source.indexOf("remoteBrokerCall('risk_check', order)") < source.indexOf("remoteBrokerCall('place_order', executionInput)"));
});
