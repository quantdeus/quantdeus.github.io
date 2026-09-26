const { loadState, saveState } = require('./lib');
function main() {
  const state = loadState();
  const laneOrder = ['coordination-data','agents','automation','web-code','docs','repository'];
  const lanes = state.analysis.lanes.slice().sort((a,b) => laneOrder.indexOf(a) - laneOrder.indexOf(b));
  const primary = lanes[0] || 'repository';
  const plan = {
    primary_lane: primary,
    branch: `squad-b/issue-${state.issue.number}-${process.env.GITHUB_RUN_ID || 'local'}-${process.env.GITHUB_RUN_ATTEMPT || '1'}`,
    steps: ['guardian-gate','apply-operations','validate-changed-files','commit-and-push','archive','open-pr'],
    summary: state.manifest.summary || state.issue.title,
  };
  saveState({ plan, stage:'planned' });
  console.log(`Execution Strategist: ${primary} → ${plan.branch}`);
}
main();
