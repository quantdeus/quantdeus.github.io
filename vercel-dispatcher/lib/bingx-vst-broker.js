import crypto from 'node:crypto';
import JSONbigFactory from 'json-bigint';

const JSONbig = JSONbigFactory({ storeAsString: true });

export const BINGX_VST_BASES = Object.freeze([
  'https://open-api-vst.bingx.com',
  'https://open-api-vst.bingx.pro'
]);

const DEFAULT_SYMBOLS = ['BTC-USDT', 'ETH-USDT', 'BNB-USDT', 'SOL-USDT', 'XRP-USDT'];
const DEFAULT_STORM_PCT = 2.5;
const DEFAULT_MAX_NOTIONAL_USDT = 100;
const DEFAULT_MIN_INDICATORS = 10;
const DEFAULT_MIN_DIRECTIONAL = 8;
const DEFAULT_MIN_CONSENSUS = 0.65;
const DEFAULT_MIN_GROUPS = 3;
const APPROVAL_TTL_MS = 60_000;

const FORBIDDEN_PARAM_CHARS = /[&=?#\\r\\n]/;

export function validateParams(params = {}) {
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    const text = String(value);
    if (FORBIDDEN_PARAM_CHARS.test(text)) {
      throw new Error(`bingx_vst_forbidden_param_${key}`);
    }
  }
}

export function canonicalParams(params = {}) {
  validateParams(params);
  return Object.keys(params)
    .filter(key => params[key] !== undefined && params[key] !== null && params[key] !== '')
    .sort()
    .map(key => `${key}=${String(params[key])}`)
    .join('&');
}

export function assertVstOnlyBase(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !/^open-api-vst\.bingx\.(?:com|pro)$/.test(parsed.hostname)) {
    throw new Error('bingx_live_or_unknown_base_blocked');
  }
  return true;
}

function envNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function tradingEnabled() {
  return /^(?:1|true|yes|on)$/i.test(String(process.env.QUANTDEUS_BINGX_VST_TRADING_ENABLED || ''));
}

function symbolMode() {
  const mode = String(process.env.BINGX_VST_SYMBOL_MODE || 'all').trim().toLowerCase();
  return mode === 'allowlist' ? 'allowlist' : 'all';
}

export function allowedSymbols() {
  if (symbolMode() === 'all') return ['*'];
  const raw = String(process.env.BINGX_VST_SYMBOL_ALLOWLIST || '').trim();
  const source = raw ? raw.split(',') : DEFAULT_SYMBOLS;
  return [...new Set(source.map(value => value.trim().toUpperCase()).filter(Boolean))];
}

export function symbolAllowed(input) {
  const symbol = String(input || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{1,40}-USDT$/.test(symbol)) return false;
  const configured = allowedSymbols();
  return configured.includes('*') || configured.includes(symbol);
}

function credentials() {
  return {
    apiKey: String(process.env.BINGX_VST_API_KEY || '').trim(),
    secretKey: String(process.env.BINGX_VST_SECRET_KEY || '').trim()
  };
}

function brokerSecret() {
  const secret = String(process.env.QUANTDEUS_BINGX_VST_BROKER_TOKEN || '').trim();
  if (!secret) throw new Error('bingx_vst_broker_token_missing');
  return secret;
}

