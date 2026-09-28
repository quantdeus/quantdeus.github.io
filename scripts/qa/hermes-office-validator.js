#!/usr/bin/env node
'use strict';

const fs = require('fs');

const agents = JSON.parse(fs.readFileSync('coordination/agents.json', 'utf8'));
const office = JSON.parse(fs.readFileSync('coordination/hermes-office.json', 'utf8'));

if (office.runtime !== 'hermes-agent') throw new Error('Hermes office runtime must be hermes-agent');
if (office.registry_source !== 'coordination/agents.json') throw new Error('Hermes office must derive profiles from agents.json');
if (office.profile_strategy !== 'one-hermes-profile-per-canonical-agent') throw new Error('Hermes profile strategy drift');
if (office.office.dispatcher_profile !== 'seven-of-nine') throw new Error('Seven of Nine must own Hermes office dispatch');
if (office.office.orchestrator_profile !== 'seven-of-nine') throw new Error('Seven of Nine must own Hermes office orchestration');
if (office.source_of_truth !== 'github') throw new Error('GitHub must remain source of truth');
if (!String(office.model.default || '').toLowerCase().includes('gpt-oss')) throw new Error('Hermes office default model must be GPT-OSS');
if ((office.model.minimum_context_tokens || 0) < 65536) throw new Error('Hermes requires >=64K context');

const ids = (agents.agents || []).map(a => a.id);
if (ids.length !== office.canonical_agent_count) {
  throw new Error('Hermes office agent count drift: registry=' + ids.length + ' manifest=' + office.canonical_agent_count);
}
if (new Set(ids).size !== ids.length) throw new Error('Duplicate canonical agent ids');
for (const required of ['seven-of-nine', 'coordinator', 'qa-syntax', 'qa-contract', 'qa-repair']) {
  if (!ids.includes(required)) throw new Error('Missing required Hermes profile source: ' + required);
}

console.log('Hermes Office contract OK:', ids.length, 'profiles, model=' + office.model.default);
