'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const JOB_NAME = 'quantdeus-bingx-vst';
const OPENCLAW_DIR = path.join(os.homedir(), '.openclaw');
const LEGACY_RUNNER_PATH = path.join(OPENCLAW_DIR, 'quantdeus-vst-cycle.cjs');

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

function listJobs() {
  const result = runOpenClaw(['automations', 'list', '--all', '--json']);
  return jobRows(parseJson(result.stdout, 'openclaw_automations_list'));
}

function matchingJobs() {
  return listJobs().filter(job => String(job?.name || '').trim().toLowerCase() === JOB_NAME);
}

function retireExistingScheduler() {
  const jobs = matchingJobs();
  for (const job of jobs) {
    const id = jobId(job);
    if (!id) fail('openclaw_existing_job_missing_id');
    runOpenClaw(['automations', 'remove', id, '--json']);
  }
  return jobs.length;
}

function main() {
  const removedJobs = retireExistingScheduler();
  const remaining = matchingJobs();
  if (remaining.length !== 0) fail('openclaw_vst_scheduler_retirement_failed');

  fs.rmSync(LEGACY_RUNNER_PATH, { force: true });

  process.stdout.write(JSON.stringify({
    ok: true,
    scheduler: 'github-actions-primary',
    openclaw_scheduler: 'retired',
    job: JOB_NAME,
    removed_jobs: removedJobs,
    legacy_runner_removed: true
  }) + '\n');
}

main();
