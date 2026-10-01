const test = require('node:test');
const assert = require('node:assert/strict');
const { validateAuthorizationIssue, upsertContributor } = require('../contributor-onboarding');

function approvedIssue(overrides = {}) {
  return {
    number: 342,
    state: 'open',
    pull_request: null,
    user: { login: 'quantdeus' },
    created_at: '2026-10-01T12:17:09Z',
    updated_at: '2026-10-01T12:17:09Z',
    labels: [
      { name: 'coord:task' },
      { name: 'coord:ready' },
      { name: 'quantdeus-target-agent:seven-of-nine' }
    ],
    body: 'Add **Egor / GitHub `goplay1937`** to contributors. Keep repository access read-only. No ability to modify workflow files.',
    ...overrides
  };
}

test('accepts immutable CEO-authored read-only onboarding issue', () => {
  assert.deepEqual(validateAuthorizationIssue(approvedIssue()), { login: 'goplay1937', displayName: 'Egor' });
});

test('rejects bot/non-CEO authorization', () => {
  assert.throws(() => validateAuthorizationIssue(approvedIssue({ user: { login: 'github-actions[bot]' } })), /CEO-authored/);
});

test('rejects edited approval issue', () => {
  assert.throws(() => validateAuthorizationIssue(approvedIssue({ updated_at: '2026-10-01T12:18:00Z' })), /unedited/);
});

test('rejects issue without explicit workflow restriction', () => {
  assert.throws(() => validateAuthorizationIssue(approvedIssue({ body: 'Add GitHub `goplay1937` with read-only access.' })), /workflow restrictions/);
});

test('registry record can never authorize write or workflow mutation', () => {
  const issue = approvedIssue();
  const identity = validateAuthorizationIssue(issue);
  const registry = upsertContributor({ schema_version: 1, contributors: [] }, issue, identity);
  assert.equal(registry.contributors.length, 1);
  const c = registry.contributors[0];
  assert.equal(c.github_login, 'goplay1937');
  assert.equal(c.requested_access, 'public-read-only');
  assert.equal(c.write_access_authorized, false);
  assert.equal(c.workflow_write_authorized, false);
  assert.equal(c.repository_role_mutation_by_automation, false);
  assert.equal(registry.access_model.granular_read_only_collaborators, false);
});