function hmacHex(secret, value) {
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

function normalizeOrder(input = {}) {
  const symbol = String(input.symbol || '').trim().toUpperCase();
  const side = String(input.side || '').trim().toUpperCase();
  const positionSide = String(input.positionSide || '').trim().toUpperCase();
  const quantity = String(input.quantity || '').trim();
  const quantityNumber = Number(quantity);

  if (!symbolAllowed(symbol)) throw new Error('bingx_vst_symbol_not_allowed');
  if (!new Set(['BUY', 'SELL']).has(side)) throw new Error('bingx_vst_invalid_side');
  if (!new Set(['LONG', 'SHORT', 'BOTH']).has(positionSide)) throw new Error('bingx_vst_invalid_position_side');
  if (!Number.isFinite(quantityNumber) || quantityNumber <= 0) throw new Error('bingx_vst_invalid_quantity');

  return { symbol, side, positionSide, quantity, quantityNumber };
}

function approvalBody(order, expiresAt, metrics) {
  return {
    v: 1,
    env: 'prod-vst',
    symbol: order.symbol,
    side: order.side,
    positionSide: order.positionSide,
    quantity: order.quantity,
    expiresAt,
    maxReturnPct: metrics.maxReturnPct,
    notionalUsdt: metrics.notionalUsdt,
    indicatorDirection5m: metrics.indicators?.['5m']?.direction ?? null,
    indicatorConsensus5m: metrics.indicators?.['5m']?.matchingConsensus ?? null,
    indicatorDirection15m: metrics.indicators?.['15m']?.direction ?? null,
    indicatorConsensus15m: metrics.indicators?.['15m']?.matchingConsensus ?? null
  };
}

export function signRiskApproval(orderInput, metrics, now = Date.now(), secret = brokerSecret()) {
  const order = normalizeOrder(orderInput);
  const expiresAt = now + APPROVAL_TTL_MS;
  const payload = Buffer.from(JSON.stringify(approvalBody(order, expiresAt, metrics))).toString('base64url');
  const signature = hmacHex(secret, payload);
  return `${payload}.${signature}`;
}

export function verifyRiskApproval(token, orderInput, now = Date.now(), secret = brokerSecret()) {
  const order = normalizeOrder(orderInput);
  const [payload, signature, extra] = String(token || '').split('.');
  if (!payload || !signature || extra) throw new Error('bingx_vst_invalid_approval_token');
  const expected = hmacHex(secret, payload);
  const left = Buffer.from(signature, 'utf8');
  const right = Buffer.from(expected, 'utf8');
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) throw new Error('bingx_vst_bad_approval_signature');

  let claims;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    throw new Error('bingx_vst_bad_approval_payload');
  }
  if (claims?.v !== 1 || claims?.env !== 'prod-vst') throw new Error('bingx_vst_wrong_approval_environment');
  if (!Number.isFinite(Number(claims.expiresAt)) || Number(claims.expiresAt) < now) throw new Error('bingx_vst_approval_expired');
  for (const key of ['symbol', 'side', 'positionSide', 'quantity']) {
    if (String(claims[key]) !== String(order[key])) throw new Error(`bingx_vst_approval_mismatch_${key}`);
  }
  return claims;
}

function parseJson(raw) {
  return raw ? JSONbig.parse(raw) : null;
}

const TRANSIENT_READ_BUSINESS_CODES = new Set([100500, 100503, 110500]);
const TRANSIENT_READ_HTTP_STATUSES = new Set([500, 502, 503, 504]);
const READ_RETRY_DELAYS_MS = Object.freeze([750, 2000, 5000]);

function isNetworkOrTimeout(error) {
  return (
    error?.name === 'TimeoutError' ||
    error?.name === 'AbortError' ||
    error instanceof TypeError
  );
}

function isTransientReadError(error) {
  return (
    isNetworkOrTimeout(error) ||
    TRANSIENT_READ_HTTP_STATUSES.has(Number(error?.status)) ||
    TRANSIENT_READ_BUSINESS_CODES.has(Number(error?.businessCode))
  );
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withReadRetry(run) {
  let lastError = null;
  for (let attempt = 0; attempt <= READ_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      if (!isTransientReadError(error) || attempt >= READ_RETRY_DELAYS_MS.length) throw error;
      await sleep(READ_RETRY_DELAYS_MS[attempt]);
    }
  }
  throw lastError || new Error('bingx_vst_unreachable');
}

async function vstFetch(path, init = {}, options = {}) {
  let lastError = null;
  for (let index = 0; index < BINGX_VST_BASES.length; index += 1) {
    const base = BINGX_VST_BASES[index];
    assertVstOnlyBase(base);
    try {
      const response = await fetch(`${base}${path}`, {
        ...init,
        signal: AbortSignal.timeout(10_000),
        headers: {
          accept: 'application/json',
          'X-SOURCE-KEY': 'BX-AI-SKILL',
          ...(init.headers || {})
        }
      });
      const raw = await response.text();
      const data = parseJson(raw);
      if (!response.ok) {
        const error = new Error(`bingx_vst_http_${response.status}`);
        error.status = response.status;
        error.data = data;
        throw error;
      }
      if (data && typeof data === 'object' && Object.hasOwn(data, 'code') && Number(data.code) !== 0) {
        const error = new Error(`bingx_vst_business_${String(data.code)}`);
        error.businessCode = Number(data.code);
        error.data = data;
        throw error;
      }
      return { data, base };
    } catch (error) {
      lastError = error;
      const canFailOver =
        options.allowNetworkFailover === true &&
        isNetworkOrTimeout(error) &&
        index < BINGX_VST_BASES.length - 1;
      if (canFailOver) continue;
      throw error;
    }
  }
  throw lastError || new Error('bingx_vst_unreachable');
}

