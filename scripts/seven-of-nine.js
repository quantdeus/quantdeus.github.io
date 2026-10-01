const { execFileSync } = require('child_process');
const fs = require('fs');
const office = require('./openclaw-office-client');
const { reason, inputDigest, render } = require('./seven-reasoning');

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
