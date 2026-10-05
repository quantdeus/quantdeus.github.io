import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMirrorCandidates, probeMirrorProviders, callMirrorJsonRole } from '../lib/mirror-model-router.js';

function response(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return typeof payload === 'string' ? payload : JSON.stringify(payload); }
  };
}

test('mirror candidates never require Vercel AI Gateway', () => {
  const rows = buildMirrorCandidates({
    AI_GATEWAY_API_KEY: 'must-not-be-used',
    OPENCLAW_GATEWAY_MODEL: 'paid-route',
    OPENROUTER_API_KEY: 'or-key',
    OPENROUTER_MODEL: 'free-model'
  });
  assert.equal(rows.some(row => /vercel|gateway/i.test(row.id)), false);
  assert.equal(rows.some(row => row.id === 'quantdeus-openrouter'), true);
});

test('billing-gated provider is rejected while healthy provider survives', async () => {
  const candidates = [
    { ref:'billing/model', endpoint:'https://billing.test/chat', key:'x', model:'m', priority:1 },
    { ref:'healthy/model', endpoint:'https://healthy.test/chat', key:'y', model:'m', priority:2 }
  ];
  const fetchImpl = async url => {
    if (String(url).includes('billing')) return response(402, { error:'billing required' });
    return response(200, { choices:[{ message:{ content:'OK' } }] });
  };
  const rows = await probeMirrorProviders(candidates, { fetchImpl, timeoutMs:100 });
  assert.equal(rows[0].ok, false);
  assert.equal(rows[0].status, 402);
  assert.equal(rows[1].ok, true);
});

test('JSON role falls through to the next working provider', async () => {
  const routes = [
    { ref:'down/model', endpoint:'https://down.test/chat', key:'x', model:'m' },
    { ref:'ok/model', endpoint:'https://ok.test/chat', key:'y', model:'m' }
  ];
  const fetchImpl = async url => {
    if (String(url).includes('down')) return response(503, { error:'unavailable' });
    return response(200, { choices:[{ message:{ content:'{"status":"healthy"}' } }] });
  };
  const result = await callMirrorJsonRole({ routes, name:'Mirror Test', system:'', prompt:'{}', fetchImpl, timeoutMs:100 });
  assert.equal(result.route.ref, 'ok/model');
  assert.equal(result.text, '{"status":"healthy"}');
});
