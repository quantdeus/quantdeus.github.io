const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { loadState, saveState } = require('./lib');

function git(args, opts={}) { const out = execFileSync('git', args, { encoding:'utf8', stdio:opts.inherit?'inherit':['ignore','pipe','pipe'] }); return typeof out === 'string' ? out.trim() : ''; }
function ensureParent(p) { fs.mkdirSync(path.dirname(p), { recursive:true }); }
function apply(op) {
  if (op.op === 'create') {
    if (fs.existsSync(op.path)) throw new Error(`create refused: ${op.path} already exists`);
    ensureParent(op.path); fs.writeFileSync(op.path, op.content);
  } else if (op.op === 'append') {
    if (!fs.existsSync(op.path)) throw new Error(`append refused: ${op.path} does not exist`);
    fs.appendFileSync(op.path, op.content);
  } else if (op.op === 'replace') {
    if (!fs.existsSync(op.path)) throw new Error(`replace refused: ${op.path} does not exist`);
    const before = fs.readFileSync(op.path, 'utf8');
    const count = before.split(op.find).length - 1;
    if (count !== 1) throw new Error(`replace refused: expected exactly one match in ${op.path}, got ${count}`);
    fs.writeFileSync(op.path, before.replace(op.find, op.replace));
  }
}
function validateFile(p) {
  if (!fs.existsSync(p)) return;
  if (p.endsWith('.json')) JSON.parse(fs.readFileSync(p,'utf8'));
  if (/\.(?:c?js|mjs)$/.test(p)) execFileSync(process.execPath, ['--check', p], { stdio:'inherit' });
}
function main() {
  const state = loadState();
  const branch = state.plan.branch;
  git(['config','user.name','octet-squad-b[bot]']);
  git(['config','user.email','octet-squad-b@users.noreply.github.com']);
  try { git(['fetch','origin','main']); } catch (_) {}
  git(['checkout','-b',branch]);
  for (const op of state.manifest.operations) apply(op);
  const changed = [...new Set(state.manifest.operations.map(op => op.path))];
  const dirty = git(['status','--porcelain','--',...changed]);
  if (!dirty) throw new Error('No repository changes produced');
  for (const p of changed) validateFile(p);
  git(['add','--',...changed]);
  git(['commit','-m',`⚒️ squad-b: execute issue #${state.issue.number}`], { inherit:true });
  git(['push','-u','origin',branch], { inherit:true });
  saveState({ execution:{ branch, changed_files:changed, commit:git(['rev-parse','HEAD']) }, stage:'executed' });
  console.log(`Task Smith pushed ${branch}`);
}
main();
