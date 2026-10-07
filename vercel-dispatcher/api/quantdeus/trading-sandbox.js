import crypto from 'node:crypto';
import JSONBig from 'json-bigint';
import { evaluateTradingRisk, TRADING_POLICY } from '../../lib/trading-risk.js';

const JSONBigParse = JSONBig({ storeAsString: true });
const ENV_URLS = Object.freeze({
  'prod-vst': ['https://open-api-vst.bingx.com', 'https://open-api-vst.bingx.pro']
});
const SOURCE_KEY = 'BX-AI-SKILL';
const DEFAULT_SYMBOLS = ['BTC-USDT', 'ETH-USDT', 'BNB-USDT', 'SOL-USDT', 'XRP-USDT'];

const json = (res, status, body) => res.status(status).json(body);
const n = value => Number(value);

function safeSymbols() {
  const raw = String(process.env.QD_TRADING_SYMBOLS || '').trim();
  const rows = raw ? raw.split(',') : DEFAULT_SYMBOLS;
  return rows
    .map(value => value.trim().toUpperCase())
    .filter(value => /^[A-Z0-9]{2,15}-USDT$/.test(value))
    .slice(0, 10);
}

function authorized(req) {
  const expected = String(process.env.QD_TRADING_VST_BROKER_TOKEN || '').trim();
  const got = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!expected || !got) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function credentials() {
  const apiKey = String(process.env.BINGX_VST_API_KEY || '').trim();
  const secretKey = String(process.env.BINGX_VST_SECRET_KEY || '').trim();
  if (!apiKey || !secretKey) {
    throw Object.assign(new Error('vst_credentials_unconfigured'), { status: 503 });
  }
  return { apiKey, secretKey };
}

function isNetworkOrTimeout(error) {
  if (error instanceof TypeError) return true;
  if (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError') return true;
  if (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)) return true;
  return false;
}

function validateParams(params) {
  const forbidden = /[&=?#\r\n]/;
  for (const [key, value] of Object.entries(params)) {
    const stringValue = String(value);
    if (forbidden.test(stringValue)) {
      throw new Error('bingx_parameter_rejected:' + key);
    }
  }
}

function buildCanonical(params) {
  return Object.keys(params)
    .sort()
    .map(key => `${key}=${params[key]}`)
    .join('&');
}

function encodeQueryValues(params, signature) {
  const pairs = Object.keys(params)
    .sort()
    .map(key => {
      const value = String(params[key]);
      const needsEncoding = value.includes('[') || value.includes('{');
      return `${key}=${needsEncoding ? encodeURIComponent(value) : value}`;
    });
  pairs.push('signature=' + signature);
  return pairs.join('&');
}

async function fetchSigned(env, apiKey, secretKey, method, path, params = {}) {
  if (env !== 'prod-vst') throw new Error('live_environment_forbidden');
  const baseUrls = ENV_URLS['prod-vst'];
  const allParams = { ...params, timestamp: Date.now() };
  validateParams(allParams);

  const canonical = buildCanonical(allParams);
  const signature = crypto.createHmac('sha256', secretKey).update(canonical).digest('hex');
  const needsValueEncoding = canonical.includes('[') || canonical.includes('{');

  for (const baseUrl of baseUrls) {
    try {
      let url;
      let body;
      let contentType;

      if (method === 'POST') {
        url = baseUrl + path;
        body = canonical + '&signature=' + signature;
        contentType = 'application/x-www-form-urlencoded';
      } else {
        const query = needsValueEncoding
          ? encodeQueryValues(allParams, signature)
          : canonical + '&signature=' + signature;
        url = baseUrl + path + '?' + query;
      }

      const response = await fetch(url, {
        method,
        headers: {
          'X-BX-APIKEY': apiKey,
          'X-SOURCE-KEY': SOURCE_KEY,
          accept: 'application/json',
          ...(contentType ? { 'Content-Type': contentType } : {})
        },
        body,
        signal: AbortSignal.timeout(10000)
      });

      const raw = await response.text();
      let data;
      try { data = JSONBigParse.parse(raw); }
      catch { throw new Error('bingx_invalid_json'); }

      if (!response.ok || Number(data?.code) !== 0) {
        const error = new Error('bingx_' + String(data?.code ?? response.status));
        error.detail = String(data?.msg || '').slice(0, 300);
        throw error;
      }
      return data?.data;
    } catch (error) {
      if (!isNetworkOrTimeout(error) || baseUrl === baseUrls[baseUrls.length - 1]) throw error;
    }
  }
  throw new Error('bingx_vst_unreachable');
}

async function signedRequest(path, method = 'GET', params = {}) {
  const { apiKey, secretKey } = credentials();
  return fetchSigned('prod-vst', apiKey, secretKey, method, path, { ...params, recvWindow: 5000 });
}

async function publicRequest(path, params = {}) {
  const query = new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)])).toString();
  for (const baseUrl of ENV_URLS['prod-vst']) {
    try {
      const response = await fetch(baseUrl + path + (query ? '?' + query : ''), {
        headers: { accept: 'application/json', 'X-SOURCE-KEY': SOURCE_KEY },
        signal: AbortSignal.timeout(10000)
      });
      const raw = await response.text();
      let data;
      try { data = JSONBigParse.parse(raw); }
      catch { throw new Error('bingx_market_invalid_json'); }
      if (!response.ok || Number(data?.code) !== 0) {
        const error = new Error('bingx_market_' + String(data?.code ?? response.status));
        error.detail = String(data?.msg || '').slice(0, 300);
        throw error;
      }
      return data?.data;
    } catch (error) {
      if (!isNetworkOrTimeout(error) || baseUrl === ENV_URLS['prod-vst'].at(-1)) throw error;
    }
  }
  throw new Error('bingx_market_unreachable');
}

