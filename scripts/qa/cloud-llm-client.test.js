'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cloudRoutes, knownAgent, askCloud } = require('../cloud-llm-client');

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
