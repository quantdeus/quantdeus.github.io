#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const registryPath = path.join(repoRoot, 'coordination', 'agents.json');
const officePath = path.join(repoRoot, 'coordination', 'hermes-office.json');
const evolutionPath = path.join(repoRoot, 'coordination', 'hermes-evolution.json');
const projectSkillsPath = path.join(repoRoot, '.hermes', 'skills');
const agentSkillsRoot = path.join(repoRoot, '.hermes', 'agent-skills');

const BOOTSTRAP_SCHEMA = 6;

function fail(message) {
  console.error('[hermes-office] ' + message);
  process.exit(1);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail('Cannot read ' + file + ': ' + error.message);
  }
}

function writeJsonYaml(file, value) {
  // JSON is valid YAML 1.2 and avoids spawning hundreds of Hermes CLI processes.
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function copyProjectSkills(profileHome) {
  if (!fs.existsSync(projectSkillsPath)) return;
  const target = path.join(profileHome, 'skills');
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(projectSkillsPath, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const src = path.join(projectSkillsPath, entry.name);
    const dst = path.join(target, entry.name);
    fs.cpSync(src, dst, { recursive: true, force: true });
  }
}

function copyAgentSkills(profileHome, agent) {
  const agentId = String(agent?.id || '');
  if (!/^[a-z0-9-]+$/.test(agentId)) fail('Unsafe agent id for local skills: ' + agentId);
  const source = path.join(agentSkillsRoot, agentId);
  if (!fs.existsSync(source)) return 0;

  const target = path.join(profileHome, 'skills');
  fs.mkdirSync(target, { recursive: true });
  let copied = 0;
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^[a-z0-9-]+$/.test(entry.name)) continue;
    const skillFile = path.join(source, entry.name, 'SKILL.md');
    if (!fs.existsSync(skillFile)) continue;
    const raw = fs.readFileSync(skillFile, 'utf8');
    if (Buffer.byteLength(raw, 'utf8') > 32768) fail('Agent-local skill exceeds 32 KiB: ' + agentId + '/' + entry.name);
    fs.cpSync(path.join(source, entry.name), path.join(target, entry.name), { recursive: true, force: true });
    copied += 1;
  }
  return copied;
}

function knowledgeFor(agent) {
  const sources = Array.isArray(agent.knowledge_sources) ? agent.knowledge_sources : [];
  if (!sources.length) return '';

  const sections = [];
  for (const rel of sources) {
    if (typeof rel !== 'string' || !/^coordination\/data-training\/[A-Za-z0-9._/-]+$/.test(rel) || rel.includes('..')) {
      fail('Unsafe canonical knowledge path for ' + agent.id + ': ' + String(rel));
    }
    const file = path.join(repoRoot, rel);
    if (!fs.existsSync(file)) fail('Missing canonical knowledge source for ' + agent.id + ': ' + rel);
    const raw = fs.readFileSync(file, 'utf8');
    if (Buffer.byteLength(raw, 'utf8') > 65536) fail('Canonical knowledge source exceeds 64 KiB: ' + rel);
    sections.push('## Canonical knowledge source: `' + rel + '`\n\n' + raw.trim());
  }
  return sections.length ? '\n\n' + sections.join('\n\n') : '';
}

function soulFor(agent) {
  let persona = '';
  const knowledge = knowledgeFor(agent);
  if (agent.persona) {
    const personaPath = path.join(repoRoot, agent.persona);
    if (fs.existsSync(personaPath)) {
      persona = '\n\n## Canonical persona\n\n' + fs.readFileSync(personaPath, 'utf8').trim();
    }
  }

  return [
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
    '- GitHub repository `quantdeus/quantdeus.github.io` is the canonical project source of truth.',
    '- Read the active task and fresh repository evidence before acting.',
    '- Never invent Issue, PR, commit, deployment, test, browser, MCP or delivery results.',
    '- Safe reversible work may proceed autonomously.',
    '- You may create Issues, branches, PRs, cron/scheduled work, agent-local skills and reversible MCP connections when they help an active QuantDeus task.',
    '- Prefer first-party or Nous-reviewed MCP servers. Test a harmless read action before external mutations.',
    '- Use Playwright MCP for deterministic browser work and legitimate QuantDeus project-account setup.',
    '- Stop and create a human handoff for CAPTCHA, unavailable email/SMS verification, 2FA/passkeys, payments, legal commitments, identity verification, secrets disclosure or destructive production actions.',
    '- After a novel workflow succeeds, improve or create a reusable agent-local skill. Keep skill changes security-scannable and auditable.',
    '- Canonical repository self-improvement belongs in a branch/PR with QA evidence; never silently weaken command hierarchy, evidence rules or safety gates.',
    '- Seven of Nine is the QuantDeus orchestrator / AI Chief of Staff. The coordinator is the Swarm Secretary. QA may require evidence-backed repair.',
    '- Finish work only after acceptance evidence actually exists.',
    '',
    'Registry source: `' + (agent.source || 'coordination/agents.json') + '`.'
  ].join('\n') + persona + knowledge + '\n';
}

