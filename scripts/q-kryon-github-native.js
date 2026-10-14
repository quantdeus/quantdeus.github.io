#!/usr/bin/env node
'use strict';

/**
 * GitHub-native, read-only evidence scout for Q and Kryon.
 * Performs real GitHub Issue/PR inspection on GitHub-hosted Actions runners.
 * Deterministic analysis only: no LLM inference, no Vercel, no fabricated actions.
 */
const fs = require('node:fs');
const path = require('node:path');

const AGENTS = new Set(['q', 'kryon']);

function safe(value, limit = 180) {
  return String(value == null ? '' : value)
    .replace(/[\r\n\t\u0000-\u001f]/g, ' ')
    .replace(/[<>\x60]/g, '')
    .replace(/[\[\]|]/g, '')
    .replace(/\s+/g, ' ').trim().slice(0, limit);
}

function score(issue, agentId) {
  const labels = (issue.labels || []).map(label => typeof label === 'string' ? label : label.name);
  const terms = (String(issue.title || '') + ' ' + labels.join(' ')).toLowerCase();
  const patterns = agentId === 'q'
    ? [/fail|error|broken|bug|blocked|regression|outage|security|timeout|limit|flaky|risk|паден|ошиб|сбо|блок|лимит|уязв/]
    : [/community|onboard|member|contributor|partner|volunteer|education|coord|culture|conflict|access|good|сообщ|партн|обуч|соглас|участ|добра|гармон/];
  const match = patterns.filter(re => re.test(terms)).length;
  const unassigned = (issue.assignees || []).length === 0 ? 1 : 0;
  return match * 10 + unassigned + (labels.some(label => /ready|priority|block/i.test(label)) ? 2 : 0);
}

function buildReport(agentId, issues, pulls, at = new Date().toISOString()) {
  if (!AGENTS.has(agentId)) throw new Error('Unsupported GitHub-native agent: ' + agentId);
  const openIssues = (issues || []).filter(i => i.state === 'open' && !i.pull_request);
  const openPulls = (pulls || []).filter(p => p.state === 'open');
  const ranked = [...openIssues].sort((a, b) => score(b, agentId) - score(a, agentId) || a.number - b.number);
  const target = ranked[0];
  const heading = agentId === 'q' ? 'Q — Anomaly & Possibility' : 'Крайон — Harmony & Long Horizon';
  const out = [
    '# ' + heading + ' | GitHub-native evidence scan',
    '',
    '- Agent: ' + agentId,
    '- Timestamp (UTC): ' + safe(at, 50),
    '- Engine: GitHub Actions + GitHub REST API, deterministic read-only analysis',
    '- LLM response: **not executed**; this is a genuine repository evidence scan, not an OpenClaw simulation',
    '- Source: canonical GitHub repository (first 100 recently updated Issues and PRs)',
    '- Visible: ' + openIssues.length + ' open Issues, ' + openPulls.length + ' open PRs',
    '- Changes performed: **none** (human review required)',
    ''
  ];
  if (!target) {
    out.push('## Observation', 'No open GitHub Issues were returned. No recommendation is invented.', '');
    return { agent_id: agentId, issue_number: null, issues_seen: openIssues.length, pulls_seen: openPulls.length, markdown: out.join('\n') + '\n' };
  }
  const issueUrl = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues\/\d+$/.test(String(target.html_url || ''))
    ? target.html_url : 'https://github.com/' + process.env.GITHUB_REPOSITORY + '/issues/' + target.number;
  const labels = (target.labels || []).map(l => safe(typeof l === 'string' ? l : l.name, 60));
  const owners = (target.assignees || []).map(a => safe(a.login, 60));
  const associated = openPulls.filter(p => String(p.title || '').match(new RegExp('(?:^|\\W)#?' + target.number + '(?:\\W|$)'))).slice(0, 3);
  out.push('## Selected evidence', '- Issue: [#' + target.number + ' — ' + safe(target.title) + '](' + issueUrl + ')',
    '- Labels: ' + (labels.join(', ') || 'none'), '- Assigned owners: ' + (owners.join(', ') || 'none visible'),
    '- Open PR titles mentioning this issue number: ' + (associated.length ? associated.map(p => '#' + p.number).join(', ') : 'none found; title scan only'),
    '- Ranking: explicit keyword/label heuristic; priority is a suggestion, not a verified diagnosis', '');
  if (agentId === 'q') {
    out.push('## Counterfactual review — hypotheses, not findings',
      '1. **Baseline:** current issue approach may be sufficient; first examine acceptance criteria and existing tests.',
      '2. **Alternative:** a smaller reversible proof-of-concept or isolation test might identify a bottleneck sooner.',
      '3. **Failure case:** changing the wrong subsystem could introduce regressions; require independent QA and an exit path.',
      '',
      '## Falsifier and next reversible experiment',
      'Check whether the issue has reproducible steps and an active owner/PR. If not, add a proposed reproduction checklist for human review; if yes, run the existing QA test suite before proposing a change.',
      'Stop on unverified assumptions, security-sensitive changes, or missing evidence.',
      '');
  } else {
    out.push('## Alignment review — actual motivations unknown',
      '- Shared purpose to confirm: one useful, voluntary improvement of the linked task.',
      '- Stakeholders visible in data: ' + (owners.length ? owners.join(', ') : 'no assigned owner; do not infer private preferences'),
      '- Option A: ask for opt-in ownership/requirements clarification through the existing issue.',
      '- Option B: propose one small, accessible contribution with acceptance criteria and an explicit opt-out.',
      '- Consent / EXIT: do not assign, message, or promise on anyone’s behalf.',
      '- Measure: one explicit accepted owner/criterion, not engagement or speculative sentiment.',
      '');
  }
  out.push('## Approval boundary', 'No automatic Issue comments, outreach, production changes, spending, or PR merges. Human owner chooses any follow-up.', '');
  return { agent_id: agentId, issue_number: target.number, issues_seen: openIssues.length, pulls_seen: openPulls.length, markdown: out.join('\n') + '\n' };
}

