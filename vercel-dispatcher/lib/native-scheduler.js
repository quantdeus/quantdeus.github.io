import crypto from 'node:crypto';

const REPOSITORY = 'quantdeus/quantdeus.github.io';
const JOB_PREFIX = 'QuantDeus / ';
const GATEWAY_PORT = 18790;
const MAX_DRAIN = 40;

const job = (key, name, cron, workflow, inputs = {}) => ({
  key,
  name: JOB_PREFIX + name,
  cron,
  workflow,
  inputs
});

export const NATIVE_SCHEDULE_VERSION = '2026-10-04-native-openclaw-v1';

export const NATIVE_SCHEDULE = [
  job('hourly-swarm', 'Hourly swarm', '0 * * * *', 'quantdeus-hourly-openclaw.yml'),
  job('qa-failure-radar', 'QA failure radar', '7 */2 * * *', 'qa-failure-radar.yml'),
  job('seven-priority', 'Seven priority cycle', '11 */2 * * *', 'seven-priority-cycle.yml'),
  job('qa-site', 'QA self-heal / site', '17 */6 * * *', 'qa-self-heal.yml', { lane: 'site' }),
  job('crew-health', 'Crew health', '19 */2 * * *', 'agent-health-daily.yml'),

  job('role-coordinator', 'Role / coordinator', '23 0 * * *', 'agent-role-cron.yml', { agent_id: 'coordinator' }),
  job('role-emh', 'Role / emh', '23 1 * * *', 'agent-role-cron.yml', { agent_id: 'emh' }),
  job('role-pillar-executor', 'Role / pillar-executor', '23 2 * * *', 'agent-role-cron.yml', { agent_id: 'pillar-executor' }),
  job('role-sherlock', 'Role / sherlock', '23 3 * * *', 'agent-role-cron.yml', { agent_id: 'sherlock' }),
  job('role-tuvok', 'Role / tuvok', '23 4 * * *', 'agent-role-cron.yml', { agent_id: 'tuvok' }),
  job('role-energy', 'Role / energy', '23 5 * * *', 'agent-role-cron.yml', { agent_id: 'energy' }),
  job('role-justice', 'Role / justice', '23 6 * * *', 'agent-role-cron.yml', { agent_id: 'justice' }),
  job('role-space', 'Role / space', '23 7 * * *', 'agent-role-cron.yml', { agent_id: 'space' }),
  job('role-potential', 'Role / potential', '23 8 * * *', 'agent-role-cron.yml', { agent_id: 'potential' }),
  job('role-scout', 'Role / scout', '23 9 * * *', 'agent-role-cron.yml', { agent_id: 'scout' }),
  job('role-verifier', 'Role / verifier', '23 10 * * *', 'agent-role-cron.yml', { agent_id: 'verifier' }),
  job('role-analyst', 'Role / analyst', '23 11 * * *', 'agent-role-cron.yml', { agent_id: 'analyst' }),
  job('role-strategist', 'Role / strategist', '23 12 * * *', 'agent-role-cron.yml', { agent_id: 'strategist' }),
  job('role-guardian', 'Role / guardian', '23 13 * * *', 'agent-role-cron.yml', { agent_id: 'guardian' }),
  job('role-strategic-hub', 'Role / strategic-hub', '23 14 * * *', 'agent-role-cron.yml', { agent_id: 'strategic-hub' }),

  job('swarm-secretary', 'Seven + Swarm Secretary', '27 6 * * *', 'quantdeus-coordinator.yml'),
  job('openclaw-evolution', 'OpenClaw evolution', '31 2 * * *', 'openclaw-evolution.yml'),
  job('six-pillar', 'Six-Pillar executor', '37 6 * * *', 'quantdeus-pulse.yml'),
  job('news-manifest', 'News to Living Manifest', '41 */6 * * *', 'news-manifest-cycle.yml'),
  job('contributor-growth', 'Contributor growth', '42 6 * * *', 'contributor-growth.yml'),
  job('qa-actions', 'QA self-heal / Actions', '47 3-23/6 * * *', 'qa-self-heal.yml', { lane: 'actions' }),
  job('qa-triad', 'QA Triad', '47 6 * * *', 'qa-triad.yml'),

  job('growth-unity', 'Growth / unity', '53 0 * * *', 'growth-site-cycle.yml', { agent_id: 'unity' }),
  job('growth-synthesis', 'Growth / synthesis', '53 4 * * *', 'growth-site-cycle.yml', { agent_id: 'synthesis' }),
  job('growth-archivist', 'Growth / archivist', '53 8 * * *', 'growth-site-cycle.yml', { agent_id: 'archivist' }),
  job('growth-herald', 'Growth / herald', '53 12 * * *', 'growth-site-cycle.yml', { agent_id: 'herald' }),
  job('growth-tasksmith', 'Growth / tasksmith', '53 16 * * *', 'growth-site-cycle.yml', { agent_id: 'tasksmith' }),
  job('growth-control-tower', 'Growth / control-tower', '53 20 * * *', 'growth-site-cycle.yml', { agent_id: 'control-tower' })
];

