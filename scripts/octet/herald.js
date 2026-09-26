const { loadState, saveState, gh, ghJson, editIssueLabels, commentIssue } = require('./lib');

function main() {
  const state = loadState();
  const branch = state.execution.branch;
  const existing = ghJson(['pr','list','--head',branch,'--state','all','--json','number,url,state,title']);
  let pr = existing && existing[0];

  if (!pr) {
    const body = `Closes #${state.issue.number}\n\n## Исполнение Squad B\n\n${state.plan.summary}\n\n### Файлы\n${state.execution.changed_files.map(x=>`- \`${x}\``).join('\n')}\n\nСтраж: **${state.guardian.verdict}**\nРиск: **${state.analysis.risk}**\n\nСгенерировано QuantDeus Octet Squad B. Автоматическое слияние отключено.`;

    try {
      const url = gh(['pr','create','--head',branch,'--base','main','--title',`[Squad B] ${state.issue.title}`,'--body',body]);
      pr = ghJson(['pr','view',url,'--json','number,url,state,title']);
    } catch (e) {
      const detail = String(e.stderr?.toString() || e.message || e);
      if (!/not permitted to create or approve pull requests|createPullRequest/i.test(detail)) throw e;

      const repo = process.env.GITHUB_REPOSITORY;
      const handoffUrl = `https://github.com/${repo}/compare/main...${branch}?expand=1`;
      editIssueLabels(state.issue.number, ['squad-b:review'], ['squad-b:active','squad-b:blocked']);
      commentIssue(
        state.issue.number,
        `📣 **Вестник PR: исполнение завершено; требуется передача PR.**\n\nBranch: \`${branch}\`\nОткрыть PR: ${handoffUrl}\n\nПолитика GitHub Actions не позволяет GITHUB_TOKEN создавать Pull Request. Ветка и архив исполнения готовы для Control Tower / коннектора GitHub.`
      );
      saveState({ pr:null, handoff:{ url:handoffUrl, reason:'github-actions-pr-policy' }, stage:'review-handoff' });
      console.log(`Вестник передал создание PR: ${handoffUrl}`);
      return;
    }
  }

  editIssueLabels(state.issue.number, ['squad-b:review'], ['squad-b:active','squad-b:blocked']);
  commentIssue(state.issue.number, `📣 **Octet Squad B завершил исполнение.**\n\nPR: ${pr.url}\nBranch: \`${branch}\`\nGuardian: ${state.guardian.verdict}\n\nТребуется человеческое ревью и слияние.`);
  saveState({ pr, stage:'review' });
  console.log(`Вестник открыл PR ${pr.url}`);
}

main();
