const { loadState, saveState, validateManifest } = require('./lib');
function main() {
  const state = loadState();
  const manifest = validateManifest(state.manifest);
  saveState({ manifest, stage:'verified', verified_at:new Date().toISOString() });
  console.log(`Task Verifier accepted ${manifest.operations.length} operation(s)`);
}
main();
