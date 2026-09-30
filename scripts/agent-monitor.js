const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = process.cwd();
const registryPath = path.join(root, 'coordination', 'agents.json');
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
const doctrinePath = path.join(root, 'coordination', 'civilization-doctrine.json');

let doctrine = null;
try {
  doctrine = JSON.parse(fs.readFileSync(doctrinePath, 'utf8'));
} catch (err) {
  console.error('Civilization doctrine missing or invalid:', err.message);
  process.exit(1);
}
if (doctrine.schema_version !== 1 || !doctrine.version || !Array.isArray(doctrine.execution_gates)) {
  console.error('Civilization doctrine schema invalid');
  process.exit(1);
}

const agents = registry.agents || [];
const failures = [];
const checks = [];
const warnings = [];

function check(condition, agent, message) {
  checks.push({ agent: agent.name, ok: condition, message });
  if (!condition) failures.push({ agent: agent.name, message });
}

for (const agent of agents) {
  const source = agent.source;
  if (!source) {
    check(false, agent, 'missing source declaration');
    continue;
  }

  const sourcePath = path.join(root, source);
  const exists = fs.existsSync(sourcePath);
  check(exists, agent, exists ? `source present: ${source}` : `source missing: ${source}`);

  if (!exists || !source.endsWith('.js')) continue;

  try {
    execFileSync(process.execPath, ['--check', sourcePath], { stdio: 'pipe' });
    check(true, agent, 'JavaScript syntax OK');
  } catch (err) {
    const detail = (err.stderr || err.stdout || err.message || '').toString().trim().split('\n')[0];
    check(false, agent, `JavaScript syntax error: ${detail}`);
  }
}

const byId = new Map(agents.map(agent => [agent.id, agent]));
const bridgeIds = ['seven-of-nine', 'emh', 'sherlock', 'tuvok', 'coordinator', 'control-tower', 'qa-repair'];
const bridgeCrew = bridgeIds.map(id => {
  const agent = byId.get(id);
  if (!agent) {
    failures.push({ agent: id, message: 'bridge crew member missing from registry' });
    return { id, present: false, status: 'missing' };
  }
  return {
    id,
    name: agent.name,
    present: true,
    status: agent.operational_status || 'active',
    temporary_delegate: agent.temporary_delegate || null,
    acting_for: agent.acting_for || [],
  };
});

const medbay = agents
  .filter(agent => agent.operational_status === 'medbay')
  .map(agent => ({
    id: agent.id,
    name: agent.name,
    temporary_delegate: agent.temporary_delegate || null,
    reason: agent.medbay_reason || null,
    rejoin_condition: agent.rejoin_condition || null,
  }));

for (const patient of medbay) {
  if (!patient.temporary_delegate || !byId.has(patient.temporary_delegate)) {
    failures.push({ agent: patient.name, message: 'medbay agent has no valid temporary delegate' });
  }
}

const actingDelegates = agents
  .filter(agent => Array.isArray(agent.acting_for) && agent.acting_for.length)
  .map(agent => ({ id: agent.id, acting_for: agent.acting_for }));

async function githubJson(route) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!token || !repo) return null;
  const response = await fetch(`https://api.github.com${route}`, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
      'user-agent': 'quantdeus-crew-health',
    },
  });
  if (!response.ok) throw new Error(`GitHub API ${response.status}: ${route}`);
  return response.json();
}

async function countIssueState(label) {
  const repo = process.env.GITHUB_REPOSITORY;
  const q = encodeURIComponent(`repo:${repo} is:issue is:open label:${label}`);
  const data = await githubJson(`/search/issues?q=${q}&per_page=1`);
  return data?.total_count ?? null;
}

