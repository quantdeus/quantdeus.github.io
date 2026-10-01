'use strict';
const crypto = require('node:crypto');

function turnBudget(timeoutMs = 60000, retryTransient = false, env = process.env, now = Date.now()) {
  const deadline = Number(env.QUANTDEUS_DIALOGUE_DEADLINE_MS || 0);
  const remaining = deadline ? deadline - now : Infinity;
  return {timeoutMs:Math.max(0,Math.min(timeoutMs,remaining)),retryTransient:deadline ? false : retryTransient};
}
function issueContext(issue) {
  return {number:issue.number,title:issue.title,body:String(issue.body || '').slice(0,12000),
    labels:(issue.labels || []).map(x=>typeof x==='string'?x:x.name).sort()};
}
function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,12);
}
function isEmhComment(comment) {
  return /<!--\s*qd-emh-(?:digest|health)[^>]*-->|\*\*EMH\s*[—-]/i.test(String(comment.body || ''));
}
function skipDialogue(comments, marker, eventName = process.env.GITHUB_EVENT_NAME) {
  const prefix = marker.split(':')[0]+':';
  const latest = [...(comments || [])].reverse().find(c=>String(c.body || '').includes(prefix));
  if (!String(latest?.body || '').includes(marker)) return false;
  const retry = /^(schedule|workflow_dispatch)$/.test(eventName || '') && /(?:Runtime|LLM) status: \*\*DEGRADED\*\*/.test(latest.body);
  return !retry;
}
function turnEvidence(result, trusted = false) {
  const expected = trusted ? 'openclaw-agent-exec-trusted-tools' : 'openclaw-agent-exec-no-tools';
  if (result.runtime !== expected || !Number.isInteger(result.assistantTurns) || result.assistantTurns < 1 ||
      typeof result.model !== 'string' || !result.model.trim()) throw new Error('ROLE_DIALOGUE_UNVERIFIED_LLM_TURN');
  return {runtime:result.runtime,model:result.model,provider:result.provider || null,
    assistant_turns:result.assistantTurns,usage:result.usage || null};
}
module.exports = {turnBudget,issueContext,digest,isEmhComment,skipDialogue,turnEvidence};
