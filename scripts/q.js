#!/usr/bin/env node
'use strict';
// Q's execution profile is dispatched through agent-role-cron.yml and the
// canonical OpenClaw/Hermes agent registry. This CLI exposes its bounded brief.
const fs = require('fs');
const path = require('path');

function brief(task = '') {
  const agents = JSON.parse(fs.readFileSync(path.join(__dirname, '../coordination/agents.json'), 'utf8')).agents;
  const self = agents.find(agent => agent.id === 'q');
  if (!self) throw new Error('Q not registered');
  return {
    agent_id: self.id, profile: self.id, title: self.startup_title,
    task: String(task).slice(0, 4000),
    mission: 'Challenge one untested premise and design a safe counterfactual experiment.',
    output: ['observed_facts', 'untested_premise', 'three_scenarios', 'risk_and_stop_condition', 'next_reversible_test'],
    rules: ['evidence before claims', 'one task owner', 'no production sabotage', 'human override', 'QA review'],
    dispatcher: '.github/workflows/agent-role-cron.yml'
  };
}
if (require.main === module) console.log(JSON.stringify(brief(process.argv.slice(2).join(' ')), null, 2));
module.exports = { brief };