async function publicGet(path, params = {}) {
  validateParams(params);
  const query = new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)])).toString();
  return withReadRetry(() =>
    vstFetch(`${path}${query ? `?${query}` : ''}`, {}, { allowNetworkFailover: true })
  );
}

async function privateRequest(method, path, params = {}) {
  const { apiKey, secretKey } = credentials();
  if (!apiKey || !secretKey) throw new Error('bingx_vst_credentials_missing');

  const headers = {
    'X-BX-APIKEY': apiKey,
    'X-SOURCE-KEY': 'BX-AI-SKILL'
  };

  if (method === 'GET') {
    return withReadRetry(() => {
      const signedParams = { ...params, recvWindow: 5000, timestamp: Date.now() };
      const canonical = canonicalParams(signedParams);
      const signature = hmacHex(secretKey, canonical);
      return vstFetch(
        `${path}?${canonical}&signature=${signature}`,
        { method, headers },
        { allowNetworkFailover: true }
      );
    });
  }
  if (method === 'POST') {
    const signedParams = { ...params, recvWindow: 5000, timestamp: Date.now() };
    const canonical = canonicalParams(signedParams);
    const signature = hmacHex(secretKey, canonical);
    return vstFetch(path, {
      method,
      headers: { ...headers, 'content-type': 'application/x-www-form-urlencoded' },
      body: `${canonical}&signature=${signature}`
    }, { allowNetworkFailover: false });
  }
  throw new Error('bingx_vst_method_not_allowed');
}

const ORDER_BUSY_CODES = new Set([100500, 110500]);
const ORDER_NOT_FOUND_CODES = new Set([109421, 80016, 80017]);
const ORDER_DUPLICATE_CLIENT_ID_CODES = new Set([101481]);

export function clientOrderIdFromApproval(approvalToken) {
  const token = String(approvalToken || '').trim();
  if (!token) throw new Error('bingx_vst_approval_token_missing');
  return 'qdvst' + crypto.createHash('sha256').update(token).digest('hex').slice(0, 30);
}

async function queryOrderByClientOrderId(order, clientOrderId) {
  try {
    return await privateRequest('GET', '/openApi/swap/v2/trade/order', {
      symbol: order.symbol,
      clientOrderId
    });
  } catch (error) {
    if (ORDER_NOT_FOUND_CODES.has(Number(error?.businessCode))) return null;
    throw error;
  }
}

async function submitMarketOrder(order, clientOrderId) {
  return privateRequest('POST', '/openApi/swap/v2/trade/order', {
    symbol: order.symbol,
    side: order.side,
    positionSide: order.positionSide,
    type: 'MARKET',
    quantity: order.quantity,
    clientOrderId
  });
}

async function submitMarketOrderWithBusyRecovery(order, clientOrderId) {
  try {
    return {
      ...(await submitMarketOrder(order, clientOrderId)),
      busyRecovery: 'not-needed'
    };
  } catch (error) {
    if (!ORDER_BUSY_CODES.has(Number(error?.businessCode))) throw error;

    const retryDelayMs = Math.min(
      5000,
      envNumber('BINGX_VST_ORDER_BUSY_RETRY_DELAY_MS', 750)
    );
    await sleep(retryDelayMs);

    // A business-level "system busy" response can still leave execution state unclear.
    // Query the same clientOrderId before any retry so we never blindly double-submit.
    const existing = await queryOrderByClientOrderId(order, clientOrderId);
    if (existing) {
      return {
        ...existing,
        busyRecovery: 'found-after-busy'
      };
    }

    await sleep(retryDelayMs);
    try {
      return {
        ...(await submitMarketOrder(order, clientOrderId)),
        busyRecovery: 'retried-after-not-found'
      };
    } catch (retryError) {
      if (ORDER_DUPLICATE_CLIENT_ID_CODES.has(Number(retryError?.businessCode))) {
        const duplicate = await queryOrderByClientOrderId(order, clientOrderId);
        if (duplicate) {
          return {
            ...duplicate,
            busyRecovery: 'found-after-duplicate-client-id'
          };
        }
      }
      throw retryError;
    }
  }
}


