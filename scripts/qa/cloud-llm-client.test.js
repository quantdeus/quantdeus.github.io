'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const llm = require('../cloud-llm-client');

const free = {OPENROUTER_API_KEY:'sk-or-v1-test-secret', OPENROUTER_MODEL:'openrouter/free'};

function response(status, data) {
  return {ok: status >= 200 && status < 300, status, async json(){return data;}};
}

test('paid model request is forced to free route, even if a key has credits', async () => {
  const env = {...free, OPENROUTER_MODEL:'openai/gpt-5.1'};
  let request;
  const result = await llm.ask([{role:'user',content:'smoke'}], {
    env,
    fetchImpl:async (url, opts) => {
      request = {url, ...opts, payload:JSON.parse(opts.body)};
      return response(200,{model:'openrouter/free',choices:[{message:{content:'QD_OK'}}]});
    }
  });
  assert.equal(request.payload.model, 'openrouter/free');
  assert.equal(request.url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(result.text, 'QD_OK');
  assert.equal(result.transport, 'direct');
});

test('explicit :free model is preserved', () => {
  assert.equal(llm.route({...free, OPENROUTER_MODEL:'google/gemma-4-31b-it:free'}).model, 'google/gemma-4-31b-it:free');
  assert.equal(llm.route({...free, OPENROUTER_MODEL:'openrouter/auto'}).model, 'openrouter/free');
});

test('Cloudflare requires three environment settings; provider key is never put in client code', async () => {
  const env = {
    ...free,
    CLOUDFLARE_ACCOUNT_ID:'account-123',
    CLOUDFLARE_AI_GATEWAY_ID:'quantdeus-openrouter',
    CLOUDFLARE_AI_GATEWAY_TOKEN:'cf-secret'
  };
  let captured;
  const out = await llm.ask([{role:'user',content:'test'}], {
    env,
    fetchImpl:async (url,opts) => {
      captured = {url,headers:opts.headers};
      return response(200,{choices:[{message:{content:'OK'}}]});
    }
  });
  assert.equal(captured.url,
    'https://gateway.ai.cloudflare.com/v1/account-123/quantdeus-openrouter/openrouter/v1/chat/completions');
  assert.equal(captured.headers.authorization, 'Bearer sk-or-v1-test-secret');
  assert.equal(captured.headers['cf-aig-authorization'],'Bearer cf-secret');
  assert.equal(out.transport,'cloudflare-ai-gateway');
  assert.equal(llm.route({...env,CLOUDFLARE_AI_GATEWAY_TOKEN:''}).viaGateway,false);
});

test('rate limit fails closed after exactly one request; no paid fallback', async () => {
  let count = 0;
  await assert.rejects(
    llm.ask([{role:'user',content:'hello'}], {
      env:free,
      fetchImpl:async () => {count++;return response(429,{error:'rate limit'});}
    }),
    error => error.status === 429 && error.message === 'OPENROUTER_FREE_QUOTA_EXHAUSTED_OR_RATE_LIMITED'
  );
  assert.equal(count,1);
});

test('payment required fails closed', async () => {
  await assert.rejects(llm.ask([{role:'user',content:'hello'}], {
    env:free,fetchImpl:async () => response(402,{error:'payment required'})
  }), error => error.status === 402 && error.message === 'OPENROUTER_HTTP_402');
});

test('missing secret and tool role are rejected before network', async () => {
  assert.equal(llm.configured({}),false);
  await assert.rejects(llm.ask([{role:'user',content:'hello'}],{env:{}}),/API_KEY_REQUIRED/);
  await assert.rejects(llm.ask([{role:'tool',content:'secret'}],{env:free}),/UNSUPPORTED_ROLE/);
});
