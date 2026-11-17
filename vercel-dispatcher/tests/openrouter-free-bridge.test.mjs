import test from 'node:test';
import assert from 'node:assert/strict';
import {freeOnlyBridge} from '../lib/openrouter-free-bridge.js';

const claims = {
  repository: 'quantdeus/quantdeus.github.io',
  ref:'refs/heads/main',
  workflow_ref:'quantdeus/quantdeus.github.io/.github/workflows/agent-role-cron.yml@refs/heads/main'
};
const key = 'sk-or-v1-test-secret-safe-value';
test('main signed workflow can select the pinned free tool-capable Gemma model', () => {
  assert.deepEqual(freeOnlyBridge({headers:{
    'x-quantdeus-openrouter-only':'true',
    'x-quantdeus-openrouter-key':key
  }},claims), {enabled:true,key,model:'google/gemma-4-26b-a4b-it:free'});
});
test('no opt-in means no credential admitted', () => {
  assert.deepEqual(freeOnlyBridge({headers:{}},claims), {enabled:false,key:''});
  assert.throws(()=>freeOnlyBridge({headers:{'x-quantdeus-openrouter-key':key}},claims),/unexpected_credential/);
});
test('wrong ref, workflow, source and absent key fail closed', () => {
  const headers={'x-quantdeus-openrouter-only':'true','x-quantdeus-openrouter-key':key};
  assert.throws(()=>freeOnlyBridge({headers},{...claims,ref:'refs/pull/3/merge'}),/requires_main/);
  assert.throws(()=>freeOnlyBridge({headers},{...claims,workflow_ref:'some-untrusted.yml'}),/requires_main/);
  assert.throws(()=>freeOnlyBridge({headers},claims,{vercelInternal:true}),/requires_main/);
  assert.throws(()=>freeOnlyBridge({headers:{'x-quantdeus-openrouter-only':'true'}},claims),/key_missing/);
});