function normalizeCandles(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map(row => {
      if (Array.isArray(row)) {
        const close = Number(row[4]);
        return {
          time: Number(row[0]),
          open: Number(row[1]),
          high: Number(row[2]),
          low: Number(row[3]),
          close,
          volume: Number(row[5] ?? 0)
        };
      }
      const close = Number(row?.close ?? row?.c);
      return {
        time: Number(row?.time ?? row?.timestamp ?? row?.T ?? 0),
        open: Number(row?.open ?? row?.o),
        high: Number(row?.high ?? row?.h),
        low: Number(row?.low ?? row?.l),
        close,
        volume: Number(row?.volume ?? row?.vol ?? row?.v ?? row?.V ?? 0)
      };
    })
    .filter(candle => Number.isFinite(candle.close) && candle.close > 0)
    .map(candle => ({
      ...candle,
      open: Number.isFinite(candle.open) && candle.open > 0 ? candle.open : candle.close,
      high: Number.isFinite(candle.high) && candle.high > 0 ? candle.high : candle.close,
      low: Number.isFinite(candle.low) && candle.low > 0 ? candle.low : candle.close,
      volume: Number.isFinite(candle.volume) && candle.volume >= 0 ? candle.volume : 0
    }))
    .sort((a, b) => a.time - b.time);
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sma(values, period) {
  if (values.length < period) return null;
  return mean(values.slice(-period));
}

function emaSeries(values, period) {
  if (!values.length) return [];
  const alpha = 2 / (period + 1);
  const out = [values[0]];
  for (let index = 1; index < values.length; index += 1) {
    out.push(values[index] * alpha + out[index - 1] * (1 - alpha));
  }
  return out;
}

function stddev(values, period) {
  if (values.length < period) return null;
  const sample = values.slice(-period);
  const center = mean(sample);
  return Math.sqrt(mean(sample.map(value => (value - center) ** 2)));
}

function rsi(values, period = 14) {
  if (values.length <= period) return null;
  let gains = 0;
  let losses = 0;
  for (let index = values.length - period; index < values.length; index += 1) {
    const delta = values[index] - values[index - 1];
    if (delta > 0) gains += delta;
    if (delta < 0) losses -= delta;
  }
  if (gains === 0 && losses === 0) return 50;
  if (losses === 0) return 100;
  if (gains === 0) return 0;
  const rs = (gains / period) / (losses / period);
  return 100 - 100 / (1 + rs);
}

function atr(candles, period = 14) {
  if (candles.length <= period) return null;
  const ranges = [];
  for (let index = candles.length - period; index < candles.length; index += 1) {
    const candle = candles[index];
    const previousClose = candles[index - 1].close;
    ranges.push(Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose)
    ));
  }
  return mean(ranges);
}

function macdHistogram(values) {
  if (values.length < 35) return null;
  const fast = emaSeries(values, 12);
  const slow = emaSeries(values, 26);
  const macd = values.map((_, index) => fast[index] - slow[index]);
  const signal = emaSeries(macd, 9);
  return macd.at(-1) - signal.at(-1);
}

function stochasticK(candles, period = 14) {
  if (candles.length < period) return null;
  const sample = candles.slice(-period);
  const high = Math.max(...sample.map(candle => candle.high));
  const low = Math.min(...sample.map(candle => candle.low));
  if (high === low) return 50;
  return ((candles.at(-1).close - low) / (high - low)) * 100;
}

function aroon(candles, period = 25) {
  if (candles.length < period) return null;
  const sample = candles.slice(-period);
  let highIndex = 0;
  let lowIndex = 0;
  for (let index = 1; index < sample.length; index += 1) {
    if (sample[index].high >= sample[highIndex].high) highIndex = index;
    if (sample[index].low <= sample[lowIndex].low) lowIndex = index;
  }
  const up = (highIndex / (period - 1)) * 100;
  const down = (lowIndex / (period - 1)) * 100;
  return { up, down };
}

function vwap(candles, period = 20) {
  if (candles.length < period) return null;
  const sample = candles.slice(-period);
  const volume = sample.reduce((sum, candle) => sum + candle.volume, 0);
  if (volume <= 0) return null;
  const weighted = sample.reduce(
    (sum, candle) => sum + ((candle.high + candle.low + candle.close) / 3) * candle.volume,
    0
  );
  return weighted / volume;
}

