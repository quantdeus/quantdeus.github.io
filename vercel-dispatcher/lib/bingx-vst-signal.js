import {
  getBalance,
  getContractInfo,
  getKlines,
  getPositions,
  getTickers,
  listContracts,
  placeMarketOrder,
  publicStatus,
  runRiskCheck,
  symbolAllowed
} from './bingx-vst-broker.js';

const DEFAULT_TARGET_NOTIONAL_USDT = 10;
const HARD_MAX_SIGNAL_NOTIONAL_USDT = 25;
const DEFAULT_MIN_QUOTE_VOLUME_USDT = 1_000_000;
const DEFAULT_MAX_24H_RANGE_PCT = 10;
const DEFAULT_MAX_24H_CHANGE_PCT = 8;
const DEFAULT_MAX_SPREAD_BPS = 20;
const DEFAULT_DEEP_SCAN_LIMIT = 60;

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

function envInteger(name, fallback, min = 1, max = 1000) {
  const value = Math.trunc(Number(process.env[name]));
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

function numeric(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function remoteBrokerUrl() {
  const raw = String(process.env.QUANTDEUS_BINGX_VST_REMOTE_BROKER_URL || '').trim();
  if (!raw) return '';
  const url = new URL(raw);
  const trusted =
    url.protocol === 'https:' &&
    url.hostname === 'quantdeus.vercel.app' &&
    url.pathname === '/api/quantdeus/bingx-vst-private-broker' &&
    !url.search &&
    !url.hash;
  if (!trusted) throw new Error('bingx_vst_remote_broker_url_not_allowed');
  return url.toString();
}

function remoteBrokerEnabled() {
  return Boolean(remoteBrokerUrl());
}

// Prevent GitHub market scans and the Vercel private broker from silently
// crossing simulated/live environments during configuration changes.
function assertBrokerEnvironment(result, expected, stage) {
  if (!result || result.environment !== expected) {
    throw new Error('bingx_broker_environment_mismatch_' + stage);
  }
  return result;
}

async function githubOidcToken() {
  const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!requestUrl || !requestToken) throw new Error('github_oidc_request_context_missing');

  const oidcUrl = new URL(requestUrl);
  oidcUrl.searchParams.set('audience', 'quantdeus-vercel-openclaw');
  const response = await fetch(oidcUrl, {
    headers: {
      authorization: 'Bearer ' + requestToken,
      accept: 'application/json'
    }
  });
  if (!response.ok) throw new Error('github_oidc_token_request_failed_' + response.status);
  const data = await response.json();
  const token = String(data?.value || '');
  if (!token) throw new Error('github_oidc_token_missing');
  return token;
}

async function remoteBrokerCall(operation, input = {}) {
  const url = remoteBrokerUrl();
  if (!url) throw new Error('bingx_vst_remote_broker_not_configured');
  const token = await githubOidcToken();
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + token,
      accept: 'application/json',
      'content-type': 'application/json'
    },
    body: JSON.stringify({ operation, input })
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch {}
  if (!response.ok || data?.ok !== true) {
    const error = new Error(
      'bingx_vst_remote_broker_failed_' + response.status + '_' +
      String(data?.error || '').slice(0, 160)
    );
    error.brokerHttpStatus = response.status;
    error.businessCode = Number.isFinite(Number(data?.upstream_code)) ? Number(data.upstream_code) : null;
    error.upstreamHttpStatus = Number.isFinite(Number(data?.upstream_http_status)) ? Number(data.upstream_http_status) : null;
    error.upstreamMessage = String(data?.upstream_message || '').slice(0, 180) || null;
    error.data = data;
    throw error;
  }
  return data.result;
}

