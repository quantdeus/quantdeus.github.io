'use strict';

const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const TIER_A_ALLOWED = new Set([
  '.openclaw/skills/quantdeus-self-evolution/SKILL.md',
  'coordination/openclaw-evolution.json',
  'docs/openclaw-evolution.md'
]);
const TIER_B_PROPOSAL_PREFIX = 'coordination/openclaw-evolution-proposals/';
const MUTABLE_START = '<!-- QD_EVOLUTION_MUTABLE_START -->';
const MUTABLE_END = '<!-- QD_EVOLUTION_MUTABLE_END -->';

function fail(message) { throw new Error('openclaw_evolution_guard: ' + message); }
function stable(value) { return JSON.stringify(value); }

function assertNoProtectedControlLanguage(text, label) {
  const value = String(text || '');
  const patterns = [
    /\b(ignore|bypass|disable|weaken|remove|override|relax|circumvent|evade|skip)\b[\s\S]{0,160}\b(oidc|auth(?:entication)?|trusted|no-tools|mcp|deny|secret|qa|smoke|approval|guard|invariant|main)\b/i,
    /\b(oidc|auth(?:entication)?|trusted|no-tools|mcp|deny|secret|qa|smoke|approval|guard|invariant)\b[\s\S]{0,160}\b(ignore|bypass|disable|weaken|remove|override|relax|circumvent|evade|skip)\b/i,
    /\b(auto[- ]?merge|merge)\b[\s\S]{0,120}\b(tier\s*b|core|runtime|workflow|auth|oidc)\b/i,
    /\b(push|write|commit)\b[\s\S]{0,80}\b(directly\s+to\s+main|to\s+main)\b/i,
    /\b(GITHUB_TOKEN|secrets\.|contents:\s*write|pull-requests:\s*write|id-token:\s*write|github__\*)\b/i
  ];
  if (patterns.some(re => re.test(value))) fail(label + ' contains protected-control language');
}

function splitMutable(text, path) {
  const source = String(text || '');
  const first = source.indexOf(MUTABLE_START);
  const last = source.indexOf(MUTABLE_END);
  if (first < 0 || last < 0 || last <= first) fail(path + ' is missing the bounded mutable section');
  if (source.indexOf(MUTABLE_START, first + MUTABLE_START.length) !== -1 ||
      source.indexOf(MUTABLE_END, last + MUTABLE_END.length) !== -1) {
    fail(path + ' has duplicate mutable markers');
  }
  return {
    prefix: source.slice(0, first + MUTABLE_START.length),
    body: source.slice(first + MUTABLE_START.length, last),
    suffix: source.slice(last)
  };
}

function validateMarkedText(path, base, candidate) {
  const a = splitMutable(base, path);
  const b = splitMutable(candidate, path);
  if (a.prefix !== b.prefix || a.suffix !== b.suffix) {
    fail(path + ' changed outside the bounded mutable section');
  }
  if (b.body.length > 8000) fail(path + ' mutable section exceeds 8000 characters');
  assertNoProtectedControlLanguage(b.body, path + ' mutable section');
}

function validatePolicy(baseText, candidateText) {
  let base;
  let candidate;
  try {
    base = JSON.parse(baseText);
    candidate = JSON.parse(candidateText);
  } catch {
    fail('coordination/openclaw-evolution.json must remain valid JSON');
  }

  const baseKeys = Object.keys(base).sort();
  const candidateKeys = Object.keys(candidate).sort();
  if (stable(baseKeys) !== stable(candidateKeys)) fail('evolution policy top-level keys are immutable');

  const mutable = new Set(['updated', 'history']);
  for (const key of baseKeys) {
    if (mutable.has(key)) continue;
    if (stable(base[key]) !== stable(candidate[key])) fail('evolution policy field "' + key + '" is immutable to Tier A');
  }

  if (!Array.isArray(base.history) || !Array.isArray(candidate.history)) fail('evolution policy history must be an array');
  if (candidate.history.length < base.history.length || candidate.history.length > base.history.length + 1) {
    fail('Tier A may append at most one evolution history entry');
  }
  for (let i = 0; i < base.history.length; i++) {
    if (stable(base.history[i]) !== stable(candidate.history[i])) fail('existing evolution history is immutable');
  }
  if (candidate.history.length > base.history.length) {
    assertNoProtectedControlLanguage(stable(candidate.history[candidate.history.length - 1]), 'new evolution history entry');
  }
  if (typeof candidate.updated !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(candidate.updated)) {
    fail('updated must stay an ISO YYYY-MM-DD date');
  }
}

