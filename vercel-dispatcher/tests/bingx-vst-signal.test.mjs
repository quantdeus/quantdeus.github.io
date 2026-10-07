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

test('scheduled signal workflow is read-only and has a 15-minute cadence', async () => {
  const fs = await import('node:fs/promises');
  const workflow = await fs.readFile(new URL('../../.github/workflows/bingx-vst-signal.yml', import.meta.url), 'utf8');
  assert.match(workflow, /cron:\s*'\*\/15 \* \* \* \*'/);
  assert.doesNotMatch(workflow, /place_market_order|bingx_vst_place_market_order|tradingEnabled\s*=\s*false/);
});
