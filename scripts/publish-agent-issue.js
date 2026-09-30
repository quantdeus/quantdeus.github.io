'use strict';

const fs = require('fs');

const repo = String(process.env.GITHUB_REPOSITORY || '').trim();
const token = String(process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '').trim();
const proposalB64 = String(process.env.ISSUE_PROPOSAL_B64 || '').trim();
const sourceAgent = String(process.env.ISSUE_SOURCE_AGENT || 'unknown').trim();
const sourceWorkflow = String(process.env.ISSUE_SOURCE_WORKFLOW || '').trim();
const outputPath = process.env.GITHUB_OUTPUT || '';

if (repo !== 'quantdeus/quantdeus.github.io') throw new Error('Unexpected repository: ' + repo);
if (!token) throw new Error('GITHUB_TOKEN is required');
if (!proposalB64) throw new Error('ISSUE_PROPOSAL_B64 is required');

function out(name, value) {
  if (!outputPath) return;
  fs.appendFileSync(outputPath, name + '=' + String(value).replace(/\r?\n/g, ' ') + '\n');
}

function normalizeTitle(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function github(path, options = {}) {
  const response = await fetch('https://api.github.com' + path, {
    ...options,
    headers: {
      authorization: 'Bearer ' + token,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'content-type': 'application/json',
      ...(options.headers || {})
    }
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch {}
  if (!response.ok) throw new Error('GitHub ' + response.status + ': ' + raw.slice(0, 1000));
  return data;
}

async function listAll(path, maxPages = 3) {
  const rows = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const joiner = path.includes('?') ? '&' : '?';
    const batch = await github(path + joiner + 'per_page=100&page=' + page);
    if (!Array.isArray(batch)) throw new Error('Expected GitHub array for ' + path);
    rows.push(...batch);
    if (batch.length < 100) break;
  }
  return rows;
}

(async () => {
  let proposal;
  try {
    proposal = JSON.parse(Buffer.from(proposalB64, 'base64').toString('utf8'));
  } catch {
    throw new Error('Issue proposal is not valid base64 JSON');
  }

  const title = String(proposal.title || '').trim().replace(/\s+/g, ' ');
  const body = String(proposal.body || '').trim();
  const targetAgent = String(proposal.target_agent || '').trim();

  if (title.length < 8 || title.length > 120) throw new Error('Issue title length outside 8..120');
  if (body.length < 30 || body.length > 20000) throw new Error('Issue body length outside 30..20000');

  const registry = JSON.parse(fs.readFileSync('coordination/agents.json', 'utf8'));
  const agentIds = new Set((registry.agents || []).map(agent => agent.id));
  if (targetAgent && !agentIds.has(targetAgent)) throw new Error('Unknown target_agent: ' + targetAgent);

  const [labelRows, openRows] = await Promise.all([
    listAll('/repos/' + repo + '/labels', 2),
    listAll('/repos/' + repo + '/issues?state=open', 3)
  ]);
  const available = new Set(labelRows.map(label => label.name).filter(Boolean));
  const requested = Array.isArray(proposal.labels) ? proposal.labels.map(String) : [];
  const labels = [];
  for (const label of requested) if (available.has(label) && !labels.includes(label)) labels.push(label);
  for (const label of ['coord:task', 'coord:ready']) {
    if (available.has(label) && !labels.includes(label)) labels.push(label);
  }
  if (targetAgent && available.has('agent:' + targetAgent) && !labels.includes('agent:' + targetAgent)) {
    labels.push('agent:' + targetAgent);
  }

  const normalized = normalizeTitle(title);
  const duplicate = openRows
    .filter(row => !row.pull_request)
    .find(row => normalizeTitle(row.title) === normalized);

  if (duplicate) {
    console.log(JSON.stringify({
      ok: true,
      status: 'duplicate',
      issue_number: duplicate.number,
      url: duplicate.html_url,
      title: duplicate.title
    }, null, 2));
    out('issue_number', duplicate.number);
    out('issue_status', 'duplicate');
    out('issue_url', duplicate.html_url || '');
    return;
  }

  const runUrl = process.env.GITHUB_RUN_ID
    ? 'https://github.com/' + repo + '/actions/runs/' + process.env.GITHUB_RUN_ID
    : '';
  const audit = [
    body,
    '',
    targetAgent ? '<!-- quantdeus-target-agent:' + targetAgent + ' -->' : '',
    '---',
    'Created by QuantDeus automated Issue publisher.',
    'Source agent: ' + sourceAgent,
    sourceWorkflow ? 'Source workflow: ' + sourceWorkflow : '',
    runUrl ? 'Run: ' + runUrl : ''
  ].filter(Boolean).join('\n');

  const created = await github('/repos/' + repo + '/issues', {
    method: 'POST',
    body: JSON.stringify({ title, body: audit, labels: labels.slice(0, 8) })
  });
  if (!created?.number || !created?.html_url) throw new Error('GitHub issue creation returned no issue identity');

  const verified = await github('/repos/' + repo + '/issues/' + created.number);
  if (verified.number !== created.number || verified.state !== 'open' || verified.pull_request) {
    throw new Error('Created Issue failed verification');
  }

  console.log(JSON.stringify({
    ok: true,
    status: 'created',
    issue_number: verified.number,
    url: verified.html_url,
    title: verified.title,
    labels: (verified.labels || []).map(label => typeof label === 'string' ? label : label.name)
  }, null, 2));
  out('issue_number', verified.number);
  out('issue_status', 'created');
  out('issue_url', verified.html_url || '');
})().catch(error => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