function obvDelta(candles, period = 10) {
  if (candles.length <= period) return null;
  const sample = candles.slice(-(period + 1));
  if (!sample.some(candle => candle.volume > 0)) return null;
  let obv = 0;
  let first = null;
  for (let index = 1; index < sample.length; index += 1) {
    const delta = sample[index].close - sample[index - 1].close;
    if (delta > 0) obv += sample[index].volume;
    if (delta < 0) obv -= sample[index].volume;
    if (index === 1) first = obv;
  }
  return obv - (first ?? 0);
}

function moneyFlowIndex(candles, period = 14) {
  if (candles.length <= period) return null;
  const sample = candles.slice(-(period + 1));
  if (!sample.some(candle => candle.volume > 0)) return null;
  let positive = 0;
  let negative = 0;
  for (let index = 1; index < sample.length; index += 1) {
    const currentTypical = (sample[index].high + sample[index].low + sample[index].close) / 3;
    const previousTypical = (sample[index - 1].high + sample[index - 1].low + sample[index - 1].close) / 3;
    const flow = currentTypical * sample[index].volume;
    if (currentTypical > previousTypical) positive += flow;
    if (currentTypical < previousTypical) negative += flow;
  }
  if (positive === 0 && negative === 0) return 50;
  if (negative === 0) return 100;
  if (positive === 0) return 0;
  const ratio = positive / negative;
  return 100 - 100 / (1 + ratio);
}

function vote(name, group, signal, value) {
  return {
    name,
    group,
    signal: signal > 0 ? 1 : signal < 0 ? -1 : 0,
    value: Number.isFinite(Number(value)) ? Number(Number(value).toFixed(6)) : null
  };
}

export function indicatorConsensus(rows) {
  const candles = normalizeCandles(rows);
  if (candles.length < 60) throw new Error('bingx_vst_insufficient_indicator_data');

  const closes = candles.map(candle => candle.close);
  const last = closes.at(-1);
  const ema9 = emaSeries(closes, 9).at(-1);
  const ema20 = emaSeries(closes, 20).at(-1);
  const ema21 = emaSeries(closes, 21).at(-1);
  const ema50 = emaSeries(closes, 50).at(-1);
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const rsi14 = rsi(closes, 14);
  const macd = macdHistogram(closes);
  const roc10 = closes.length > 10 ? (last / closes.at(-11) - 1) * 100 : null;
  const stoch14 = stochasticK(candles, 14);
  const sd20 = stddev(closes, 20);
  const donchian = candles.slice(-20);
  const donchianMid = (Math.max(...donchian.map(candle => candle.high)) + Math.min(...donchian.map(candle => candle.low))) / 2;
  const atr14 = atr(candles, 14);
  const aroon25 = aroon(candles, 25);
  const vwap20 = vwap(candles, 20);
  const obv10 = obvDelta(candles, 10);
  const mfi14 = moneyFlowIndex(candles, 14);

  const signals = [
    vote('ema_9_21', 'trend', ema9 > ema21 ? 1 : ema9 < ema21 ? -1 : 0, ema9 - ema21),
    vote('sma_20_50', 'trend', sma20 > sma50 ? 1 : sma20 < sma50 ? -1 : 0, sma20 - sma50),
    vote('price_vs_ema50', 'trend', last > ema50 ? 1 : last < ema50 ? -1 : 0, last - ema50),
    vote('aroon_25', 'trend', aroon25.up - aroon25.down > 15 ? 1 : aroon25.down - aroon25.up > 15 ? -1 : 0, aroon25.up - aroon25.down),

    vote('rsi_14', 'momentum', rsi14 >= 55 ? 1 : rsi14 <= 45 ? -1 : 0, rsi14),
    vote('macd_histogram', 'momentum', macd > 0 ? 1 : macd < 0 ? -1 : 0, macd),
    vote('roc_10', 'momentum', roc10 > 0.05 ? 1 : roc10 < -0.05 ? -1 : 0, roc10),
    vote('stochastic_14', 'momentum', stoch14 >= 55 ? 1 : stoch14 <= 45 ? -1 : 0, stoch14),

    vote('bollinger_mid', 'volatility', last > sma20 + sd20 * 0.05 ? 1 : last < sma20 - sd20 * 0.05 ? -1 : 0, (last - sma20) / Math.max(sd20 || 1, Number.EPSILON)),
    vote('donchian_mid', 'volatility', last > donchianMid ? 1 : last < donchianMid ? -1 : 0, last - donchianMid),
    vote('atr_trend', 'volatility', last > ema20 + atr14 * 0.15 ? 1 : last < ema20 - atr14 * 0.15 ? -1 : 0, (last - ema20) / Math.max(atr14 || 1, Number.EPSILON)),

    vote('vwap_20', 'flow', vwap20 == null ? 0 : last > vwap20 ? 1 : last < vwap20 ? -1 : 0, vwap20 == null ? null : last - vwap20),
    vote('obv_10', 'flow', obv10 == null ? 0 : obv10 > 0 ? 1 : obv10 < 0 ? -1 : 0, obv10),
    vote('mfi_14', 'flow', mfi14 == null ? 0 : mfi14 >= 55 ? 1 : mfi14 <= 45 ? -1 : 0, mfi14)
  ];

  const bullish = signals.filter(signal => signal.signal > 0).length;
  const bearish = signals.filter(signal => signal.signal < 0).length;
  const directional = bullish + bearish;
  const neutral = signals.length - directional;
  const direction = bullish > bearish ? 'bullish' : bearish > bullish ? 'bearish' : 'neutral';
  const consensus = directional ? Math.max(bullish, bearish) / directional : 0;
  const activeGroups = new Set(signals.filter(signal => signal.signal !== 0).map(signal => signal.group)).size;

  return {
    direction,
    consensus: Number(consensus.toFixed(4)),
    bullish,
    bearish,
    neutral,
    directional,
    indicatorCount: signals.length,
    activeGroups,
    signals
  };
}

