const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = process.cwd();
const registryPath = path.join(root, 'coordination', 'agents.json');
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
const agents = registry.agents || [];

const failures = [];
const checks = [];

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

const report = {
  timestamp: new Date().toISOString(),
  registry_version: registry.schema_version,
  agent_count: agents.length,
  healthy_count: checks.filter(c => c.ok).length,
  failed_count: failures.length,
  failures,
  checks,
};

fs.writeFileSync('/tmp/quantdeus-agent-health.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

if (failures.length) {
  console.error(`Agent health check failed for ${failures.length} check(s).`);
  process.exit(1);
}

console.log(`All ${agents.length} registered agents passed the daily health check.`);
