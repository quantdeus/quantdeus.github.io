'use strict';

const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const token = process.env.GH_TOKEN;
const repo = process.env.GITHUB_REPOSITORY || 'quantdeus/quantdeus.github.io';
const lookbackDays = Math.max(1, Math.min(30, Number(process.env.LOOKBACK_DAYS || 7)));
const triggerWorkflow = String(process.env.TRIGGER_WORKFLOW || '');
const triggerConclusion = String(process.env.TRIGGER_CONCLUSION || '');

if (!token) throw new Error('GH_TOKEN is required');

const failureConclusions = new Set(['failure', 'timed_out', 'startup_failure', 'action_required']);
const ignoredWorkflows = new Set(['QuantDeus QA Failure Radar 📡']);

function familyFor(name) {
  const n = String(name || '').toLowerCase();
  if (n.includes('telegram')) return 'telegram';
  if (n.includes('site agent')) return 'site-agent';
  if (n.includes('openclaw')) return 'openclaw';
  if (n.includes('pages') || n.includes('vercel') || n.includes('wordpress') || n.includes('deploy')) return 'web';
  if (n.includes('qa') || n.includes('static smoke')) return 'core-qa';
  return 'automation';
}

const checksByFamily = {
  'site-agent': [
    ['site-agent syntax', 'node --check scripts/site-agent-reply.js'],
    ['OpenClaw contract', 'node scripts/qa/openclaw-office-validator.js']
  ],
  openclaw: [
    ['OpenClaw client syntax', 'node --check scripts/openclaw-office-client.js'],
    ['OpenClaw route syntax', 'node --check vercel-dispatcher/api/quantdeus/openclaw.js'],
    ['OpenClaw contract', 'node scripts/qa/openclaw-office-validator.js']
  ],
  telegram: [
    ['Telegram bot syntax', 'node --check scripts/telegram-bot.js'],
    ['Telegram bridge syntax', 'node --check vercel-dispatcher/api/quantdeus/telegram.js'],
    ['Contract validator', 'node scripts/qa/contract-validator.js']
  ],
  web: [
    ['Syntax validator', 'node scripts/qa/syntax-validator.js'],
    ['Production route files', "node -e \"const fs=require('fs'); for(const p of ['index.html','telegram/index.html','coordination/index.html','vercel-dispatcher/vercel.json']) if(!fs.existsSync(p)) throw new Error('missing '+p)\""]
  ],
  'core-qa': [
    ['Mission alignment', 'node scripts/mission-alignment.js'],
    ['Syntax validator', 'node scripts/qa/syntax-validator.js'],
    ['Contract validator', 'node scripts/qa/contract-validator.js']
  ],
  automation: [
    ['Mission alignment', 'node scripts/mission-alignment.js'],
    ['Agent monitor', 'node scripts/agent-monitor.js'],
    ['Contract validator', 'node scripts/qa/contract-validator.js']
  ]
};

const baseline = [
  ['Mission alignment', 'node scripts/mission-alignment.js'],
  ['Syntax validator', 'node scripts/qa/syntax-validator.js'],
  ['Contract validator', 'node scripts/qa/contract-validator.js'],
  ['OpenClaw contract', 'node scripts/qa/openclaw-office-validator.js'],
  ['Agent monitor', 'node scripts/agent-monitor.js']
];

async function api(path) {
  const response = await fetch('https://api.github.com' + path, {
    headers: {
      authorization: 'Bearer ' + token,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'quantdeus-qa-failure-radar'
    }
  });
  const raw = await response.text();
  if (!response.ok) throw new Error('GitHub API ' + response.status + ': ' + raw.slice(0, 500));
  return JSON.parse(raw);
}

function runCheck(label, command) {
  const started = Date.now();
  const result = spawnSync(command, {
    cwd: process.cwd(),
    shell: true,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 1024 * 1024 * 4
  });
  return {
    label,
    command,
    ok: result.status === 0,
    status: result.status,
    duration_ms: Date.now() - started,
    stdout: String(result.stdout || '').slice(-4000),
    stderr: String(result.stderr || '').slice(-4000)
  };
}

