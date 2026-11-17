'use strict';

// Verifies one REAL inference, not a tool call; a daily rotation costs one free request.
const fs = require('node:fs');
const llm = require('./cloud-llm-client');

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
  ], {maxTokens: 40, timeoutMs: 25000});
  if (result.text.trim() !== 'QD_AGENT_SMOKE_OK') {
    throw new Error('OPENROUTER_SMOKE_UNEXPECTED_MODEL_RESPONSE');
  }
  const status = {
    ok:true,
    agent_id:agent.id,
    model:result.model,
    provider:result.provider,
    transport:result.transport,
    mode:'text_only_no_tools',
    route:'free_model_only'
  };
  console.log(JSON.stringify(status, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      '## Проверка OpenRouter: реальный ответ\\n\\n' +
      '- Агент: `' + agent.id + '`\\n' +
      '- Модель: `' + result.model + '`\\n' +
      '- Маршрут: `' + result.transport + '`\\n' +
      '- Результат: OK (текст без инструментов)\\n');
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('OPENROUTER_SMOKE_FAILED: ' + String(error?.message || error).slice(0, 240));
    process.exitCode = 1;
  });
}

module.exports = {main};
