import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { evaluateQdrp, capturePublicWordPress, sanitizeWpItems, loadBridgeConfig, loadQdrpPolicy } from '../quantdeus-federation-bridge.mjs';

const secret = 'test-only-signing-key-not-a-real-secret-12345';
const now = Date.parse('2026-11-04T18:30:00Z');

function make() {
  const request = {
    agent_id: 'seven-of-nine', action: 'scoped_staging_edit', environment: 'staging',
    resource: 'wordpress/src/quantdeus-aero/page-about.php',
    branch: 'agent/site-copy', repo: 'quantdeus/quantdeus.github.io'
  };
  const payload = {
    issuer: 'quantdeus-independent-review-authority', agent_id: 'seven-of-nine', score: 75,
    issued_at: new Date(now - 1000).toISOString(),
    expires_at: new Date(now + 120000).toISOString(),
    allowed_actions: ['scoped_staging_edit'],
    issue: 'https://github.com/quantdeus/quantdeus.github.io/issues/579',
    reviews: ['tuvok', 'data'],
    ci_pass: true, rollback_ref: 'commit:abc12345',
    allowed_path_prefixes: ['wordpress/src/']
  };
  const sign = value => ({ payload: value, signature: createHmac('sha256', secret).update(JSON.stringify(value)).digest('hex') });
  return { request, payload, sign };
}

test('manifest: existing Cloudflare Seven bridge links to Metaverse', () => {
  const m = loadBridgeConfig();
  assert.equal(m.wordpress.active_plugin.name, 'WP Git Sync');
  assert.equal(m.sync_contract.github_to_live_wordpress, false);
  assert.ok(m.cloudflare.existing_service_bindings.some(x => x.name === 'METAVERSE' && x.service === 'quantdeus-galactic-metaverse'));
  assert.equal(loadQdrpPolicy().development.frozen, false);
});
test('valid independent evidence grants a scoped staging change', () => {
  const { request, payload, sign } = make();
  assert.equal(evaluateQdrp(request, sign(payload), secret, now).allowed, true);
});
test('production is denied regardless of reputation', () => {
  const { request, payload, sign } = make();
  payload.score = 100;
  assert.equal(evaluateQdrp({ ...request, environment: 'production', action: 'live_publish' }, sign(payload), secret, now).allowed, false);
});
test('agent self-scoring or missing independent signing key cannot grant access', () => {
  const { request, payload, sign } = make();
  assert.equal(evaluateQdrp(request, sign(payload), '', now).allowed, false);
  assert.equal(evaluateQdrp(request, sign(payload), 'wrong-key-but-long-enough-to-look-ok', now).allowed, false);
});
test('tampering, path escape, expired grant, self review and direct main all fail', () => {
  const { request, payload, sign } = make();
  const signed = sign(payload);
  signed.payload = { ...payload, score: 100 };
  assert.equal(evaluateQdrp(request, signed, secret, now).allowed, false);
  assert.equal(evaluateQdrp({ ...request, resource: '../.github/workflows/unsafe.yml' }, sign(payload), secret, now).allowed, false);
  assert.equal(evaluateQdrp(request, sign({ ...payload, expires_at: new Date(now - 1000).toISOString() }), secret, now).allowed, false);
  assert.equal(evaluateQdrp(request, sign({ ...payload, reviews: ['seven-of-nine'] }), secret, now).allowed, false);
  assert.equal(evaluateQdrp({ ...request, branch: 'main' }, sign(payload), secret, now).allowed, false);
});
test('GET-only public WP snapshot excludes drafts, foreign URLs and HTML bodies', async () => {
  const calls = [];
  const fetchStub = async (url, options) => {
    calls.push({ url: String(url), method: options.method });
    return { ok: true, json: async () => [
      { id: 209, slug: 'real', status: 'publish', link: 'https://quantdeus.ru/news/', modified: '2026-11-04', title: { rendered: '<b>QuantDeus</b> news' }, content: { rendered: 'SECRET-NOT-TO-BE-COPIED' } },
      { id: 210, slug: 'private', status: 'private', link: 'https://quantdeus.ru/private/', title: { rendered: 'Secret' } },
      { id: 211, slug: 'foreign', status: 'publish', link: 'https://evil.example/foreign/', title: { rendered: 'Foreign' } }
    ] };
  };
  const result = await capturePublicWordPress({ fetchImpl: fetchStub });
  assert.equal(result.errors.length, 0);
  assert.equal(result.types.posts.items.length, 1);
  assert.equal(result.types.pages.items.length, 1);
  assert.equal(result.types.posts.items[0].title, 'QuantDeus news');
  assert.equal(JSON.stringify(result).includes('SECRET-NOT-TO-BE-COPIED'), false);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(x => x.method === 'GET' && x.url.includes('status=publish')));
});
test('unreachable WP is explicitly unverified, never written', async () => {
  const result = await capturePublicWordPress({ fetchImpl: async () => { throw Error('offline'); } });
  assert.equal(result.types.posts.status, 'unverified');
  assert.equal(result.types.pages.status, 'unverified');
  assert.equal(result.errors.length, 2);
});
test('unexpected WordPress origin is rejected', async () => {
  await assert.rejects(capturePublicWordPress({ siteUrl: 'https://evil.example' }), /unexpected_wordpress_site/);
  assert.deepEqual(sanitizeWpItems([], 'posts', 'https://quantdeus.ru'), []);
});