function stable(value) {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

async function stdout(result) {
  return (await result.stdout()).trim();
}

async function run(sandbox, spec, label) {
  const result = await sandbox.runCommand(spec);
  if (result.exitCode !== 0) {
    const err = (await result.stderr()).trim();
    throw new Error(label + '_failed: ' + err.slice(-1600));
  }
  return result;
}

async function readOptional(sandbox, path) {
  const result = await sandbox.runCommand({ cmd: 'cat', args: [path] });
  if (result.exitCode !== 0) return '';
  return stdout(result);
}

async function writeFile(sandbox, path, content, mode = null) {
  await sandbox.writeFiles([{ path, content: Buffer.from(content) }]);
  if (mode) await run(sandbox, { cmd: 'chmod', args: [mode, path] }, 'chmod');
}

function jobsFromList(data) {
  if (Array.isArray(data)) return data;
  for (const key of ['jobs', 'items', 'automations']) {
    if (Array.isArray(data?.[key])) return data[key];
  }
  return [];
}

function jobId(row) {
  return String(row?.id || row?.jobId || row?.job_id || '').trim();
}

function scheduleHash(runtimeVersion) {
  return crypto.createHash('sha256')
    .update(stable({ version: NATIVE_SCHEDULE_VERSION, runtimeVersion, jobs: NATIVE_SCHEDULE }))
    .digest('hex');
}

function queueRunnerSource() {
  return `import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const [spool, workflow, inputsRaw, key] = process.argv.slice(2);
if (!spool || !workflow || !key) process.exit(64);
let inputs = {};
try { inputs = JSON.parse(inputsRaw || '{}'); } catch { process.exit(65); }
fs.mkdirSync(spool, { recursive: true });
const now = new Date().toISOString();
const id = Date.now() + '-' + crypto.randomUUID();
const finalPath = path.join(spool, id + '.json');
const tempPath = finalPath + '.tmp';
const payload = { schema: 1, queued_at: now, key, workflow, inputs };
fs.writeFileSync(tempPath, JSON.stringify(payload) + '\\n', { mode: 0o600 });
fs.renameSync(tempPath, finalPath);
process.stdout.write(JSON.stringify({ ok: true, queued: key, at: now }) + '\\n');
`;
}

async function ensureGateway(sandbox, { baseDir, stateDir, configPath, token, env }) {
  const url = 'ws://127.0.0.1:' + GATEWAY_PORT;
  const statusArgs = ['gateway', 'status', '--url', url, '--token', token, '--json'];
  let status = await sandbox.runCommand({ cmd: 'openclaw', args: statusArgs, cwd: baseDir, env });
  if (status.exitCode === 0) return { url, restarted: false };

  const logPath = stateDir + '/gateway.log';
  const pidPath = stateDir + '/gateway.pid';
  await sandbox.runCommand({
    cmd: 'bash',
    args: ['-lc', 'nohup openclaw gateway run --port ' + GATEWAY_PORT + ' --bind loopback >>' + JSON.stringify(logPath) + ' 2>&1 </dev/null & echo $! >' + JSON.stringify(pidPath)],
    cwd: baseDir,
    env
  });

  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 500));
    status = await sandbox.runCommand({ cmd: 'openclaw', args: statusArgs, cwd: baseDir, env });
    if (status.exitCode === 0) return { url, restarted: true };
  }
  const tail = await sandbox.runCommand({ cmd: 'bash', args: ['-lc', 'tail -n 80 ' + JSON.stringify(logPath) + ' 2>/dev/null || true'] });
  throw new Error('native_openclaw_gateway_failed: ' + (await tail.stdout()).slice(-2400));
}