export function evaluateIndicatorGate(orderInput, analysis, options = {}) {
  const order = normalizeOrder(orderInput);
  const minIndicators = Number(options.minIndicators ?? envNumber('BINGX_VST_MIN_INDICATORS', DEFAULT_MIN_INDICATORS));
  const minDirectional = Number(options.minDirectional ?? envNumber('BINGX_VST_MIN_DIRECTIONAL', DEFAULT_MIN_DIRECTIONAL));
  const minConsensus = Number(options.minConsensus ?? envNumber('BINGX_VST_MIN_CONSENSUS', DEFAULT_MIN_CONSENSUS));
  const minGroups = Number(options.minGroups ?? envNumber('BINGX_VST_MIN_GROUPS', DEFAULT_MIN_GROUPS));
  const expectedSignal = order.side === 'BUY' ? 1 : -1;
  const matching = expectedSignal > 0 ? Number(analysis?.bullish || 0) : Number(analysis?.bearish || 0);
  const directional = Number(analysis?.directional || 0);
  const matchingConsensus = directional > 0 ? matching / directional : 0;
  const expectedDirection = expectedSignal > 0 ? 'bullish' : 'bearish';

  const reasons = [];
  if (Number(analysis?.indicatorCount || 0) < minIndicators) reasons.push('indicator_count_low');
  if (directional < minDirectional) reasons.push('directional_votes_low');
  if (Number(analysis?.activeGroups || 0) < minGroups) reasons.push('indicator_group_coverage_low');
  if (analysis?.direction !== expectedDirection) reasons.push('indicator_direction_mismatch');
  if (matchingConsensus < minConsensus) reasons.push('indicator_consensus_weak');

  return {
    allowed: reasons.length === 0,
    reasons,
    expectedDirection,
    matchingConsensus: Number(matchingConsensus.toFixed(4)),
    minIndicators,
    minDirectional,
    minConsensus,
    minGroups,
    ...analysis
  };
}

function candleMetrics(rows) {
  const candles = normalizeCandles(rows);
  if (candles.length < 3) throw new Error('bingx_vst_insufficient_kline_data');
  let maxReturnPct = 0;
  let maxRangePct = 0;
  for (let index = 1; index < candles.length; index += 1) {
    const previous = candles[index - 1].close;
    const current = candles[index].close;
    maxReturnPct = Math.max(maxReturnPct, Math.abs((current / previous - 1) * 100));
  }
  for (const candle of candles) {
    maxRangePct = Math.max(maxRangePct, Math.abs((candle.high - candle.low) / candle.open * 100));
  }
  return {
    lastPrice: candles.at(-1).close,
    maxReturnPct: Number(maxReturnPct.toFixed(4)),
    maxRangePct: Number(maxRangePct.toFixed(4)),
    samples: candles.length
  };
}

