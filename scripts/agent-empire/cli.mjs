#!/usr/bin/env node
// Runs an offline logical swarm plan; optionally performs four human-triggered,
// public GET-only endpoint presence checks. Does not invoke AI or send posts.
import { readFileSync, appendFileSync } from 'node:fs';
import { planSwarm, validateConfig } from './core.mjs';
import { probeAll } from './probe.mjs';

function argument(name, fallback) {
  const index = process.argv.indexOf('--' + name);
  if (index < 0) return fallback;
  if (index + 1 >= process.argv.length) throw new Error('Missing --' + name + ' value');
  return process.argv[index + 1];
}

async function main() {
  const config = validateConfig(JSON.parse(readFileSync('coordination/agent-empire/mesh.json', 'utf8')));
  const mode = argument('mode', 'simulate');
  if (mode !== 'simulate' && mode !== 'discover') {
    throw new Error('Mode must be simulate or discover');
  }
  const slots = argument('slots', String(config.max_virtual_agents));
  const plan = planSwarm(config, slots);
  const output = { ...plan, mode };
  if (mode === 'discover') {
    // This checks HTTP presence only, NOT authentication, MCP tool calls or actual integrations.
    output.public_endpoint_checks = await probeAll(config.readonly_probes);
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    const summary = [
      '## QuantDeus Agent Empire — bounded run',
      '',
      '- Mode: ' + mode,
      '- Virtual slots planned: ' + plan.virtual_agent_slots,
      '- Batches planned: ' + plan.batch_count,
      '- Actual LLM sessions: 0',
      '- Posts sent: 0',
      '- Incremental model costs: 0 RUB',
      '- Read-only HTTP checks: ' + (output.public_endpoint_checks?.length || 0),
      '',
      'The virtual agent slots are planning records, not live models.',
      ''
    ].join('\n');
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  }
  process.stdout.write(JSON.stringify(output, null, 2) + '\n');
}

main().catch(error => {
  console.error('Agent Empire stopped: ' + (error instanceof Error ? error.message : 'unknown error'));
  process.exitCode = 1;
});
