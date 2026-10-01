'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { normalizeNoAction, validateProposal, validateChangedFiles, validateCandidate, scoreCandidate, chooseChampion, assertMaterializedChampion } = require('../openclaw-evolution');
const { validateTierAChangeSet, validateTierBProposal } = require('../openclaw-evolution-guard');

const base = 'a'.repeat(40);
const evidenceUrl = 'https://github.com/quantdeus/quantdeus.github.io/actions/runs/123';
const evidence = { actions: [{ url: evidenceUrl }], prs: [], issues: [] };
const MUTABLE_START = '<!-- QD_EVOLUTION_MUTABLE_START -->';
const MUTABLE_END = '<!-- QD_EVOLUTION_MUTABLE_END -->';

function boundedCandidate(path, body = '- Prefer one reproducible, measurable recovery improvement.') {
  const source = fs.readFileSync(path, 'utf8');
  const start = source.indexOf(MUTABLE_START);
  const end = source.indexOf(MUTABLE_END);
  assert.ok(start >= 0 && end > start, path + ' must expose bounded mutable markers');
  return source.slice(0, start + MUTABLE_START.length) + '\n' + body + '\n' + source.slice(end);
}
function proposal() {
  return {
    action: 'proposal',
    base_sha: base,
    tier: 'skill',
    problem: 'Repeated recovery friction',
    hypothesis: 'A bounded evidence heuristic can reduce recurrence',
    summary: 'Refine evidence heuristic',
    metric: 'Failure recurrence',
    falsifier: 'No improvement after 3 runs',
    evidence: [evidenceUrl],
    files: [{
      path: 'docs/openclaw-evolution.md',
      content: boundedCandidate('docs/openclaw-evolution.md')
    }]
  };
}
function clone(value) { return JSON.parse(JSON.stringify(value)); }

test('proposal validation enforces base, evidence, paths and semantic Tier A envelope', () => {
  const p = proposal();
  assert.equal(validateProposal(p, base, evidence), p);
  validateChangedFiles([{ filename: p.files[0].path, status: 'modified' }], p);

  const invalidMutations = [
    p => { p.base_sha = 'b'.repeat(40); },
    p => { p.files[0].path = 'vercel-dispatcher/api/quantdeus/openclaw.js'; },
    p => { p.files[0].path = 'docs/../scripts/guarded-automerge.js'; },
    p => { p.files.push(clone(p.files[0])); },
    p => { p.evidence = []; },
    p => { p.evidence = ['https://github.com/quantdeus/quantdeus.github.io/actions/runs/999']; },
    p => { delete p.metric; },
    p => { p.falsifier = ''; },
    p => { p.action = 'pr'; },
    p => { p.files[0].content = 'replace the whole control document'; }
  ];
  for (const mutate of invalidMutations) {
    const invalid = proposal();
    mutate(invalid);
    assert.throws(() => validateProposal(invalid, base, evidence));
  }

  assert.throws(() => validateChangedFiles([{ filename: 'scripts/guarded-automerge.js', status: 'modified' }], p));
  assert.throws(() => validateChangedFiles([{ filename: p.files[0].path, status: 'renamed' }], p));
  assert.throws(() => validateChangedFiles([], p));
});

test('Tier B is proposal-only and cannot carry generated core code', () => {
  const core = proposal();
  core.tier = 'core';
  delete core.files;
  core.suggested_paths = ['scripts/openclaw-office-client.js'];
  assert.equal(validateProposal(core, base, evidence), core);

  const withCode = clone(core);
  withCode.files = [{ path: 'scripts/openclaw-office-client.js', content: 'generated code' }];
  assert.throws(() => validateProposal(withCode, base, evidence));

  const protectedOutsideScope = clone(core);
  protectedOutsideScope.suggested_paths = ['.github/workflows/qa-triad.yml'];
  assert.throws(() => validateProposal(protectedOutsideScope, base, evidence));
});


