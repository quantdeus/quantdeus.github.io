#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const registryPath = path.join(repoRoot, 'coordination', 'agents.json');
const officePath = path.join(repoRoot, 'coordination', 'hermes-office.json');

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

if (!fs.existsSync(registryPath) || !fs.existsSync(officePath)) fail('Missing QuantDeus registry/office manifest.');

const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
const office = JSON.parse(fs.readFileSync(officePath, 'utf8'));
const agents = Array.isArray(registry.agents) ? registry.agents : [];
if (!agents.length) fail('No agents in coordination/agents.json.');

const provider = process.env.HERMES_MODEL_PROVIDER || office.model.provider;
const model = process.env.HERMES_MODEL || office.model.default;
const terminalBackend = process.env.HERMES_TERMINAL_BACKEND || office.execution.preferred_terminal_backend;

if (terminalBackend === 'vercel_sandbox') {
  for (const key of ['VERCEL_TOKEN', 'VERCEL_PROJECT_ID', 'VERCEL_TEAM_ID']) {
    if (!process.env[key]) fail(key + ' is required when HERMES_TERMINAL_BACKEND=vercel_sandbox.');
  }
}

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

run([
  'kanban', 'boards', 'create', office.office.board,
  '--name', office.office.display_name,
  '--description', 'Shared durable task board for the 26 QuantDeus Hermes profiles',
  '--icon', '🖖'
], { allowFailure: true });

run(['kanban', 'boards', 'switch', office.office.board]);
run(['kanban', '--board', office.office.board, 'init']);

console.log('');
console.log('[hermes-office] READY');
console.log('Start dispatcher: hermes -p ' + seven + ' gateway start');
console.log('Open office UI:   hermes -p ' + seven + ' dashboard');
console.log('Board:            hermes kanban --board ' + office.office.board + ' list');