function canonicalConfig(agent, office, evolution) {
  const seven = agent.id === 'seven-of-nine';
  const toolsets = seven ? ['hermes-cli', 'kanban', 'connections'] : ['hermes-cli', 'connections'];

  const modelBaseUrl = process.env.HERMES_LOCAL_BASE_URL || process.env.OPENAI_BASE_URL;
  const modelKeyEnv = process.env.HERMES_LOCAL_API_KEY
    ? 'HERMES_LOCAL_API_KEY'
    : (process.env.OPENAI_API_KEY ? 'OPENAI_API_KEY' : null);
  const openRouterModel = String(process.env.HERMES_OPENROUTER_MODEL || 'openrouter/free').trim();
  const fallbackProviders = [];
  if (process.env.OPENROUTER_API_KEY && openRouterModel) {
    fallbackProviders.push({ provider: 'openrouter', model: openRouterModel });
  }

  const cfg = {
    fallback_providers: fallbackProviders,
    quantdeus: {
      bootstrap_schema: BOOTSTRAP_SCHEMA,
      agent_id: agent.id,
      registry_source: 'coordination/agents.json',
      source_of_truth: 'github'
    },
    model: {
      provider: process.env.HERMES_MODEL_PROVIDER || office.model.provider || 'custom',
      default: process.env.HERMES_MODEL || office.model.default || '',
      ...(modelBaseUrl ? { base_url: modelBaseUrl } : {}),
      ...(modelKeyEnv ? { key_env: modelKeyEnv } : {})
    },
    terminal: {
      backend: process.env.HERMES_TERMINAL_BACKEND || 'local',
      cwd: repoRoot
    },
    toolsets,
    platform_toolsets: {
      cli: toolsets
    },
    mcp_servers: {
      playwright: {
        command: 'npx',
        args: ['-y', '@playwright/mcp@latest'],
        connect_timeout: 90,
        timeout: 180,
        enabled: true
      },
      github: {
        url: 'https://api.githubcopilot.com/mcp/',
        headers: {
          Authorization: 'Bearer ${MCP_GITHUB_API_KEY}'
        },
        connect_timeout: 90,
        timeout: 180,
        enabled: true
      }
    },
    skills: {
      guard_agent_created: true,
      write_approval: false,
      ledger: true,
      creation_nudge_interval: Number(evolution?.capabilities?.self_improvement?.creation_nudge_interval || 10)
    },
    curator: {
      enabled: true,
      interval_hours: Number(evolution?.capabilities?.self_improvement?.curator?.interval_hours || 24),
      min_idle_hours: Number(evolution?.capabilities?.self_improvement?.curator?.min_idle_hours || 1),
      consolidate: true,
      backup: {
        enabled: true
      }
    },
    cron: {
      allow_agent_scheduling: true,
      model: process.env.HERMES_MODEL || office.model.default || '',
      model_provider: process.env.HERMES_MODEL_PROVIDER || office.model.provider || 'custom',
      max_parallel_jobs: seven ? 3 : 1
    }
  };

  if (seven) {
    cfg.kanban = {
      dispatch_in_gateway: true,
      auto_decompose: Boolean(office.office.auto_decompose),
      orchestrator_profile: office.office.orchestrator_profile,
      default_assignee: office.office.default_assignee,
      max_in_progress: office.execution.max_in_progress,
      max_in_progress_per_profile: office.execution.max_in_progress_per_profile
    };
    cfg.dashboard = {
      kanban: {
        lane_by_profile: Boolean(office.office.dashboard_lanes_by_profile)
      }
    };
  }

  return cfg;
}

if (![registryPath, officePath, evolutionPath].every(fs.existsSync)) {
  fail('Missing QuantDeus registry/office/evolution manifest.');
}

const registry = readJson(registryPath);
const office = readJson(officePath);
const evolution = readJson(evolutionPath);
const agents = Array.isArray(registry.agents) ? registry.agents : [];
if (!agents.length) fail('No agents in coordination/agents.json.');

const hermesRoot = process.env.HERMES_HOME
  ? path.resolve(process.env.HERMES_HOME)
  : path.join(os.homedir(), '.hermes');
const profilesRoot = path.join(hermesRoot, 'profiles');

fs.mkdirSync(profilesRoot, { recursive: true });

let created = 0;
let refreshed = 0;

for (const agent of agents) {
  const profileHome = path.join(profilesRoot, agent.id);
  const schemaMarker = path.join(profileHome, '.quantdeus-bootstrap-schema');
  const configPath = path.join(profileHome, 'config.yaml');
  const soulPath = path.join(profileHome, 'SOUL.md');

  fs.mkdirSync(profileHome, { recursive: true });

  let schema = 0;
  try { schema = Number(fs.readFileSync(schemaMarker, 'utf8').trim()) || 0; } catch {}

  // Only replace canonical config when the bootstrap schema changes. This lets
  // agents evolve MCP/skill/config state between canonical migrations.
  if (schema !== BOOTSTRAP_SCHEMA || !fs.existsSync(configPath)) {
    writeJsonYaml(configPath, canonicalConfig(agent, office, evolution));
    fs.writeFileSync(schemaMarker, String(BOOTSTRAP_SCHEMA) + '\n', 'utf8');
    refreshed += 1;
  }

  // Canonical identity/role is allowed to refresh; memories, sessions, state,
  // cron runtime metadata and agent-created skills remain untouched.
  fs.writeFileSync(soulPath, soulFor(agent), 'utf8');
  copyProjectSkills(profileHome);
  copyAgentSkills(profileHome, agent);

  for (const dir of ['memories', 'sessions', 'cron', 'logs']) {
    fs.mkdirSync(path.join(profileHome, dir), { recursive: true });
  }

  created += 1;
}

console.log('[hermes-office] FAST BOOTSTRAP READY');
console.log('[hermes-office] profiles=' + created + ' config_refreshed=' + refreshed);
console.log('[hermes-office] root=' + hermesRoot);
console.log('[hermes-office] model=' + (process.env.HERMES_MODEL || office.model.default));
console.log('[hermes-office] provider=' + (process.env.HERMES_MODEL_PROVIDER || office.model.provider));
console.log('[hermes-office] GitHub MCP=remote official endpoint; Playwright MCP=@playwright/mcp@latest');
console.log('[hermes-office] project skills copied to every profile');
console.log('[hermes-office] agent-local skills copied by profile id');
