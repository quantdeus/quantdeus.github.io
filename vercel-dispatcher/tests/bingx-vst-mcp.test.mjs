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


test('native OpenClaw cron has one guarded full VST cycle tool without granting it to model allow-list', async () => {
  const fs = await import('node:fs/promises');
  const handlerSource = await fs.readFile(new URL('../lib/bingx-vst-mcp-handler.js', import.meta.url), 'utf8');
  const openclawSource = await fs.readFile(new URL('../api/quantdeus/openclaw.js', import.meta.url), 'utf8');
  const bootstrapSource = await fs.readFile(new URL('../../scripts/openclaw-vst-cron-bootstrap.js', import.meta.url), 'utf8');

  assert.match(handlerSource, /name: 'bingx_vst_autotrade_cycle'/);
  assert.match(handlerSource, /case 'bingx_vst_autotrade_cycle': return runVstSignalCycle\(\)/);
  assert.doesNotMatch(openclawSource, /bingxvst__bingx_vst_autotrade_cycle/);

  assert.match(bootstrapSource, /2,17,32,47 \* \* \* \*/);
  assert.match(bootstrapSource, /'automations', 'create'/);
  assert.match(bootstrapSource, /'--exact'/);
  assert.match(bootstrapSource, /'--no-deliver'/);
  assert.match(bootstrapSource, /QUANTDEUS_BINGX_VST_BROKER_TOKEN/);
  assert.match(bootstrapSource, /bingx_vst_autotrade_cycle/);
});

test('native OpenClaw VST runner never embeds the broker secret into its generated source', async () => {
  const fs = await import('node:fs/promises');
  const bootstrapSource = await fs.readFile(new URL('../../scripts/openclaw-vst-cron-bootstrap.js', import.meta.url), 'utf8');
  assert.match(bootstrapSource, /process\.env\.QUANTDEUS_BINGX_VST_BROKER_TOKEN/);
  assert.doesNotMatch(bootstrapSource, /test-broker-secret-that-is-long-enough/);
});
