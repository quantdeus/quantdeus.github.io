import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateTradingRisk } from '../lib/trading-risk.js';

const safe = {
  symbol: 'BTC-USDT', side: 'BUY', equity: 1000, markPrice: 100,
  quantity: 0.2, leverage: 2, stopLoss: 99, takeProfit: 101.5,
  dailyPnl: 0, openPositions: 0, spreadBps: 3, fundingRate: 0.0001,
  move15mPct: 0.4, range60mPct: 1.2, marketDataAgeMs: 500,
  qaApprovals: [{ agent: 'qa-contract', verdict: 'approve' }, { agent: 'qa-repair', verdict: 'approve' }]
};

test('safe VST proposal passes deterministic QA gate', () => {
  const r = evaluateTradingRisk(safe);
  assert.equal(r.allowed, true);
  assert.equal(r.storm, false);
});

test('market storm blocks trade', () => {
  const r = evaluateTradingRisk({ ...safe, move15mPct: 3.5 });
  assert.equal(r.allowed, false);
  assert.equal(r.storm, true);
  assert.ok(r.reasons.includes('fast_move_storm'));
});

test('excess leverage blocks trade', () => {
  const r = evaluateTradingRisk({ ...safe, leverage: 10 });
  assert.equal(r.allowed, false);
  assert.ok(r.reasons.includes('leverage_limit'));
});

test('missing QA quorum blocks trade', () => {
  const r = evaluateTradingRisk({ ...safe, qaApprovals: [{ agent: 'qa-contract', verdict: 'approve' }] });
  assert.equal(r.allowed, false);
  assert.ok(r.reasons.includes('qa_quorum_missing'));
});

test('daily drawdown activates kill gate', () => {
  const r = evaluateTradingRisk({ ...safe, dailyPnl: -11 });
  assert.equal(r.allowed, false);
  assert.ok(r.reasons.includes('daily_drawdown_kill_switch'));
});
