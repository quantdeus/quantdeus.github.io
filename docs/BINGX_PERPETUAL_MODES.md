# BingX USDT perpetual modes (QuantDeus)

The existing `bingx_vst_*` tool names are retained for backwards compatibility. They now select an **explicit account environment**, not a product type. Both environments use **USDT-M perpetual swap** endpoints under `/openApi/swap/`.

| Environment | API primary | API network fallback | Funds | Default |
| --- | --- | --- | --- | --- |
| `prod-vst` | `https://open-api-vst.bingx.com` | `https://open-api-vst.bingx.pro` | VST simulated | No for this account; the scheduled scanner has an explicit live override |
| `prod-live` | `https://open-api.bingx.com` | `https://open-api.bingx.pro` | Real funds | No |

## Rollout and configuration

**Do not switch live on simply to cure a `100500` error.** This error can also mean temporary service busy. Test the environment/account mismatch hypothesis with read-only queries before permitting order creation.

1. On the Vercel backend (private broker), explicitly set `BINGX_TRADING_ENV=prod-live`, `BINGX_LIVE_API_KEY`, and `BINGX_LIVE_SECRET_KEY`. Create an exchange key restricted to **Perpetual Futures and read access only** for the first connectivity check; never enable withdrawals or transfer permissions. Keep simulated `BINGX_VST_*` credentials separate. Never commit either key.
2. The canonical GitHub workflow now explicitly selects `BINGX_TRADING_ENV=prod-live` (real Perpetual Futures) with `QUANTDEUS_BINGX_LIVE_TRADING_ENABLED=false` (orders disabled). Set `BINGX_TRADING_ENV=prod-live` on the Vercel production broker too. Otherwise the runtime rejects mismatched broker environments.
3. The 15-minute GitHub scheduler operates in live-account mode but remains execution-locked; Vercel must share the live account environment. **With live mode selected but the live execution flag unset, the cycle returns `live_execution_locked`, without attempting orders.** The legacy Vercel fallback is not invoked on a live primary failure.
4. Before any funded trading: verify signed `GET /openApi/swap/v3/user/balance`, `GET /openApi/swap/v2/user/positions`, and public `/openApi/swap/v2/quote/contracts`, `/openApi/swap/v2/quote/ticker`, `/openApi/swap/v3/quote/klines`. Check account type, USDT-M permissions, position mode (hedge vs one-way), current leverage, isolated/cross margin selection, settlement asset, contract quantity rules, and any existing positions. The **read-only connectivity check does not place an order**.
5. Funded automation is separately gated by BOTH `QUANTDEUS_BINGX_VST_TRADING_ENABLED=true` AND `QUANTDEUS_BINGX_LIVE_TRADING_ENABLED=true` at the Vercel broker. The GitHub workflow must also be modified in a separately reviewed commit to lift the hardcoded live-execution lock; a repository variable cannot silently override it. Do not enable until risk review and an explicit owner go-live decision. These are independent on purpose.
6. Live max order notional defaults to **25 USDT** via `BINGX_LIVE_MAX_ORDER_NOTIONAL_USDT` (separate from VST caps). The 14-indicator QA gate, 5m/15m agreement, stable/liquid market prefilters, current-position avoidance and HMAC-signed 60-second order approvals remain required.
7. In live mode a MARKET order **must** carry correctly oriented numeric `stopPrice` / `takeProfitPrice`, within a 0.1%–3% stop-loss distance at the risk-check price, with exchange-side `stopLoss` and `takeProfit` payloads attached to the entry order. The approval signature binds symbol, side, quantity, stop, take-profit and environment. Stop triggers cannot guarantee fill price.
8. On a live `100500` busy response, query by stable client order ID once; if no order is found, fail closed with **no second POST**. If GitHub-native fails in live mode, do **not** execute automatic Vercel fallback: reconcile order and positions first.
9. Confirm the new-mode CI (mocked API only) is green. A successful signed `/order/test` does not guarantee acceptance by the actual live order endpoint. No real-funded order is used as an integration test.

### Emergency shutdown

Keep the GitHub workflow live-execution lock at `false` and disable `QUANTDEUS_BINGX_LIVE_TRADING_ENABLED` in Vercel backend. **Do not mistake disabling new orders for closing open positions.** Existing positions, contingent orders, and account risk need independent reconciliation on the exchange.

### Scope

No spot trading, transfers, withdrawals, API key exposure, or automatic VST-to-live fallback. The live mode cannot claim profitable signals or working real trades until actual authorized, safe end-to-end verification. This change prepares the integration; enabling live trading is a separate operational act.

References: [Official BingX API base environments](https://github.com/BingX-API/api-ai-skills/blob/main/skills/references/base-urls.md), [perpetual order contract](https://github.com/BingX-API/api-ai-skills/blob/main/skills/swap-trade/api-reference.md).
