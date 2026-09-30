const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  domainAllowed,
  gateDetected,
  parsePlannerDecision,
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
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /QD_BROWSER_LLM_BRIDGE/);
  assert.doesNotMatch(workflow, /AI_GATEWAY_API_KEY/);
});

test('runtime enables bounded eyes-and-hands safeguards', () => {
  const source = fs.readFileSync(path.join(__dirname, '../browser-homunculus.js'), 'utf8');
  assert.match(source, /AGENT_BROWSER_ALLOWED_DOMAINS/);
  assert.match(source, /AGENT_BROWSER_CONTENT_BOUNDARIES/);
  assert.match(source, /AGENT_BROWSER_MAX_OUTPUT/);
  assert.match(source, /AGENT_BROWSER_PIN_TAB/);
  assert.match(source, /browser_final_url_outside_allowed_domains/);
  assert.match(source, /getGithubOidcToken/);
  assert.match(source, /browser_planner_step_limit_reached/);
});

test('planner accepts only bounded browser decisions', () => {
  assert.deepEqual(parsePlannerDecision('{"status":"done","summary":"ok"}'), { status: 'done', summary: 'ok' });
  assert.equal(parsePlannerDecision('{"status":"act","action":{"op":"click_ref","ref":"@e1"}}').action.op, 'click_ref');
  assert.throws(() => parsePlannerDecision('{"status":"act","action":{"op":"eval","code":"1+1"}}'), /browser_planner_action_not_allowed/);
});

test('LLM bridge scopes browser OIDC to the browser workflow', () => {
  const bridge = fs.readFileSync(path.join(__dirname, '../../vercel-dispatcher/api/quantdeus/llm.js'), 'utf8');
  assert.match(bridge, /browser-homunculus\\\.yml@/);
  assert.match(bridge, /workflow_dispatch/);
  assert.match(bridge, /issues/);
  assert.match(bridge, /github_oidc_wrong_event_or_workflow/);
  assert.match(bridge, /generateText/);
  assert.match(bridge, /vercel-ai-gateway-oidc/);
  assert.match(bridge, /google\/gemini-3\.6-flash/);
  assert.match(bridge, /message\.role === 'system'/);
  assert.match(bridge, /instructions/);
  assert.match(bridge, /message\.role !== 'system'/);
  assert.doesNotMatch(bridge, /text\.pollinations\.ai/);
});