async function marketSnapshot(symbol) {
  const [depth, premium, candles, openInterest] = await Promise.all([
    publicRequest('/openApi/swap/v2/quote/depth', { symbol, limit: 5 }),
    publicRequest('/openApi/swap/v2/quote/premiumIndex', { symbol }),
    publicRequest('/openApi/swap/v3/quote/klines', { symbol, interval: '5m', limit: 13 }),
    publicRequest('/openApi/swap/v2/quote/openInterest', { symbol })
  ]);

  const bestBid = n(depth?.bids?.[0]?.[0]);
  const bestAsk = n(depth?.asks?.[0]?.[0]);
  const markPrice = n(premium?.markPrice);
  const mid = (bestBid + bestAsk) / 2;
  const spreadBps = mid > 0 ? (bestAsk - bestBid) / mid * 10000 : Infinity;

  const rows = Array.isArray(candles) ? candles : [];
  const closes = rows.map(row => n(row?.[4])).filter(Number.isFinite);
  const highs = rows.map(row => n(row?.[2])).filter(Number.isFinite);
  const lows = rows.map(row => n(row?.[3])).filter(Number.isFinite);
  const last = closes.at(-1);
  const close15 = closes.at(-4) ?? closes[0];
  const move15mPct = last && close15 ? (last - close15) / close15 * 100 : Infinity;
  const high60 = highs.length ? Math.max(...highs) : NaN;
  const low60 = lows.length ? Math.min(...lows) : NaN;
  const range60mPct = Number.isFinite(high60) && Number.isFinite(low60) && low60 > 0
    ? (high60 - low60) / low60 * 100
    : Infinity;

  return {
    symbol,
    markPrice,
    spreadBps,
    fundingRate: n(premium?.lastFundingRate || 0),
    openInterest: n(openInterest?.openInterest || openInterest?.openInterestValue || 0),
    move15mPct,
    range60mPct,
    marketDataAgeMs: Math.max(0, Date.now() - n(premium?.time || Date.now()))
  };
}

async function accountSnapshot() {
  const now = Date.now();
  const [balances, positions, income] = await Promise.all([
    signedRequest('/openApi/swap/v3/user/balance'),
    signedRequest('/openApi/swap/v2/user/positions'),
    signedRequest('/openApi/swap/v2/user/income', 'GET', {
      startTime: now - 24 * 60 * 60 * 1000,
      endTime: now,
      limit: 1000
    })
  ]);

  const usdt = (Array.isArray(balances) ? balances : []).find(row => row.asset === 'USDT');
  const open = (Array.isArray(positions) ? positions : []).filter(row => Math.abs(n(row.positionAmt)) > 0);
  const dailyPnl = (Array.isArray(income) ? income : [])
    .filter(row => ['REALIZED_PNL', 'TRADING_FEE', 'FUNDING_FEE'].includes(String(row.incomeType)))
    .reduce((sum, row) => sum + n(row.income || 0), 0);

  return {
    equity: n(usdt?.equity),
    openPositions: open.length,
    dailyPnl,
    positions: open
  };
}

async function positionMode() {
  const data = await signedRequest('/openApi/swap/v1/positionSide/dual');
  return Boolean(data?.dualSidePosition);
}

async function ensureIsolated(symbol) {
  const current = await signedRequest('/openApi/swap/v2/trade/marginType', 'GET', { symbol });
  if (String(current?.marginType || '').toUpperCase() === 'ISOLATED') return;
  await signedRequest('/openApi/swap/v2/trade/marginType', 'POST', { symbol, marginType: 'ISOLATED' });
  const verified = await signedRequest('/openApi/swap/v2/trade/marginType', 'GET', { symbol });
  if (String(verified?.marginType || '').toUpperCase() !== 'ISOLATED') {
    throw new Error('isolated_margin_not_verified');
  }
}