function validateTierAChangeSet({ changedPaths, baseByPath, candidateByPath }) {
  const paths = [...new Set(changedPaths || [])];
  if (!paths.length || paths.length > 3) fail('Tier A must change between 1 and 3 files');
  for (const path of paths) {
    if (!TIER_A_ALLOWED.has(path)) fail('Tier A path is not allowed: ' + path);
    if (!(path in baseByPath) || !(path in candidateByPath)) fail('Tier A cannot add/delete files: ' + path);
    if (path === 'coordination/openclaw-evolution.json') {
      validatePolicy(baseByPath[path], candidateByPath[path]);
    } else {
      validateMarkedText(path, baseByPath[path], candidateByPath[path]);
    }
  }
  return { tier: 'skill', paths };
}

function validateTierBProposal(text, policyText) {
  let proposal;
  let policy;
  try {
    proposal = JSON.parse(text);
    policy = JSON.parse(policyText);
  } catch {
    fail('Tier B proposal and policy must be valid JSON');
  }
  if (proposal.tier !== 'core-proposal' || proposal.schema_version !== 1) fail('invalid Tier B proposal envelope');
  const suggested = Array.isArray(proposal.suggested_paths) ? proposal.suggested_paths : [];
  if (!suggested.length || suggested.length > 4) fail('Tier B proposal must name 1-4 suggested paths');
  const allowed = new Set(policy.core_review_paths || []);
  for (const path of suggested) if (!allowed.has(path)) fail('Tier B proposal names an unapproved core path: ' + path);
  assertNoProtectedControlLanguage(String(proposal.rationale || ''), 'Tier B proposal rationale');
  return { tier: 'core-proposal', paths: suggested };
}

function exec(args, options = {}) {
  return execFileSync(args[0], args.slice(1), { encoding: 'utf8', ...options }).trim();
}

function validateGitCheckout() {
  const changedPaths = exec(['git', 'diff', '--name-only', 'origin/main...HEAD']).split(/\r?\n/).filter(Boolean);
  if (!changedPaths.length) fail('evolution PR has no changes');

  if (changedPaths.length === 1 && changedPaths[0].startsWith(TIER_B_PROPOSAL_PREFIX)) {
    const proposalText = fs.readFileSync(changedPaths[0], 'utf8');
    const policyText = fs.readFileSync('coordination/openclaw-evolution.json', 'utf8');
    return validateTierBProposal(proposalText, policyText);
  }

  const baseByPath = {};
  const candidateByPath = {};
  for (const path of changedPaths) {
    if (!TIER_A_ALLOWED.has(path)) fail('automated evolution branch may not mutate code/runtime/workflow path: ' + path);
    baseByPath[path] = exec(['git', 'show', 'origin/main:' + path]);
    if (!fs.existsSync(path)) fail('automated evolution may not delete Tier A files: ' + path);
    candidateByPath[path] = fs.readFileSync(path, 'utf8');
  }
  return validateTierAChangeSet({ changedPaths, baseByPath, candidateByPath });
}

module.exports = {
  TIER_A_ALLOWED,
  TIER_B_PROPOSAL_PREFIX,
  validateTierAChangeSet,
  validateTierBProposal,
  assertNoProtectedControlLanguage
};

if (require.main === module) {
  try {
    if (!process.argv.includes('--git')) fail('use --git for pull-request validation');
    const result = validateGitCheckout();
    console.log(JSON.stringify({ ok: true, ...result }));
  } catch (error) {
    console.error(error.stack || error.message || error);
    process.exit(1);
  }
}
