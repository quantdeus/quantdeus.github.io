'use strict';

// Execute the real CLI in an isolated VM. Every GitHub request and output write is mocked.
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'scripts/publish-agent-issue.js'), 'utf8');
const registry = {
  agents: [
    { id: 'unity', operational_status: 'medbay', temporary_delegate: 'herald' },
    { id: 'synthesis', operational_status: 'medbay', temporary_delegate: 'archivist' },
    { id: 'qa-syntax', operational_status: 'medbay', temporary_delegate: 'qa-repair' },
    { id: 'qa-contract', operational_status: 'medbay', temporary_delegate: 'qa-repair' },
    { id: 'herald', operational_status: 'active' },
    { id: 'archivist', operational_status: 'active' },
    { id: 'qa-repair', operational_status: 'active' },
    { id: 'tasksmith' }
  ]
};
const states = ['coord:blocked', 'coord:active', 'coord:ready', 'coord:stale', 'coord:done'];
const extras = Array.from({ length: 12 }, (_, i) => 'extra:' + i);
const available = ['coord:task', ...states, ...registry.agents.map(a => 'agent:' + a.id), ...extras];

async function publish(overrides = {}, options = {}) {
  const proposal = {
    title: 'Repair publisher coordination contracts',
    body: 'Implement the bounded repair and verify its acceptance criteria.',
    target_agent: 'tasksmith',
    labels: [],
    ...overrides
  };
  const requests = [];
  const errors = [];
  const outputs = [];
  let created;
  const sandbox = {
    Buffer,
    require(name) {
      assert.equal(name, 'fs');
      return {
        readFileSync(file) {
          assert.equal(file, 'coordination/agents.json');
          return JSON.stringify(options.registry || registry);
        },
        appendFileSync(file, value) { outputs.push(value); }
      };
    },
    process: {
      env: {
        GITHUB_REPOSITORY: 'quantdeus/quantdeus.github.io',
        GITHUB_TOKEN: 'mock-token',
        ISSUE_PROPOSAL_B64: Buffer.from(JSON.stringify(proposal)).toString('base64'),
        GITHUB_OUTPUT: '/mock/output'
      },
      exit(code) { throw new Error('publisher exit ' + code); }
    },
    console: {
      log() {},
      error(value) { errors.push(String(value)); }
    },
    async fetch(url, init = {}) {
      requests.push({ url, method: init.method || 'GET' });
      let data;
      if (url.includes('/labels?')) {
        data = (options.available || available).map(name => ({ name }));
      } else if (url.includes('/issues?state=open')) {
        data = options.openRows || [];
      } else if (init.method === 'POST' && url.endsWith('/issues')) {
        assert.equal(created, undefined, 'at most one POST');
        created = JSON.parse(init.body);
        data = { number: 42, html_url: 'https://github.com/mock/issues/42' };
      } else if (url.endsWith('/issues/42')) {
        data = { ...created, number: 42, html_url: 'https://github.com/mock/issues/42', state: 'open' };
      } else {
        throw new Error('Unexpected mocked request: ' + url);
      }
      return { ok: true, status: 200, text: async () => JSON.stringify(data) };
    }
  };
  try {
    await vm.runInNewContext(source, sandbox, { filename: 'publish-agent-issue.js', timeout: 1000 });
  } catch (error) {
    return { created, requests, errors, outputs, error };
  }
  return { created, requests, errors, outputs };
}

async function run() {
  let count = 0;
  function success(result) {
    assert.equal(result.error, undefined, result.errors.join('\n'));
    assert.ok(result.created);
    assert.equal(result.requests.filter(r => r.method === 'POST').length, 1);
    assert.ok(result.requests.some(r => r.url.endsWith('/issues/42')));
    assert.ok(result.outputs.includes('issue_status=created\n'));
    count++;
    return result.created;
  }
  for (const [owner, delegate] of [
    ['unity', 'herald'], ['synthesis', 'archivist'],
    ['qa-syntax', 'qa-repair'], ['qa-contract', 'qa-repair']
  ]) {
    const issue = success(await publish({ target_agent: owner, labels: ['agent:' + owner, 'agent:tasksmith'] }));
    assert.deepEqual(issue.labels, ['coord:task', 'coord:ready', 'agent:' + delegate]);
    assert.ok(issue.body.includes('<!-- quantdeus-target-agent:' + delegate + ' -->'));
    assert.ok(!issue.body.includes('<!-- quantdeus-target-agent:' + owner + ' -->'));
    assert.ok(issue.body.includes('Delegated from medbay owner: ' + owner));
  }

  const crowded = success(await publish({ labels: [...extras, 'extra:0', 'coord:task', 'agent:herald'] }));
  assert.deepEqual(crowded.labels, ['coord:task', 'coord:ready', 'agent:tasksmith', ...extras.slice(0, 5)]);
  assert.equal(new Set(crowded.labels).size, 8);

  const blocked = success(await publish({ labels: [...extras, 'coord:blocked', 'coord:ready'] }));
  assert.deepEqual(blocked.labels.slice(0, 3), ['coord:task', 'coord:blocked', 'agent:tasksmith']);
  assert.ok(!blocked.labels.includes('coord:ready'));
  assert.equal(blocked.labels.length, 8);

  const normal = success(await publish());
  assert.deepEqual(normal.labels, ['coord:task', 'coord:ready', 'agent:tasksmith']);
  assert.ok(!normal.body.includes('Delegated from medbay owner:'));
  for (let i = 0; i < states.length; i++) {
    const issue = success(await publish({ labels: states.slice(i).reverse() }));
    assert.deepEqual(issue.labels.filter(l => states.includes(l)), [states[i]]);
  }
  const untargeted = success(await publish({ target_agent: '', labels: ['agent:herald'] }));
  assert.deepEqual(untargeted.labels, ['coord:task', 'coord:ready']);
  assert.ok(!untargeted.body.includes('quantdeus-target-agent:'));

  for (const delegate of [undefined, 'missing', 'unity', 'synthesis']) {
    const broken = JSON.parse(JSON.stringify(registry));
    broken.agents[0].temporary_delegate = delegate;
    const result = await publish({ target_agent: 'unity' }, { registry: broken });
    assert.ok(result.error);
    assert.ok(result.errors.join('\n').includes('Medbay target has no valid active temporary_delegate'));
    assert.equal(result.requests.length, 0);
    count++;
  }
  const unknown = await publish({ target_agent: 'missing' });
  assert.ok(unknown.error);
  assert.equal(unknown.requests.length, 0);
  count++;

  for (const missing of ['coord:task', 'coord:ready', 'agent:tasksmith', 'coord:blocked']) {
    const result = await publish({ labels: missing === 'coord:blocked' ? ['coord:blocked'] : [] },
      { available: available.filter(l => l !== missing) });
    assert.ok(result.error);
    assert.ok(result.errors.join('\n').includes('Required coordination label unavailable: ' + missing));
    assert.equal(result.requests.filter(r => r.method === 'POST').length, 0);
    count++;
  }

  const duplicate = await publish({}, { openRows: [{
    number: 7, title: 'REPAIR publisher coordination contracts!',
    html_url: 'https://github.com/mock/issues/7'
  }] });
  assert.equal(duplicate.error, undefined);
  assert.equal(duplicate.created, undefined);
  assert.equal(duplicate.requests.filter(r => r.method === 'POST').length, 0);
  assert.ok(duplicate.outputs.includes('issue_status=duplicate\n'));
  count++;
  console.log('Publisher mock contracts passed: ' + count);
}
run().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
