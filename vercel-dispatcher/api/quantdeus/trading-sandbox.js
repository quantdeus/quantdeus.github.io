import crypto from 'node:crypto';
import { evaluateTradingRisk, TRADING_POLICY } from '../../lib/trading-risk.js';

const PRIMARY = 'https://open-api-vst.bingx.com';
const FALLBACK = 'https://open-api-vst.bingx.pro';
const SOURCE_KEY = 'BX-AI-SKILL';
const DEFAULT_SYMBOLS = ['BTC-USDT', 'ETH-USDT', 'BNB-USDT', 'SOL-USDT', 'XRP-USDT'];

const json = (res, status, body) => res.status(status).json(body);
const safeSymbols = () => {
  const raw = String(process.env.QD_TRADING_SYMBOLS || '').trim();
  const rows = raw ? raw.split(',') : DEFAULT_SYMBOLS;
  return rows.map(x => x.trim().toUpperCase()).filter(x => /^[A-Z0-9]{2,15}-USDT$/.test(x)).slice(0, 10);
};
function authorized(req) {
  const expected = String(process.env.QD_TRADING_VST_BROKER_TOKEN || '').trim();
  const got = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!expected || !got) return false;
  const a = Buffer.from(got), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function credentials() {
  const apiKey = String(process.env.BINGX_VST_API_KEY || '').trim();
  const secret = String(process.env.BINGX_VST_SECRET_KEY || '').trim();
  if (!apiKey || !secret) throw Object.assign(new Error('vst_credentials_unconfigured'), { status: 503 });
  return { apiKey, secret };
}
function sign(params, secret) {
  const query = new URLSearchParams(Object.entries(params).map(([k,v]) => [k, String(v)])).toString();
  const signature = crypto.createHmac('sha256', secret).update(query).digest('hex');
  return { query, signature };
}
async function signedRequest(path, method = 'GET', params = {}) {
  const { apiKey, secret } = credentials();
  const payload = { ...params, timestamp: Date.now(), recvWindow: 5000 };
  const { query, signature } = sign(payload, secret);
  const urlPath = path + '?' + query + '&signature=' + signature;
  const request = async base => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const r = await fetch(base + urlPath, {
        method,
        headers: { 'X-BX-APIKEY': apiKey, 'X-SOURCE-KEY': SOURCE_KEY, accept: 'application/json' },
        signal: controller.signal
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || Number(data?.code) !== 0) throw Object.assign(new Error('bingx_' + (data?.code ?? r.status)), { business: true, detail: data?.msg || '' });
      return data?.data;
    } finally { clearTimeout(timer); }
  };
  try { return await request(PRIMARY); }
  catch (error) {
    if (error?.business) throw error;
    return request(FALLBACK);
  }
}
async function publicRequest(path, params = {}) {
  const query = new URLSearchParams(Object.entries(params).map(([k,v]) => [k, String(v)])).toString();
  const r = await fetch(PRIMARY + path + (query ? '?' + query : ''), { headers: { accept: 'application/json', 'X-SOURCE-KEY': SOURCE_KEY } });
  const data = await r.json();
  if (!r.ok || Number(data?.code) !== 0) throw new Error('bingx_market_' + (data?.code ?? r.status));
  return data?.data;
}
const n = x => Number(x);
async function marketSnapshot(symbol) {
  const [depth, premium, candles] = await Promise.all([
    publicRequest('/openApi/swap/v2/quote/depth', { symbol, limit: 5 }),
    publicRequest('/openApi/swap/v2/quote/premiumIndex', { symbol }),
    publicRequest('/openApi/swap/v3/quote/klines', { symbol, interval: '5m', limit: 13 })
  ]);
  const bestBid = n(depth?.bids?.[0]?.[0]);
  const bestAsk = n(depth?.asks?.[0]?.[0]);
  const markPrice = n(premium?.markPrice);
  const mid = (bestBid + bestAsk) / 2;
  const spreadBps = mid > 0 ? (bestAsk - bestBid) / mid * 10000 : Infinity;
  const rows = Array.isArray(candles) ? candles : [];
  const closes = rows.map(x => n(x?.[4])).filter(Number.isFinite);
  const highs = rows.map(x => n(x?.[2])).filter(Number.isFinite);
  const lows = rows.map(x => n(x?.[3])).filter(Number.isFinite);
  const last = closes.at(-1), close15 = closes.at(-4) ?? closes[0];
  const move15mPct = last && close15 ? (last - close15) / close15 * 100 : Infinity;
  const hi = highs.length ? Math.max(...highs) : NaN;
  const lo = lows.length ? Math.min(...lows) : NaN;
  const range60mPct = Number.isFinite(hi) && Number.isFinite(lo) && lo > 0 ? (hi - lo) / lo * 100 : Infinity;
  return {
    symbol,
    markPrice,
    spreadBps,
    fundingRate: n(premium?.lastFundingRate || 0),
    move15mPct,
    range60mPct,
    marketDataAgeMs: Math.max(0, Date.now() - n(premium?.time || Date.now()))
  };
}
async function accountSnapshot() {
  const [balances, positions, income] = await Promise.all([
    signedRequest('/openApi/swap/v3/user/balance'),
    signedRequest('/openApi/swap/v2/user/positions'),
    signedRequest('/openApi/swap/v2/user/income', 'GET', { startTime: Date.now() - 24 * 60 * 60 * 1000, endTime: Date.now(), limit: 1000 })
  ]);
  const usdt = (Array.isArray(balances) ? balances : []).find(x => x.asset === 'USDT');
  const open = (Array.isArray(positions) ? positions : []).filter(x => Math.abs(n(x.positionAmt)) > 0);
  const dailyPnl = (Array.isArray(income) ? income : [])
    .filter(x => ['REALIZED_PNL','TRADING_FEE','FUNDING_FEE'].includes(String(x.incomeType)))
    .reduce((sum, x) => sum + n(x.income || 0), 0);
  return { equity: n(usdt?.equity), openPositions: open.length, dailyPnl, positions: open };
}
function htmlPage() {
  return '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>QuantDeus × BingX VST</title><style>body{font-family:system-ui;max-width:780px;margin:48px auto;padding:0 20px;line-height:1.55}code{background:#eef;padding:2px 6px;border-radius:6px}.ok{padding:14px;border:1px solid #6a8;border-radius:12px;background:#f4fff7}.warn{padding:14px;border:1px solid #ca8;border-radius:12px;background:#fffaf0}a.button{display:inline-block;padding:12px 16px;border-radius:10px;background:#111;color:#fff;text-decoration:none}</style><h1>QuantDeus Trading Sandbox 🐒📈</h1><div class="ok"><b>Режим:</b> только BingX VST / simulated trading. Реальные средства недоступны.</div><p>Брокер жёстко закреплён на <code>prod-vst</code>. QA-кворум: 2 из 3 агентов. При шторме рынка — <code>NO_TRADE</code>.</p><p><a class="button" href="https://bingx.com/account/api/" rel="noreferrer">Открыть BingX API Management</a></p><div class="warn"><b>Важно:</b> у BingX нет OAuth-кнопки для этого API. После создания VST-ключа добавьте его в защищённые Vercel Environment Variables как <code>BINGX_VST_API_KEY</code> и <code>BINGX_VST_SECRET_KEY</code>. Не включайте Withdraw/Transfer.</div><p>Публичная страница не принимает и не хранит ключи.</p>';
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
    if (!safeSymbols().includes(symbol)) return json(res, 400, { ok: false, error: 'symbol_not_allowlisted' });
    if (body.environment && body.environment !== 'prod-vst') return json(res, 400, { ok: false, error: 'live_environment_forbidden' });

    const [market, account] = await Promise.all([marketSnapshot(symbol), accountSnapshot()]);
    const assessment = evaluateTradingRisk({
      ...body,
      ...market,
      equity: account.equity,
      dailyPnl: account.dailyPnl,
      openPositions: account.openPositions
    });
    if (action === 'assess') return json(res, 200, { ok: true, environment: 'prod-vst', market, account: { equity: account.equity, dailyPnl: account.dailyPnl, openPositions: account.openPositions }, assessment });
    if (action === 'kill_switch') {
      await signedRequest('/openApi/swap/v2/trade/cancelAllAfter', 'POST', { type: 'ACTIVATE', timeOut: 1000 });
      return json(res, 200, { ok: true, environment: 'prod-vst', kill_switch: 'armed' });
    }
    if (action !== 'paper_order') return json(res, 400, { ok: false, error: 'unknown_action' });
    if (!assessment.allowed) return json(res, 409, { ok: false, error: assessment.storm ? 'no_trade_market_storm' : 'risk_gate_rejected', assessment, market });

    const side = String(body.side || '').toUpperCase();
    const positionSide = side === 'BUY' ? 'LONG' : 'SHORT';
    await signedRequest('/openApi/swap/v2/trade/marginType', 'POST', { symbol, marginType: 'ISOLATED' }).catch(error => {
      if (!/bingx_/.test(error.message)) throw error;
    });
    await signedRequest('/openApi/swap/v2/trade/leverage', 'POST', { symbol, side: positionSide, leverage: Number(body.leverage) });
    const stopLoss = JSON.stringify({ type: 'STOP_MARKET', stopPrice: Number(body.stopLoss), workingType: 'MARK_PRICE' });
    const takeProfit = JSON.stringify({ type: 'TAKE_PROFIT_MARKET', stopPrice: Number(body.takeProfit), workingType: 'MARK_PRICE' });
    const data = await signedRequest('/openApi/swap/v2/trade/order', 'POST', {
      symbol,
      side,
      positionSide,
      type: 'MARKET',
      quantity: Number(body.quantity),
      stopLoss,
      takeProfit,
      clientOrderId: 'qdvst' + Date.now().toString(36)
    });
    return json(res, 201, { ok: true, environment: 'prod-vst', live_trading: false, assessment, order: { orderID: String(data?.orderID || data?.orderId || ''), symbol: data?.symbol || symbol, status: data?.status || null } });
  } catch (error) {
    const status = Number(error?.status) || (/unconfigured/.test(String(error?.message)) ? 503 : 502);
    return json(res, status, { ok: false, error: String(error?.message || error).slice(0, 160), detail: String(error?.detail || '').slice(0, 200) || undefined });
  }
}
