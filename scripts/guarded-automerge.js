'use strict';

const { execFileSync } = require('child_process');

const repo = process.env.GITHUB_REPOSITORY;
const prNumber = Number(process.env.PR_NUMBER || 0);
const mode = String(process.env.AUTO_MERGE_MODE || '');
const expectedPrefix = String(process.env.EXPECTED_BRANCH_PREFIX || '');

if (!repo || !prNumber || !['manifest','site'].includes(mode) || !expectedPrefix) {
  console.error('GITHUB_REPOSITORY, PR_NUMBER, AUTO_MERGE_MODE and EXPECTED_BRANCH_PREFIX are required');
  process.exit(2);
}

const env = { ...process.env, GH_TOKEN: process.env.GH_TOKEN || process.env.GITHUB_TOKEN };
function gh(args) {
  return execFileSync('gh', args, { encoding:'utf8', env, stdio:['ignore','pipe','pipe'] }).trim();
}
function ghJson(args) {
  const out = gh(args);
  return out ? JSON.parse(out) : null;
}
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function allowedSitePath(path) {
  return path === 'index.html' ||
    path === 'README.md' ||
    path === 'robots.txt' ||
    path === 'sitemap.xml' ||
    path === 'coordination/index.html' ||
    path === 'coordination.html' ||
    path === 'coordination/growth/platform-campaign-queue.md' ||
    path.startsWith('site/') ||
    path.startsWith('telegram/') ||
    path.startsWith('homunculi/') ||
    path.startsWith('docs/') ||
    path.startsWith('coordination/growth/');
}

(async () => {
  const meta = ghJson(['pr','view',String(prNumber),'--repo',repo,'--json','state,baseRefName,headRefName,headRefOid,files']);
  if (!meta || meta.state !== 'OPEN' || meta.baseRefName !== 'main') throw new Error('PR must be open against main');
  if (!String(meta.headRefName || '').startsWith(expectedPrefix)) throw new Error('unexpected PR branch');
  const files = (meta.files || []).map(f => f.path);
  if (!files.length || files.length > 8) throw new Error('automerge file count outside bounded range');

  if (mode === 'manifest') {
    if (files.some(p => p !== 'coordination/manifesto-living.md')) {
      console.log('Manifest PR touches non-living-manifest paths; leaving open for human review.');
      return;
    }
  } else if (files.some(p => !allowedSitePath(p))) {
    console.log('Site PR touches a non-content/non-site path; leaving open for human review.');
    return;
  }

  const sha = meta.headRefOid;
  for (let attempt=0; attempt<24; attempt++) {
    const checks = ghJson(['api',`repos/${repo}/commits/${sha}/check-runs`])?.check_runs || [];
    const important = checks.filter(x => x.name === 'qa' || x.name === 'smoke');
    const hardFail = important.some(x => x.status === 'completed' && !['success','neutral','skipped'].includes(x.conclusion));
    if (hardFail) {
      console.log('QA/Smoke failed; leaving PR open.');
      return;
    }
    const qaOk = important.some(x => x.name === 'qa' && x.status === 'completed' && ['success','neutral','skipped'].includes(x.conclusion));
    const smokeOk = important.some(x => x.name === 'smoke' && x.status === 'completed' && ['success','neutral','skipped'].includes(x.conclusion));
    if (qaOk && smokeOk) {
      const latest = ghJson(['pr','view',String(prNumber),'--repo',repo,'--json','headRefOid']);
      if (latest.headRefOid !== sha) throw new Error('PR head moved during verification');
      gh(['pr','merge',String(prNumber),'--repo',repo,'--squash','--delete-branch']);
      console.log(`Merged guarded ${mode} PR #${prNumber}`);
      return;
    }
    await sleep(20000);
  }
  console.log('QA/Smoke did not settle within the guard window; leaving PR open.');
})().catch(error => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
