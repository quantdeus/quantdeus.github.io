import {
  getBalance,
  getKlines,
  getTickers,
  listContracts,
  placeMarketOrder,
  publicStatus,
  runRiskCheck
} from './bingx-vst-broker.js';

const PROTOCOL_VERSION = '2025-03-26';

const TOOLS = [
  {
    name: 'bingx_vst_status',
    description: 'Inspect the QuantDeus BingX VST-only broker. Never exposes API secrets and never enables live trading.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'bingx_vst_balance',
    description: 'Read the BingX perpetual-swap balance through the VST-only API.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'bingx_vst_contracts',
    description: 'Read the complete BingX VST perpetual contract universe for market-wide scanning.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'bingx_vst_tickers',
    description: 'Read 24h VST ticker statistics for all contracts, including volume, high/low and bid/ask spread inputs.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'bingx_vst_klines',
    description: 'Read VST market candles for a permitted USDT perpetual symbol.',
    inputSchema: {
      type: 'object',
      required: ['symbol'],
      properties: {
        symbol: { type: 'string' },
        interval: { type: 'string', default: '5m' },
        limit: { type: 'integer', minimum: 3, maximum: 100, default: 20 }
      },
      additionalProperties: false
    }
  },
  {
    name: 'bingx_vst_risk_check',
    description: 'Mandatory deterministic QA/risk gate. Requires 14-indicator consensus across 5m and 15m trend/momentum/volatility/flow groups, and also blocks orders when the kill switch is off, order notional exceeds the cap, or 5m market movement is stormy. Returns a short-lived order-bound approval token only when every gate allows the order.',
    inputSchema: {
      type: 'object',
      required: ['symbol', 'side', 'positionSide', 'quantity'],
      properties: {
        symbol: { type: 'string' },
        side: { type: 'string', enum: ['BUY', 'SELL'] },
        positionSide: { type: 'string', enum: ['LONG', 'SHORT', 'BOTH'] },
        quantity: { type: ['string', 'number'] }
      },
      additionalProperties: false
    }
  },
  {
    name: 'bingx_vst_place_market_order',
    description: 'Place a MARKET order on BingX VST. Requires an unexpired approval token from bingx_vst_risk_check bound to the exact order. Live API, withdrawals and transfers are not implemented.',
    inputSchema: {
      type: 'object',
      required: ['symbol', 'side', 'positionSide', 'quantity', 'approval_token'],
      properties: {
        symbol: { type: 'string' },
        side: { type: 'string', enum: ['BUY', 'SELL'] },
        positionSide: { type: 'string', enum: ['LONG', 'SHORT', 'BOTH'] },
        quantity: { type: ['string', 'number'] },
        approval_token: { type: 'string', minLength: 20 }
      },
      additionalProperties: false
    }
  }
];

function authorized(req) {
  const configured = String(process.env.QUANTDEUS_BINGX_VST_BROKER_TOKEN || '').trim();
  const supplied = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!configured || !supplied) return false;
  const left = Buffer.from(supplied, 'utf8');
  const right = Buffer.from(configured, 'utf8');
  if (left.length !== right.length) return false;
  return cryptoSafeEqual(left, right);
}

function cryptoSafeEqual(left, right) {
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left[index] ^ right[index];
  return diff === 0;
}

function toolResult(value, isError = false) {
  return {
    content: [{ type: 'text', text: JSON.stringify(value) }],
    ...(isError ? { isError: true } : {})
  };
}

async function callTool(name, args) {
  switch (name) {
    case 'bingx_vst_status': return publicStatus();
    case 'bingx_vst_balance': return getBalance();
    case 'bingx_vst_contracts': return listContracts();
    case 'bingx_vst_tickers': return getTickers();
    case 'bingx_vst_klines': return getKlines(args);
    case 'bingx_vst_risk_check': return runRiskCheck(args);
    case 'bingx_vst_place_market_order': return placeMarketOrder(args);
    default: throw new Error('bingx_vst_unknown_tool');
  }
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    res.setHeader('cache-control', 'no-store');
    return res.status(200).json(publicStatus());
  }
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  if (!authorized(req)) return res.status(401).json({ ok: false, error: 'unauthorized' });

  const body = req.body || {};
  const id = body.id;
  const method = String(body.method || '');
  res.setHeader('cache-control', 'no-store');

  if (!id && method.startsWith('notifications/')) return res.status(204).end();

  try {
    if (method === 'initialize') {
      return res.status(200).json({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: body.params?.protocolVersion || PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: 'quantdeus-bingx-vst', version: '1.0.0' }
        }
      });
    }
    if (method === 'ping') return res.status(200).json({ jsonrpc: '2.0', id, result: {} });
    if (method === 'tools/list') return res.status(200).json({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
    if (method === 'tools/call') {
      const value = await callTool(String(body.params?.name || ''), body.params?.arguments || {});
      return res.status(200).json({ jsonrpc: '2.0', id, result: toolResult(value) });
    }
    return res.status(200).json({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } });
  } catch (error) {
    const detail = {
      ok: false,
      error: String(error?.message || error),
      ...(error?.status ? { upstreamStatus: error.status } : {}),
      ...(error?.data ? { upstream: error.data } : {})
    };
    if (method === 'tools/call') return res.status(200).json({ jsonrpc: '2.0', id, result: toolResult(detail, true) });
    return res.status(200).json({ jsonrpc: '2.0', id, error: { code: -32000, message: detail.error, data: detail } });
  }
}
