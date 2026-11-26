'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fixture = require('./scenarios/two-shores.json');
const {assess, validate, graph, renderMarkdown} = require('./peacelab.js');
const clone = () => JSON.parse(JSON.stringify(fixture));

test('fictional case produces 3 dialogue candidates and 1 blocked proposal', () => {
  const r = assess(clone());
  assert.equal(r.scope, 'fictional_training_only');
  assert.equal(r.options.filter(x => x.decision === 'candidate_for_dialogue').length, 3);
  assert.equal(r.options.filter(x => x.decision === 'blocked_rights').length, 1);
  assert.equal(r.options.find(x=>x.id==='shutdown').blocked_rights.includes('access_to_essentials'), true);
});
test('dialogue is never confused with consent', () => {
  const r = assess(clone());
  assert.equal(r.options.find(x => x.id === 'pilot').consent_pending, true);
  assert.equal(r.options.find(x => x.id === 'pilot').consent_status, 'not_obtained');
});
test('unknown rights status cannot silently pass', () => {
  const s = clone(); delete s.options[0].rights.non_discrimination;
  const o = assess(s).options[0];
  assert.equal(o.decision, 'needs_review');
  assert.deepEqual(o.unresolved_rights, ['non_discrimination']);
});
test('missing stakeholder representation calls for review', () => {
  const s = clone(); s.options[1].stakeholders.pop();
  const o = assess(s).options[1];
  assert.equal(o.decision, 'needs_review');
  assert.deepEqual(o.missing_stakeholders, ['residents']);
});
test('all real-world scenarios rejected at entry', () => {
  const s=clone();s.fictional=false;
  assert.throws(()=>validate(s), /only explicitly fictional/);
});
test('graph cannot refer to nonexistent nodes', () => {
  const s=clone();s.edges[0].to='nonexistent';
  assert.throws(()=>validate(s), /orphan edge/);
});
test('causal conjecture cannot be relabeled as proven', () => {
  const s=clone();s.edges[1].epistemic_status='observed';
  assert.throws(()=>validate(s), /causal conjecture/);
});
test('synthetic facts cannot masquerade as external sources', () => {
  const s=clone();s.facts[0].source='anonymous';
  assert.throws(()=>validate(s), /synthetic-fixture attribution/);
});
test('hypotheses must have falsifiers', () => {
  const s=clone();delete s.hypotheses[0].falsifier;
  assert.throws(()=>validate(s), /falsifiable alternatives/);
});
test('visual and accessible alternatives include same edges', () => {
  const s=clone();const r=assess(s);
  assert.equal(r.edge_list.length,s.edges.length);
  assert.ok(graph(s).startsWith('flowchart LR'));
  const md=renderMarkdown(r);
  assert.ok(md.includes('mermaid'));
  for (const e of s.edges) assert.ok(md.includes(e.from+' —'+e.relation+'→ '+e.to));
});
test('no numeric merit score is invented', () => {
  const r=assess(clone());
  assert.equal(Object.hasOwn(r.options[0], 'score'), false);
  assert.ok(r.uncertainties.length>=2);
});
