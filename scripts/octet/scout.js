const { ensureLabels, readIssue, isAuthorized, parseManifest, saveState, editIssueLabels, issueNumber, hasLabel, doctrineSummary } = require('./lib');

function main() {
  ensureLabels();
  const issue = readIssue();
  if (String(issue.state).toUpperCase() !== 'OPEN') throw new Error('Issue must be open');
  if (!hasLabel(issue, 'coord:task')) throw new Error('Issue must have coord:task');
  if (!hasLabel(issue, 'squad-b:ready')) throw new Error('Issue must have squad-b:ready');
  if (!isAuthorized(issue)) throw new Error('Governance denied: task must be created by an admin or have governance:passed');
  const manifest = parseManifest(issue.body);
  const doctrine = doctrineSummary();
  saveState({ issue, manifest, doctrine, started_at: new Date().toISOString(), stage: 'scout' });
  editIssueLabels(issueNumber(), ['team:octet-b','squad-b:active'], ['squad-b:ready','squad-b:blocked']);
  console.log(`Разведчик репозитория принял Issue #${issue.number}: ${issue.title}`);
}
main();
