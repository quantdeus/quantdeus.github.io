export const TRADING_POLICY = Object.freeze({
  environment: 'prod-vst',
  maxLeverage: 3,
  maxRiskPerTradePct: 0.25,
  maxDailyDrawdownPct: 1.0,
  maxOpenPositions: 2,
  maxSpreadBps: 12,
  maxAbsFundingRate: 0.0015,
  maxAbs15mMovePct: 2.0,
  max60mRangePct: 5.0,
  maxMarketDataAgeMs: 15000,
  minRewardRisk: 1.2,
  qaQuorum: 2,
  qaAgents: ['qa-syntax', 'qa-contract', 'qa-repair']
});

const finite = value => Number.isFinite(Number(value));
const num = value => Number(value);

export function evaluateTradingRisk(input, policy = TRADING_POLICY) {
  const reasons = [];
  const warnings = [];
  const symbol = String(input?.symbol || '').toUpperCase();
  const side = String(input?.side || '').toUpperCase();
  const equity = num(input?.equity);
  const markPrice = num(input?.markPrice);
  const quantity = num(input?.quantity);
  const leverage = num(input?.leverage);
  const stopLoss = num(input?.stopLoss);
  const takeProfit = num(input?.takeProfit);
  const dailyPnl = num(input?.dailyPnl || 0);
  const openPositions = num(input?.openPositions || 0);
  const spreadBps = num(input?.spreadBps);
  const fundingRate = num(input?.fundingRate);
  const move15mPct = num(input?.move15mPct);
  const range60mPct = num(input?.range60mPct);
  const marketDataAgeMs = num(input?.marketDataAgeMs);

  if (!/^[A-Z0-9]{2,15}-USDT$/.test(symbol)) reasons.push('invalid_symbol');
  if (!['BUY', 'SELL'].includes(side)) reasons.push('invalid_side');
  for (const [name, value] of Object.entries({ equity, markPrice, quantity, leverage, stopLoss, takeProfit, spreadBps, fundingRate, move15mPct, range60mPct, marketDataAgeMs })) {
    if (!finite(value)) reasons.push('invalid_' + name);
  }
  if (reasons.length) return { allowed: false, storm: false, reasons, warnings, metrics: {} };

  if (equity <= 0 || markPrice <= 0 || quantity <= 0) reasons.push('non_positive_trade_input');
  if (!Number.isInteger(leverage) || leverage < 1 || leverage > policy.maxLeverage) reasons.push('leverage_limit');
  if (openPositions >= policy.maxOpenPositions) reasons.push('too_many_open_positions');
  if (dailyPnl <= -(equity * policy.maxDailyDrawdownPct / 100)) reasons.push('daily_drawdown_kill_switch');
  if (marketDataAgeMs > policy.maxMarketDataAgeMs) reasons.push('stale_market_data');

  const stormReasons = [];
  if (spreadBps > policy.maxSpreadBps) stormReasons.push('spread_storm');
  if (Math.abs(fundingRate) > policy.maxAbsFundingRate) stormReasons.push('funding_storm');
  if (Math.abs(move15mPct) > policy.maxAbs15mMovePct) stormReasons.push('fast_move_storm');
  if (range60mPct > policy.max60mRangePct) stormReasons.push('volatility_storm');
  reasons.push(...stormReasons);

  const stopDistancePct = Math.abs(markPrice - stopLoss) / markPrice * 100;
  const takeDistancePct = Math.abs(takeProfit - markPrice) / markPrice * 100;
  if (side === 'BUY' && !(stopLoss < markPrice && takeProfit > markPrice)) reasons.push('invalid_long_tp_sl');
  if (side === 'SELL' && !(stopLoss > markPrice && takeProfit < markPrice)) reasons.push('invalid_short_tp_sl');
  if (stopDistancePct <= 0 || takeDistancePct <= 0) reasons.push('invalid_tp_sl_distance');

  const notional = markPrice * quantity;
  const riskUsdt = notional * stopDistancePct / 100;
  const riskPct = equity > 0 ? riskUsdt / equity * 100 : Infinity;
  const rewardRisk = stopDistancePct > 0 ? takeDistancePct / stopDistancePct : 0;
  if (riskPct > policy.maxRiskPerTradePct) reasons.push('risk_per_trade_limit');
  if (rewardRisk < policy.minRewardRisk) reasons.push('reward_risk_too_low');

  const approvals = Array.isArray(input?.qaApprovals) ? input.qaApprovals : [];
  const distinctQa = new Set(approvals
    .filter(x => x && x.verdict === 'approve' && policy.qaAgents.includes(String(x.agent)))
    .map(x => String(x.agent)));
  if (distinctQa.size < policy.qaQuorum) reasons.push('qa_quorum_missing');

  if (riskPct > policy.maxRiskPerTradePct * 0.8) warnings.push('risk_near_limit');
  if (spreadBps > policy.maxSpreadBps * 0.75) warnings.push('spread_near_storm');

  return {
    allowed: reasons.length === 0,
    storm: stormReasons.length > 0,
    reasons,
    warnings,
    metrics: {
      notionalUsdt: Number(notional.toFixed(8)),
      riskUsdt: Number(riskUsdt.toFixed(8)),
      riskPct: Number(riskPct.toFixed(4)),
      rewardRisk: Number(rewardRisk.toFixed(3)),
      qaApprovals: distinctQa.size
    }
  };
}