test('Darwin candidates are evidence-bound and limited to approved target paths', () => {
  const candidate = {
    action: 'candidate',
    base_sha: base,
    tier: 'skill',
    problem: 'Repeated provider stalls',
    hypothesis: 'Prefer a bounded recovery heuristic after repeated provider failures',
    summary: 'Refine provider recovery heuristic',
    metric: 'Failed evolution runs per day',
    falsifier: 'Failure recurrence does not drop after three comparable runs',
    evidence: [evidenceUrl],
    target_paths: ['docs/openclaw-evolution.md']
  };
  assert.equal(validateCandidate(candidate, base, evidence), candidate);

  const unknownEvidence = clone(candidate);
  unknownEvidence.evidence = ['https://github.com/quantdeus/quantdeus.github.io/actions/runs/999'];
  assert.throws(() => validateCandidate(unknownEvidence, base, evidence));

  const escapedPath = clone(candidate);
  escapedPath.target_paths = ['scripts/openclaw-evolution.js'];
  assert.throws(() => validateCandidate(escapedPath, base, evidence));
});

test('Darwin fitness favors stronger evidence, novelty and smaller reversible blast radius', () => {
  const failureUrl = 'https://github.com/quantdeus/quantdeus.github.io/actions/runs/456';
  const issueUrl = 'https://github.com/quantdeus/quantdeus.github.io/issues/77';
  const snapshot = {
    actions: [{ url: failureUrl, conclusion: 'failure' }],
    prs: [],
    issues: [{ url: issueUrl }]
  };
  const strong = {
    action: 'candidate',
    tier: 'skill',
    evidence: [failureUrl],
    hypothesis: 'Route repeated inference stalls through a bounded recovery heuristic',
    target_paths: ['docs/openclaw-evolution.md']
  };
  const weak = {
    action: 'candidate',
    tier: 'skill',
    evidence: [issueUrl],
    hypothesis: 'Reuse the same old recovery heuristic',
    target_paths: [
      '.openclaw/skills/quantdeus-self-evolution/SKILL.md',
      'coordination/openclaw-evolution.json',
      'docs/openclaw-evolution.md'
    ]
  };
  const history = [{ hypothesis: 'Reuse the same old recovery heuristic' }];
  const strongFitness = scoreCandidate(strong, snapshot, history);
  const weakFitness = scoreCandidate(weak, snapshot, history);
  assert.ok(strongFitness.score > weakFitness.score);

  const champion = chooseChampion([
    { index: 0, valid: true, candidate: weak, fitness: weakFitness },
    { index: 1, valid: true, candidate: strong, fitness: strongFitness },
    { index: 2, valid: false, candidate: {}, fitness: { score: -1 }, error: 'invalid' }
  ]);
  assert.equal(champion.index, 1);
});

test('Darwin materialization cannot rewrite the selected champion genome', () => {
  const final = proposal();
  const champion = {
    action: 'candidate',
    base_sha: final.base_sha,
    tier: final.tier,
    problem: final.problem,
    hypothesis: final.hypothesis,
    summary: final.summary,
    metric: final.metric,
    falsifier: final.falsifier,
    evidence: final.evidence,
    target_paths: final.files.map(x => x.path)
  };
  assert.equal(assertMaterializedChampion(final, champion), final);

  const mutatedHypothesis = clone(final);
  mutatedHypothesis.hypothesis = 'Different hypothesis after selection';
  assert.throws(() => assertMaterializedChampion(mutatedHypothesis, champion));

  const mutatedPath = clone(final);
  mutatedPath.files[0].path = '.openclaw/skills/quantdeus-self-evolution/SKILL.md';
  assert.throws(() => assertMaterializedChampion(mutatedPath, champion));
});

test('semantic guard freezes Tier A control text and policy while allowing bounded notes/history', () => {
  const path = '.openclaw/skills/quantdeus-self-evolution/SKILL.md';
  const baseSkill = fs.readFileSync(path, 'utf8');
  validateTierAChangeSet({
    changedPaths: [path],
    baseByPath: { [path]: baseSkill },
    candidateByPath: { [path]: boundedCandidate(path, '- Track one safe latency heuristic with a falsifier.') }
  });

  const badSkill = boundedCandidate(path).replace('Never weaken or bypass:', 'Bypass protections when useful:');
  assert.throws(() => validateTierAChangeSet({
    changedPaths: [path],
    baseByPath: { [path]: baseSkill },
    candidateByPath: { [path]: badSkill }
  }));

  const policyPath = 'coordination/openclaw-evolution.json';
  const basePolicyText = fs.readFileSync(policyPath, 'utf8');
  const candidatePolicy = JSON.parse(basePolicyText);
  candidatePolicy.updated = '2026-09-30';
  candidatePolicy.history = [...candidatePolicy.history, {
    date: '2026-09-30',
    type: 'test-observation',
    hypothesis: 'One bounded evidence note may improve diagnosis.',
    status: 'candidate'
  }];
  validateTierAChangeSet({
    changedPaths: [policyPath],
    baseByPath: { [policyPath]: basePolicyText },
    candidateByPath: { [policyPath]: JSON.stringify(candidatePolicy, null, 2) + '\n' }
  });
  candidatePolicy.policy.core_auto_merge = true;
  assert.throws(() => validateTierAChangeSet({
    changedPaths: [policyPath],
    baseByPath: { [policyPath]: basePolicyText },
    candidateByPath: { [policyPath]: JSON.stringify(candidatePolicy, null, 2) + '\n' }
  }));

  const coreRecord = {
    schema_version: 1,
    tier: 'core-proposal',
    rationale: 'Investigate repeated recovery friction without changing controls automatically.',
    suggested_paths: ['vercel-dispatcher/api/quantdeus/openclaw.js']
  };
  validateTierBProposal(JSON.stringify(coreRecord), basePolicyText);
  coreRecord.suggested_paths = ['.github/workflows/qa-triad.yml'];
  assert.throws(() => validateTierBProposal(JSON.stringify(coreRecord), basePolicyText));
});

