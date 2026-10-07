import test from 'node:test';
import assert from 'node:assert/strict';

process.env.BINGX_VST_SYMBOL_ALLOWLIST = 'BTC-USDT,ETH-USDT';
process.env.QUANTDEUS_BINGX_VST_TRADING_ENABLED = 'true';
process.env.QUANTDEUS_BINGX_VST_BROKER_TOKEN = 'test-broker-secret-that-is-long-enough';

const broker = await import('../lib/bingx-vst-broker.js');

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
});
