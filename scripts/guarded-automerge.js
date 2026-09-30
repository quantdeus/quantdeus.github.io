'use strict';

const { execFileSync } = require('node:child_process');
const {
  TIER_A_ALLOWED,
  validateTierAChangeSet
} = require('./openclaw-evolution-guard');

const repo = process.env.GITHUB_REPOSITORY;
const prNumber = Number(process.env.PR_NUMBER || 0);
const mode = String(process.env.AUTO_MERGE_MODE || '');
const expectedPrefix = String(process.env.EXPECTED_BRANCH_PREFIX || '');

if (!repo || !prNumber || !['manifest','site','openclaw-skill'].includes(mode) || !expectedPrefix) {
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
function apiPath(path) { return path.split('/').map(encodeURIComponent).join('/'); }
function readAt(ref, path) {
  const data = ghJson(['api', 'repos/' + repo + '/contents/' + apiPath(path) + '?ref=' + encodeURIComponent(ref)]);
  if (!data?.content) throw new Error('unable to read ' + path + ' at ' + ref);
  return Buffer.from(String(data.content).replace(/\n/g,''), 'base64').toString('utf8');
}

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
  const meta = ghJson(['pr','view',String(prNumber),'--repo',repo,'--json','state,baseRefName,headRefName,headRefOid,files,isCrossRepository,headRepositoryOwner']);
  if (!meta || meta.state !== 'OPEN' || meta.baseRefName !== 'main') throw new Error('PR must be open against main');
  if (!String(meta.headRefName || '').startsWith(expectedPrefix)) throw new Error('unexpected PR branch');
  const files = (meta.files || []).map(f => f.path);
  if (!files.length || files.length > 8) throw new Error('automerge file count outside bounded range');

  if (mode === 'manifest') {
    if (files.some(p => p !== 'coordination/manifesto-living.md')) {
      console.log('Manifest PR touches non-living-manifest paths; leaving open for human review.');
      return;
    }
  } else if (mode === 'openclaw-skill') {
    if (meta.isCrossRepository) throw new Error('OpenClaw evolution auto-merge forbids cross-repository heads');
    if (files.some(p => !TIER_A_ALLOWED.has(p))) {
      console.log('OpenClaw evolution PR is not Tier A; leaving open for Seven/human review.');
      return;
    }
    if (files.length > 3) throw new Error('OpenClaw Tier A automerge exceeds 3-file bound');

    const mainRef = ghJson(['api','repos/' + repo + '/git/ref/heads/main'])?.object?.sha;
    if (!mainRef) throw new Error('unable to resolve current main');
    const baseByPath = {};
    const candidateByPath = {};
    for (const path of files) {
      baseByPath[path] = readAt(mainRef, path);
      candidateByPath[path] = readAt(meta.headRefOid, path);
    }
    validateTierAChangeSet({ changedPaths: files, baseByPath, candidateByPath });
    console.log('Tier A strict path + semantic envelope revalidated against current main.');
  } else if (files.some(p => !allowedSitePath(p))) {
    console.log('Site PR touches a non-content/non-site path; leaving open for human review.');
    return;
  }

  const sha = meta.headRefOid;
  const requiredChecks = mode === 'openclaw-skill' ? ['qa','smoke','evolution-guard'] : ['qa','smoke'];
  const maxAttempts = mode === 'openclaw-skill' ? 1 : 24;

  for (let attempt=0; attempt<maxAttempts; attempt++) {
    const checks = ghJson(['api','repos/' + repo + '/commits/' + sha + '/check-runs'])?.check_runs || [];
    const selected = new Map();

    for (const name of requiredChecks) {
      const matches = checks.filter(x => x.name === name);
      const failed = matches.some(x => x.status === 'completed' && x.conclusion !== 'success');
      if (failed) {
        console.log(name + ' did not conclude success; leaving PR open.');
        return;
      }
      const successful = matches.find(x => x.status === 'completed' && x.conclusion === 'success');
      if (successful) selected.set(name, successful);
    }

    if (requiredChecks.every(name => selected.has(name))) {
      if (mode === 'openclaw-skill') {
        const qaSuite = selected.get('qa')?.check_suite?.id;
        const smokeSuite = selected.get('smoke')?.check_suite?.id;
        const guardSuite = selected.get('evolution-guard')?.check_suite?.id;
        if (!qaSuite || !smokeSuite || !guardSuite || new Set([qaSuite, smokeSuite, guardSuite]).size !== 3) {
          throw new Error('QA, Smoke, and Evolution Guard must come from three independent check suites');
        }
      }

      const latest = ghJson(['pr','view',String(prNumber),'--repo',repo,'--json','headRefOid,files']);
      if (latest.headRefOid !== sha) throw new Error('PR head moved during verification');
      const latestFiles = (latest.files || []).map(f => f.path);
      if (JSON.stringify(latestFiles) !== JSON.stringify(files)) throw new Error('PR file set moved during verification');

      gh(['pr','merge',String(prNumber),'--repo',repo,'--squash','--delete-branch']);
      console.log('Merged guarded ' + mode + ' PR #' + prNumber + ' after required successful checks.');
      return;
    }

    if (attempt + 1 < maxAttempts) await sleep(20000);
  }

  console.log('Required successful checks are not all present yet; leaving PR open.');
})().catch(error => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
