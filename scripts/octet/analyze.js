const { loadState, saveState } = require('./lib');
function main() {
  const state = loadState();
  const ops = state.manifest.operations;
  const lanes = [...new Set(ops.map(x => x.lane))];
  const privileged = ops.filter(x => x.risk === 'privileged').map(x => x.path);
  const analysis = { operation_count:ops.length, lanes, privileged_paths:privileged, risk: privileged.length ? 'privileged' : 'normal' };
  saveState({ analysis, stage:'analyzed' });
  console.log(JSON.stringify(analysis, null, 2));
}
main();
