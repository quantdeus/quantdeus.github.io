const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = process.cwd();
const failures = [];
const checks = [];
const ignored = new Set(['.git','node_modules']);

function walk(dir, out=[]) {
  for (const entry of fs.readdirSync(dir, { withFileTypes:true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}
function record(ok, target, message) {
  checks.push({ ok, target, message });
  if (!ok) failures.push({ target, message });
}

const jsFiles = walk(path.join(root,'scripts')).filter(p => p.endsWith('.js'));
for (const file of jsFiles) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio:'pipe' });
    record(true, path.relative(root,file), 'JavaScript syntax OK');
  } catch (err) {
    record(false, path.relative(root,file), (err.stderr || err.message || '').toString().trim().split('\n')[0]);
  }
}

const jsonRoots = ['coordination','wordpress'].map(x=>path.join(root,x)).filter(fs.existsSync);
const jsonFiles = jsonRoots.flatMap(dir => walk(dir)).filter(p => p.endsWith('.json'));
for (const file of jsonFiles) {
  try {
    JSON.parse(fs.readFileSync(file,'utf8'));
    record(true, path.relative(root,file), 'JSON parse OK');
  } catch (err) {
    record(false, path.relative(root,file), 'JSON parse error: ' + err.message);
  }
}

const report = {
  agent:'qa-syntax',
  timestamp:new Date().toISOString(),
  js_files:jsFiles.length,
  json_files:jsonFiles.length,
  failures,
  checks
};
fs.writeFileSync('/tmp/quantdeus-qa-syntax.json', JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if (failures.length) process.exit(1);
