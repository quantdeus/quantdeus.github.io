const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  domainAllowed,
  gateDetected,
  validateManifest
} = require('../browser-homunculus');

function issue(labels = ['governance:passed', 'agent:control-tower']) {
  return { number: 1, labels };
}

test('domain allowlist accepts exact and wildcard hosts but not lookalikes', () => {
  assert.equal(domainAllowed('example.com', ['example.com']), true);
  assert.equal(domainAllowed('app.example.com', ['*.example.com']), true);
  assert.equal(domainAllowed('example.com', ['*.example.com']), true);
  assert.equal(domainAllowed('evil-example.com', ['*.example.com']), false);
});

test('manifest requires governance and keeps target inside allowlist', () => {
  assert.doesNotThrow(() => validateManifest(issue(), {
    version: 1,
    mode: 'steps',
    url: 'https://example.com/',
    allowed_domains: ['example.com'],
    actions: [{ op: 'snapshot' }]
  }));
  assert.throws(() => validateManifest(issue(), {
    version: 1,
    mode: 'steps',
    url: 'https://example.com/',
    allowed_domains: ['other.example'],
    actions: [{ op: 'snapshot' }]
  }), /target_not_in_allowed_domains/);
});

test('verification gates are detected', () => {
  assert.equal(gateDetected('Please verify you are human'), true);
  assert.equal(gateDetected('Enter authenticator code for 2FA'), true);
  assert.equal(gateDetected('Ordinary documentation page'), false);
});

test('workflow pins agent-browser and cannot mask execution failure', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '../../.github/workflows/browser-homunculus.yml'), 'utf8');
  assert.match(workflow, /agent-browser@0\.38\.1/);
  assert.doesNotMatch(workflow, /continue-on-error:\s*true/);
  assert.match(workflow, /AI_GATEWAY_API_KEY/);
  assert.match(workflow, /AI_GATEWAY_MODEL/);
});

test('runtime enables bounded eyes-and-hands safeguards', () => {
  const source = fs.readFileSync(path.join(__dirname, '../browser-homunculus.js'), 'utf8');
  assert.match(source, /AGENT_BROWSER_ALLOWED_DOMAINS/);
  assert.match(source, /AGENT_BROWSER_CONTENT_BOUNDARIES/);
  assert.match(source, /AGENT_BROWSER_MAX_OUTPUT/);
  assert.match(source, /AGENT_BROWSER_PIN_TAB/);
  assert.match(source, /browser_final_url_outside_allowed_domains/);
  assert.match(source, /AI_GATEWAY_API_KEY_required_for_chat_mode/);
  assert.match(source, /AI_GATEWAY_MODEL_required_for_chat_mode/);
});
