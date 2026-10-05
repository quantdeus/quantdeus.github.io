#!/usr/bin/env node
const fs = require('fs');

const bot = fs.readFileSync('scripts/telegram-bot.js', 'utf8');
const setup = fs.readFileSync('scripts/telegram-webhook-setup.js', 'utf8');
const vercelBot = fs.readFileSync('vercel-dispatcher/api/quantdeus/telegram.js', 'utf8');
const agents = JSON.parse(fs.readFileSync('coordination/agents.json', 'utf8'));

const checks = [
  ['owner has explicit role set', /const ownerIds = telegramIdSet\(/],
  ['admin has explicit role set', /const adminIds = telegramIdSet\(/],
  ['moderator has explicit role set', /const moderatorIds = telegramIdSet\(/],
  ['local role precedence owner>admin>moderator', /if \(ownerIds\.has\(id\)\) return 'owner';[\s\S]*if \(adminIds\.has\(id\)\) return 'admin';[\s\S]*if \(moderatorIds\.has\(id\)\) return 'moderator';/],
  ['owner/admin receive Pro without payment', /\['owner', 'admin'\]\.includes\(localRole\)[\s\S]*plan: 'pro'/],
  ['WordPress Pro does not mutate role', /if \(wordpress\.plan === 'pro'\) return \{ \.\.\.wordpress, role \};/],
  ['group admin entitlement is explicit', /role: 'admin', plan: 'pro', source: 'telegram-group-admin'/],
  ['unverified entitlement fails to Free', /plan: 'free', source: 'unavailable', verified: false/],
  ['UI states Pro does not grant admin role', /Покупка Pro расширяет тариф, но не выдаёт административную роль/],
  ['direct slash role commands are accepted by Actions bot', /const direct = value\.match\(\/\^\\\/\(\[a-z0-9_\]\+\)/],
  ['Actions setup derives role commands from canonical agents', /function telegramCommands\(\)[\s\S]*agents\.map\(agent =>/],
  ['Vercel setup derives role commands from canonical agents', /function telegramCommandsForAgents\(agents = \[\]\)[\s\S]*roleCommands/],
  ['Vercel router accepts direct slash role commands', /const direct = value\.match\(\/\^\\\/\(\[a-z0-9_\]\+\)/],
];

let failed = false;
for (const [name, pattern] of checks) {
  const haystack = name.includes('Vercel') ? vercelBot : name.includes('setup') ? setup : bot;
  const ok = pattern.test(haystack);
  console.log((ok ? 'PASS' : 'FAIL') + ' — ' + name);
  failed ||= !ok;
}

const ids = (agents.agents || []).map(a => a.id);
const rosterOk = ids.length === 27 && ids.includes('data');
console.log((rosterOk ? 'PASS' : 'FAIL') + ' — canonical Telegram roster is 27 agents including data');
failed ||= !rosterOk;

const active = new Set(agents.agents.filter(a => a.operational_status !== 'medbay').map(a => a.id));
for (const agent of agents.agents) {
  for (const delegated of agent.acting_for || []) {
    const ok = !active.has(delegated);
    console.log((ok ? 'PASS' : 'FAIL') + ' — delegation ' + agent.id + ' -> ' + delegated + (ok ? '' : ' duplicates an active role'));
    failed ||= !ok;
  }
}

if (failed) process.exit(1);
console.log('Telegram RBAC + active-role delegation contract: OK');
