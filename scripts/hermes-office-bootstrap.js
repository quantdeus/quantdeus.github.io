#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const registryPath = path.join(repoRoot, 'coordination', 'agents.json');
const officePath = path.join(repoRoot, 'coordination', 'hermes-office.json');
const evolutionPath = path.join(repoRoot, 'coordination', 'hermes-evolution.json');

function fail(message) {
  console.error('[hermes-office] ' + message);
  process.exit(1);
}

function run(args, options = {}) {
  const r = spawnSync('hermes', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    env: process.env,
  });
  if (r.error) fail('Cannot execute hermes: ' + r.error.message);
  if (r.status !== 0 && !options.allowFailure) {
    const detail = options.capture ? ('\n' + (r.stderr || r.stdout || '')) : '';
    fail('hermes ' + args.join(' ') + ' failed with exit ' + r.status + detail);
  }
  return r;
}

function config(profile, key, value) {
  run(['-p', profile, 'config', 'set', key, String(value)]);
}

function enableToolset(profile, name) {
  run(['-p', profile, 'tools', 'enable', name], { allowFailure: true });
}

function ensureMcp(profile, name, addArgs) {
  const listed = run(['-p', profile, 'mcp', 'list'], { capture: true, allowFailure: true });
  const output = String(listed.stdout || '') + '\n' + String(listed.stderr || '');
  if (output.split(/\s+/).includes(name)) return;
  run(['-p', profile, 'mcp', 'add', name, ...addArgs], { allowFailure: true });
}

function ensureSecret(profile, provider) {
  if (provider === 'ollama-cloud') {
    if (!process.env.OLLAMA_API_KEY) {
      fail('OLLAMA_API_KEY is required for provider ollama-cloud. Set it in the runtime environment; never commit it.');
    }
    run(['-p', profile, 'config', 'set', 'OLLAMA_API_KEY', process.env.OLLAMA_API_KEY]);
    return;
  }
  if (provider === 'openrouter') {
    if (!process.env.OPENROUTER_API_KEY) {
      fail('OPENROUTER_API_KEY is required for provider openrouter. Set it in the runtime environment; never commit it.');
    }
    run(['-p', profile, 'config', 'set', 'OPENROUTER_API_KEY', process.env.OPENROUTER_API_KEY]);
  }
}

if (!fs.existsSync(registryPath) || !fs.existsSync(officePath) || !fs.existsSync(evolutionPath)) {
  fail('Missing QuantDeus registry/office/evolution manifest.');
}

const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
const office = JSON.parse(fs.readFileSync(officePath, 'utf8'));
const evolution = JSON.parse(fs.readFileSync(evolutionPath, 'utf8'));
const agents = Array.isArray(registry.agents) ? registry.agents : [];
if (!agents.length) fail('No agents in coordination/agents.json.');

const provider = process.env.HERMES_MODEL_PROVIDER || office.model.provider;
const model = process.env.HERMES_MODEL || office.model.default;
const terminalBackend = process.env.HERMES_TERMINAL_BACKEND || office.execution.preferred_terminal_backend;

console.log('[hermes-office] profiles=' + agents.length + ' provider=' + provider + ' model=' + model + ' terminal=' + terminalBackend);