export function evaluateRisk(orderInput, marketMetrics, options = {}) {
  const order = normalizeOrder(orderInput);
  const stormPct = Number(options.stormPct ?? envNumber('BINGX_VST_STORM_PCT', DEFAULT_STORM_PCT));
  const maxNotionalUsdt = Number(options.maxNotionalUsdt ?? envNumber('BINGX_VST_MAX_ORDER_NOTIONAL_USDT', DEFAULT_MAX_NOTIONAL_USDT));
  const notionalUsdt = order.quantityNumber * Number(marketMetrics.lastPrice);
  if (!Number.isFinite(notionalUsdt) || notionalUsdt <= 0) throw new Error('bingx_vst_invalid_notional');

  const storm = Number(marketMetrics.maxReturnPct) >= stormPct || Number(marketMetrics.maxRangePct) >= stormPct * 1.5;
  const overNotional = notionalUsdt > maxNotionalUsdt;
  const enabled = options.enabled ?? tradingEnabled();
  const allowed = Boolean(enabled) && !storm && !overNotional;
  const reasons = [];
  if (!enabled) reasons.push('kill_switch_off');
  if (storm) reasons.push('market_storm');
  if (overNotional) reasons.push('max_notional_exceeded');

  return {
    allowed,
    reasons,
    environment: 'prod-vst',
    symbol: order.symbol,
    side: order.side,
    positionSide: order.positionSide,
    quantity: order.quantity,
    lastPrice: Number(marketMetrics.lastPrice),
    notionalUsdt: Number(notionalUsdt.toFixed(8)),
    maxReturnPct: Number(marketMetrics.maxReturnPct),
    maxRangePct: Number(marketMetrics.maxRangePct),
    stormPct,
    maxNotionalUsdt
  };
}

export function publicStatus() {
  const { apiKey, secretKey } = credentials();
  return {
    ok: true,
    service: 'quantdeus-bingx-vst-mcp',
    environment: 'prod-vst',
    primaryBase: BINGX_VST_BASES[0],
    fallbackBase: BINGX_VST_BASES[1],
    liveApiAllowed: false,
    withdrawalsExposed: false,
    transfersExposed: false,
    tradingEnabled: tradingEnabled(),
    credentialsConfigured: Boolean(apiKey && secretKey),
    symbolMode: symbolMode(),
    universe: symbolMode() === 'all' ? 'all-vst-usdt' : 'configured-allowlist',
    allowedSymbols: allowedSymbols(),
    stormPct: envNumber('BINGX_VST_STORM_PCT', DEFAULT_STORM_PCT),
    maxOrderNotionalUsdt: envNumber('BINGX_VST_MAX_ORDER_NOTIONAL_USDT', DEFAULT_MAX_NOTIONAL_USDT),
    indicatorGate: {
      indicatorCount: 14,
      timeframes: ['5m', '15m'],
      minIndicators: envNumber('BINGX_VST_MIN_INDICATORS', DEFAULT_MIN_INDICATORS),
      minDirectional: envNumber('BINGX_VST_MIN_DIRECTIONAL', DEFAULT_MIN_DIRECTIONAL),
      minConsensus: envNumber('BINGX_VST_MIN_CONSENSUS', DEFAULT_MIN_CONSENSUS),
      minGroups: envNumber('BINGX_VST_MIN_GROUPS', DEFAULT_MIN_GROUPS)
    },
    approvalTtlMs: APPROVAL_TTL_MS
  };
}

export async function getBalance() {
  const response = await privateRequest('GET', '/openApi/swap/v3/user/balance');
  return { environment: 'prod-vst', upstreamBase: response.base, response: response.data };
}

export async function getPositions(input = {}) {
  const symbol = input.symbol ? String(input.symbol).trim().toUpperCase() : '';
  if (symbol && !allowedSymbols().includes(symbol)) throw new Error('bingx_vst_symbol_not_allowed');
  const response = await privateRequest('GET', '/openApi/swap/v2/user/positions', symbol ? { symbol } : {});
  return { environment: 'prod-vst', upstreamBase: response.base, symbol: symbol || null, response: response.data };
}

export async function listContracts() {
  const response = await publicGet('/openApi/swap/v2/quote/contracts');
  const rows = response.data?.data;
  const contracts = Array.isArray(rows) ? rows : (rows ? [rows] : []);
  return { environment: 'prod-vst', upstreamBase: response.base, contracts };
}

