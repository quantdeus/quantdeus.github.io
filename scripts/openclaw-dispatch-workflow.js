'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'coordination', 'openclaw-automations.json');
const REPOSITORY = 'quantdeus/quantdeus.github.io';

async function main() {
  const jobId = String(process.argv[2] || '').trim();
  if (!/^[a-z0-9][a-z0-9-]{1,80}$/.test(jobId)) throw new Error('invalid_native_scheduler_job_id');

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const job = (manifest.jobs || []).find(item => item.id === jobId);
  if (!job) throw new Error('unknown_native_scheduler_job:' + jobId);
  if (!/^[A-Za-z0-9._-]+\.ya?ml$/.test(job.workflow)) throw new Error('invalid_workflow_name');
  if (job.workflow === 'openclaw-scheduler-watchdog.yml') throw new Error('watchdog_recursion_denied');

  const token = String(process.env.QUANTDEUS_GITHUB_TOKEN || '').trim();
  if (!token) throw new Error('QUANTDEUS_GITHUB_TOKEN_missing');

  const inputs = {};
  for (const [key, value] of Object.entries(job.inputs || {})) {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(key)) throw new Error('invalid_workflow_input_key');
    const normalized = String(value);
    if (normalized.length > 500) throw new Error('workflow_input_too_long');
    inputs[key] = normalized;
  }

  const response = await fetch(
    'https://api.github.com/repos/' + REPOSITORY + '/actions/workflows/' + encodeURIComponent(job.workflow) + '/dispatches',
    {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + token,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'content-type': 'application/json',
        'user-agent': 'quantdeus-openclaw-native-scheduler'
      },
      body: JSON.stringify({ ref: 'main', ...(Object.keys(inputs).length ? { inputs } : {}) })
    }
  );

  const raw = await response.text();
  if (response.status !== 204) {
    throw new Error('workflow_dispatch_failed_' + response.status + ':' + raw.slice(0, 800));
  }

  console.log(JSON.stringify({
    ok: true,
    scheduler: 'openclaw-native',
    job_id: job.id,
    workflow: job.workflow,
    inputs,
    status: response.status
  }));
}

main().catch(error => {
  console.error(String(error?.stack || error?.message || error));
  process.exit(1);
});