for (const agent of agents) {
  const profile = agent.id;
  const shown = run(['profile', 'show', profile], { capture: true, allowFailure: true });
  if (shown.status !== 0) {
    run(['profile', 'create', profile, '--no-alias']);
  }

  run(['profile', 'describe', profile, '--text', agent.role]);
  config(profile, 'model.provider', provider);
  config(profile, 'model.default', model);
  config(profile, 'terminal.backend', terminalBackend);
  ensureSecret(profile, provider);

  for (const toolset of ['web', 'browser', 'skills', 'memory', 'session_search', 'cronjob', 'code_execution', 'delegation', 'connections']) {
    enableToolset(profile, toolset);
  }

  config(profile, 'skills.guard_agent_created', true, { force: true });
  config(profile, 'skills.write_approval', false, { force: true });
  config(profile, 'skills.ledger', true, { force: true });
  config(profile, 'skills.creation_nudge_interval', evolution.capabilities.self_improvement.creation_nudge_interval, { force: true });
  config(profile, 'curator.enabled', true, { force: true });
  config(profile, 'curator.interval_hours', evolution.capabilities.self_improvement.curator.interval_hours, { force: true });
  config(profile, 'curator.min_idle_hours', evolution.capabilities.self_improvement.curator.min_idle_hours, { force: true });
  config(profile, 'curator.consolidate', true, { force: true });
  config(profile, 'curator.backup.enabled', true, { force: true });

  run(['-p', profile, 'skills', 'trust', repoRoot], { allowFailure: true });

  // Configure first-party MCPs through the sanctioned config path. This avoids
  // interactive discovery/install flows and keeps transient credentials out of config.
  config(profile, 'mcp_servers.playwright.command', 'npx', { force: true });
  config(profile, 'mcp_servers.playwright.args', JSON.stringify(['-y', '@playwright/mcp@latest']), { force: true });
  config(profile, 'mcp_servers.playwright.connect_timeout', 90, { force: true });

  config(profile, 'mcp_servers.github.url', 'https://api.githubcopilot.com/mcp/', { force: true });
  config(profile, 'mcp_servers.github.headers.Authorization', 'Bearer ${MCP_GITHUB_API_KEY}', { force: true });
  config(profile, 'mcp_servers.github.connect_timeout', 90, { force: true });
  config(profile, 'mcp_servers.github.enabled', true, { force: true });

  const hermesHome = process.env.HERMES_HOME || path.join(os.homedir(), '.hermes');
  const profileHome = path.join(hermesHome, 'profiles', profile);
  fs.mkdirSync(profileHome, { recursive: true });

  const soul = [
    '# ' + agent.name,
    '',
    'You are the Hermes runtime profile for QuantDeus agent `' + agent.id + '`.',
    '',
    '## Role',
    agent.role,
    '',
    '## Department',
    agent.department || agent.group || 'QuantDeus',
    '',
    '## KPI',
    agent.kpi || 'verified outcomes',
    '',
    '## Operating contract',
    '- GitHub repository `quantdeus/quantdeus.github.io` is the project source of truth.',
    '- Read the current task and repository evidence before acting.',
    '- Do not invent Issue, PR, commit, deployment, test, or delivery results.',
    '- Safe reversible work may proceed autonomously; stop for secrets, payments, irreversible commitments, production-destructive changes, CAPTCHA and 2FA.',
    '- You may create Issues, branches, PRs, cron jobs, agent-local skills and reversible MCP connections when they help the active QuantDeus task.',
    '- Prefer first-party or Nous-approved MCP servers and test one harmless read operation after connecting.',
    '- Use Playwright MCP for deterministic web interaction and legitimate QuantDeus project-account setup; stop at verification/payment/legal gates.',
    '- After a novel workflow succeeds, save the reusable procedure as an agent-local skill. Curator may later consolidate it.',
    '- Canonical self-modification belongs in a branch/PR with QA evidence; never silently weaken command hierarchy or guardrails.',
    '- Seven of Nine is the orchestrator / AI Chief of Staff. The coordinator is the swarm secretary. QA can request evidence-backed repair.',
    '- Finish Kanban work only after the acceptance contract is actually verified.',
    '',
    'Registry source: `' + (agent.source || 'coordination/agents.json') + '`.',
    ''
  ].join('\n');

  fs.writeFileSync(path.join(profileHome, 'SOUL.md'), soul, 'utf8');
}

const seven = office.office.dispatcher_profile;
config(seven, 'kanban.dispatch_in_gateway', true);
config(seven, 'kanban.auto_decompose', office.office.auto_decompose);
config(seven, 'kanban.orchestrator_profile', office.office.orchestrator_profile);
config(seven, 'kanban.default_assignee', office.office.default_assignee);
config(seven, 'kanban.max_in_progress', office.execution.max_in_progress);
config(seven, 'kanban.max_in_progress_per_profile', office.execution.max_in_progress_per_profile);
config(seven, 'dashboard.kanban.lane_by_profile', office.office.dashboard_lanes_by_profile);

run(['-p', seven, 'tools', 'enable', 'kanban']);
run(['-p', seven, 'tools', 'enable', 'connections']);
run(['-p', seven, 'tools', 'enable', 'cronjob']);

// The canonical cloud path is one-shot Hermes inside a persistent Vercel Sandbox.
 // A long-running Hermes API server is optional and no longer required for chat routing.
if (process.env.HERMES_API_KEY) {
  config(seven, 'gateway.api_server.enabled', true, { force: true });
  config(seven, 'gateway.api_server.host', process.env.HERMES_API_HOST || '127.0.0.1', { force: true });
  config(seven, 'gateway.api_server.port', process.env.HERMES_API_PORT || '8642', { force: true });
  config(seven, 'gateway.api_server.key', process.env.HERMES_API_KEY, { force: true });
}

run([
  'kanban', 'boards', 'create', office.office.board,
  '--name', office.office.display_name,
  '--description', 'Shared durable task board for the 26 QuantDeus Hermes profiles',
  '--icon', '🖖'
], { allowFailure: true });

run(['kanban', 'boards', 'switch', office.office.board]);
run(['kanban', '--board', office.office.board, 'init']);

const cronList = run(['-p', seven, 'cron', 'list', '--all'], { capture: true, allowFailure: true });
if (!String(cronList.stdout || '').includes('QuantDeus Evolution Review')) {
  run(['-p', seven, 'cron', 'create', 'every 1d', 'Audit the QuantDeus Hermes office: inspect repeated failures, missing capabilities, stale skills, MCP gaps, open GitHub blockers and Kanban bottlenecks. Make at most one bounded reversible improvement per run. You may create/update a GitHub Issue or PR and improve agent-local skills. Verify every external mutation. Do not weaken guardrails or perform payment/legal/identity-verification actions.', '--name', 'QuantDeus Evolution Review', '--deliver', 'local', '--workdir', repoRoot], { allowFailure: true });
}

console.log('');
console.log('[hermes-office] READY');
console.log('Start dispatcher: hermes -p ' + seven + ' gateway start');
console.log('Open office UI:   hermes -p ' + seven + ' dashboard');
console.log('Board:            hermes kanban --board ' + office.office.board + ' list');