async function githubGet(token, repo, suffix) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) throw Error('Invalid GitHub repo selector');
  const resp = await fetch('https://api.github.com/repos/' + repo + '/' + suffix, {
    headers: { authorization: 'Bearer ' + token, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' },
    signal: AbortSignal.timeout(15000)
  });
  if (!resp.ok) throw new Error('GitHub evidence read failed HTTP ' + resp.status + ' ' + suffix);
  const data = await resp.json();
  if (!Array.isArray(data)) throw new Error('Unexpected GitHub API evidence shape');
  return data;
}

async function main() {
  const token = String(process.env.GITHUB_TOKEN || '').trim();
  const repo = String(process.env.GITHUB_REPOSITORY || '').trim();
  if (!token) throw new Error('GITHUB_TOKEN missing: cannot claim a live evidence scan');
  if (repo !== 'quantdeus/quantdeus.github.io') throw new Error('Evidence scan must use canonical repo');
  const requested = String(process.env.AGENT_ID || '').trim();
  const event = String(process.env.GITHUB_EVENT_NAME || '');
  const schedule = String(process.env.GITHUB_SCHEDULE || '');
  let selected;
  if (event === 'schedule') {
    if (schedule === '23 16 * * *') selected = ['q'];
    else if (schedule === '23 17 * * *') selected = ['kryon'];
    else throw new Error('Unknown native schedule: ' + schedule);
  } else if (requested === 'q' || requested === 'kryon') selected = [requested];
  else if (requested === 'both' || (!requested && event === 'push')) selected = ['q','kryon'];
  else throw new Error('Unsupported agent selection: ' + requested);
  const [issues, pulls] = await Promise.all([
    githubGet(token,repo,'issues?state=open&sort=updated&direction=desc&per_page=100'),
    githubGet(token,repo,'pulls?state=open&sort=updated&direction=desc&per_page=100')
  ]);
  const dir=path.join(process.cwd(),'artifacts','native-agent-evidence');
  fs.mkdirSync(dir,{recursive:true});
  const stamp=new Date().toISOString();
  for (const id of selected) {
    const report = buildReport(id,issues,pulls,stamp);
    const file=path.join(dir,id+'.md');
    fs.writeFileSync(file,report.markdown);
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,report.markdown+'\n');
    console.log(JSON.stringify({ ok: true, mode:'github-native-readonly', llm_executed:false,
      agent:id,issue_number:report.issue_number,issues_seen:report.issues_seen,pulls_seen:report.pulls_seen,
      artifact:file }));
  }
}

if (require.main === module) main().catch(e=>{console.error(e.stack||e);process.exit(1);});
module.exports = { buildReport, score };
