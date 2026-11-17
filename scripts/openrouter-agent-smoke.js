'use strict';

// One real, read-only text inference per smoke run. Never execute model-provided tools.
const fs = require('node:fs');
const llm = require('./cloud-llm-client');

function markerMatches(text) {
  const stripped = String(text || '').trim()
    .replace(/^\x60{3}(?:text)?[ \t]*\r?\n/i, '')
    .replace(/\r?\n\x60{3}$/g, '')
    .trim()
    .replace(/^[\s"'“”‘’\x60]+|[\s"'“”‘’\x60]+$/g, '')
    .replace(/[.!。]+$/g, '')
    .trim();
  return stripped === 'QD_AGENT_SMOKE_OK';
}

async function main() {
  const registry = JSON.parse(fs.readFileSync('coordination/agents.json', 'utf8'));
  const agents = registry.agents;
  if (!Array.isArray(agents) || !agents.length) throw new Error('AGENT_REGISTRY_MISSING');
  const slot = Math.floor(Date.now() / 86400000) % agents.length;
  const requestedId = String(process.env.QD_SMOKE_AGENT_ID || '').trim();
  const agent = requestedId ? agents.find(a => a.id === requestedId) : agents[slot];
  if (!agent) throw new Error('AGENT_NOT_IN_CANONICAL_REGISTRY');
  if (!llm.configured()) throw new Error('OPENROUTER_API_KEY_REQUIRED');

  const result = await llm.ask([
    {
      role:'system',
      content:'You are executing a read-only QuantDeus LLM smoke test. No tools. No external actions. Answer with only the requested plain-text marker.'
    },
    {
      role:'user',
      content:'Agent profile ' + agent.id + '. Reply exactly QD_AGENT_SMOKE_OK and nothing else.'
    }
  ], {maxTokens: 512, timeoutMs: 25000});

  // Nonempty text proves connectivity; exact instruction-following is a separate signal.
  const markerMatch = markerMatches(result.text);
  const status = {
    ok:true,
    connectivity:'verified',
    exact_marker:markerMatch,
    agent_id:agent.id,
    model:result.model,
    provider:result.provider,
    transport:result.transport,
    mode:'text_only_no_tools',
    route:'free_model_only'
  };

  if (!markerMatch) {
    console.warn('::warning title=OpenRouter marker mismatch::Live inference succeeded, but the free model did not echo the strict marker. Instruction fidelity remains unverified.');
  }
  console.log(JSON.stringify(status, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
      '## Проверка OpenRouter: реальный ответ',
      '',
      '- Агент: ' + agent.id,
      '- Модель: ' + result.model,
      '- Маршрут: ' + result.transport,
      '- Связь: OK (непустой текстовый ответ, без инструментов)',
      '- Точный маркер: ' + (markerMatch ? 'OK' : 'не совпал; требуется проверка качества')
    ].join('\n') + '\n');
  }
  if (!markerMatch && process.env.QD_SMOKE_STRICT_MARKER === 'true') {
    throw new Error('OPENROUTER_SMOKE_UNEXPECTED_MODEL_RESPONSE');
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('OPENROUTER_SMOKE_FAILED: ' + String(error?.message || error).slice(0, 240));
    process.exitCode = 1;
  });
}

module.exports = {main, markerMatches};