async function actionsSnapshot() {
  const data = await githubJson('/repos/' + process.env.GITHUB_REPOSITORY + '/actions/runs?per_page=100');
  if (!data) return null;
  const watched = [
    'QuantDeus Seven + Swarm Secretary 🖖🗂️',
    'QuantDeus QA Triad 🦀',
    'QuantDeus Static Smoke',
    'QuantDeus QA Failure Radar 📡',
    'QuantDeus Hourly OpenClaw Swarm',
  ];
  const latest = {};
  for (const run of data.workflow_runs || []) {
    if (!watched.includes(run.name) || latest[run.name]) continue;
    latest[run.name] = {
      id: run.id,
      status: run.status,
      conclusion: run.conclusion,
      run_number: run.run_number,
      head_sha: run.head_sha,
      created_at: run.created_at,
      html_url: run.html_url,
    };
  }
  return latest;
}

(async () => {
  let coordination = { ready: null, active: null, blocked: null };
  let actions = null;

  try {
    coordination = {
      ready: await countIssueState('coord:ready'),
      active: await countIssueState('coord:active'),
      blocked: await countIssueState('coord:blocked'),
    };
  } catch (err) {
    warnings.push(`coordination snapshot unavailable: ${err.message}`);
  }

  try {
    actions = await actionsSnapshot();
    for (const [name, run] of Object.entries(actions || {})) {
      if (run.status === 'completed' && !['success', 'skipped'].includes(run.conclusion)) {
        warnings.push(`${name} latest run is ${run.conclusion}`);
      }
    }
  } catch (err) {
    warnings.push(`Actions snapshot unavailable: ${err.message}`);
  }

  const coreInMedbay = bridgeCrew.filter(member => member.status === 'medbay');
  if (coreInMedbay.length) {
    warnings.push(`bridge crew in medbay: ${coreInMedbay.map(x => x.id).join(', ')}`);
  }
  if ((coordination.blocked || 0) > 0) {
    warnings.push(`${coordination.blocked} blocked coordination issue(s)`);
  }

  const overallStatus = failures.length ? 'red' : (warnings.length || medbay.length ? 'yellow' : 'green');

  const report = {
    timestamp: new Date().toISOString(),
    registry_version: registry.schema_version,
    doctrine_version: doctrine.version,
    overall_status: overallStatus,
    agent_count: agents.length,
    source_check_count: checks.length,
    source_check_passed: checks.filter(c => c.ok).length,
    failed_count: failures.length,
    failures,
    warnings,
    bridge_crew: bridgeCrew,
    medbay,
    acting_delegates: actingDelegates,
    coordination,
    actions,
    checks,
  };

  fs.writeFileSync('/tmp/quantdeus-agent-health.json', JSON.stringify(report, null, 2));

  const icon = overallStatus === 'green' ? '🟢' : overallStatus === 'yellow' ? '🟡' : '🔴';
  const lines = [
    `# ${icon} QuantDeus Crew Health`,
    '',
    `- status: **${overallStatus.toUpperCase()}**`,
    `- agents: **${agents.length}**`,
    `- bridge crew: **${bridgeCrew.filter(x => x.present).length}/${bridgeIds.length} present**`,
    `- medbay: **${medbay.length}**`,
    `- coordination: READY **${coordination.ready ?? '?'}** / ACTIVE **${coordination.active ?? '?'}** / BLOCKED **${coordination.blocked ?? '?'}**`,
    `- hard failures: **${failures.length}**`,
    '',
    '## Bridge crew',
    ...bridgeCrew.map(x => `- ${x.id}: ${x.status}${x.acting_for?.length ? ` (acting for ${x.acting_for.join(', ')})` : ''}`),
    '',
    '## Medbay',
    ...(medbay.length ? medbay.map(x => `- ${x.id} → delegate: ${x.temporary_delegate || 'MISSING'}`) : ['- none']),
    '',
    '## Warnings',
    ...(warnings.length ? warnings.map(x => `- ${x}`) : ['- none']),
  ];
  fs.writeFileSync('/tmp/quantdeus-agent-health.md', lines.join('\n') + '\n');

  console.log(JSON.stringify(report, null, 2));

  if (failures.length) {
    console.error(`Crew health check failed for ${failures.length} hard check(s).`);
    process.exit(1);
  }

  console.log(`Crew health: ${overallStatus}; ${agents.length} agents; ${medbay.length} medbay; ${warnings.length} warning(s).`);
})().catch(err => {
  console.error('Crew health monitor crashed:', err);
  process.exit(1);
});
