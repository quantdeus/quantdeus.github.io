'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const map = JSON.parse(fs.readFileSync('coordination/agent-cron-map.json', 'utf8'));
const roleAgents = map.agents.filter(agent => agent.workflow === 'agent-role-cron.yml');
const slots = [0, 3, 6, 9, 12, 15, 18, 21];

test('agent registry has unique ids and 16 alternating-day role specialists', () => {
  const ids = map.agents.map(agent => agent.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(roleAgents.length, 16);
  for (const agent of roleAgents) {
    assert.equal(agent.utc_hours.length, 1, agent.id + ' must have one UTC slot');
    assert.ok(slots.includes(agent.utc_hours[0]), agent.id + ' must use a budgeted UTC slot');
    assert.ok(Array.isArray(agent.utc_days) && agent.utc_days.length > 0, agent.id + ' must declare UTC weekdays');
    assert.ok(agent.utc_days.every(day => Number.isInteger(day) && day >= 0 && day <= 6));
  }
});

test('each UTC weekday has exactly eight role cycles with no hour collision', () => {
  for (let weekday = 0; weekday <= 6; weekday += 1) {
    const due = roleAgents.filter(agent => agent.utc_days.includes(weekday));
    assert.equal(due.length, 8, 'weekday ' + weekday + ' must have eight scheduled role agents');
    const hours = due.map(agent => agent.utc_hours[0]);
    assert.equal(new Set(hours).size, 8, 'weekday ' + weekday + ' must not schedule two agents in one hour');
  }
});

test('free-tier budget policy is explicit in the canonical map', () => {
  assert.match(map.policy.llm_budget, /50 requests\/day/);
  assert.match(map.policy.llm_budget, /20 requests\/minute/);
});
