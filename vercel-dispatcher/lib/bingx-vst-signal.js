import {
  allowedSymbols,
  getContractInfo,
  getKlines,
  getPositions,
  publicStatus
} from './bingx-vst-broker.js';

const DEFAULT_TARGET_NOTIONAL_USDT = 10;
const HARD_MAX_SIGNAL_NOTIONAL_USDT = 25;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function envNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function rowsFromKlines(result) {
  const raw = result?.response?.data ?? result?.response;
  return Array.isArray(raw) ? raw : [];
}

export function parseCandles(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map(row => {
      if (Array.isArray(row)) {
        return {
          time: Number(row[0]),
          open: Number(row[1]),
          high: Number(row[2]),
          low: Number(row[3]),
          close: Number(row[4])
        };
      }
      return {
        time: Number(row?.time ?? row?.timestamp ?? row?.T ?? 0),
        open: Number(row?.open ?? row?.o),
        high: Number(row?.high ?? row?.h),
        low: Number(row?.low ?? row?.l),
        close: Number(row?.close ?? row?.c)
      };
    })
    .filter(candle =>
      Number.isFinite(candle.close) && candle.close > 0 &&
      Number.isFinite(candle.open) && candle.open > 0 &&
      Number.isFinite(candle.high) && candle.high > 0 &&
      Number.isFinite(candle.low) && candle.low > 0
    )
    .sort((a, b) => a.time - b.time);
}

export function ema(values, period) {
  const input = (Array.isArray(values) ? values : []).map(Number).filter(Number.isFinite);
  if (input.length < period || period < 2) return null;
  const k = 2 / (period + 1);
  let current = input.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  for (let index = period; index < input.length; index += 1) {
    current = input[index] * k + current * (1 - k);
  }
  return current;
}

