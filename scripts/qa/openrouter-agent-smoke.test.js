'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {markerMatches} = require('../openrouter-agent-smoke');

test('strict marker and harmless formatting variants are accepted', () => {
  for (const answer of ['QD_AGENT_SMOKE_OK', '"QD_AGENT_SMOKE_OK"', '\x60QD_AGENT_SMOKE_OK\x60', 'QD_AGENT_SMOKE_OK.']) {
    assert.equal(markerMatches(answer), true, answer);
  }
});
test('verbose, empty and unrelated text are not mislabeled as compliant', () => {
  for (const answer of ['sure: QD_AGENT_SMOKE_OK', 'Hello there', '', 'QD_AGENT_SMOKE_OK but more']) {
    assert.equal(markerMatches(answer), false, answer);
  }
});
