'use strict';

const { execFileSync } = require('node:child_process');
const { TIER_A_ALLOWED, validateTierAChangeSet } = require('./openclaw-evolution-guard');

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
function verifiedChecks(sha, names) {
  const expectedPath = {
    qa: '.github/workflows/qa-triad.yml',
    smoke: '.github/workflows/static-smoke.yml',
    'evolution-guard': '.github/workflows/openclaw-evolution-pr-guard.yml'
  };
  const checks = ghJson(['api','repos/' + repo + '/commits/' + sha + '/check-runs'])?.check_runs || [];
  const selected = new Map();

  for (const name of names) {
    for (const check of checks.filter(x => x.name === name && x.app?.slug === 'github-actions')) {
      const match = String(check.details_url || check.html_url || '').match(/\/actions\/runs\/(\d+)(?:\/job\/\d+)?/);
      if (!match) continue;
      const run = ghJson(['api', 'repos/' + repo + '/actions/runs/' + match[1]]);
      if (run.head_sha !== sha || run.path !== expectedPath[name] || !['workflow_dispatch','pull_request'].includes(run.event)) continue;
      if (check.status === 'completed' && check.conclusion !== 'success') {
        return { failed: name + ' concluded ' + String(check.conclusion), selected };
      }
      if (check.status === 'completed' && check.conclusion === 'success') {
        selected.set(name, { check, run });
        break;
      }
    }
  }
  return { failed: null, selected };
}

(async () => {
  const meta = ghJson(['pr','view',String(prNumber),'--repo',repo,'--json','state,baseRefName,headRefName,headRefOid,files,isCrossRepository,isDraft']);
  if (!meta || meta.state !== 'OPEN' || meta.baseRefName !== 'main') throw new Error('PR must be open against main');
  if (!String(meta.headRefName || '').startsWith(expectedPrefix)) throw new Error('unexpected PR branch');

  const evolutionBranch = String(meta.headRefName || '').startsWith('automation/openclaw-evolution/');
  if (evolutionBranch && mode !== 'openclaw-skill') {
    console.log('Evolution PR cannot merge through manifest/site modes.');
    return;
  }

  const files = (meta.files || []).map(f => f.path);
  if (!files.length || files.length > 8) throw new Error('automerge file count outside bounded range');

  if (mode === 'manifest') {
    if (files.some(p => p !== 'coordination/manifesto-living.md')) {
      console.log('Manifest PR touches non-living-manifest paths; leaving open for human review.');
      return;
    }
  } else if (mode === 'site') {
    if (files.some(p => !allowedSitePath(p))) {
      console.log('Site PR touches a non-content/non-site path; leaving open for human review.');
      return;
    }
  } else {
    if (!evolutionBranch || meta.isCrossRepository || meta.isDraft) {
      console.log('Tier A evolution auto-merge requires same-repository non-draft evolution PR.');
      return;
    }
    if (files.length > 3 || files.some(p => !TIER_A_ALLOWED.has(p))) {
      console.log('Evolution PR is not bounded Tier A; leaving open for human/Seven review.');
      return;
    }

    const currentMain = ghJson(['api','repos/' + repo + '/git/ref/heads/main'])?.object?.sha;
    if (!currentMain) throw new Error('unable to resolve current main');
    const baseByPath = {};
    const candidateByPath = {};
    for (const path of files) {
      baseByPath[path] = readAt(currentMain, path);
      candidateByPath[path] = readAt(meta.headRefOid, path);
    }
    validateTierAChangeSet({ changedPaths: files, baseByPath, candidateByPath });
    console.log('Tier A strict path + semantic envelope revalidated against current main.');
  }

  const sha = meta.headRefOid;
  const required = mode === 'openclaw-skill' ? ['qa','smoke','evolution-guard'] : ['qa','smoke'];
  const maxAttempts = mode === 'openclaw-skill' ? 1 : 24;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const verified = verifiedChecks(sha, required);
    if (verified.failed) {
      console.log(verified.failed + '; leaving PR open.');
      return;
    }

    if (required.every(name => verified.selected.has(name))) {
      if (mode === 'openclaw-skill') {
        const runIds = required.map(name => verified.selected.get(name).run.id);
        if (new Set(runIds).size !== required.length) throw new Error('QA, Smoke, and Evolution Guard must be independent workflow runs');
      }
      const latest = ghJson(['pr','view',String(prNumber),'--repo',repo,'--json','headRefOid,files,isDraft']);
      if (latest.headRefOid !== sha || latest.isDraft) throw new Error('PR head/draft state moved during verification');
      const latestFiles = (latest.files || []).map(f => f.path);
      if (JSON.stringify(latestFiles) !== JSON.stringify(files)) throw new Error('PR file set moved during verification');
      gh(['pr','merge',String(prNumber),'--repo',repo,'--squash','--delete-branch','--match-head-commit',sha]);
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
