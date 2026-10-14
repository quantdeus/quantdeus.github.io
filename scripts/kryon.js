#!/usr/bin/env node
'use strict';
// Kryon's execution profile is scouted through q-kryon-github-native.yml and the
// canonical GitHub agent registry. This CLI exposes its bounded brief.
const fs = require('fs');
const path = require('path');

function brief(task = '') {
  const agents = JSON.parse(fs.readFileSync(path.join(__dirname, '../coordination/agents.json'), 'utf8')).agents;
  const self = agents.find(agent => agent.id === 'kryon');
  if (!self) throw new Error('Kryon not registered');
  return {
    agent_id: self.id, profile: self.id, title: self.startup_title,
    task: String(task).slice(0, 4000),
    mission: 'Turn shared human-centered vision into a voluntary measurable collaboration.',
    output: ['shared_purpose', 'stakeholder_positions', 'two_noncoercive_options', 'consent_and_exit', 'one_measured_next_step'],
    rules: ['symbolic ideas are not evidence', 'no mind-reading', 'one task owner', 'human override', 'QA review'],
    dispatcher: '.github/workflows/q-kryon-github-native.yml'
  };
}
if (require.main === module) console.log(JSON.stringify(brief(process.argv.slice(2).join(' ')), null, 2));
module.exports = { brief };
