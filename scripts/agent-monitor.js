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
  console.error('Цивилизационная доктрина отсутствует или повреждена:', err.message);
  process.exit(1);
}
if (doctrine.schema_version !== 1 || !doctrine.version || !Array.isArray(doctrine.execution_gates)) {
  console.error('Схема цивилизационной доктрины недействительна');
  process.exit(1);
}
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
    check(false, agent, 'не указан исходный файл');
    continue;
  }

  const sourcePath = path.join(root, source);
  const exists = fs.existsSync(sourcePath);
  check(exists, agent, exists ? `исходный файл найден: ${source}` : `исходный файл отсутствует: ${source}`);

  if (!exists || !source.endsWith('.js')) continue;

  try {
    execFileSync(process.execPath, ['--check', sourcePath], { stdio: 'pipe' });
    check(true, agent, 'синтаксис JavaScript: ОК');
  } catch (err) {
    const detail = (err.stderr || err.stdout || err.message || '').toString().trim().split('\n')[0];
    check(false, agent, `ошибка синтаксиса JavaScript: ${detail}`);
  }
}

const report = {
  timestamp: new Date().toISOString(),
  registry_version: registry.schema_version,
  doctrine_version: doctrine.version,
  agent_count: agents.length,
  healthy_count: checks.filter(c => c.ok).length,
  failed_count: failures.length,
  failures,
  checks,
};

fs.writeFileSync('/tmp/quantdeus-agent-health.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

if (failures.length) {
  console.error(`Проверка здоровья агентов завершилась ошибками: ${failures.length} проверок.`);
  process.exit(1);
}

console.log(`Все ${agents.length} зарегистрированных агентов прошли суточную проверку здоровья.`);