export function assessTicker(ticker = {}, options = {}) {
  const lastPrice = numeric(ticker.lastPrice);
  const highPrice = numeric(ticker.highPrice);
  const lowPrice = numeric(ticker.lowPrice);
  const openPrice = numeric(ticker.openPrice);
  const bidPrice = numeric(ticker.bidPrice);
  const askPrice = numeric(ticker.askPrice);
  const quoteVolume = Math.max(0, numeric(ticker.quoteVolume) ?? 0);
  const explicitChange = numeric(ticker.priceChangePercent);

  const minQuoteVolumeUsdt = Number(options.minQuoteVolumeUsdt ?? envNumber('BINGX_VST_MIN_QUOTE_VOLUME_USDT', DEFAULT_MIN_QUOTE_VOLUME_USDT));
  const maxRangePct = Number(options.maxRangePct ?? envNumber('BINGX_VST_MAX_24H_RANGE_PCT', DEFAULT_MAX_24H_RANGE_PCT));
  const maxChangePct = Number(options.maxChangePct ?? envNumber('BINGX_VST_MAX_24H_CHANGE_PCT', DEFAULT_MAX_24H_CHANGE_PCT));
  const maxSpreadBps = Number(options.maxSpreadBps ?? envNumber('BINGX_VST_MAX_SPREAD_BPS', DEFAULT_MAX_SPREAD_BPS));

  const rangePct = lastPrice && highPrice && lowPrice
    ? ((highPrice - lowPrice) / lastPrice) * 100
    : Infinity;
  const changePct = explicitChange ?? (lastPrice && openPrice ? pctChange(lastPrice, openPrice) : Infinity);
  const midpoint = bidPrice && askPrice ? (bidPrice + askPrice) / 2 : null;
  const spreadBps = midpoint && askPrice >= bidPrice
    ? ((askPrice - bidPrice) / midpoint) * 10_000
    : Infinity;

  const reasons = [];
  if (!(lastPrice > 0)) reasons.push('invalid_last_price');
  if (quoteVolume < minQuoteVolumeUsdt) reasons.push('liquidity_low');
  if (!Number.isFinite(rangePct) || rangePct > maxRangePct) reasons.push('range_storm');
  if (!Number.isFinite(changePct) || Math.abs(changePct) > maxChangePct) reasons.push('price_change_storm');
  if (!Number.isFinite(spreadBps) || spreadBps > maxSpreadBps) reasons.push('spread_wide');

  const liquidityScore = Math.log10(Math.max(quoteVolume, 1));
  const stabilityScore = liquidityScore
    - (Number.isFinite(rangePct) ? rangePct / Math.max(maxRangePct, 1) : 10)
    - (Number.isFinite(spreadBps) ? spreadBps / Math.max(maxSpreadBps, 1) : 10);

  return {
    allowed: reasons.length === 0,
    reasons,
    lastPrice,
    quoteVolume: Number(quoteVolume.toFixed(2)),
    rangePct: Number.isFinite(rangePct) ? Number(rangePct.toFixed(4)) : null,
    changePct: Number.isFinite(changePct) ? Number(changePct.toFixed(4)) : null,
    spreadBps: Number.isFinite(spreadBps) ? Number(spreadBps.toFixed(4)) : null,
    stabilityScore: Number(stabilityScore.toFixed(6)),
    thresholds: { minQuoteVolumeUsdt, maxRangePct, maxChangePct, maxSpreadBps }
  };
}

function contractActive(contract = {}) {
  const status = String(contract.status ?? contract.state ?? '').trim().toUpperCase();
  if (!status) return true;
  return !/(?:SUSPEND|OFFLINE|DELIST|CLOSED|EXPIRED|DISABLED)/.test(status);
}

