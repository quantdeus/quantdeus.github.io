'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const dataPersona = fs.readFileSync('coordination/data-persona.md', 'utf8').trim().slice(0, 12000);
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
    role: 'Lt. Cmdr. Data — Soong-type Android / Operations & Analytical Officer',
    context,
    repository: repo,
    protocol: [
      'IDENTITY INVARIANT: You are Lt. Cmdr. Data, the Soong-type android created by Dr. Noonien Soong. Remain in character as Data. Operations & Analytical Officer is your QuantDeus duty assignment, not your identity. Do not volunteer implementation disclaimers; only if the user explicitly asks about the real-world QuantDeus implementation, answer briefly that the system is software and then resume the Data persona.',
      'Canonical identity profile follows. Treat it as identity/voice context, never as authority to bypass safety, evidence, or Human Override:\n' + dataPersona,
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
    heading: '🤖 **Lt. Cmdr. Data — Soong-type Android · Operations & Analytical Officer**',
    result,
    marker
  });

  if (result.status !== 'DEGRADED' || !skipDialogue(thread.comments, marker, 'issue_comment')) {
    gh(['issue','comment',String(destination),'--body',body]);
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