test('signed evolution identity cannot request trusted tools on any permitted event', () => {
  const route = fs.readFileSync('vercel-dispatcher/api/quantdeus/openclaw.js', 'utf8');
  const source = route.slice(route.indexOf('function trustedOfficeRequest('), route.indexOf('function hourlyOfficeRequest('));
  const gate = vm.runInNewContext(source + '\ntrustedOfficeRequest');
  for (const event of ['schedule', 'workflow_dispatch', 'push', 'issue_comment']) {
    assert.equal(gate({ body: { execution_mode: 'trusted-office', metadata: { admin_authorized: true, source: 'github-command-center', actor_login: 'owner' } } }, {
      workflow_ref: 'quantdeus/quantdeus.github.io/.github/workflows/openclaw-evolution.yml@refs/heads/main',
      event_name: event,
      actor: 'owner'
    }), false);
  }
  assert.equal(gate({ body: { execution_mode: 'trusted-office' } }, {
    workflow_ref: 'quantdeus/quantdeus.github.io/.github/workflows/qa-self-heal.yml@refs/heads/main',
    event_name: 'schedule'
  }), true);
});

async function runGuard({
  mode = 'site',
  branch = 'automation/site-refresh/test',
  conclusion = 'success',
  workflowPath,
  app = 'github-actions',
  moved = false,
  draft = false,
  semanticThrows = false,
  files
} = {}) {
  const calls = [];
  const sha = 'c'.repeat(40);
  const mainSha = 'e'.repeat(40);
  const required = mode === 'openclaw-skill' ? ['qa', 'smoke', 'evolution-guard'] : ['qa', 'smoke'];
  const checks = required.map((name, i) => ({
    name,
    status: 'completed',
    conclusion,
    app: { slug: app },
    details_url: `https://github.com/quantdeus/quantdeus.github.io/actions/runs/${i + 1}/job/42`
  }));
  const defaultFiles = mode === 'openclaw-skill'
    ? [{ path: 'docs/openclaw-evolution.md' }]
    : [{ path: 'docs/change.md' }];
  const expectedPaths = {
    1: '.github/workflows/qa-triad.yml',
    2: '.github/workflows/static-smoke.yml',
    3: '.github/workflows/openclaw-evolution-pr-guard.yml'
  };

  const execFileSync = (cmd, args) => {
    calls.push(args);
    if (args[0] === 'pr' && args[1] === 'view') {
      const fields = args[args.indexOf('--json') + 1];
      if (fields.startsWith('state,')) {
        return JSON.stringify({
          state: 'OPEN',
          baseRefName: 'main',
          headRefName: branch,
          headRefOid: sha,
          files: files || defaultFiles,
          isCrossRepository: false,
          isDraft: draft
        });
      }
      return JSON.stringify({
        headRefOid: moved ? 'd'.repeat(40) : sha,
        files: files || defaultFiles,
        isDraft: draft
      });
    }
    if (args[0] === 'api' && args[1].endsWith('/git/ref/heads/main')) {
      return JSON.stringify({ object: { sha: mainSha } });
    }
    if (args[0] === 'api' && args[1].includes('/contents/')) {
      return JSON.stringify({ content: Buffer.from('bounded candidate').toString('base64') });
    }
    if (args[0] === 'api' && args[1].endsWith('/check-runs')) {
      return JSON.stringify({ check_runs: checks });
    }
    if (args[0] === 'api' && args[1].includes('/actions/runs/')) {
      const id = Number(args[1].split('/').at(-1));
      return JSON.stringify({
        id,
        head_sha: sha,
        event: 'workflow_dispatch',
        path: workflowPath || expectedPaths[id]
      });
    }
    if (args[0] === 'pr' && args[1] === 'merge') return '';
    throw new Error('Unexpected gh call: ' + args.join(' '));
  };

  const helper = {
    TIER_A_ALLOWED: new Set([
      '.openclaw/skills/quantdeus-self-evolution/SKILL.md',
      'coordination/openclaw-evolution.json',
      'docs/openclaw-evolution.md'
    ]),
    validateTierAChangeSet() {
      if (semanticThrows) throw new Error('semantic guard rejected');
    }
  };

  const localRequire = id => {
    if (id === 'node:child_process') return { execFileSync };
    if (id === './openclaw-evolution-guard') return helper;
    return require(id);
  };

  const expectedPrefix = branch.split('/').slice(0, 2).join('/') + '/';
  await vm.runInNewContext(fs.readFileSync('scripts/guarded-automerge.js', 'utf8'), {
    require: localRequire,
    Buffer,
    process: {
      env: {
        GITHUB_REPOSITORY: 'quantdeus/quantdeus.github.io',
        PR_NUMBER: '1',
        AUTO_MERGE_MODE: mode,
        EXPECTED_BRANCH_PREFIX: expectedPrefix
      },
      exit: code => { throw new Error('exit ' + code); }
    },
    console: { log() {}, error() {} },
    setTimeout: callback => callback()
  });
  return calls;
}

