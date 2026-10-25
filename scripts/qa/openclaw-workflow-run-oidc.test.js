'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../../vercel-dispatcher/api/quantdeus/openclaw.js'), 'utf8');
function eventSet(name) {
  const match = source.match(new RegExp('const ' + name + ' = new Set\\(\\[([^\\]]+)\\]\\)'));
  assert.ok(match, name + ' event allowlist must exist');
  return new Set([...match[1].matchAll(/'([^']+)'/g)].map(x => x[1]));
}

test('signed workflow_run may pass outer OIDC event gate', () => {
  assert.ok(eventSet('EVENTS').has('workflow_run'));
  assert.match(source, /if \(!EVENTS\.has\(c\.event_name\)\) throw new Error\('github_oidc_wrong_event'\)/);
});

test('workflow_run cannot enter privileged trusted-office lanes', () => {
  const trusted = source.split('function trustedOfficeRequest(')[1].split('function hourlyOfficeRequest(')[0];
  assert.ok(trusted, 'trusted office gate exists');
  assert.match(trusted, /new Set\(\['schedule', 'workflow_dispatch', 'push'\]\)/);
  assert.doesNotMatch(trusted, /new Set\(\[[^\]]*'workflow_run'/);
  const autonomous = source.split('function autonomousWorkerRequest(')[1].split('async function probeChatCandidate(')[0];
  assert.ok(autonomous);
  assert.match(autonomous, /if \(!trustedOfficeRequest\(req, claims\)\) return false/);
});