export async function getTickers() {
  const response = await publicGet('/openApi/swap/v2/quote/ticker');
  const rows = response.data?.data;
  const tickers = Array.isArray(rows) ? rows : (rows ? [rows] : []);
  return { environment: 'prod-vst', upstreamBase: response.base, tickers };
}

export async function getContractInfo(input = {}) {
  const symbol = String(input.symbol || '').trim().toUpperCase();
  if (!symbolAllowed(symbol)) throw new Error('bingx_vst_symbol_not_allowed');
  const response = await publicGet('/openApi/swap/v2/quote/contracts', { symbol });
  const rows = response.data?.data;
  const contracts = Array.isArray(rows) ? rows : (rows ? [rows] : []);
  const contract = contracts.find(item => String(item?.symbol || '').toUpperCase() === symbol);
  if (!contract) throw new Error('bingx_vst_contract_not_found');
  return { environment: 'prod-vst', upstreamBase: response.base, symbol, contract };
}

export async function getKlines(input = {}) {
  const symbol = String(input.symbol || '').trim().toUpperCase();
  if (!symbolAllowed(symbol)) throw new Error('bingx_vst_symbol_not_allowed');
  const interval = String(input.interval || '5m').trim();
  if (!new Set(['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d']).has(interval)) {
    throw new Error('bingx_vst_invalid_interval');
  }
  const limit = Math.max(3, Math.min(100, Math.trunc(Number(input.limit || 20))));
  const response = await publicGet('/openApi/swap/v3/quote/klines', { symbol, interval, limit });
  return { environment: 'prod-vst', upstreamBase: response.base, symbol, interval, response: response.data };
}

export async function runRiskCheck(input = {}) {
  const order = normalizeOrder(input);
  const [fastResponse, slowResponse] = await Promise.all([
    publicGet('/openApi/swap/v3/quote/klines', { symbol: order.symbol, interval: '5m', limit: 100 }),
    publicGet('/openApi/swap/v3/quote/klines', { symbol: order.symbol, interval: '15m', limit: 100 })
  ]);

  const fastRows = fastResponse.data?.data ?? fastResponse.data;
  const slowRows = slowResponse.data?.data ?? slowResponse.data;
  const metrics = candleMetrics(fastRows);
  const risk = evaluateRisk(order, metrics);
  const fastGate = evaluateIndicatorGate(order, indicatorConsensus(fastRows));
  const slowGate = evaluateIndicatorGate(order, indicatorConsensus(slowRows));
  const allowed = risk.allowed && fastGate.allowed && slowGate.allowed;
  const reasons = [
    ...risk.reasons,
    ...fastGate.reasons.map(reason => `5m_${reason}`),
    ...slowGate.reasons.map(reason => `15m_${reason}`)
  ];
  const combined = {
    ...risk,
    allowed,
    reasons: [...new Set(reasons)],
    indicators: {
      '5m': fastGate,
      '15m': slowGate
    },
    upstreamBase: fastResponse.base,
    secondaryUpstreamBase: slowResponse.base
  };

  if (!allowed) return { ...combined, approvalToken: null };
  const approvalToken = signRiskApproval(order, combined);
  return { ...combined, approvalToken };
}

export async function placeMarketOrder(input = {}) {
  if (!tradingEnabled()) throw new Error('bingx_vst_kill_switch_off');
  const order = normalizeOrder(input);
  const claims = verifyRiskApproval(input.approval_token, order);
  const clientOrderId = clientOrderIdFromApproval(input.approval_token);
  const response = await submitMarketOrderWithBusyRecovery(order, clientOrderId);
  return {
    environment: 'prod-vst',
    liveApiAllowed: false,
    upstreamBase: response.base,
    clientOrderId,
    busyRecovery: response.busyRecovery || 'not-needed',
    riskApproval: {
      expiresAt: claims.expiresAt,
      maxReturnPct: claims.maxReturnPct,
      notionalUsdt: claims.notionalUsdt,
      indicatorDirection5m: claims.indicatorDirection5m,
      indicatorConsensus5m: claims.indicatorConsensus5m,
      indicatorDirection15m: claims.indicatorDirection15m,
      indicatorConsensus15m: claims.indicatorConsensus15m
    },
    response: response.data
  };
}
