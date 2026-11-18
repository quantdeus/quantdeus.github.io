import test from 'node:test';
import assert from 'node:assert/strict';
import {
  selectReadyFastRoutes,
  markFastRouteFailure,
  nextFastRouteRetrySeconds
} from '../lib/fast-chat-route-health.js';

test('fast chat uses distinct healthy routes, not just two and not duplicates', () => {
  const refs = ['test-a', 'test-b', 'test-c', 'test-d', 'test-e'];
  const candidates = refs.map(ref => ({ ref }));
  assert.deepEqual(selectReadyFastRoutes(refs, candidates, { now: 1000 }).map(x => x.ref), refs.slice(0, 4));
  assert.deepEqual(selectReadyFastRoutes(['test-a', 'test-a', 'missing'], candidates, { now: 1000 }).map(x => x.ref), ['test-a']);
});

test('429 cools down one provider without blocking other candidates', () => {
  const refs = ['test-rate-limited', 'test-alternative'];
  const candidates = refs.map(ref => ({ ref }));
  assert.equal(markFastRouteFailure('test-rate-limited', 429, '30', { now: 1000 }), 30);
  assert.deepEqual(selectReadyFastRoutes(refs, candidates, { now: 1001 }).map(x => x.ref), ['test-alternative']);
  assert.equal(nextFastRouteRetrySeconds(['test-rate-limited'], { now: 1001 }), 30);
  assert.deepEqual(selectReadyFastRoutes(refs, candidates, { now: 31001 }).map(x => x.ref), refs);
});

test('HTTP 200 with empty content is a temporary failure, success must not be marked', () => {
  const refs = ['test-empty', 'test-good'];
  const candidates = refs.map(ref => ({ ref }));
  assert.equal(markFastRouteFailure('test-empty', 200, null, { now: 1000 }), 12);
  assert.deepEqual(selectReadyFastRoutes(refs, candidates, { now: 1001 }).map(x => x.ref), ['test-good']);
  assert.deepEqual(selectReadyFastRoutes(refs, candidates, { now: 13001 }).map(x => x.ref), refs);
  assert.equal(markFastRouteFailure('test-good', 204, null, { now: 1000 }), 0);
});
