const { execFileSync } = require('child_process');
const fs = require('fs');
const office = require('./openclaw-office-client');
const { reason, inputDigest, render } = require('./seven-reasoning');
const { privileged, parseIssueCreateCommand, containsSensitiveMaterial } = require('./seven-command-gate');

async function main() {
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  const hubIssue = Number(process.env.QUANTDEUS_COORDINATION_HUB_ISSUE || 9);
  if (!repo || !token) {
    console.error('GITHUB_REPOSITORY and GITHUB_TOKEN are required');
    process.exit(1);
  }
  const ghEnv = { ...process.env, GH_TOKEN: token };

  function gh(args) {
    return execFileSync('gh', args, {
      encoding: 'utf8',
      env: ghEnv,
      stdio: ['ignore','pipe','pipe'],
    }).trim();
  }
  function ghJson(args) {
    const out = gh(args);
    return out ? JSON.parse(out) : null;
  }
  function labelsOf(issue) {
    return (issue.labels || []).map(x => typeof x === 'string' ? x : x.name);
  }
  function ageHours(iso) {
    return (Date.now() - Date.parse(iso)) / 36e5;
  }

  const issues = ghJson(['issue','list','--state','open','--limit','200','--json','number,title,url,labels,updatedAt']) || [];
  const prs = ghJson(['pr','list','--state','open','--limit','100','--json','number,title,url,isDraft,updatedAt']) || [];
  const tasks = issues.filter(i => labelsOf(i).includes('coord:task'));
  const blocked = tasks.filter(i => labelsOf(i).includes('coord:blocked')).sort((a,b)=>Date.parse(a.updatedAt)-Date.parse(b.updatedAt));
  const active = tasks.filter(i => labelsOf(i).includes('coord:active'));
  const ready = tasks.filter(i => labelsOf(i).includes('coord:ready'));
  const staleActive = active.filter(i => ageHours(i.updatedAt) >= 36).sort((a,b)=>Date.parse(a.updatedAt)-Date.parse(b.updatedAt));
  const reviewQueue = prs.filter(p => !p.isDraft);

  const snapshot = {
    agent:'seven-of-nine',
    timestamp:new Date().toISOString(),
    role:'QuantDeus Coordinator / AI Chief of Staff',
    tasks:{total:tasks.length,ready:ready.length,active:active.length,blocked:blocked.length,stale_active:staleActive.length},
    open_non_draft_prs:reviewQueue.length
  };
  const hub = ghJson(['issue','view',String(hubIssue),'--json','comments,title,url']);

  // Direct owner/admin commands use a narrow deterministic execution gate.
  // The LLM remains tool-free; only CREATE_ISSUE is allowed here.
  if ((process.env.GITHUB_EVENT_NAME || '') === 'issue_comment') {
    const comments = hub.comments || [];
    let latest = comments[comments.length - 1] || null;
    try {
      const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
      if (event?.comment?.body && event?.comment?.user?.login) {
        latest = {
          id:event.comment.id,
          body:event.comment.body,
          author:{login:event.comment.user.login},
          url:event.comment.html_url || ''
        };
      }
    } catch {}
    const login = latest?.author?.login || '';
    const repoOwner = repo.split('/')[0];
    const isPrivileged = privileged(login, repoOwner, process.env.QUANTDEUS_ADMIN_GITHUB_USERS || '');
    const proposal = parseIssueCreateCommand(latest?.body || '');

    if (proposal && isPrivileged) {
      if (containsSensitiveMaterial(latest.body || '')) {
        gh(['issue','comment',String(hubIssue),'--body',
          '🛡️ Seven execution gate: Issue creation was rejected because the directive appears to contain credential/secret material. Store secrets privately and send only the non-secret task description.'
        ]);
        console.log('Seven of Nine: rejected direct Issue command containing sensitive material.');
        return;
      }

      const commandId = String(latest.id || 'unknown');
      proposal.body = [
        proposal.body,
        '',
        'Authorized by: @' + login,
        'Source: Coordination Hub comment ' + commandId,
        '<!-- qd-seven-command:' + commandId + ' -->'
      ].join('\n');

      const outputPath = '/tmp/quantdeus-seven-command-output.txt';
      try { fs.unlinkSync(outputPath); } catch {}
      execFileSync(process.execPath,['scripts/publish-agent-issue.js'],{
        encoding:'utf8',
        env:{
          ...process.env,
          ISSUE_PROPOSAL_B64:Buffer.from(JSON.stringify(proposal)).toString('base64'),
          ISSUE_SOURCE_AGENT:'seven-of-nine',
          ISSUE_SOURCE_WORKFLOW:'quantdeus-coordinator.yml',
          GITHUB_OUTPUT:outputPath
        },
        stdio:['ignore','pipe','pipe']
      });
      const outputs = Object.fromEntries(
        fs.readFileSync(outputPath,'utf8').split(/\r?\n/).filter(Boolean).map(line=>{
          const i=line.indexOf('=');
          return i < 0 ? [line,''] : [line.slice(0,i),line.slice(i+1)];
        })
      );
      const evidence = {
        agent:'seven-of-nine',
        timestamp:new Date().toISOString(),
        status:'DIRECT_EXECUTION',
        action:'create_issue',
        authorized_by:login,
        command_id:commandId,
        issue_number:Number(outputs.issue_number || 0) || null,
        issue_status:outputs.issue_status || null,
        issue_url:outputs.issue_url || null
      };
      fs.writeFileSync('/tmp/quantdeus-seven-reasoning.json',JSON.stringify(evidence,null,2));
      gh(['issue','comment',String(hubIssue),'--body',[
        '🖖 **Seven of Nine — direct execution**',
        '',
        'Authenticated owner/admin directive accepted.',
        'Issue ' + (outputs.issue_status === 'duplicate' ? 'reused' : 'created') + ': **#' + outputs.issue_number + '**',
        outputs.issue_url || '',
        '',
        'Safety policy unchanged: this lane can only create/deduplicate a bounded Issue; secrets, spending, irreversible production changes and guardrail bypass remain prohibited.'
      ].filter(Boolean).join('\n')]);
      console.log(JSON.stringify(evidence,null,2));
      return;
    }
  }

  // Generated swarm comments never become new requests or trigger an inference loop.
  const humanComments = (hub.comments || []).filter(c =>
    c.author?.login && c.author.login.toLowerCase() === repo.split('/')[0].toLowerCase()
  ).slice(-3).map(c => ({id:c.id, body:String(c.body || '').slice(0,2000)}));
  const context = {
    snapshot,
    tasks: tasks.map(i => ({number:i.number,title:i.title,labels:labelsOf(i),url:i.url})),
    prs: prs.map(p => ({number:p.number,title:p.title,isDraft:p.isDraft,url:p.url})),
    humanComments
  };
  const hash = inputDigest(context);
  const marker = `<!-- qd-seven-of-nine-digest:${hash} -->`;
  const previous = [...(hub.comments || [])].reverse().find(c => String(c.body || '').includes('<!-- qd-seven-of-nine-digest:'));
  const unchanged = (previous?.body || '').includes(marker);
  const retryDegraded = /^(schedule|workflow_dispatch)$/.test(process.env.GITHUB_EVENT_NAME || '') &&
    (previous?.body || '').includes('LLM status: **DEGRADED**');
  if (unchanged && !retryDegraded) {
    console.log('Seven of Nine: efficiency state unchanged.');
    return;
  }
  const persona = fs.readFileSync('coordination/seven-of-nine-persona.md','utf8');
  const doctrine = fs.readFileSync('coordination/civilization-doctrine.json','utf8');
  const result = await reason({office,context,persona,doctrine,repository:repo});
  const evidence = {...snapshot, ...result, input_digest:hash, run_id:process.env.GITHUB_RUN_ID || null};
  fs.writeFileSync('/tmp/quantdeus-seven-reasoning.json',JSON.stringify(evidence,null,2));
  if (!(unchanged && result.status === 'DEGRADED')) {
    gh(['issue','comment',String(hubIssue),'--body',render(context,result,marker)]);
  }
  console.log(JSON.stringify(evidence,null,2));
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,render(context,result,marker)+'\n');
}
main().catch(error => {console.error(error); process.exitCode = 1;});
