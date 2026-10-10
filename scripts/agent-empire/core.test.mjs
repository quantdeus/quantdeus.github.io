import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { enumerateVirtualAgents, planSwarm, requestedSlots, validateConfig, forbidSideEffects } from './core.mjs';
import { probeEndpoint, probeAll, ALLOWED_READS } from './probe.mjs';

const config = JSON.parse(readFileSync('coordination/agent-empire/mesh.json', 'utf8'));

test('10,000 deterministic virtual identities; equal lane distribution; 100 bounded batches', () => {
  validateConfig(config);
  const agents = [...enumerateVirtualAgents(config)];
  assert.equal(agents.length, 10000);
  assert.equal(new Set(agents.map(a => a.id)).size, 10000);
  assert.equal(agents[0].id, 'qd-virtual-00001');
  assert.equal(agents.at(-1).id, 'qd-virtual-10000');
  assert.ok(agents.every(a => a.mode === 'planned-only' && a.model_session === null && a.social_account === null));
  const plan = planSwarm(config);
  assert.equal(plan.status, 'offline-plan-only');
  assert.equal(plan.batch_count, 100);
  assert.equal(plan.virtual_agent_slots, 10000);
  assert.deepEqual(Object.values(plan.counts_by_lane), Array(10).fill(1000));
  assert.equal(plan.real_model_sessions_started, 0);
  assert.equal(plan.external_posts_sent, 0);
  assert.equal(plan.incremental_model_spend_rub, 0);
});

test('reject invalid or extravagant requested slot counts', () => {
  for (const invalid of [0, -1, 10001, 2.5, 'abc', 'Infinity']) {
    assert.throws(() => requestedSlots(invalid, config));
  }
  assert.equal(planSwarm(config, 11).batch_count, 1);
  assert.equal(planSwarm(config, 101).batch_count, 2);
});

test('reject unsafe configuration and all outbound side effects', () => {
  assert.throws(() => validateConfig({ ...config, paid_model_calls: 'enabled' }));
  assert.throws(() => validateConfig({ ...config, max_real_llm_workers: 1 }));
  assert.throws(() => validateConfig({ ...config, new_spend_rub_limit: 1 }));
  assert.throws(() => validateConfig({ ...config, external_publication: 'enabled' }));
  assert.throws(() => forbidSideEffects('post_message'), /DENY/);
  assert.throws(() => forbidSideEffects('create_account'), /DENY/);
});

test('GET-only allowed public endpoints; never sends credentials or reads untrusted body', async () => {
  let called = 0;
  const mock = async (url, opts) => {
    called += 1;
    assert.ok(ALLOWED_READS.includes(url));
    assert.equal(opts.method, 'GET');
    assert.equal(opts.redirect, 'manual');
    assert.ok(!Object.keys(opts.headers).some(k => /auth|token|cookie/i.test(k)));
    return { status: 200, ok: true, headers: { get: () => 'application/json' }, body: null };
  };
  const answer = await probeEndpoint(config.readonly_probes[0], mock);
  assert.equal(answer.reachable, true);
  assert.equal(answer.mcp_session_started, false);
  assert.equal(called, 1);
  await assert.rejects(() => probeEndpoint({id:'private', url:'http://127.0.0.1/admin'}, mock), /DENY/);
  await assert.rejects(() => probeAll([...config.readonly_probes, config.readonly_probes[0]], mock));
  assert.equal(called, 1);
});

test('public endpoint presence failures are reported, never treated as successful integrations', async () => {
  const results = await probeAll(config.readonly_probes, async () => { throw new Error('simulated network down'); });
  assert.equal(results.length, config.readonly_probes.length);
  assert.ok(results.every(item => item.reachable === false && item.error === 'network-unavailable'));
});
