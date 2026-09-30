const fs = require('fs');
const assert = require('assert');

const workflow = fs.readFileSync('.github/workflows/seven-priority-cycle.yml', 'utf8');

assert(workflow.includes('Blocked work is diagnostic context, not an executable priority.'));
assert(workflow.includes('Classify blockers as human_decision, external_environment, technical, or dependency.'));
assert(workflow.includes("labels.has('coord:blocked')||labels.has('squad-b:blocked')"));
assert(workflow.includes("throw new Error('Seven selected blocked Issue as executable action')"));

const blocked = new Set(['coord:task', 'coord:blocked', 'priority:p1']);
const ready = new Set(['coord:task', 'coord:ready', 'priority:p1']);
const executable = labels => !labels.has('coord:blocked') && !labels.has('squad-b:blocked');
assert.strictEqual(executable(blocked), false);
assert.strictEqual(executable(ready), true);

console.log('seven blocked-loop guard: PASS');