async function syncJobs(sandbox, { baseDir, stateDir, spoolDir, url, token, env, runtimeVersion }) {
  const list = await run(sandbox, {
    cmd: 'openclaw',
    args: ['automations', 'list', '--all', '--json', '--url', url, '--token', token],
    cwd: baseDir,
    env
  }, 'native_automation_list');
  let data;
  try { data = JSON.parse(await stdout(list)); }
  catch (error) { throw new Error('native_automation_list_invalid_json: ' + error.message); }

  const rows = jobsFromList(data);
  const managed = rows.filter(row => String(row?.name || '').startsWith(JOB_PREFIX));
  const wantedNames = new Set(NATIVE_SCHEDULE.map(item => item.name));
  const namesHealthy = managed.length === NATIVE_SCHEDULE.length &&
    managed.every(row => wantedNames.has(String(row?.name || '')));
  const manifestPath = stateDir + '/quantdeus-native-schedule.sha256';
  const wantedHash = scheduleHash(runtimeVersion);
  const currentHash = (await readOptional(sandbox, manifestPath)).trim();

  if (namesHealthy && currentHash === wantedHash) {
    return { changed: false, count: managed.length, hash: wantedHash };
  }

  for (const row of managed) {
    const id = jobId(row);
    if (!id) continue;
    await run(sandbox, {
      cmd: 'openclaw',
      args: ['automations', 'remove', id, '--url', url, '--token', token],
      cwd: baseDir,
      env
    }, 'native_automation_remove');
  }

  const runnerPath = baseDir + '/queue-dispatch.mjs';
  for (const item of NATIVE_SCHEDULE) {
    const argv = ['node', runnerPath, spoolDir, item.workflow, JSON.stringify(item.inputs || {}), item.key];
    await run(sandbox, {
      cmd: 'openclaw',
      args: [
        'automations', 'create',
        '--name', item.name,
        '--cron', item.cron,
        '--tz', 'UTC',
        '--exact',
        '--command-argv', JSON.stringify(argv),
        '--command-cwd', baseDir,
        '--timeout-seconds', '60',
        '--no-deliver',
        '--url', url,
        '--token', token
      ],
      cwd: baseDir,
      env
    }, 'native_automation_create_' + item.key);
  }
  await writeFile(sandbox, manifestPath, wantedHash + '\n', '600');
  return { changed: true, count: NATIVE_SCHEDULE.length, hash: wantedHash };
}

function allowedIntent(intent) {
  const candidate = NATIVE_SCHEDULE.find(item => item.key === intent?.key);
  if (!candidate) return null;
  if (candidate.workflow !== intent.workflow) return null;
  if (stable(candidate.inputs || {}) !== stable(intent.inputs || {})) return null;
  return candidate;
}

async function dispatchWorkflow(githubToken, workflow, inputs) {
  const response = await fetch(
    'https://api.github.com/repos/' + REPOSITORY + '/actions/workflows/' + encodeURIComponent(workflow) + '/dispatches',
    {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + githubToken,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'content-type': 'application/json'
      },
      body: JSON.stringify({ ref: 'main', inputs: inputs || {} })
    }
  );
  const raw = await response.text();
  if (response.status !== 204) {
    throw new Error('github_workflow_dispatch_' + response.status + ': ' + raw.slice(0, 800));
  }
}