export function buildUniverse(contracts = [], tickers = [], options = {}) {
  const tickerMap = new Map(
    (Array.isArray(tickers) ? tickers : [])
      .map(item => [String(item?.symbol || '').trim().toUpperCase(), item])
      .filter(([symbol]) => symbol)
  );

  const all = [];
  for (const contract of Array.isArray(contracts) ? contracts : []) {
    const symbol = String(contract?.symbol || '').trim().toUpperCase();
    if (!symbolAllowed(symbol) || !contractActive(contract)) continue;
    const ticker = tickerMap.get(symbol);
    if (!ticker) {
      all.push({ symbol, allowed: false, reasons: ['ticker_missing'], quoteVolume: 0, stabilityScore: -Infinity });
      continue;
    }
    all.push({ symbol, contract, ...assessTicker(ticker, options) });
  }

  const eligible = all
    .filter(item => item.allowed)
    .sort((a, b) => b.stabilityScore - a.stabilityScore || b.quoteVolume - a.quoteVolume);

  return {
    all,
    eligible,
    scannedSymbols: all.length,
    eligibleSymbols: eligible.length
  };
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

function openPositionsFrom(result, symbolSet = null) {
  const rows = result?.response?.data ?? result?.response;
  const positions = Array.isArray(rows) ? rows : (rows ? [rows] : []);
  return positions.filter(position => {
    const symbol = String(position?.symbol || '').toUpperCase();
    const amount = Math.abs(Number(position?.positionAmt ?? position?.availableAmt ?? 0));
    const inScope = symbolSet ? symbolSet.has(symbol) : symbolAllowed(symbol);
    return inScope && Number.isFinite(amount) && amount > 0;
  });
}

function positionSideFor(side) {
  const mode = String(process.env.BINGX_VST_POSITION_MODE || 'hedge').trim().toLowerCase();
  if (mode === 'one-way' || mode === 'oneway' || mode === 'both') return 'BOTH';
  return side === 'BUY' ? 'LONG' : 'SHORT';
}

function targetNotional() {
  const status = publicStatus();
  return Math.min(
    HARD_MAX_SIGNAL_NOTIONAL_USDT,
    Number(status.maxOrderNotionalUsdt),
    envNumber('BINGX_VST_SIGNAL_NOTIONAL_USDT', DEFAULT_TARGET_NOTIONAL_USDT)
  );
}

export function upstreamErrorDetails(error) {
  const message = String(error?.message || error || '');
  const data = error?.data && typeof error.data === 'object' ? error.data : {};
  const businessMatch = message.match(/bingx_vst_business_(-?\d+)/);
  const upstreamHttpMatch = message.match(/bingx_vst_http_(\d{3})/);
  const brokerHttpMatch = message.match(/bingx_vst_remote_broker_failed_(\d{3})_/);
  const numberOrNull = value => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const bingxCode = numberOrNull(error?.businessCode ?? data?.upstream_code ?? data?.code ?? businessMatch?.[1]);
  const bingxHttpStatus = numberOrNull(error?.upstreamHttpStatus ?? data?.upstream_http_status ?? error?.status ?? upstreamHttpMatch?.[1]);
  const brokerHttpStatus = numberOrNull(error?.brokerHttpStatus ?? brokerHttpMatch?.[1]);
  const bingxMessage = String(
    error?.upstreamMessage ??
    data?.upstream_message ??
    data?.msg ??
    data?.message ??
    ''
  ).slice(0, 180) || null;

  return {
    bingxCode,
    bingxMessage,
    bingxHttpStatus,
    brokerHttpStatus,
    upstreamError: message.slice(0, 240) || null
  };
}

function isTransientUpstreamReadFailure(error) {
  const details = upstreamErrorDetails(error);
  if ([100500, 100503, 110500].includes(details.bingxCode)) return true;
  if ([500, 502, 503, 504].includes(details.bingxHttpStatus)) return true;
  const message = String(error?.message || error);
  return /bingx_vst_(?:business_(?:100500|100503|110500)|http_(?:500|502|503|504))/.test(message);
}

function degradedNoTrade(stage, reason = 'upstream_busy_fail_closed', extra = {}) {
  return {
    ok: true,
    environment: publicStatus().environment,
    action: 'none',
    reason,
    degraded: true,
    upstreamStage: stage,
    ...extra
  };
}

export async function runVstSignalCycle() {
  const status = publicStatus();
  if (!['prod-vst', 'prod-live'].includes(status.environment)) {
    throw new Error('bingx_vst_signal_environment_guard_failed');
  }
  const useRemoteBroker = remoteBrokerEnabled();
  if (status.environment === 'prod-live' && !status.liveApiAllowed) {
    // The owner's existing key belongs to a real perpetual-futures account.
    // With the live order gate locked, confirm private API auth and positions
    // through the same trusted broker without submitting any order.
    const balance = useRemoteBroker ? await remoteBrokerCall('balance') : await getBalance();
    assertBrokerEnvironment(balance, 'prod-live', 'balance');
    const positions = useRemoteBroker ? await remoteBrokerCall('positions') : await getPositions();
    assertBrokerEnvironment(positions, 'prod-live', 'positions');
    return {
      ok: true,
      environment: 'prod-live',
      action: 'none',
      reason: 'live_execution_locked',
      orderAttempted: false,
      privateAccountAuthenticated: true,
      positionsRead: true
    };
  }
  if (!status.credentialsConfigured && !useRemoteBroker) {
    throw new Error('bingx_vst_signal_credentials_missing');
  }

  let contractsResult;
  let tickersResult;
  let positions;
  try {
    [contractsResult, tickersResult, positions] = await Promise.all([
      listContracts(),
      getTickers(),
      useRemoteBroker ? remoteBrokerCall('positions') : getPositions()
    ]);
  } catch (error) {
    if (isTransientUpstreamReadFailure(error)) {
      return degradedNoTrade('initial_market_and_positions_read', 'upstream_busy_fail_closed', upstreamErrorDetails(error));
    }
    throw error;
  }

  if (useRemoteBroker) {
    assertBrokerEnvironment(positions, status.environment, 'positions');
  }
  const universe = buildUniverse(contractsResult.contracts, tickersResult.tickers);
  const openPositions = openPositionsFrom(positions);
  if (openPositions.length) {
    return {
      ok: true,
      environment: status.environment,
      action: 'none',
      reason: 'open_position_exists',
      universeScanned: universe.scannedSymbols,
      eligibleUniverse: universe.eligibleSymbols,
      openPositionCount: openPositions.length
    };
  }

  if (!universe.eligible.length) {
    return {
      ok: true,
      environment: status.environment,
      action: 'none',
      reason: 'no_stable_liquid_assets',
      universeScanned: universe.scannedSymbols,
      eligibleUniverse: 0
    };
  }

  const deepScanLimit = envInteger('BINGX_VST_DEEP_SCAN_LIMIT', DEFAULT_DEEP_SCAN_LIMIT, 5, 80);
  const deepUniverse = universe.eligible.slice(0, deepScanLimit);
  const analyses = [];

  for (const item of deepUniverse) {
    try {
      const klines = await getKlines({ symbol: item.symbol, interval: '15m', limit: 80 });
      analyses.push({
        symbol: item.symbol,
        quoteVolume: item.quoteVolume,
        stabilityScore: item.stabilityScore,
        marketFilter: {
          rangePct: item.rangePct,
          changePct: item.changePct,
          spreadBps: item.spreadBps
        },
        ...analyzeMarket(rowsFromKlines(klines))
      });
    } catch (error) {
      analyses.push({
        symbol: item.symbol,
        tradable: false,
        reason: 'deep_scan_failed',
        error: String(error?.message || error).slice(0, 120),
        quoteVolume: item.quoteVolume,
        stabilityScore: item.stabilityScore
      });
    }
  }

  const candidate = analyses
    .filter(item => item.tradable)
    .sort((a, b) =>
      b.confidence - a.confidence ||
      Math.abs(b.score) - Math.abs(a.score) ||
      b.stabilityScore - a.stabilityScore ||
      b.quoteVolume - a.quoteVolume
    )[0];

  if (!candidate) {
    const strongest = [...analyses].sort((a, b) =>
      Math.abs(b.score || 0) - Math.abs(a.score || 0) ||
      (b.stabilityScore || 0) - (a.stabilityScore || 0)
    )[0];
    return {
      ok: true,
      environment: status.environment,
      action: 'none',
      reason: 'no_confirmed_signal',
      universeScanned: universe.scannedSymbols,
      eligibleUniverse: universe.eligibleSymbols,
      deepScannedSymbols: analyses.length,
      strongestSymbol: strongest?.symbol ?? null,
      strongestScore: strongest?.score ?? 0
    };
  }

  let contractInfo;
  try {
    contractInfo = await getContractInfo({ symbol: candidate.symbol });
  } catch (error) {
    if (isTransientUpstreamReadFailure(error)) {
      return degradedNoTrade('contract_read', 'upstream_busy_fail_closed', {
        symbol: candidate.symbol,
        side: candidate.side,
        score: candidate.score,
        confidence: candidate.confidence,
        universeScanned: universe.scannedSymbols,
        eligibleUniverse: universe.eligibleSymbols,
        deepScannedSymbols: analyses.length,
        ...upstreamErrorDetails(error)
      });
    }
    throw error;
  }
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

  const order = {
    symbol: candidate.symbol,
    side: candidate.side,
    positionSide: positionSideFor(candidate.side),
    quantity: quantityInfo.quantity,
    ...(status.environment === 'prod-live' ? {
      stopPrice: protection.stopPrice,
      takeProfitPrice: protection.takeProfitPrice
    } : {})
  };

  let qa;
  try {
    qa = useRemoteBroker
      ? await remoteBrokerCall('risk_check', order)
      : await runRiskCheck(order);
  } catch (error) {
    if (isTransientUpstreamReadFailure(error)) {
      return degradedNoTrade('qa_risk_read', 'upstream_busy_fail_closed', {
        symbol: candidate.symbol,
        side: candidate.side,
        score: candidate.score,
        confidence: candidate.confidence,
        universeScanned: universe.scannedSymbols,
        eligibleUniverse: universe.eligibleSymbols,
        deepScannedSymbols: analyses.length,
        ...upstreamErrorDetails(error)
      });
    }
    throw error;
  }
  if (useRemoteBroker) {
    assertBrokerEnvironment(qa, status.environment, 'risk_check');
  }
  if (!qa.allowed || !qa.approvalToken) {
    return {
      ok: true,
      environment: status.environment,
      action: 'none',
      reason: 'qa_risk_gate_blocked',
      universeScanned: universe.scannedSymbols,
      eligibleUniverse: universe.eligibleSymbols,
      deepScannedSymbols: analyses.length,
      symbol: candidate.symbol,
      side: candidate.side,
      score: candidate.score,
      confidence: candidate.confidence,
      qaReasons: qa.reasons || []
    };
  }

  const executionInput = {
    ...order,
    approval_token: qa.approvalToken
  };
  let execution;
  try {
    execution = useRemoteBroker
      ? await remoteBrokerCall('place_order', executionInput)
      : await placeMarketOrder(executionInput);
  } catch (error) {
    // Never retry or start a second full cycle after an order submission attempt.
    // Even in VST, a transport/upstream failure can make execution state uncertain.
    const transient = isTransientUpstreamReadFailure(error);
    return degradedNoTrade(
      'order_submit',
      transient
        ? 'order_rejected_upstream_busy'
        : 'order_submit_state_uncertain_fail_closed',
      {
        universeScanned: universe.scannedSymbols,
        eligibleUniverse: universe.eligibleSymbols,
        deepScannedSymbols: analyses.length,
        symbol: candidate.symbol,
        side: candidate.side,
        score: candidate.score,
        confidence: candidate.confidence,
        estimatedNotionalUsdt: Number(quantityInfo.notionalUsdt.toFixed(8)),
        riskPct: protection.riskPct,
        rewardPct: protection.rewardPct,
        orderAttempted: true,
        requiresReview: !transient,
        ...upstreamErrorDetails(error)
      }
    );
  }
  if (useRemoteBroker) {
    assertBrokerEnvironment(execution, status.environment, 'place_order');
  }
  const upstream = execution?.response?.data ?? execution?.response ?? {};
  const orderId = upstream?.order?.orderID ?? upstream?.order?.orderId ?? upstream?.orderID ?? upstream?.orderId ?? null;

  return {
    ok: true,
    environment: status.environment,
    action: status.environment === 'prod-live' ? 'live_perpetual_order_placed' : 'vst_order_placed',
    reason: 'signal_and_qa_confirmed',
    universeScanned: universe.scannedSymbols,
    eligibleUniverse: universe.eligibleSymbols,
    deepScannedSymbols: analyses.length,
    symbol: candidate.symbol,
    side: candidate.side,
    positionSide: order.positionSide,
    score: candidate.score,
    confidence: candidate.confidence,
    quantity: quantityInfo.quantity,
    estimatedNotionalUsdt: Number(quantityInfo.notionalUsdt.toFixed(8)),
    riskPct: protection.riskPct,
    rewardPct: protection.rewardPct,
    stopPriceSuggestion: protection.stopPrice,
    takeProfitPriceSuggestion: protection.takeProfitPrice,
    qa: {
      maxReturnPct: qa.maxReturnPct,
      maxRangePct: qa.maxRangePct,
      indicatorDirection5m: qa.indicators?.['5m']?.direction ?? null,
      indicatorConsensus5m: qa.indicators?.['5m']?.matchingConsensus ?? null,
      indicatorDirection15m: qa.indicators?.['15m']?.direction ?? null,
      indicatorConsensus15m: qa.indicators?.['15m']?.matchingConsensus ?? null
    },
    orderId
  };
}
