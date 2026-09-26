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
  const body = `# Исполнение Squad B — Issue #${state.issue.number}\n\n- Задача: ${state.issue.title}\n- Доктрина: ${state.doctrine?.version || 'missing'}\n- Запущено: ${state.started_at}\n- Исполненный commit: ${state.execution.commit}\n- Риск: ${state.analysis.risk}\n- Маршруты: ${state.analysis.lanes.join(', ')}\n- Ветка: \`${state.execution.branch}\`\n\n## Изменённые файлы\n\n${state.execution.changed_files.map(x => `- \`${x}\``).join('\n')}\n\n## Сводка\n\n${state.plan.summary}\n`;
  fs.writeFileSync(p, body);
  git(['add',p]);
  git(['commit','-m',`🗄️ squad-b: archive issue #${state.issue.number}`], { inherit:true });
  git(['push','origin',state.execution.branch], { inherit:true });
  saveState({ execution:{...state.execution, archive:p, archive_commit:git(['rev-parse','HEAD'])}, stage:'archived' });
  console.log(`Архивариус записал ${p}`);
}
main();