async function drainSpool(sandbox, { spoolDir, githubToken }) {
  if (!githubToken) throw new Error('native_scheduler_github_token_missing');
  const listing = await sandbox.runCommand({
    cmd: 'bash',
    args: ['-lc', 'find ' + JSON.stringify(spoolDir) + ' -maxdepth 1 -type f -name "*.json" -printf "%T@ %p\\n" | sort -n | cut -d" " -f2- | head -n ' + MAX_DRAIN]
  });
  const files = (await listing.stdout()).split('\n').map(x => x.trim()).filter(Boolean);
  const result = { pending_before: files.length, dispatched: [], rejected: [], deferred: [] };

  for (const path of files) {
    const raw = await readOptional(sandbox, path);
    let intent;
    try { intent = JSON.parse(raw); }
    catch {
      const quarantine = path + '.invalid';
      await sandbox.runCommand({ cmd: 'mv', args: [path, quarantine] });
      result.rejected.push({ file: path.split('/').pop(), reason: 'invalid_json' });
      continue;
    }
    const allowed = allowedIntent(intent);
    if (!allowed) {
      const quarantine = path + '.denied';
      await sandbox.runCommand({ cmd: 'mv', args: [path, quarantine] });
      result.rejected.push({ file: path.split('/').pop(), reason: 'not_allowlisted' });
      continue;
    }
    try {
      await dispatchWorkflow(githubToken, allowed.workflow, allowed.inputs);
      await sandbox.runCommand({ cmd: 'rm', args: ['-f', path] });
      result.dispatched.push(allowed.key);
    } catch (error) {
      result.deferred.push({ key: allowed.key, reason: String(error?.message || error).slice(0, 500) });
      break;
    }
  }
  return result;
}

export async function runNativeSchedulerWatchdog({ sandbox, githubToken, runtimeVersion }) {
  const homeResult = await run(sandbox, {
    cmd: 'bash',
    args: ['-lc', 'printf %s "$HOME"']
  }, 'native_scheduler_home');
  const home = await stdout(homeResult);
  const baseDir = home + '/quantdeus-native-scheduler';
  const stateDir = home + '/.openclaw/quantdeus-native-scheduler';
  const spoolDir = stateDir + '/dispatch-spool';
  const configPath = stateDir + '/openclaw.json';
  const tokenPath = stateDir + '/gateway.token';

  await run(sandbox, { cmd: 'mkdir', args: ['-p', baseDir, stateDir, spoolDir] }, 'native_scheduler_mkdir');

  let token = (await readOptional(sandbox, tokenPath)).trim();
  if (!token) {
    token = crypto.randomBytes(32).toString('hex');
    await writeFile(sandbox, tokenPath, token + '\n', '600');
  }

  const config = {
    gateway: {
      mode: 'local',
      bind: 'loopback',
      port: GATEWAY_PORT,
      auth: { mode: 'token', token }
    },
    cron: {
      enabled: true,
      skipMissedJobs: false,
      triggers: { enabled: true },
      sessionRetention: '24h'
    }
  };
  await writeFile(sandbox, configPath, JSON.stringify(config, null, 2) + '\n', '600');
  await writeFile(sandbox, baseDir + '/queue-dispatch.mjs', queueRunnerSource(), '700');

  const env = {
    OPENCLAW_HOME: home,
    OPENCLAW_STATE_DIR: stateDir,
    OPENCLAW_CONFIG_PATH: configPath,
    OPENCLAW_GATEWAY_TOKEN: token,
    CI: '1'
  };
  const gateway = await ensureGateway(sandbox, { baseDir, stateDir, configPath, token, env });
  const sync = await syncJobs(sandbox, {
    baseDir, stateDir, spoolDir, url: gateway.url, token, env, runtimeVersion
  });
  const drain = await drainSpool(sandbox, { spoolDir, githubToken });

  const finalList = await run(sandbox, {
    cmd: 'openclaw',
    args: ['automations', 'list', '--all', '--json', '--url', gateway.url, '--token', token],
    cwd: baseDir,
    env
  }, 'native_automation_final_list');
  const finalRows = jobsFromList(JSON.parse(await stdout(finalList)));
  const managedCount = finalRows.filter(row => String(row?.name || '').startsWith(JOB_PREFIX)).length;
  if (managedCount !== NATIVE_SCHEDULE.length) {
    throw new Error('native_scheduler_job_count_mismatch: expected=' + NATIVE_SCHEDULE.length + ' actual=' + managedCount);
  }

  return {
    scheduler: 'openclaw-native-automations',
    schedule_version: NATIVE_SCHEDULE_VERSION,
    jobs: managedCount,
    gateway_restarted: gateway.restarted,
    schedule_changed: sync.changed,
    dispatched: drain.dispatched,
    deferred: drain.deferred,
    rejected: drain.rejected,
    queue_seen: drain.pending_before
  };
}