(async () => {
  const data = await api('/repos/' + repo + '/actions/runs?branch=main&per_page=100');
  const cutoff = Date.now() - lookbackDays * 86400000;
  const runs = (data.workflow_runs || [])
    .filter(r => Date.parse(r.created_at) >= cutoff)
    .filter(r => !ignoredWorkflows.has(r.name));

  const byWorkflow = new Map();
  for (const run of runs) {
    if (!byWorkflow.has(run.name)) byWorkflow.set(run.name, []);
    byWorkflow.get(run.name).push(run);
  }

  const ranking = [];
  for (const [name, workflowRuns] of byWorkflow) {
    workflowRuns.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    const failures = workflowRuns.filter(r => failureConclusions.has(r.conclusion));
    ranking.push({
      workflow: name,
      family: familyFor(name),
      failures: failures.length,
      runs: workflowRuns.length,
      latest_conclusion: workflowRuns[0]?.conclusion || null,
      latest_url: workflowRuns[0]?.html_url || null,
      latest_at: workflowRuns[0]?.created_at || null,
      unresolved: failureConclusions.has(workflowRuns[0]?.conclusion)
    });
  }

  ranking.sort((a, b) =>
    b.failures - a.failures ||
    Number(b.unresolved) - Number(a.unresolved) ||
    Date.parse(b.latest_at || 0) - Date.parse(a.latest_at || 0)
  );

  const familyStats = {};
  for (const row of ranking) {
    if (!familyStats[row.family]) familyStats[row.family] = {family: row.family, failures: 0, runs: 0, unresolved: 0};
    familyStats[row.family].failures += row.failures;
    familyStats[row.family].runs += row.runs;
    familyStats[row.family].unresolved += row.unresolved ? 1 : 0;
  }

  const familyRanking = Object.values(familyStats).sort((a, b) =>
    b.failures - a.failures || b.unresolved - a.unresolved || b.runs - a.runs
  );

  const queue = [];
  const seen = new Set();
  function enqueue(pair, source) {
    const [label, command] = pair;
    if (seen.has(command)) return;
    seen.add(command);
    queue.push({label, command, source});
  }

  for (const family of familyRanking) {
    for (const pair of checksByFamily[family.family] || []) enqueue(pair, 'frequency:' + family.family);
  }
  for (const pair of baseline) enqueue(pair, 'baseline');

  const checkResults = queue.map(item => ({...runCheck(item.label, item.command), source: item.source}));
  const failedChecks = checkResults.filter(x => !x.ok);
  const unresolved = ranking.filter(x => x.unresolved);
  const triggerFailed = failureConclusions.has(triggerConclusion);
  const needsRepair = failedChecks.length > 0 || unresolved.length > 0 || triggerFailed;

  const topFamily = familyRanking[0]?.family || 'core-qa';
  const repairLane = ['web', 'site-agent'].includes(topFamily) ? 'site' : 'actions';

  const report = {
    generated_at: new Date().toISOString(),
    repository: repo,
    lookback_days: lookbackDays,
    trigger: {workflow: triggerWorkflow || null, conclusion: triggerConclusion || null},
    ranking,
    family_ranking: familyRanking,
    execution_order: queue.map(x => ({label:x.label, source:x.source})),
    checks: checkResults,
    failed_checks: failedChecks.map(x => x.label),
    unresolved_workflows: unresolved.map(x => x.workflow),
    needs_repair: needsRepair,
    repair_lane: repairLane
  };

  fs.writeFileSync('/tmp/quantdeus-qa-failure-radar.json', JSON.stringify(report, null, 2));

  const summary = [
    '# QuantDeus QA Failure Radar 📡',
    '',
    'Lookback: ' + lookbackDays + ' day(s). Recent main runs: ' + runs.length + '.',
    '',
    '## Failure frequency',
    '',
    '| Workflow | Family | Failures | Runs | Latest | Unresolved |',
    '|---|---|---:|---:|---|---|',
    ...ranking.slice(0, 20).map(x => '| ' + x.workflow.replace(/\|/g,'\\|') + ' | ' + x.family + ' | ' + x.failures + ' | ' + x.runs + ' | ' + (x.latest_conclusion || '-') + ' | ' + (x.unresolved ? 'yes' : 'no') + ' |'),
    '',
    '## Diagnostic order',
    '',
    ...checkResults.map((x, i) => (i + 1) + '. ' + (x.ok ? '✅' : '❌') + ' **' + x.label + '** — ' + x.source),
    '',
    '## Decision',
    '',
    '- needs_repair: **' + needsRepair + '**',
    '- repair_lane: **' + repairLane + '**',
    '- failed_checks: ' + (failedChecks.map(x => x.label).join(', ') || 'none'),
    '- unresolved_workflows: ' + (unresolved.map(x => x.workflow).join(', ') || 'none')
  ].join('\n');

  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, 'needs_repair=' + (needsRepair ? 'true' : 'false') + '\n');
    fs.appendFileSync(process.env.GITHUB_OUTPUT, 'repair_lane=' + repairLane + '\n');
    fs.appendFileSync(process.env.GITHUB_OUTPUT, 'top_family=' + topFamily + '\n');
  }

  console.log(summary);
  if (failedChecks.length) process.exitCode = 1;
})().catch(error => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
