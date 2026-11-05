import test from 'node:test';
import assert from 'node:assert/strict';
import { createFederationHandler } from '../src/index.mjs';

const bound = ok => ({ fetch: async request => {
  assert.equal(request.method, 'GET');
  return new Response(JSON.stringify({ secret: "NEVER-EXPOSE" }), { status: ok ? 200 : 503, headers: { 'content-type': 'application/json' } });
}});
const fetcher = async request => {
  assert.equal(request.method, 'GET');
  assert.match(request.url, /^https:\/\/quantdeus\.ru\/wp-json\/wp\/v2\/posts\?/);
  return new Response(JSON.stringify([{id: 1, privateData: "NEVER-EXPOSE"}]), { status: 200, headers: { 'content-type': 'application/json' } });
};

test('health is bounded and read only', async () => {
  const handler = createFederationHandler({fetcher});
  const response = await handler(new Request('https://example.com/health'), {});
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.mode, 'read_only');
});
test('status probes existing Cloudflare service bindings and published WP metadata', async () => {
  const handler = createFederationHandler({fetcher});
  const response = await handler(new Request('https://example.com/api/federation/status'), {SEVEN:bound(true), METAVERSE:bound(true)});
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.components.seven.responding, true);
  assert.equal(body.components.metaverse.responding, true);
  assert.equal(body.components.wordpress.responding, true);
  assert.equal(body.qdrp.production_write, false);
  assert.equal(JSON.stringify(body).includes('NEVER-EXPOSE'), false);
});
test('degraded dependencies fail softly and never claim connectivity', async () => {
  const handler = createFederationHandler({fetcher:async () => {throw Error('network-down')}});
  const response = await handler(new Request('https://example.com/api/federation/status'), {});
  const body = await response.json();
  assert.equal(body.components.seven.responding, false);
  assert.equal(body.components.metaverse.responding, false);
  assert.equal(body.components.wordpress.responding, false);
});
test('all write methods and unspecified paths are denied', async () => {
  const handler = createFederationHandler({fetcher});
  for(const method of ['POST','PUT','PATCH','DELETE']){
    const r=await handler(new Request('https://example.com/api/federation/status',{method}),{});
    assert.equal(r.status,405);
  }
  assert.equal((await handler(new Request('https://example.com/admin'),{})).status,404);
});

test('Jetpack public API fallback restores WordPress health when origin is unreachable', async () => {
  const visited=[];
  const fetcher = async request => {
    visited.push(request.url);
    if (request.url.startsWith('https://quantdeus.ru/')) throw new Error('origin_timeout');
    assert.match(request.url, /public-api\.wordpress\.com\/rest\/v1\.1\/sites\/quantdeus\.ru/);
    return new Response(JSON.stringify({posts:[{ID:209, URL:'https://quantdeus.ru/posts'}],secret:'NOT-TO-RETURN'}), {
      status:200,headers:{'content-type':'application/json'}
    });
  };
  const h=createFederationHandler({fetcher});
  const response=await h(new Request('https://example.com/api/federation/status'),{SEVEN:bound(true),METAVERSE:bound(true)});
  const body=await response.json();
  assert.equal(body.components.wordpress.responding,true);
  assert.equal(body.components.wordpress.route,'jetpack_public_api');
  assert.equal(visited.length,2);
  assert.equal(JSON.stringify(body).includes('NOT-TO-RETURN'),false);
});
