const { execFileSync } = require('child_process');

const token = process.env.GITHUB_TOKEN;
const repo = process.env.GITHUB_REPOSITORY;
const prNumber = Number(process.env.PR_NUMBER || 0);
if (!token || !repo || !prNumber) throw new Error('GITHUB_TOKEN, GITHUB_REPOSITORY and PR_NUMBER are required');

function gh(args) {
  return execFileSync('gh', args, {
    encoding:'utf8',
    env:{...process.env, GH_TOKEN:token},
    stdio:['ignore','pipe','pipe']
  }).trim();
}

const pr = JSON.parse(gh(['pr','view',String(prNumber),'--json','number,title,body,mergedAt,headRefName,url']));
if (!pr.mergedAt) process.exit(0);
if (!String(pr.headRefName || '').startsWith('squad-b/')) process.exit(0);

const match = String(pr.body || '').match(/Closes\s+#(\d+)/i);
if (!match) throw new Error('Merged Squad B PR does not declare Closes #<issue>');
const issue = match[1];

gh(['issue','edit',issue,
  '--add-label','squad-b:done',
  '--remove-label','squad-b:review',
  '--remove-label','squad-b:active',
  '--remove-label','squad-b:blocked',
  '--remove-label','squad-b:ready'
]);
gh(['issue','comment',issue,'--body',
  `✅ **Octet Squad B lifecycle complete.**\n\nMerged PR: ${pr.url}\n\nState transitioned to \`squad-b:done\`.`
]);
console.log(`Completed Squad B issue #${issue} from merged PR #${prNumber}`);
