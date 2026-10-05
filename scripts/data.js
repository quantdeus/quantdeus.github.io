'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const { issueContext, digest: stateDigest, skipDialogue } = require('./dialogue-state');
const { reasonRole, renderRole } = require('./openclaw-role-dialogue');

const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
const hubIssue = Number(process.env.QUANTDEUS_COORDINATION_HUB_ISSUE || 9);
if (!repo || !token) process.exit(1);

const env = { ...process.env, GH_TOKEN: token };
const gh = a => execFileSync('gh', a, { encoding: 'utf8', env, stdio: ['ignore','pipe','pipe'] }).trim();
const j = a => { const s = gh(a); return s ? JSON.parse(s) : null; };
const labels = i => (i.labels || []).map(x => typeof x === 'string' ? x : x.name);
const targetAgent = i =>
  labels(i).find(x => x.startsWith('agent:'))?.slice(6) ||
  String(i.body || '').match(/quantdeus-target-agent:([a-z0-9-]+)/i)?.[1] ||
  '';

(async () => {
  const issues = j(['issue','list','--state','open','--limit','200','--json','number,title,body,labels,updatedAt']) || [];
  const explicit = issues.filter(i => targetAgent(i) === 'data' && labels(i).includes('coord:task'));
  const target = explicit.find(i => !labels(i).includes('coord:blocked')) || explicit[0];

  if (!target) {
    console.log('Data: no assigned analytical case.');
    return;
  }

  const destination = targetAgent(target) === 'data' ? target.number : hubIssue;
  const context = { issue: issueContext(target) };
  const digest = stateDigest(context);
  const marker = '<!-- qd-data-digest:' + digest + ' -->';
  const thread = j(['issue','view',String(destination),'--json','comments']);
  if (skipDialogue(thread.comments, marker)) return;

  const result = await reasonRole({
    profile: 'data',
    role: 'Lt. Cmdr. Data — Operations & Analytical Officer',
    context,
    repository: repo,
    protocol: [
      'Separate OBSERVED facts, derived calculations, INFERENCES and unknowns.',
      'Check quantities, units, timelines, dependencies and internal contradictions before recommending action.',
      'Prefer explicit calculations or structured comparisons when they improve verification.',
      'Triangulate evidence and state confidence; do not turn plausibility into certainty.',
      'Do not override Seven operational priority, Sherlock scientific investigation, Tuvok epistemic review or human authority.',
      'Conclude with one smallest reversible evidence-backed next test, or a justified no-op.'
    ].join(' ')
  });

  fs.writeFileSync('/tmp/quantdeus-data-reasoning.json', JSON.stringify({ context, result }, null, 2));
  const body = renderRole({
    heading: '🤖 **Lt. Cmdr. Data — OpenClaw Operations & Analytical Officer**',
    result,
    marker
  });

  if (result.status !== 'DEGRADED' || !skipDialogue(thread.comments, marker, 'issue_comment')) {
    gh(['issue','comment',String(destination),'--body',body]);
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
