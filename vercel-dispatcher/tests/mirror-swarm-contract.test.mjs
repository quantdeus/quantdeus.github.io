import test from 'node:test';
import assert from 'node:assert/strict';
import { deterministicDiagnosis, safeRepairPath, fingerprint } from '../api/quantdeus/mirror.js';

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