export function rsi(values, period = 14) {
  const input = (Array.isArray(values) ? values : []).map(Number).filter(Number.isFinite);
  if (input.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let index = input.length - period; index < input.length; index += 1) {
    const delta = input[index] - input[index - 1];
    if (delta >= 0) gains += delta;
    else losses -= delta;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

export function atr(candles, period = 14) {
  if (!Array.isArray(candles) || candles.length < period + 1) return null;
  const ranges = [];
  for (let index = candles.length - period; index < candles.length; index += 1) {
    const current = candles[index];
    const previous = candles[index - 1];
    ranges.push(Math.max(
      current.high - current.low,
      Math.abs(current.high - previous.close),
      Math.abs(current.low - previous.close)
    ));
  }
  return ranges.reduce((sum, value) => sum + value, 0) / ranges.length;
}

function pctChange(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return 0;
  return (current / previous - 1) * 100;
}

function sma(values, period) {
  if (!Array.isArray(values) || values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((sum, value) => sum + value, 0) / slice.length;
}

export function analyzeMarket(rows) {
  const candles = parseCandles(rows);
  if (candles.length < 40) return { tradable: false, reason: 'insufficient_data' };

  const closes = candles.map(candle => candle.close);
  const last = closes.at(-1);
  const ema9 = ema(closes, 9);
  const ema21 = ema(closes, 21);
  const rsi14 = rsi(closes, 14);
  const atr14 = atr(candles, 14);
  const sma20 = sma(closes, 20);
  const mom1h = pctChange(last, closes.at(-5));
  const mom4h = pctChange(last, closes.at(-17));
  const trendSpreadPct = pctChange(ema9, ema21);
  const atrPct = atr14 && last ? (atr14 / last) * 100 : 0;

  let score = 0;
  if (trendSpreadPct >= 0.08) score += 2;
  if (trendSpreadPct <= -0.08) score -= 2;
  if (rsi14 >= 52 && rsi14 <= 70) score += 1;
  if (rsi14 >= 30 && rsi14 <= 48) score -= 1;
  if (mom1h >= 0.12) score += 1;
  if (mom1h <= -0.12) score -= 1;
  if (mom4h >= 0.35) score += 1;
  if (mom4h <= -0.35) score -= 1;
  if (last >= sma20 * 1.001) score += 1;
  if (last <= sma20 * 0.999) score -= 1;

  const lastCandle = candles.at(-1);
  if (lastCandle.close > lastCandle.open) score += 0.5;
  if (lastCandle.close < lastCandle.open) score -= 0.5;

  const extremeRsi = rsi14 >= 75 || rsi14 <= 25;
  const volatilityBlocked = atrPct > 2 || atrPct < 0.05;
  const direction = score > 0 ? 'BUY' : score < 0 ? 'SELL' : null;
  const tradable = Boolean(direction) && Math.abs(score) >= 4 && !extremeRsi && !volatilityBlocked;

  return {
    tradable,
    reason: tradable ? 'signal_confirmed' : (extremeRsi ? 'rsi_extreme' : volatilityBlocked ? 'volatility_filter' : 'signal_too_weak'),
    side: direction,
    score: Number(score.toFixed(2)),
    confidence: Number(clamp(Math.abs(score) / 6.5, 0, 1).toFixed(4)),
    lastPrice: last,
    rsi14: Number(rsi14.toFixed(4)),
    atrPct: Number(atrPct.toFixed(4)),
    momentum1hPct: Number(mom1h.toFixed(4)),
    momentum4hPct: Number(mom4h.toFixed(4))
  };
}

export function computeQuantity({ price, targetNotionalUsdt, quantityPrecision, tradeMinQuantity, tradeMinUSDT }) {
  const lastPrice = Number(price);
  const precision = Math.max(0, Math.min(12, Math.trunc(Number(quantityPrecision || 0))));
  const minQuantity = Math.max(0, Number(tradeMinQuantity || 0));
  const minUsdt = Math.max(0, Number(tradeMinUSDT || 0));
  if (!Number.isFinite(lastPrice) || lastPrice <= 0) throw new Error('bingx_vst_signal_invalid_price');
  const requestedNotional = Math.max(Number(targetNotionalUsdt || 0), minUsdt * 1.05);
  const factor = 10 ** precision;
  let quantity = Math.floor((requestedNotional / lastPrice) * factor) / factor;
  if (quantity < minQuantity) quantity = Math.ceil(minQuantity * factor) / factor;
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('bingx_vst_signal_invalid_quantity');
  return {
    quantity: quantity.toFixed(precision),
    notionalUsdt: quantity * lastPrice
  };
}

export function buildProtectionSuggestion({ side, price, atrPct, pricePrecision }) {
  const lastPrice = Number(price);
  const precision = Math.max(0, Math.min(12, Math.trunc(Number(pricePrecision || 0))));
  const riskPct = clamp(Number(atrPct) * 0.9, 0.35, 1);
  const rewardPct = clamp(riskPct * 1.5, 0.55, 1.5);
  const round = value => Number(Number(value).toFixed(precision));

  if (side === 'BUY') {
    return {
      riskPct: Number(riskPct.toFixed(4)),
      rewardPct: Number(rewardPct.toFixed(4)),
      stopPrice: round(lastPrice * (1 - riskPct / 100)),
      takeProfitPrice: round(lastPrice * (1 + rewardPct / 100))
    };
  }
  if (side === 'SELL') {
    return {
      riskPct: Number(riskPct.toFixed(4)),
      rewardPct: Number(rewardPct.toFixed(4)),
      stopPrice: round(lastPrice * (1 + riskPct / 100)),
      takeProfitPrice: round(lastPrice * (1 - rewardPct / 100))
    };
  }
  throw new Error('bingx_vst_signal_invalid_side');
}

function openPositionsFrom(result, symbolSet) {
  const rows = result?.response?.data ?? result?.response;
  const positions = Array.isArray(rows) ? rows : (rows ? [rows] : []);
  return positions.filter(position => {
    const symbol = String(position?.symbol || '').toUpperCase();
    const amount = Math.abs(Number(position?.positionAmt ?? position?.availableAmt ?? 0));
    return symbolSet.has(symbol) && Number.isFinite(amount) && amount > 0;
  });
}

function targetNotional() {
  const status = publicStatus();
  return Math.min(
    HARD_MAX_SIGNAL_NOTIONAL_USDT,
    Number(status.maxOrderNotionalUsdt),
    envNumber('BINGX_VST_SIGNAL_NOTIONAL_USDT', DEFAULT_TARGET_NOTIONAL_USDT)
  );
}

export async function runVstSignalCycle() {
  const status = publicStatus();
  if (status.environment !== 'prod-vst' || status.liveApiAllowed !== false) {
    throw new Error('bingx_vst_signal_environment_guard_failed');
  }
  if (!status.credentialsConfigured) throw new Error('bingx_vst_signal_credentials_missing');

  const symbols = allowedSymbols().slice(0, 5);
  const symbolSet = new Set(symbols);
  const positions = await getPositions();
  const openPositions = openPositionsFrom(positions, symbolSet);
  if (openPositions.length) {
    return {
      ok: true,
      environment: 'prod-vst',
      action: 'none',
      reason: 'open_position_exists',
      openPositionCount: openPositions.length
    };
  }

  const analyses = [];
  for (const symbol of symbols) {
    const klines = await getKlines({ symbol, interval: '15m', limit: 80 });
    analyses.push({ symbol, ...analyzeMarket(rowsFromKlines(klines)) });
  }

  const candidate = analyses
    .filter(item => item.tradable)
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score) || b.confidence - a.confidence)[0];

  if (!candidate) {
    const strongest = [...analyses].sort((a, b) => Math.abs(b.score || 0) - Math.abs(a.score || 0))[0];
    return {
      ok: true,
      environment: 'prod-vst',
      action: 'none',
      reason: 'no_confirmed_signal',
      scannedSymbols: analyses.length,
      strongestSymbol: strongest?.symbol ?? null,
      strongestScore: strongest?.score ?? 0
    };
  }

  const contractInfo = await getContractInfo({ symbol: candidate.symbol });
  const contract = contractInfo.contract || {};
  const quantityInfo = computeQuantity({
    price: candidate.lastPrice,
    targetNotionalUsdt: targetNotional(),
    quantityPrecision: Number(contract.quantityPrecision ?? 0),
    tradeMinQuantity: Number(contract.tradeMinQuantity ?? contract.tradeMinLimit ?? 0),
    tradeMinUSDT: Number(contract.tradeMinUSDT ?? 0)
  });
  const protection = buildProtectionSuggestion({
    side: candidate.side,
    price: candidate.lastPrice,
    atrPct: candidate.atrPct,
    pricePrecision: Number(contract.pricePrecision ?? 0)
  });

  return {
    ok: true,
    environment: 'prod-vst',
    action: 'would_trade',
    symbol: candidate.symbol,
    side: candidate.side,
    score: candidate.score,
    confidence: candidate.confidence,
    quantity: quantityInfo.quantity,
    estimatedNotionalUsdt: Number(quantityInfo.notionalUsdt.toFixed(8)),
    riskPct: protection.riskPct,
    rewardPct: protection.rewardPct,
    stopPrice: protection.stopPrice,
    takeProfitPrice: protection.takeProfitPrice
  };
}
