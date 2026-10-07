'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const JOB_NAME = 'quantdeus-bingx-vst';
const DISPLAY_NAME = 'QuantDeus BingX VST Autotrade';
const SCHEDULE = '2,17,32,47 * * * *';
const OPENCLAW_DIR = path.join(os.homedir(), '.openclaw');
const RUNNER_PATH = path.join(OPENCLAW_DIR, 'quantdeus-vst-cycle.cjs');
const RUN_NOW = process.argv.includes('--run-now');

function fail(message) {
  throw new Error(message);
}

function runOpenClaw(args, { allowFailure = false } = {}) {
  const result = spawnSync('openclaw', args, {
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 1024 * 1024
  });
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) {
    fail('openclaw_' + args[0] + '_failed: ' + String(result.stderr || result.stdout || '').slice(0, 1200));
  }
  return result;
}

function parseJson(text, label) {
  try {
    return JSON.parse(String(text || '').trim() || 'null');
  } catch {
    fail(label + '_invalid_json');
  }
}

function jobRows(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.jobs)) return value.jobs;
  if (Array.isArray(value?.result)) return value.result;
  if (Array.isArray(value?.result?.jobs)) return value.result.jobs;
  return [];
}

function jobId(job) {
  return String(job?.id || job?.jobId || job?.job_id || '').trim();
}

function writeRunner() {
  fs.mkdirSync(OPENCLAW_DIR, { recursive: true, mode: 0o700 });
  const source = `'use strict';

const ENDPOINT = 'https://quantdeus.vercel.app/api/quantdeus/bingx-vst-mcp';

async function main() {
  const token = String(process.env.QUANTDEUS_BINGX_VST_BROKER_TOKEN || '').trim();
  if (!token) throw new Error('vst_broker_token_missing');

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + token,
      accept: 'application/json',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'openclaw-vst-cron',
      method: 'tools/call',
      params: {
        name: 'bingx_vst_autotrade_cycle',
        arguments: {}
      }
    })
  });

  const raw = await response.text();
  if (!response.ok) throw new Error('vst_mcp_http_' + response.status + ': ' + raw.slice(0, 300));

  let rpc;
  try { rpc = JSON.parse(raw); } catch { throw new Error('vst_mcp_invalid_json'); }
  if (rpc?.error) throw new Error('vst_mcp_rpc_error: ' + String(rpc.error?.message || 'unknown'));

  const result = rpc?.result || {};
  const textPart = Array.isArray(result.content)
    ? result.content.find(part => part?.type === 'text')
    : null;
  if (!textPart?.text) throw new Error('vst_mcp_result_missing');
  if (result.isError) throw new Error('vst_mcp_tool_error: ' + String(textPart.text).slice(0, 500));

  let data;
  try { data = JSON.parse(textPart.text); } catch { throw new Error('vst_cycle_invalid_json'); }
  if (data?.ok !== true) throw new Error('vst_cycle_not_ok: ' + String(data?.error || data?.reason || 'unknown'));

  const safe = {
    ok: true,
    environment: data.environment || null,
    action: data.action || null,
    reason: data.reason || null,
    symbol: data.symbol || data.strongestSymbol || null,
    side: data.side || null,
    score: data.score ?? data.strongestScore ?? null,
    confidence: data.confidence ?? null,
    universe_scanned: data.universeScanned ?? null,
    eligible_universe: data.eligibleUniverse ?? null,
    deep_scanned_symbols: data.deepScannedSymbols ?? null,
    order_id: data.orderId ?? null
  };
  process.stdout.write(JSON.stringify(safe) + '\\n');
}

main().catch(error => {
  process.stderr.write(String(error?.message || error) + '\\n');
  process.exit(1);
});
`;
  fs.writeFileSync(RUNNER_PATH, source, { mode: 0o700 });
}

function listJobs() {
  const result = runOpenClaw(['automations', 'list', '--all', '--json']);
  return jobRows(parseJson(result.stdout, 'openclaw_automations_list'));
}

function matchingJobs() {
  return listJobs().filter(job => String(job?.name || '').trim().toLowerCase() === JOB_NAME);
}

function removeExisting() {
  for (const job of matchingJobs()) {
    const id = jobId(job);
    if (!id) fail('openclaw_existing_job_missing_id');
    runOpenClaw(['automations', 'remove', id, '--json']);
  }
}

function createJob() {
  const argv = JSON.stringify(['node', RUNNER_PATH]);
  const result = runOpenClaw([
    'automations', 'create', SCHEDULE,
    '--name', JOB_NAME,
    '--display-name', DISPLAY_NAME,
    '--command-argv', argv,
    '--timeout-seconds', '220',
    '--no-output-timeout-seconds', '210',
    '--output-max-bytes', '65536',
    '--no-deliver',
    '--exact',
    '--json'
  ]);
  return parseJson(result.stdout, 'openclaw_automations_create');
}

function main() {
  if (!String(process.env.QUANTDEUS_BINGX_VST_BROKER_TOKEN || '').trim()) {
    fail('QUANTDEUS_BINGX_VST_BROKER_TOKEN must be present in the OpenClaw Gateway environment');
  }
  if (String(process.env.OPENCLAW_SKIP_CRON || '').trim()) {
    fail('OPENCLAW_SKIP_CRON is set; native OpenClaw scheduling is disabled');
  }

  writeRunner();
  removeExisting();
  const created = createJob();
  const rows = matchingJobs();
  if (rows.length !== 1) fail('openclaw_vst_cron_reconcile_failed');

  const id = jobId(rows[0]) || jobId(created);
  if (!id) fail('openclaw_vst_cron_id_missing');

  if (RUN_NOW) {
    runOpenClaw([
      'automations', 'run', id,
      '--wait',
      '--wait-timeout', '4m',
      '--poll-interval', '2s',
      '--json'
    ]);
  }

  process.stdout.write(JSON.stringify({
    ok: true,
    scheduler: 'openclaw-native',
    job: JOB_NAME,
    job_id: id,
    schedule: SCHEDULE,
    exact: true,
    delivery: 'none',
    runner: RUNNER_PATH,
    run_now: RUN_NOW
  }) + '\n');
}

main();
