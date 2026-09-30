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
  const byId = new Map((registry.agents || []).map(agent => [agent.id, agent]));
  if (targetAgent && !byId.has(targetAgent)) throw new Error('Unknown target_agent: ' + targetAgent);
  let effectiveTarget = targetAgent;
  const owner = byId.get(targetAgent);
  if (owner?.operational_status === 'medbay') {
    const delegate = byId.get(owner.temporary_delegate);
    if (!delegate || delegate.id === targetAgent || delegate.operational_status === 'medbay') {
      throw new Error('Medbay target has no valid active temporary_delegate: ' + targetAgent);
    }
    effectiveTarget = delegate.id;
  }

  const [labelRows, openRows] = await Promise.all([
    listAll('/repos/' + repo + '/labels', 2),
    listAll('/repos/' + repo + '/issues?state=open', 3)
  ]);
  const available = new Set(labelRows.map(label => label.name).filter(Boolean));
  const requested = Array.isArray(proposal.labels) ? proposal.labels.map(String) : [];
  const stateLabels = ['coord:blocked', 'coord:active', 'coord:ready', 'coord:stale', 'coord:done'];
  const stateLabel = stateLabels.find(label => requested.includes(label)) || 'coord:ready';
  const pinned = ['coord:task', stateLabel, ...(effectiveTarget ? ['agent:' + effectiveTarget] : [])];
  for (const label of pinned) {
    if (!available.has(label)) throw new Error('Required coordination label unavailable: ' + label);
  }
  const extras = [...new Set(requested)].filter(label =>
    available.has(label) && !pinned.includes(label) &&
    !stateLabels.includes(label) && !label.startsWith('agent:')
  );
  const finalLabels = [...pinned, ...extras].slice(0, 8);

  const normalized = normalizeTitle(title);
  const duplicate = openRows
    .filter(row => !row.pull_request)
    .find(row => normalizeTitle(row.title) === normalized);

  if (duplicate) {
    const duplicateLabels = (duplicate.labels || [])
      .map(label => typeof label === 'string' ? label : label.name)
      .filter(Boolean);
    const duplicateState = stateLabels.find(label => duplicateLabels.includes(label)) || stateLabel;
    const preservedAgent = !effectiveTarget
      ? duplicateLabels.find(label => label.startsWith('agent:'))
      : '';
    const duplicatePinned = [
      'coord:task',
      duplicateState,
      ...(effectiveTarget ? ['agent:' + effectiveTarget] : preservedAgent ? [preservedAgent] : [])
    ];
    for (const label of duplicatePinned) {
      if (!available.has(label)) throw new Error('Required coordination label unavailable: ' + label);
    }
    const duplicateExtras = [...new Set([...duplicateLabels, ...requested])].filter(label =>
      available.has(label) && !duplicatePinned.includes(label) &&
      !stateLabels.includes(label) && !label.startsWith('agent:')
    );
    const reconciledLabels = [...duplicatePinned, ...duplicateExtras].slice(0, 8);

    const routingMarker = /<!--\s*quantdeus-target-agent:[a-z0-9_-]+\s*-->/i;
    const marker = effectiveTarget ? '<!-- quantdeus-target-agent:' + effectiveTarget + ' -->' : '';
    let reconciledBody = String(duplicate.body || '').trim();
    if (marker) {
      reconciledBody = routingMarker.test(reconciledBody)
        ? reconciledBody.replace(routingMarker, marker)
        : [reconciledBody, marker].filter(Boolean).join('\n\n');
    }
    if (effectiveTarget !== targetAgent) {
      const delegationNote = 'Delegated from medbay owner: ' + targetAgent;
      if (!reconciledBody.includes(delegationNote)) {
        reconciledBody = [reconciledBody, delegationNote].filter(Boolean).join('\n\n');
      }
    }

    const labelsChanged = JSON.stringify(duplicateLabels) !== JSON.stringify(reconciledLabels);
    const bodyChanged = String(duplicate.body || '').trim() !== reconciledBody;
    let verifiedDuplicate = duplicate;
    if (labelsChanged || bodyChanged) {
      verifiedDuplicate = await github('/repos/' + repo + '/issues/' + duplicate.number, {
        method: 'PATCH',
        body: JSON.stringify({ body: reconciledBody, labels: reconciledLabels })
      });
      if (verifiedDuplicate.number !== duplicate.number || verifiedDuplicate.state !== 'open' || verifiedDuplicate.pull_request) {
        throw new Error('Reconciled duplicate Issue failed verification');
      }
    }

    console.log(JSON.stringify({
      ok: true,
      status: 'duplicate',
      issue_number: verifiedDuplicate.number,
      url: verifiedDuplicate.html_url,
      title: verifiedDuplicate.title,
      labels: (verifiedDuplicate.labels || []).map(label => typeof label === 'string' ? label : label.name)
    }, null, 2));
    out('issue_number', verifiedDuplicate.number);
    out('issue_status', 'duplicate');
    out('issue_url', verifiedDuplicate.html_url || '');
    return;
  }

  const runUrl = process.env.GITHUB_RUN_ID
    ? 'https://github.com/' + repo + '/actions/runs/' + process.env.GITHUB_RUN_ID
    : '';
  const audit = [
    body,
    '',
    effectiveTarget ? '<!-- quantdeus-target-agent:' + effectiveTarget + ' -->' : '',
    effectiveTarget !== targetAgent ? 'Delegated from medbay owner: ' + targetAgent : '',
    '---',
    'Created by QuantDeus automated Issue publisher.',
    'Source agent: ' + sourceAgent,
    sourceWorkflow ? 'Source workflow: ' + sourceWorkflow : '',
    runUrl ? 'Run: ' + runUrl : ''
  ].filter(Boolean).join('\n');

  const created = await github('/repos/' + repo + '/issues', {
    method: 'POST',
    body: JSON.stringify({ title, body: audit, labels: finalLabels })
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
