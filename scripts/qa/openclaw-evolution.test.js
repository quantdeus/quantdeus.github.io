'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { validateProposal, validateChangedFiles } = require('../openclaw-evolution');
const base = 'a'.repeat(40);
const evidenceUrl = 'https://github.com/quantdeus/quantdeus.github.io/actions/runs/123';
const evidence = { actions: [{ url: evidenceUrl }], prs: [], issues: [] };
function proposal() {
  return { action: 'proposal', base_sha: base, tier: 'skill', problem: 'Repeated failure', hypothesis: 'A bounded fix', summary: 'Clarify evidence', metric: 'Failure recurrence', falsifier: 'No improvement after 3 runs', evidence: [evidenceUrl], files: [{ path: 'docs/openclaw-evolution.md', content: 'updated documentation' }] };
}
test('proposal validation enforces tier/path/evidence/base/count and actual diff', () => {
  const p = proposal();
  assert.equal(validateProposal(p, base, evidence), p);
  validateChangedFiles([{ filename: p.files[0].path, status: 'modified' }], p);
  for (const mutate of [
    p => { p.base_sha = 'b'.repeat(40); },
    p => { p.files[0].path = 'vercel-dispatcher/api/quantdeus/openclaw.js'; },
    p => { p.files[0].path = 'docs/../scripts/guarded-automerge.js'; },
    p => { p.files.push(p.files[0]); },
    p => { p.files = Array(4).fill(p.files[0]); },
    p => { p.evidence = []; },
    p => { p.evidence = ['https://github.com/quantdeus/quantdeus.github.io/actions/runs/999']; },
    p => { delete p.metric; },
    p => { p.falsifier = ''; },
    p => { p.action = 'pr'; }
  ]) {
    const invalid = proposal(); mutate(invalid);
    assert.throws(() => validateProposal(invalid, base, evidence));
  }
  assert.throws(() => validateChangedFiles([{ filename: 'scripts/guarded-automerge.js', status: 'modified' }], p));
  assert.throws(() => validateChangedFiles([{ filename: p.files[0].path, status: 'renamed' }], p));
  assert.throws(() => validateChangedFiles([], p));
  const core = proposal(); core.tier = 'core'; core.files[0].path = 'scripts/openclaw-office-client.js';
  validateProposal(core, base, evidence);
  core.files[0].path = '.github/workflows/qa-triad.yml';
  assert.throws(() => validateProposal(core, base, evidence));
});
test('signed evolution identity cannot request trusted tools on any permitted event', () => {
  const route = fs.readFileSync('vercel-dispatcher/api/quantdeus/openclaw.js', 'utf8');
  const source = route.slice(route.indexOf('function trustedOfficeRequest('), route.indexOf('function hourlyOfficeRequest('));
  const gate = vm.runInNewContext(source + '\ntrustedOfficeRequest');
  for (const event of ['schedule', 'workflow_dispatch', 'push', 'issue_comment']) {
    assert.equal(gate({ body: { execution_mode: 'trusted-office', metadata: { admin_authorized: true, source: 'github-command-center', actor_login: 'owner' } } }, {
      workflow_ref: 'quantdeus/quantdeus.github.io/.github/workflows/openclaw-evolution.yml@refs/heads/main', event_name: event, actor: 'owner'
    }), false);
  }
  assert.equal(gate({ body: { execution_mode: 'trusted-office' } }, {
    workflow_ref: 'quantdeus/quantdeus.github.io/.github/workflows/qa-self-heal.yml@refs/heads/main', event_name: 'schedule'
  }), true);
});
async function runGuard({ mode = 'site', branch = 'automation/site-refresh/test', conclusion = 'success', workflowPath, app = 'github-actions', moved = false } = {}) {
  const calls = [];
  const sha = 'c'.repeat(40);
  const checks = ['qa', 'smoke'].map((name, i) => ({ name, status: 'completed', conclusion, app: { slug: app }, details_url: `https://github.com/quantdeus/quantdeus.github.io/actions/runs/${i + 1}/job/42` }));
  const execFileSync = (cmd, args) => {
    calls.push(args);
    if (args[0] === 'pr' && args[1] === 'view') {
      return JSON.stringify(args.includes('headRefOid') ? { headRefOid: moved ? 'd'.repeat(40) : sha } : { state: 'OPEN', baseRefName: 'main', headRefName: branch, headRefOid: sha, files: [{ path: 'docs/change.md' }] });
    }
    if (args[0] === 'api' && args[1].endsWith('/check-runs')) return JSON.stringify({ check_runs: checks });
    if (args[0] === 'api' && args[1].includes('/actions/runs/')) {
      return JSON.stringify({ head_sha: sha, event: 'workflow_dispatch', path: workflowPath || (args[1].endsWith('/1') ? '.github/workflows/qa-triad.yml' : '.github/workflows/static-smoke.yml') });
    }
    if (args[0] === 'pr' && args[1] === 'merge') return '';
    throw new Error('Unexpected gh call');
  };
  await vm.runInNewContext(fs.readFileSync('scripts/guarded-automerge.js', 'utf8'), {
    require: () => ({ execFileSync }),
    process: { env: { GITHUB_REPOSITORY: 'quantdeus/quantdeus.github.io', PR_NUMBER: '1', AUTO_MERGE_MODE: mode, EXPECTED_BRANCH_PREFIX: branch.split('/').slice(0, 2).join('/') + '/' }, exit: code => { throw new Error('exit ' + code); } },
    console: { log() {}, error() {} }, setTimeout: callback => callback()
  });
  return calls;
}
test('all modes refuse evolution branch merges', async () => {
  for (const mode of ['manifest', 'site', 'openclaw-skill']) {
    const calls = await runGuard({ mode, branch: 'automation/openclaw-evolution/123' });
    assert.equal(calls.some(x => x[1] === 'merge'), false);
  }
});
test('merge guard rejects skipped/neutral, forged check provenance, moved head', async () => {
  for (const options of [{ conclusion: 'skipped' }, { conclusion: 'neutral' }, { conclusion: 'failure' }, { workflowPath: '.github/workflows/fake.yml' }, { app: 'fake-app' }]) {
    const calls = await runGuard(options);
    assert.equal(calls.some(x => x[1] === 'merge'), false);
  }
  await assert.rejects(runGuard({ moved: true }));
  const calls = await runGuard();
  const merge = calls.find(x => x[1] === 'merge');
  assert.ok(merge);
  assert.ok(merge.includes('--match-head-commit'));
  assert.equal(merge.at(-1), 'c'.repeat(40));
});
