'use strict';

const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { validateTierAChangeSet, validateTierBProposal } = require('./openclaw-evolution-guard');

const repo = process.env.GITHUB_REPOSITORY;
const baseSha = process.env.GITHUB_SHA;
const resultPath = process.env.EVOLUTION_RESULT_PATH || '/tmp/qd-openclaw-evolution/result.json';
const ghToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;

function fail(message) { throw new Error('openclaw_evolution_apply: ' + message); }
function gh(args) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    env: { ...process.env, GH_TOKEN: ghToken },
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}
function ghJson(args) {
  const out = gh(args);
  return out ? JSON.parse(out) : null;
}
function output(key, value) {
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, key + '=' + String(value) + '\n');
}
function apiPath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}
function validateBranch(branch) {
  if (!/^automation\/openclaw-evolution\/[a-z0-9][a-z0-9._\/-]{0,79}$/i.test(branch) || branch.includes('..')) {
    fail('invalid evolution branch');
  }
}
function createBranch(branch) {
  gh(['api', '-X', 'POST', 'repos/' + repo + '/git/refs', '-f', 'ref=refs/heads/' + branch, '-f', 'sha=' + baseSha]);
}
function putExisting(branch, path, content) {
  const current = ghJson(['api', 'repos/' + repo + '/contents/' + apiPath(path) + '?ref=' + encodeURIComponent(baseSha)]);
  if (!current?.sha) fail('missing base blob for ' + path);
  gh([
    'api', '-X', 'PUT', 'repos/' + repo + '/contents/' + apiPath(path),
    '-f', 'message=chore(evolution): guarded Tier A update',
    '-f', 'branch=' + branch,
    '-f', 'sha=' + current.sha,
    '-f', 'content=' + Buffer.from(content).toString('base64')
  ]);
}
function putNew(branch, path, content) {
  gh([
    'api', '-X', 'PUT', 'repos/' + repo + '/contents/' + apiPath(path),
    '-f', 'message=chore(evolution): record Tier B proposal',
    '-f', 'branch=' + branch,
    '-f', 'content=' + Buffer.from(content).toString('base64')
  ]);
}
function createPr(branch, title, body) {
  gh(['pr', 'create', '--repo', repo, '--base', 'main', '--head', branch, '--title', title, '--body', body]);
  const meta = ghJson(['pr', 'view', branch, '--repo', repo, '--json', 'number,url,headRefOid']);
  if (!meta?.number) fail('failed to resolve created PR');
  return meta;
}

(async () => {
  if (!repo || !baseSha || !ghToken) fail('repository, base SHA and GitHub token are required');
  const envelope = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
  const d = envelope.decision || {};
  if (d.action === 'none') {
    output('action', 'none');
    console.log('No evidence-backed evolution proposal.');
    return;
  }
  if (d.action !== 'proposal') fail('unsupported decision action');

  const branch = String(d.branch || '');
  validateBranch(branch);

  if (d.tier === 'skill') {
    const files = Array.isArray(d.files) ? d.files : [];
    const changedPaths = files.map(f => String(f.path || ''));
    const candidateByPath = {};
    const baseByPath = {};
    for (const file of files) {
      const path = String(file.path || '');
      if (typeof file.content !== 'string') fail('Tier A file content must be a string');
      candidateByPath[path] = file.content;
      if (!fs.existsSync(path)) fail('Tier A may only modify existing files: ' + path);
      baseByPath[path] = fs.readFileSync(path, 'utf8');
    }

    validateTierAChangeSet({ changedPaths, baseByPath, candidateByPath });
    createBranch(branch);
    for (const path of changedPaths) putExisting(branch, path, candidateByPath[path]);
    const pr = createPr(
      branch,
      'chore(openclaw): guarded Tier A evolution',
      [
        'Evidence-driven OpenClaw Tier A evolution.',
        '',
        'This PR was created only after deterministic pre-mutation validation.',
        'Auto-merge requires independent QA Triad, Static Smoke, and Evolution Guard success.',
        '',
        'Metric: ' + String(d.metric || 'not supplied'),
        'Falsifier: ' + String(d.falsifier || 'not supplied')
      ].join('\n')
    );
    output('action', 'pr');
    output('tier', 'skill');
    output('pr_number', pr.number);
    console.log(JSON.stringify({ action: 'pr', tier: 'skill', pr }, null, 2));
    return;
  }

  if (d.tier === 'core') {
    const policyText = fs.readFileSync('coordination/openclaw-evolution.json', 'utf8');
    const suggested = Array.isArray(d.suggested_paths) ? d.suggested_paths.map(String) : [];
    const proposal = {
      schema_version: 1,
      tier: 'core-proposal',
      created_at: new Date().toISOString(),
      source_run_id: process.env.GITHUB_RUN_ID || null,
      summary: String(d.summary || ''),
      rationale: String(d.rationale || ''),
      metric: String(d.metric || ''),
      falsifier: String(d.falsifier || ''),
      suggested_paths: suggested
    };
    validateTierBProposal(JSON.stringify(proposal), policyText);

    createBranch(branch);
    const proposalPath = 'coordination/openclaw-evolution-proposals/' + (process.env.GITHUB_RUN_ID || Date.now()) + '.json';
    putNew(branch, proposalPath, JSON.stringify(proposal, null, 2) + '\n');
    const pr = createPr(
      branch,
      'proposal(openclaw): Tier B core evolution',
      [
        'Tier B is proposal-only.',
        '',
        'No runtime, auth, workflow, MCP, secret, QA, or approval code was mutated automatically.',
        'A human/Seven review may decide whether to implement the proposal separately.'
      ].join('\n')
    );
    output('action', 'pr');
    output('tier', 'core');
    output('pr_number', pr.number);
    console.log(JSON.stringify({ action: 'pr', tier: 'core-proposal', pr }, null, 2));
    return;
  }

  fail('unsupported proposal tier');
})().catch(error => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
