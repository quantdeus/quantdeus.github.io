use strict;

const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const token = process.env.GH_TOKEN;
const repo = process.env.GITHUB_REPOSITORY || 'quantdeus/quantdeus.github.io';
const lookbackDays = Math.max(1, Math.min(30, Number(process.env.LOOKBACK_DAYS || 7)));
const triggerWorkflow = String(process.env.TRIGGER_WORKFLOW || '');
const triggerConclusion = String(process.env.TRIGGER_CONCLUSION || '');
const triggerRunId = String(process.env.TRIGGER_RUN_ID || '');
const eventName = String(process.env.GITHUB_EVENT_NAME || '');

if (!token) throw new Error('GH_TOKEN is required');

// Debug: Log trigger data for verification
console.log(`Trigger workflow: ${triggerWorkflow}, Conclusion: ${triggerConclusion}, Run ID: ${triggerRunId}`);
console.log(`Trigger failure detected: ${failureConclusions.has(triggerConclusion)}`);

const failureConclusions = new Set(['failure', 'timed_out', 'startup_failure', 'action_required']);