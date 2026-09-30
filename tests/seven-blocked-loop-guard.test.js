const fs = require('fs');
const assert = require('assert');

const workflow = fs.readFileSync('.github/workflows/seven-priority-cycle.yml', 'utf8');
const seven = fs.readFileSync('scripts/seven-of-nine.js', 'utf8');
const roleCron = fs.readFileSync('.github/workflows/agent-role-cron.yml', 'utf8');

assert(workflow.includes('trusted:false'));
assert(workflow.includes("result.runtime!=='chat'"));
assert(workflow.includes("!['none','dispatch','open_issue'].includes(d.action)"));
assert(workflow.includes('Sherlock protocol: OBSERVE'));
assert(workflow.includes('Blocked work is diagnostic context, not an executable priority.'));
assert(workflow.includes("labels.has('coord:blocked')||labels.has('squad-b:blocked')||labels.has('squad-b:review')"));
assert(workflow.includes("throw new Error('Seven dispatch selected non-executable Issue')"));
assert(workflow.includes("throw new Error('agent-role dispatch rejected non-executable Issue')"));
assert(!workflow.includes("trusted:true"));
assert(!workflow.includes('or {"action":"issue"'));
assert(!workflow.includes('or {"action":"pr"'));

assert(seven.includes('Blocked work is diagnostic context, not executable priority.'));
assert(!seven.includes("primary = `blocked:#"));
assert(seven.includes('OBSERVE → CLASSIFY → FALSIFY → OWNER → VERIFY → DONE'));

const executable = labels =>
  !labels.has('coord:blocked') &&
  !labels.has('squad-b:blocked') &&
  !labels.has('squad-b:review') &&
  (labels.has('coord:ready') || labels.has('coord:active'));

assert.strictEqual(executable(new Set(['coord:task','coord:blocked','priority:p1'])), false);
assert.strictEqual(executable(new Set(['coord:task','squad-b:blocked','coord:active'])), false);
assert.strictEqual(executable(new Set(['coord:task','squad-b:review','coord:ready'])), false);
assert.strictEqual(executable(new Set(['coord:task','coord:ready','priority:p1'])), true);
assert.strictEqual(executable(new Set(['coord:task','coord:active','priority:p0'])), true);

console.log('seven coordinator+sherlock logic guard: PASS');