function htmlPage() {
  return '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>QuantDeus × BingX VST</title><style>body{font-family:system-ui;max-width:780px;margin:48px auto;padding:0 20px;line-height:1.55}code{background:#eef;padding:2px 6px;border-radius:6px}.ok{padding:14px;border:1px solid #6a8;border-radius:12px;background:#f4fff7}.warn{padding:14px;border:1px solid #ca8;border-radius:12px;background:#fffaf0}a.button{display:inline-block;padding:12px 16px;border-radius:10px;background:#111;color:#fff;text-decoration:none}</style><h1>QuantDeus Trading Sandbox 🐒📈</h1><div class="ok"><b>Режим:</b> только BingX VST / simulated trading. Реальные средства недоступны.</div><p>Брокер жёстко закреплён на <code>prod-vst</code>. QA-кворум: 2 из 3 агентов. При шторме рынка — <code>NO_TRADE</code>.</p><p><a class="button" href="https://bingx.com/en/accounts/api" rel="noreferrer">Открыть BingX API Management</a></p><div class="warn"><b>Важно:</b> BingX OpenAPI использует API Key + Secret Key, а не OAuth-кнопку. Создайте отдельный VST-ключ и добавьте его только в защищённые Vercel Environment Variables как <code>BINGX_VST_API_KEY</code> и <code>BINGX_VST_SECRET_KEY</code>. Не включайте Withdraw/Transfer.</div><p>Публичная страница не принимает, не передаёт в модель и не хранит ключи.</p>';
}

export default async function handler(req, res) {
  if (req.method === 'GET' && String(req.query?.connect || '') === '1') {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    return res.status(200).send(htmlPage());
  }

  if (!authorized(req)) return json(res, 401, { ok: false, error: 'unauthorized' });

  try {
    if (req.method === 'GET') {
      return json(res, 200, {
        ok: true,
        environment: 'prod-vst',
        live_trading: false,
        credentials_configured: Boolean(process.env.BINGX_VST_API_KEY && process.env.BINGX_VST_SECRET_KEY),
        symbols: safeSymbols(),
        policy: TRADING_POLICY
      });
    }

    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' });

    const body = req.body || {};
    const action = String(body.action || 'assess');
    const symbol = String(body.symbol || '').toUpperCase();

    if (body.environment && body.environment !== 'prod-vst') {
      return json(res, 400, { ok: false, error: 'live_environment_forbidden' });
    }

    if (action === 'kill_switch') {
      await signedRequest('/openApi/swap/v2/trade/cancelAllAfter', 'POST', { type: 'ACTIVATE', timeOut: 30 });
      return json(res, 200, { ok: true, environment: 'prod-vst', kill_switch: 'armed', cancel_after_seconds: 30 });
    }

    if (!safeSymbols().includes(symbol)) {
      return json(res, 400, { ok: false, error: 'symbol_not_allowlisted' });
    }

    const [market, account] = await Promise.all([marketSnapshot(symbol), accountSnapshot()]);
    const assessment = evaluateTradingRisk({
      ...body,
      ...market,
      equity: account.equity,
      dailyPnl: account.dailyPnl,
      openPositions: account.openPositions
    });

    if (action === 'assess') {
      return json(res, 200, {
        ok: true,
        environment: 'prod-vst',
        market,
        account: {
          equity: account.equity,
          dailyPnl: account.dailyPnl,
          openPositions: account.openPositions
        },
        assessment
      });
    }

    if (action !== 'paper_order') return json(res, 400, { ok: false, error: 'unknown_action' });
    if (!assessment.allowed) {
      return json(res, 409, {
        ok: false,
        error: assessment.storm ? 'no_trade_market_storm' : 'risk_gate_rejected',
        assessment,
        market
      });
    }

    await ensureIsolated(symbol);
    const dual = await positionMode();
    const side = String(body.side || '').toUpperCase();
    const positionSide = dual ? (side === 'BUY' ? 'LONG' : 'SHORT') : 'BOTH';
    const leverageSide = dual ? positionSide : 'BOTH';

    await signedRequest('/openApi/swap/v2/trade/leverage', 'POST', {
      symbol,
      side: leverageSide,
      leverage: Number(body.leverage)
    });

    const stopLoss = JSON.stringify({
      type: 'STOP_MARKET',
      stopPrice: Number(body.stopLoss),
      workingType: 'MARK_PRICE'
    });
    const takeProfit = JSON.stringify({
      type: 'TAKE_PROFIT_MARKET',
      stopPrice: Number(body.takeProfit),
      workingType: 'MARK_PRICE'
    });

    const order = await signedRequest('/openApi/swap/v2/trade/order', 'POST', {
      symbol,
      side,
      positionSide,
      type: 'MARKET',
      quantity: Number(body.quantity),
      stopLoss,
      takeProfit,
      clientOrderId: 'qdvst' + Date.now().toString(36)
    });

    return json(res, 201, {
      ok: true,
      environment: 'prod-vst',
      live_trading: false,
      assessment,
      order: {
        orderID: String(order?.orderID || order?.orderId || ''),
        symbol: order?.symbol || symbol,
        status: order?.status || null
      }
    });
  } catch (error) {
    const status = Number(error?.status) || (/unconfigured/.test(String(error?.message)) ? 503 : 502);
    return json(res, status, {
      ok: false,
      error: String(error?.message || error).slice(0, 160),
      detail: String(error?.detail || '').slice(0, 200) || undefined
    });
  }
}
