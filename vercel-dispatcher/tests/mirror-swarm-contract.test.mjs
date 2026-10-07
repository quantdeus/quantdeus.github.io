import test from 'node:test';
import assert from 'node:assert/strict';
import { deterministicDiagnosis, deterministicStageDiagnosis, safeRepairPath, fingerprint, providerExhausted, mirrorIncidentKey, publicHeadText } from '../api/quantdeus/mirror.js';

test('deterministic fallback stays healthy on clean evidence', () => {
  const result = deterministicDiagnosis({
    validator_state: { syntax_rc:0, contract_rc:0, openclaw_rc:0 },
    recent_failures: []
  });
  assert.equal(result.status, 'healthy');
  assert.deepEqual(result.suspect_files, []);
});

test('deterministic fallback escalates without guessing a patch', () => {
  const result = deterministicDiagnosis({
    validator_state: { syntax_rc:1, contract_rc:0, openclaw_rc:0 },
    recent_failures: [{ id:42, name:'QA Triad', conclusion:'failure' }]
  });
  assert.equal(result.status, 'escalate');
  assert.deepEqual(result.suspect_files, []);
  assert.ok(result.evidence.some(item => item.includes('syntax_rc')));
  assert.ok(result.evidence.some(item => item.includes('QA Triad')));
});

test('protected and unsafe paths remain rejected', () => {
  assert.equal(safeRepairPath('coordination/agents.json'), false);
  assert.equal(safeRepairPath('vercel-dispatcher/api/quantdeus/mirror.js'), false);
  assert.equal(safeRepairPath('../escape.js'), false);
  assert.equal(safeRepairPath('scripts/example-runtime.js'), true);
});

test('fallback fingerprint is stable for deduplication', () => {
  assert.equal(fingerprint('same evidence'), fingerprint('same evidence'));
  assert.notEqual(fingerprint('same evidence'), fingerprint('different evidence'));
});


test('role-stage provider exhaustion escalates even after a successful admission probe', () => {
  const result = deterministicStageDiagnosis({
    validator_state: { syntax_rc:0, contract_rc:0, openclaw_rc:0 },
    recent_failures: []
  }, 'role');
  assert.equal(result.status, 'escalate');
  assert.ok(result.evidence.includes('provider_stage:role'));
});

test('provider exhaustion classifier only matches the bounded mirror exhaustion error', () => {
  assert.equal(providerExhausted(new Error('mirror_no_healthy_provider')), true);
  assert.equal(providerExhausted(new Error('github_token_unavailable')), false);
});


test('model-plane recurrences share one semantic incident key across changing evidence', () => {
  const a = deterministicStageDiagnosis({
    validator_state: { syntax_rc:0, contract_rc:1, openclaw_rc:0 },
    recent_failures: [{ id:1, name:'Hourly', conclusion:'failure' }]
  }, 'probe');
  const b = deterministicStageDiagnosis({
    validator_state: { syntax_rc:0, contract_rc:0, openclaw_rc:0 },
    recent_failures: []
  }, 'role');
  assert.equal(mirrorIncidentKey(a, 'probe'), 'model-plane-unavailable');
  assert.equal(mirrorIncidentKey(b, 'role'), 'model-plane-unavailable');
});

test('mirror incident titles keep the beginning of the summary', () => {
  const title = publicHeadText('Mirror model routes unavailable; deterministic evidence captured a repair-worthy condition.', 20);
  assert.equal(title, 'Mirror model routes un');
});
