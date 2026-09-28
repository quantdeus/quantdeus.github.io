const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { doctrineSummary } = require('../doctrine');

const RUN_DIR = path.join(process.env.RUNNER_TEMP || '/tmp', 'quantdeus-octet-run');
const STATE_PATH = path.join(RUN_DIR, 'state.json');
const ALLOWED_OPS = new Set(['create', 'replace', 'append']);
const DENY_PATTERNS = [
  /^\.git(?:\/|$)/,
  /(^|\/)\.env(?:[^\/]*)(?:$|\/)/,
  /(^|\/)(?:id_rsa|id_ed25519|credentials?|secrets?)(?:\.|\/|$)/i,
  /\.pem$/i,
  /\.p12$/i,
  /\.key$/i,
];
const PRIVILEGED_PATTERNS = [
  /^\.github\/workflows\//,
  /^scripts\/governance-gate\.js$/,
  /^coordination\/homunculi\.json$/,
  /^CNAME$/,
];

function ensureRunDir() { fs.mkdirSync(RUN_DIR, { recursive: true }); }
function loadState() { ensureRunDir(); return fs.existsSync(STATE_PATH) ? JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) : {}; }
function saveState(patch) { const next = { ...loadState(), ...patch }; fs.writeFileSync(STATE_PATH, JSON.stringify(next, null, 2) + '\n'); return next; }
function labelsOf(issue) { return (issue.labels || []).map(x => typeof x === 'string' ? x : x.name); }
function hasLabel(issue, label) { return labelsOf(issue).includes(label); }

function gh(args, opts = {}) {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN is required');
  return execFileSync('gh', args, {
    encoding: 'utf8',
    env: { ...process.env, GH_TOKEN: token },
    stdio: opts.inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
  }).trim();
}
function ghJson(args) { const out = gh(args); return out ? JSON.parse(out) : null; }

function issueNumber() {
  const n = Number(process.env.ISSUE_NUMBER || process.argv.find(x => /^\d+$/.test(x)) || 0);
  if (!n) throw new Error('ISSUE_NUMBER is required');
  return n;
}
function readIssue() {
  const number = issueNumber();
  return ghJson(['issue','view',String(number),'--json','number,title,body,url,author,labels,state']);
}
function repoOwner() { return String(process.env.GITHUB_REPOSITORY || '').split('/')[0].toLowerCase(); }
function adminUsers() {
  return new Set(String(process.env.QUANTDEUS_ADMIN_GITHUB_USERS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean));
}
function isAdminAuthor(issue) {
  const login = String(issue.author?.login || '').toLowerCase();
  return Boolean(login && (login === repoOwner() || adminUsers().has(login)));
}
function isAuthorized(issue) {
  return hasLabel(issue, 'governance:passed') || isAdminAuthor(issue);
}

function parseManifest(body) {
  const m = String(body || '').match(/```qd-exec\s*([\s\S]*?)```/i);
  if (!m) throw new Error('Missing ```qd-exec JSON manifest in Issue body');
  let obj;
  try { obj = JSON.parse(m[1]); } catch (e) { throw new Error(`Invalid qd-exec JSON: ${e.message}`); }
  return obj;
}
function normalizeRepoPath(p) {
  const raw = String(p || '').replace(/\\/g, '/').replace(/^\.\//, '');
  if (!raw || raw.startsWith('/') || raw.includes('\0')) throw new Error(`Invalid path: ${p}`);
  const normalized = path.posix.normalize(raw);
  if (normalized === '..' || normalized.startsWith('../')) throw new Error(`Path traversal denied: ${p}`);
  return normalized;
}
function pathRisk(p) {
  const normalized = normalizeRepoPath(p);
  if (DENY_PATTERNS.some(r => r.test(normalized))) return 'denied';
  if (PRIVILEGED_PATTERNS.some(r => r.test(normalized))) return 'privileged';
  return 'normal';
}
function laneForPath(p) {
  if (/^\.github\//.test(p)) return 'automation';
  if (/^scripts\//.test(p)) return 'agents';
  if (/^(coordination|data)\//.test(p) || /\.json$/i.test(p)) return 'coordination-data';
  if (/^(docs\/|README|.*\.md$)/i.test(p)) return 'docs';
  if (/\.(html|css|js|ts|tsx|jsx)$/i.test(p)) return 'web-code';
  return 'repository';
}
function validateManifest(manifest) {
  if (!manifest || manifest.version !== 1) throw new Error('Manifest version must be 1');
  if (!Array.isArray(manifest.operations) || manifest.operations.length < 1 || manifest.operations.length > 20) throw new Error('operations must contain 1..20 items');
  const ops = manifest.operations.map((op, i) => {
    if (!ALLOWED_OPS.has(op.op)) throw new Error(`Operation #${i+1}: unsupported op ${op.op}`);
    const p = normalizeRepoPath(op.path);
    const risk = pathRisk(p);
    if (risk === 'denied') throw new Error(`Operation #${i+1}: denied path ${p}`);
    if (typeof op.content === 'string' && op.content.length > 200000) throw new Error(`Operation #${i+1}: content too large`);
    if (op.op === 'create' && typeof op.content !== 'string') throw new Error(`Operation #${i+1}: create requires content`);
    if (op.op === 'append' && typeof op.content !== 'string') throw new Error(`Operation #${i+1}: append requires content`);
    if (op.op === 'replace' && (typeof op.find !== 'string' || typeof op.replace !== 'string' || !op.find)) throw new Error(`Operation #${i+1}: replace requires non-empty find and string replace`);
    return { ...op, path: p, risk, lane: laneForPath(p) };
  });
  return { ...manifest, operations: ops };
}
function ensureLabels() {
  const defs = [
    ['squad-b:ready','2da44e','Ready for Octet Squad B execution'],
    ['squad-b:active','bf8700','Octet Squad B is executing'],
    ['squad-b:review','1f6feb','Octet Squad B opened a PR for review'],
    ['squad-b:blocked','d1242f','Octet Squad B execution is blocked'],
    ['squad-b:done','8250df','Octet Squad B execution merged/finished'],
    ['squad-b:privileged','b60205','Allows approved changes to sensitive repository surfaces'],
    ['team:octet-b','5319e7','QuantDeus second execution crew'],
  ];
  for (const [name,color,description] of defs) {
    try { gh(['label','create',name,'--color',color,'--description',description,'--force']); } catch (e) { console.error(`label ${name}: ${e.stderr?.toString() || e.message}`); }
  }
}
function editIssueLabels(number, add = [], remove = []) {
  const args = ['issue','edit',String(number)];
  for (const x of add) args.push('--add-label',x);
  for (const x of remove) args.push('--remove-label',x);
  if (args.length > 3) gh(args);
}
function commentIssue(number, body) { gh(['issue','comment',String(number),'--body',body]); }
function runNode(script) { execFileSync(process.execPath, [script], { stdio:'inherit', env:process.env }); }

module.exports = {
  RUN_DIR, STATE_PATH, ensureRunDir, loadState, saveState, labelsOf, hasLabel,
  gh, ghJson, issueNumber, readIssue, isAdminAuthor, isAuthorized, parseManifest, normalizeRepoPath,
  pathRisk, laneForPath, validateManifest, ensureLabels, editIssueLabels, commentIssue, runNode, doctrineSummary,
};
