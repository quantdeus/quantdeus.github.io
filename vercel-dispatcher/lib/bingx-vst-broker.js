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

export function allowedSymbols() {
  const raw = String(process.env.BINGX_VST_SYMBOL_ALLOWLIST || '').trim();
  const source = raw ? raw.split(',') : DEFAULT_SYMBOLS;
  return [...new Set(source.map(value => value.trim().toUpperCase()).filter(Boolean))];
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

  if (!allowedSymbols().includes(symbol)) throw new Error('bingx_vst_symbol_not_allowed');
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
    notionalUsdt: metrics.notionalUsdt
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

async function vstFetch(path, init = {}) {
  let networkError = null;
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
        error.data = data;
        throw error;
      }
      return { data, base };
    } catch (error) {
      const isNetwork = error?.name === 'TimeoutError' || error?.name === 'AbortError' || error instanceof TypeError;
      if (isNetwork && index === 0) {
        networkError = error;
        continue;
      }
      throw error;
    }
  }
  throw networkError || new Error('bingx_vst_unreachable');
}

async function publicGet(path, params = {}) {
  validateParams(params);
  const query = new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)])).toString();
  return vstFetch(`${path}${query ? `?${query}` : ''}`);
}

async function privateRequest(method, path, params = {}) {
  const { apiKey, secretKey } = credentials();
  if (!apiKey || !secretKey) throw new Error('bingx_vst_credentials_missing');

  const signedParams = { ...params, recvWindow: 5000, timestamp: Date.now() };
  const canonical = canonicalParams(signedParams);
  const signature = hmacHex(secretKey, canonical);
  const headers = {
    'X-BX-APIKEY': apiKey,
    'X-SOURCE-KEY': 'BX-AI-SKILL'
  };

  if (method === 'GET') {
    return vstFetch(`${path}?${canonical}&signature=${signature}`, { method, headers });
  }
  if (method === 'POST') {
    return vstFetch(path, {
      method,
      headers: { ...headers, 'content-type': 'application/x-www-form-urlencoded' },
      body: `${canonical}&signature=${signature}`
    });
  }
  throw new Error('bingx_vst_method_not_allowed');
}

function candleMetrics(rows) {
  const candles = (Array.isArray(rows) ? rows : [])
    .map(row => {
      if (Array.isArray(row)) {
        const time = Number(row[0]);
        const open = Number(row[1]);
        const high = Number(row[2]);
        const low = Number(row[3]);
        const close = Number(row[4]);
        return { time, open, high, low, close };
      }
      return {
        time: Number(row?.time ?? row?.timestamp ?? row?.T ?? 0),
        open: Number(row?.open ?? row?.o),
        high: Number(row?.high ?? row?.h),
        low: Number(row?.low ?? row?.l),
        close: Number(row?.close ?? row?.c)
      };
    })
    .filter(candle => Number.isFinite(candle.close) && candle.close > 0)
    .sort((a, b) => a.time - b.time);

  if (candles.length < 3) throw new Error('bingx_vst_insufficient_kline_data');
  let maxReturnPct = 0;
  let maxRangePct = 0;
  for (let index = 1; index < candles.length; index += 1) {
    const previous = candles[index - 1].close;
    const current = candles[index].close;
    maxReturnPct = Math.max(maxReturnPct, Math.abs((current / previous - 1) * 100));
  }
  for (const candle of candles) {
    if (Number.isFinite(candle.open) && candle.open > 0 && Number.isFinite(candle.high) && Number.isFinite(candle.low)) {
      maxRangePct = Math.max(maxRangePct, Math.abs((candle.high - candle.low) / candle.open * 100));
    }
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
    allowedSymbols: allowedSymbols(),
    stormPct: envNumber('BINGX_VST_STORM_PCT', DEFAULT_STORM_PCT),
    maxOrderNotionalUsdt: envNumber('BINGX_VST_MAX_ORDER_NOTIONAL_USDT', DEFAULT_MAX_NOTIONAL_USDT),
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

export async function getContractInfo(input = {}) {
  const symbol = String(input.symbol || '').trim().toUpperCase();
  if (!allowedSymbols().includes(symbol)) throw new Error('bingx_vst_symbol_not_allowed');
  const response = await publicGet('/openApi/swap/v2/quote/contracts', { symbol });
  const rows = response.data?.data;
  const contracts = Array.isArray(rows) ? rows : (rows ? [rows] : []);
  const contract = contracts.find(item => String(item?.symbol || '').toUpperCase() === symbol);
  if (!contract) throw new Error('bingx_vst_contract_not_found');
  return { environment: 'prod-vst', upstreamBase: response.base, symbol, contract };
}

export async function getKlines(input = {}) {
  const symbol = String(input.symbol || '').trim().toUpperCase();
  if (!allowedSymbols().includes(symbol)) throw new Error('bingx_vst_symbol_not_allowed');
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
  const response = await publicGet('/openApi/swap/v3/quote/klines', { symbol: order.symbol, interval: '5m', limit: 13 });
  const rows = response.data?.data ?? response.data;
  const metrics = candleMetrics(rows);
  const risk = evaluateRisk(order, metrics);
  if (!risk.allowed) return { ...risk, approvalToken: null, upstreamBase: response.base };
  const approvalToken = signRiskApproval(order, risk);
  return { ...risk, approvalToken, upstreamBase: response.base };
}

export async function placeMarketOrder(input = {}) {
  if (!tradingEnabled()) throw new Error('bingx_vst_kill_switch_off');
  const order = normalizeOrder(input);
  const claims = verifyRiskApproval(input.approval_token, order);
  const response = await privateRequest('POST', '/openApi/swap/v2/trade/order', {
    symbol: order.symbol,
    side: order.side,
    positionSide: order.positionSide,
    type: 'MARKET',
    quantity: order.quantity
  });
  return {
    environment: 'prod-vst',
    liveApiAllowed: false,
    upstreamBase: response.base,
    riskApproval: {
      expiresAt: claims.expiresAt,
      maxReturnPct: claims.maxReturnPct,
      notionalUsdt: claims.notionalUsdt
    },
    response: response.data
  };
}
