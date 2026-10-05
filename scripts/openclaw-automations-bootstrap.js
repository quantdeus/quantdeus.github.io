'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'coordination', 'openclaw-automations.json');
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
const url = String(process.env.QUANTDEUS_OPENCLAW_SCHEDULER_URL || '').trim();
const token = String(process.env.QUANTDEUS_OPENCLAW_SCHEDULER_TOKEN || '').trim();
const stateDir = String(process.env.QUANTDEUS_SCHEDULER_STATE_DIR || '').trim();

if (!url || !token || !stateDir) throw new Error('native_scheduler_connection_env_missing');
if (!Array.isArray(manifest.jobs) || !manifest.jobs.length) throw new Error('native_scheduler_manifest_empty');

fs.mkdirSync(stateDir, { recursive: true });
const registryPath = path.join(stateDir, 'quantdeus-native-jobs.json');
const hash = crypto.createHash('sha256').update(JSON.stringify(manifest)).digest('hex');

function oc(args, { tolerate = false } = {}) {
  try {
    return execFileSync('openclaw', ['automations', '--url', url, '--token', token, ...args], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30000,
      maxBuffer: 4 * 1024 * 1024
    }).trim();
  } catch (error) {
    if (tolerate) return '';
    const stderr = String(error?.stderr || error?.message || error);
    throw new Error('openclaw_automations_cli_failed:' + stderr.slice(-1400));
  }
}

function parseJson(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  try { return JSON.parse(text); } catch {}
  const start = text.lastIndexOf('\n{');
  if (start >= 0) return JSON.parse(text.slice(start + 1));
  throw new Error('openclaw_automations_invalid_json:' + text.slice(-800));
}

function loadRegistry() {
  try { return JSON.parse(fs.readFileSync(registryPath, 'utf8')); }
  catch { return { manifest_hash: null, jobs: [] }; }
}

function healthyRegistry(registry) {
  if (registry.manifest_hash !== hash || !Array.isArray(registry.jobs) || registry.jobs.length !== manifest.jobs.length) return false;
  for (const entry of registry.jobs) {
    if (!entry?.id || !entry?.job_id) return false;
    const expected = manifest.jobs.find(job => job.id === entry.id);
    if (!expected) return false;
    const raw = oc(['get', entry.job_id, '--json'], { tolerate: true });
    if (!raw) return false;
    const got = parseJson(raw);
    if (!got || got.id !== entry.job_id || got.name !== expected.name) return false;
  }
  return true;
}

function persist(registry) {
  const tmp = registryPath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(registry, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, registryPath);
}

let registry = loadRegistry();
if (healthyRegistry(registry)) {
  console.log(JSON.stringify({ ok: true, changed: false, jobs: registry.jobs.length, manifest_hash: hash }));
  process.exit(0);
}

for (const entry of registry.jobs || []) {
  if (entry?.job_id) oc(['rm', entry.job_id, '--json'], { tolerate: true });
}

registry = { manifest_hash: null, jobs: [] };
persist(registry);

for (const job of manifest.jobs) {
  if (!/^[a-z0-9][a-z0-9-]{1,80}$/.test(job.id)) throw new Error('invalid_manifest_job_id:' + job.id);
  if (!/^[-*0-9/, ]+$/.test(job.cron)) throw new Error('invalid_manifest_cron:' + job.id);
  if (!/^[A-Za-z0-9 .+/_-]{3,120}$/.test(job.name)) throw new Error('invalid_manifest_job_name:' + job.id);

  const argv = ['node', 'scripts/openclaw-dispatch-workflow.js', job.id];
  const raw = oc([
    'add',
    '--cron', job.cron,
    '--tz', manifest.timezone || 'UTC',
    '--exact',
    '--name', job.name,
    '--declaration-key', 'quantdeus-native:' + job.id,
    '--command-argv', JSON.stringify(argv),
    '--command-cwd', ROOT,
    '--timeout-seconds', '120',
    '--no-output-timeout-seconds', '60',
    '--output-max-bytes', '65536',
    '--no-deliver'
  ]);
  const created = parseJson(raw);
  const jobId = String(created?.id || created?.job?.id || '').trim();
  if (!jobId) throw new Error('native_scheduler_job_id_missing:' + job.id);

  registry.jobs.push({ id: job.id, job_id: jobId });
  persist(registry);
}

registry.manifest_hash = hash;
persist(registry);
console.log(JSON.stringify({ ok: true, changed: true, jobs: registry.jobs.length, manifest_hash: hash }));
