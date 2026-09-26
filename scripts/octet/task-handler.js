const { runNode, issueNumber, editIssueLabels, commentIssue } = require('./lib');
const path = require('path');
const stages = ['scout','verify','analyze','strategize','guardian','tasksmith','archivist','herald'];
function main() {
  const number = issueNumber();
  try {
    for (const stage of stages) runNode(path.join(__dirname, `${stage}.js`));
  } catch (e) {
    console.error(e.stack || e.message);
    try {
      editIssueLabels(number, ['squad-b:blocked'], ['squad-b:active']);
      commentIssue(number, `🛑 **Octet Squad B blocked.**\n\n\`${String(e.message || e).slice(0,1500)}\`\n\nFix the task/manifest or required labels, then re-add \`squad-b:ready\`.`);
    } catch (_) {}
    process.exit(1);
  }
}
main();
