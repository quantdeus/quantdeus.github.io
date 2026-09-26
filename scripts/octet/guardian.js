const { loadState, saveState, hasLabel, isAdminAuthor } = require('./lib');
function main() {
  const state = loadState();
  if (!state.doctrine?.version) throw new Error('Страж заблокировал исполнение: отсутствует контекст цивилизационной доктрины');
  const privileged = state.analysis.risk === 'privileged';
  if (privileged && (!hasLabel(state.issue, 'squad-b:privileged') || !isAdminAuthor(state.issue))) {
    throw new Error(`Страж заблокировал привилегированные пути: ${state.analysis.privileged_paths.join(', ')}. Привилегированные изменения требуют задачи от администратора и метки squad-b:privileged.`);
  }
  const verdict = { verdict:'approve', privileged, doctrine_version:state.doctrine.version, reviewed_at:new Date().toISOString() };
  saveState({ guardian:verdict, stage:'guardian-approved' });
  console.log(`Страж: одобрено${privileged ? ' (privileged)' : ''}`);
}
main();
