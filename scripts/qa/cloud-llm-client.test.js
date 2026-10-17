'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cloudRoutes, knownAgent, askCloud, healthSnapshot } = require('../cloud-llm-client');

test('all 29 registered QuantDeus agents have cloud text identities', () => {
  const agents = require('../../coordination/agents.json').agents;
  assert.equal(agents.length, 29);
  for (const agent of agents) assert.equal(knownAgent(agent.id)?.id, agent.id);
});

test('without an API key no provider is silently assumed healthy', () => {
  assert.deepEqual(cloudRoutes({}), []);
});

test('only free OpenRouter model is admitted even with a paid model override', () => {
  const rows = cloudRoutes({ OPENROUTER_API_KEY: 'test-secret', QD_LLM_MODEL: 'some-paid-model' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].model, 'openrouter/free');
});

test('agent response is a real successful API model turn, without tools', async () => {
  let body;
  const result = await askCloud({
    profile: 'seven-of-nine',
    messages: [{role:'user',content:'Проверка соединения'}],
    env: { OPENROUTER_API_KEY:'test-secret' },
    fetchImpl: async (_url, options) => {
      body = JSON.parse(options.body);
      return {ok:true, json:async () => ({choices:[{message:{content:'Связь установлена'}}]})};
    }
  });
  assert.equal(result.text, 'Связь установлена');
  assert.equal(result.runtime, 'github-actions-cloud-no-tools');
  assert.equal(result.toolSummary.executed, 0);
  assert.match(body.messages[0].content, /seven-of-nine/);
  assert.equal(body.model, 'openrouter/free');
});

test('HTTP refusal is not reported as a healthy model turn', async () => {
  await assert.rejects(
    askCloud({
      profile:'emh',
      messages:[{role:'user',content:'test'}],
      env:{OPENROUTER_API_KEY:'test-secret'},
      fetchImpl: async()=>({ok:false,status:429})
    }), /cloud_llm_http_429/
  );
});

test('configured API is unverified before any real turn', () => {
  const route = cloudRoutes({OPENROUTER_API_KEY:'unproven-provider-key'})[0];
  assert.equal(healthSnapshot(route).status, 'unverified');
  assert.equal(healthSnapshot(route).healthy, false);
});

test('real provider reply alone certifies route health', async () => {
  const key = 'live-evidence-key';
  const route = cloudRoutes({OPENROUTER_API_KEY:key})[0];
  assert.equal(healthSnapshot(route).verified, false);
  const result = await askCloud({
    profile:'tuvok',
    messages:[{role:'user',content:'Ping'}],
    env:{OPENROUTER_API_KEY:key},
    fetchImpl:async()=>({
      ok:true,
      json:async()=>({model:'verified-free-upstream',choices:[{message:{content:'Pong'}}]})
    })
  });
  assert.equal(result.health.verified, true);
  assert.equal(result.model, 'verified-free-upstream');
  assert.equal(healthSnapshot(route).status, 'healthy');
});

test('dead, unauthorized or exhausted APIs are quarantined without retry loops', async () => {
  for (const status of [401, 404, 410, 429]) {
    const key='blocked-provider-key-'+status;
    let calls=0;
    const args={
      profile:'emh',
      messages:[{role:'user',content:'Ping'}],
      env:{OPENROUTER_API_KEY:key},
      fetchImpl:async()=>{calls++;return {ok:false,status};}
    };
    await assert.rejects(askCloud(args), new RegExp('cloud_llm_http_'+status));
    const route=cloudRoutes(args.env)[0];
    assert.equal(healthSnapshot(route).healthy,false);
    assert.ok(healthSnapshot(route).retry_after_ms>0);
    await assert.rejects(askCloud(args),/cloud_llm_route_quarantined/);
    assert.equal(calls,1);
  }
});

test('empty 200 response does not falsely certify a working API', async () => {
  const key='empty-response-test-key';
  await assert.rejects(askCloud({
    profile:'data',messages:[{role:'user',content:'Ping'}],
    env:{OPENROUTER_API_KEY:key},
    fetchImpl:async()=>({ok:true,json:async()=>({choices:[{message:{content:''}}]})})
  }),/cloud_llm_empty_response/);
  assert.equal(healthSnapshot(cloudRoutes({OPENROUTER_API_KEY:key})[0]).healthy,false);
});
