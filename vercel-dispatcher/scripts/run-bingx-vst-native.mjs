import { appendFile } from 'node:fs/promises';
import { runVstSignalCycle } from '../lib/bingx-vst-signal.js';

function safeResult(data) {
  return {
    ok: true,
    execution_path: 'github-native',
    environment: data?.environment ?? null,
    action: data?.action ?? null,
    reason: data?.reason || null,
    symbol: data?.symbol || data?.strongestSymbol || null,
    side: data?.side || null,
    score: data?.score ?? data?.strongestScore ?? null,
    confidence: data?.confidence ?? null,
    estimated_notional_usdt: data?.estimatedNotionalUsdt ?? null,
    risk_pct: data?.riskPct ?? null,
    reward_pct: data?.rewardPct ?? null,
    universe_scanned: data?.universeScanned ?? null,
    eligible_universe: data?.eligibleUniverse ?? null,
    deep_scanned_symbols: data?.deepScannedSymbols ?? null,
    order_id: data?.orderId ?? null,
    degraded: data?.degraded === true,
    order_attempted: data?.orderAttempted === true,
    private_account_authenticated: data?.privateAccountAuthenticated === true,
    positions_read: data?.positionsRead === true,
    requires_review: data?.requiresReview === true,
    upstream_stage: data?.upstreamStage ?? null,
    bingx_code: data?.bingxCode ?? null,
    bingx_message: data?.bingxMessage ?? null,
    bingx_http_status: data?.bingxHttpStatus ?? null,
    broker_http_status: data?.brokerHttpStatus ?? null,
    upstream_error: data?.upstreamError ?? null
  };
}

async function writeSummary(safe) {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  await appendFile(
    process.env.GITHUB_STEP_SUMMARY,
    '### BingX VST guarded autotrade\n\n' +
    '- execution path: GitHub-native primary\n' +
    '- environment: ' + (safe.environment || 'n/a') + '\n' +
    '- action: ' + (safe.action || 'n/a') + '\n' +
    '- reason: ' + (safe.reason || 'n/a') + '\n' +
    '- degraded: ' + (safe.degraded ? 'yes' : 'no') + '\n' +
    '- order attempted: ' + (safe.order_attempted ? 'yes' : 'no') + '\n' +
    '- private account authenticated (read-only): ' + (safe.private_account_authenticated ? 'yes' : 'no') + '\n' +
    '- live positions read (read-only): ' + (safe.positions_read ? 'yes' : 'no') + '\n' +
    '- requires review: ' + (safe.requires_review ? 'yes' : 'no') + '\n' +
    '- symbol: ' + (safe.symbol || 'n/a') + '\n' +
    '- side: ' + (safe.side || 'n/a') + '\n' +
    '- score: ' + (safe.score ?? 'n/a') + '\n' +
    '- confidence: ' + (safe.confidence ?? 'n/a') + '\n' +
    '- upstream stage: ' + (safe.upstream_stage ?? 'n/a') + '\n' +
    '- BingX code: ' + (safe.bingx_code ?? 'n/a') + '\n' +
    '- BingX message: ' + (safe.bingx_message ?? 'n/a') + '\n' +
    '- BingX HTTP status: ' + (safe.bingx_http_status ?? 'n/a') + '\n' +
    '- broker HTTP status: ' + (safe.broker_http_status ?? 'n/a') + '\n' +
    '- upstream error: ' + (safe.upstream_error ?? 'n/a') + '\n' +
    '- universe scanned: ' + (safe.universe_scanned ?? 'n/a') + '\n' +
    '- eligible universe: ' + (safe.eligible_universe ?? 'n/a') + '\n' +
    '- deep scanned: ' + (safe.deep_scanned_symbols ?? 'n/a') + '\n' +
    '- order id: ' + (safe.order_id ?? 'n/a') + '\n'
  );
}

try {
  const data = await runVstSignalCycle();
  if (data?.ok !== true) throw new Error('github_native_vst_non_ok');
  const safe = safeResult(data);
  console.log(JSON.stringify(safe));
  await writeSummary(safe);
} catch (error) {
  console.error(String(error?.message || error));
  process.exit(1);
}
