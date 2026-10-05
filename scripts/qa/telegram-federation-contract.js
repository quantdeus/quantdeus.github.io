#!/usr/bin/env node
const fs = require('fs');

const policy = JSON.parse(fs.readFileSync('coordination/telegram-federation.json', 'utf8'));
const runtime = fs.readFileSync('vercel-dispatcher/lib/telegram-federation.js', 'utf8');
const telegram = fs.readFileSync('vercel-dispatcher/api/quantdeus/telegram.js', 'utf8');

const checks = [
  ['issue 430 policy is bounded opt-in', policy.issue === 430 && policy.mode === 'bounded-opt-in'],
  ['transport remains webhook-only', policy.transport === 'webhook-only'],
  ['node registration is opt-in and owner/admin approved', policy.node_registration?.opt_in_required === true && policy.node_registration?.mode === 'owner-admin-approved'],
  ['autonomous replication forbidden', policy.node_registration?.autonomous_replication === false],
  ['mass outreach forbidden', policy.outreach?.mass_outreach === false && policy.outreach?.mode === 'opt-in-only'],
  ['autonomous provisioning and spend forbidden', policy.scale_request?.autonomous_server_provisioning === false && policy.scale_request?.autonomous_spend === false],
  ['scale request is advisory owner review', policy.scale_request?.mode === 'advisory-only' && policy.scale_request?.action === 'owner-review'],
  ['runtime drops bot-authored updates', /blocked_bot_authored_update/.test(runtime)],
  ['runtime suppresses immediate duplicate updates', /blocked_duplicate_update/.test(runtime)],
  ['runtime has bounded per-chat rate limiting', /rate_limited/.test(runtime) && /privateMax/.test(runtime) && /groupMax/.test(runtime)],
  ['runtime exposes advisory health snapshot', /telegramFederationHealth/.test(runtime) && /owner-review/.test(runtime)],
  ['telegram webhook invokes federation ingress guard', /guardTelegramIngress\(update\)/.test(telegram)],
  ['telegram setup reports federation health', /telegramFederationHealth\(info\)/.test(telegram)]
];

let failed = false;
for (const [name, ok] of checks) {
  console.log((ok ? 'PASS' : 'FAIL') + ' — ' + name);
  failed ||= !ok;
}

if (failed) process.exit(1);
console.log('Telegram federation #430 bounded MVP contract: OK');
