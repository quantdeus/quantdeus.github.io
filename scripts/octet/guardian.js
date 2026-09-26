const { loadState, saveState, hasLabel, isAdminAuthor } = require('./lib');
function main() {
  const state = loadState();
  if (!state.doctrine?.version) throw new Error('Guardian blocked execution: missing civilization doctrine context');
  const privileged = state.analysis.risk === 'privileged';
  if (privileged && (!hasLabel(state.issue, 'squad-b:privileged') || !isAdminAuthor(state.issue))) {
    throw new Error(`Guardian blocked privileged paths: ${state.analysis.privileged_paths.join(', ')}. Privileged changes require an admin-authored task and squad-b:privileged.`);
  }
  const verdict = { verdict:'approve', privileged, doctrine_version:state.doctrine.version, reviewed_at:new Date().toISOString() };
  saveState({ guardian:verdict, stage:'guardian-approved' });
  console.log(`Guardian: approve${privileged ? ' (privileged)' : ''}`);
}
main();