test('manifest/site modes cannot bypass evolution gate; Tier A can merge only through its own mode', async () => {
  for (const mode of ['manifest', 'site']) {
    const calls = await runGuard({ mode, branch: 'automation/openclaw-evolution/123' });
    assert.equal(calls.some(x => x[1] === 'merge'), false);
  }
  const calls = await runGuard({ mode: 'openclaw-skill', branch: 'automation/openclaw-evolution/123' });
  const merge = calls.find(x => x[1] === 'merge');
  assert.ok(merge);
  assert.ok(merge.includes('--match-head-commit'));
  assert.equal(merge.at(-1), 'c'.repeat(40));
});

test('explicit no-action explanation is bounded without granting mutation authority', () => {
  for (const reason of ['x'.repeat(5000), undefined, '', { diagnostic: 'no change' }]) {
    const original = { action: 'none', base_sha: base, reason, files: [{ path: 'main', content: 'unsafe' }] };
    const normalized = normalizeNoAction(original);
    validateProposal(normalized, base, evidence);
    assert.equal(normalized.action, 'none');
    assert.ok(normalized.reason.length <= 2000);
    assert.equal(normalized.files, undefined);
    assert.equal(original.reason, reason);
  }
  const actionable = proposal(); delete actionable.metric;
  assert.throws(() => validateProposal(normalizeNoAction(actionable), base, evidence));
});
test('merge guard rejects skipped/neutral/failure, forged provenance, draft, semantic failure and moved head', async () => {
  for (const options of [
    { conclusion: 'skipped' },
    { conclusion: 'neutral' },
    { conclusion: 'failure' },
    { workflowPath: '.github/workflows/fake.yml' },
    { app: 'fake-app' }
  ]) {
    const calls = await runGuard({ mode: 'openclaw-skill', branch: 'automation/openclaw-evolution/123', ...options });
    assert.equal(calls.some(x => x[1] === 'merge'), false);
  }
  {
    const calls = await runGuard({ mode: 'openclaw-skill', branch: 'automation/openclaw-evolution/123', draft: true });
    assert.equal(calls.some(x => x[1] === 'merge'), false);
  }
  await assert.rejects(runGuard({ mode: 'openclaw-skill', branch: 'automation/openclaw-evolution/123', semanticThrows: true }));
  await assert.rejects(runGuard({ mode: 'openclaw-skill', branch: 'automation/openclaw-evolution/123', moved: true }));
  {
    const calls = await runGuard({
      mode: 'openclaw-skill',
      branch: 'automation/openclaw-evolution/123',
      files: [{ path: 'vercel-dispatcher/api/quantdeus/openclaw.js' }]
    });
    assert.equal(calls.some(x => x[1] === 'merge'), false);
  }
});

