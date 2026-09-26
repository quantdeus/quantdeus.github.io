const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { loadState, saveState } = require('./lib');
function git(args, opts={}) { const out = execFileSync('git', args, { encoding:'utf8', stdio:opts.inherit?'inherit':['ignore','pipe','pipe'] }); return typeof out === 'string' ? out.trim() : ''; }
function main() {
  const state = loadState();
  const dir = 'coordination/executions';
  fs.mkdirSync(dir, { recursive:true });
  const p = path.join(dir, `issue-${state.issue.number}.md`);
  const body = `# Squad B execution — Issue #${state.issue.number}\n\n- Task: ${state.issue.title}\n- Doctrine: ${state.doctrine?.version || 'missing'}\n- Started: ${state.started_at}\n- Executed commit: ${state.execution.commit}\n- Risk: ${state.analysis.risk}\n- Lanes: ${state.analysis.lanes.join(', ')}\n- Branch: \`${state.execution.branch}\`\n\n## Changed files\n\n${state.execution.changed_files.map(x => `- \`${x}\``).join('\n')}\n\n## Summary\n\n${state.plan.summary}\n`;
  fs.writeFileSync(p, body);
  git(['add',p]);
  git(['commit','-m',`🗄️ squad-b: archive issue #${state.issue.number}`], { inherit:true });
  git(['push','origin',state.execution.branch], { inherit:true });
  saveState({ execution:{...state.execution, archive:p, archive_commit:git(['rev-parse','HEAD'])}, stage:'archived' });
  console.log(`Archivist wrote ${p}`);
}
main();
