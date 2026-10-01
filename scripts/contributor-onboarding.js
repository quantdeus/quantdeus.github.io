const { execFileSync } = require('child_process');
const fs = require('fs');

const CANONICAL_REPO = 'quantdeus/quantdeus.github.io';
const OWNER_LOGIN = 'quantdeus';
const REGISTRY_PATH = 'coordination/contributors.json';

function labelsOf(issue) {
  return new Set((issue.labels || []).map(l => typeof l === 'string' ? l : l.name).filter(Boolean));
}

function extractGithubLogin(body) {
  const text = String(body || '');
  const match = text.match(/GitHub(?:\s+login)?\s*[:=]?\s*`([A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?)`/i);
  if (!match) throw new Error('CEO Issue must contain a GitHub `username` marker');
  return match[1];
}

function extractDisplayName(body, fallback) {
  const text = String(body || '');
  const match = text.match(/Add\s+\*\*([^*\n]+?)\s*\/\s*GitHub\s*`/i);
  return String(match?.[1] || fallback).trim();
}

function validateAuthorizationIssue(issue) {
  if (!issue || issue.pull_request || issue.state !== 'open') throw new Error('Onboarding source must be an open Issue');
  if (String(issue.user?.login || '') !== OWNER_LOGIN) throw new Error('Onboarding requires a CEO-authored Issue');
  if (!issue.created_at || issue.updated_at !== issue.created_at) throw new Error('CEO approval Issue must remain unedited after creation');
  const labels = labelsOf(issue);
  if (!labels.has('coord:task')) throw new Error('Onboarding Issue requires coord:task');
  if (!labels.has('coord:ready') && !labels.has('coord:active')) throw new Error('Onboarding Issue must be executable');
  if (!labels.has('quantdeus-target-agent:seven-of-nine')) throw new Error('Onboarding Issue must explicitly target Seven of Nine');
  const body = String(issue.body || '');
  if (!/read[- ]only/i.test(body)) throw new Error('Onboarding Issue must explicitly request read-only access');
  if (!/workflow/i.test(body)) throw new Error('Onboarding Issue must explicitly mention workflow restrictions');
  const login = extractGithubLogin(body);
  return { login, displayName: extractDisplayName(body, login) };
}

function upsertContributor(registry, issue, identity) {
  const next = JSON.parse(JSON.stringify(registry || {}));
  next.schema_version = Number(next.schema_version || 1);
  next.title = next.title || 'QuantDeus Human Contributors';
  next.access_model = {
    repository_owner_type: 'User',
    repository_visibility: 'public',
    policy: 'registry membership never grants repository write/admin access',
    granular_read_only_collaborators: false,
    organization_migration_required_for_granular_repo_roles: true
  };
  if (!Array.isArray(next.contributors)) next.contributors = [];
  const normalized = identity.login.toLowerCase();
  const existing = next.contributors.find(c => String(c.github_login || '').toLowerCase() === normalized);
  const record = {
    github_login: identity.login,
    display_name: identity.displayName,
    status: 'active',
    requested_access: 'public-read-only',
    write_access_authorized: false,
    workflow_write_authorized: false,
    repository_role_mutation_by_automation: false,
    source_issue: Number(issue.number || issue.issue_number),
    added: String(issue.created_at || '').slice(0, 10)
  };
  if (existing) Object.assign(existing, record);
  else next.contributors.push(record);
  next.contributors.sort((a, b) => String(a.github_login).localeCompare(String(b.github_login)));
  return next;
}

function gh(token, args) {
  return execFileSync('gh', args, {
    encoding: 'utf8',
    env: { ...process.env, GH_TOKEN: token },
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

function ghJson(token, args) {
  const out = gh(token, args);
  return out ? JSON.parse(out) : null;
}

function comment(token, repo, issueNumber, body) {
  gh(token, ['issue', 'comment', String(issueNumber), '--repo', repo, '--body', body]);
}

function main() {
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  const issueNumber = Number(process.env.ISSUE_NUMBER);
  if (repo !== CANONICAL_REPO) throw new Error('Unexpected repository');
  if (!token) throw new Error('GITHUB_TOKEN is required');
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) throw new Error('ISSUE_NUMBER must be a positive integer');

  const issue = ghJson(token, ['api', `/repos/${repo}/issues/${issueNumber}`]);
  issue.number = issueNumber;
  const identity = validateAuthorizationIssue(issue);
  const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  const current = (registry.contributors || []).find(c => String(c.github_login || '').toLowerCase() === identity.login.toLowerCase());
  if (current && current.requested_access === 'public-read-only' && current.write_access_authorized === false && current.workflow_write_authorized === false) {
    comment(token, repo, issueNumber, `🖖 Contributor \`${identity.login}\` is already registered in \`${REGISTRY_PATH}\` with public-read-only policy. No repository role or workflow permission mutation was performed.`);
    console.log(JSON.stringify({ status: 'already-registered', login: identity.login, mutation: 'none' }));
    return;
  }

  const next = upsertContributor(registry, issue, identity);
  const branch = `automation/contributor-onboarding/${issueNumber}-${identity.login.toLowerCase()}`;
  const mainRef = ghJson(token, ['api', `/repos/${repo}/git/ref/heads/main`]);
  try {
    gh(token, ['api', '--method', 'POST', `/repos/${repo}/git/refs`, '-f', `ref=refs/heads/${branch}`, '-f', `sha=${mainRef.object.sha}`]);
  } catch (error) {
    const stderr = String(error.stderr || error.message || error);
    if (!/Reference already exists|422/.test(stderr)) throw error;
  }

  const file = ghJson(token, ['api', `/repos/${repo}/contents/${REGISTRY_PATH}?ref=${encodeURIComponent(branch)}`]);
  const content = Buffer.from(JSON.stringify(next, null, 2) + '\n', 'utf8').toString('base64');
  gh(token, [
    'api', '--method', 'PUT', `/repos/${repo}/contents/${REGISTRY_PATH}`,
    '-f', `message=chore(contributors): onboard ${identity.login} as read-only contributor`,
    '-f', `content=${content}`,
    '-f', `sha=${file.sha}`,
    '-f', `branch=${branch}`
  ]);

  const prs = ghJson(token, ['pr', 'list', '--repo', repo, '--state', 'open', '--head', branch, '--json', 'number,url,title']);
  let pr = prs?.[0];
  if (!pr) {
    const url = gh(token, [
      'pr', 'create', '--repo', repo, '--base', 'main', '--head', branch,
      '--title', `chore(contributors): onboard ${identity.login} read-only`,
      '--body', [
        `Closes #${issueNumber} after merge.`,
        '',
        `Registers GitHub user \`${identity.login}\` as a QuantDeus human contributor.`,
        '',
        'Guardrails:',
        '- registry-only onboarding;',
        '- public read-only policy;',
        '- no collaborator API call;',
        '- no write/admin permission grant;',
        '- no `.github/workflows/**` mutation by the onboarding executor.',
        '',
        'GitHub personal-account repositories do not provide granular read-only collaborator roles; organization migration is required before any real granular repository role can be automated.'
      ].join('\n')
    ]);
    pr = { url };
  }
  comment(token, repo, issueNumber, `🖖 Seven contributor-onboarding lane prepared ${pr.url || 'a PR'} for \`${identity.login}\`. Registry-only: no repository role or workflow permission mutation.`);
  console.log(JSON.stringify({ status: 'pr-ready', login: identity.login, branch, pr_url: pr.url || null }, null, 2));
}

if (require.main === module) {
  try { main(); }
  catch (error) {
    console.error(error.stack || error.message || error);
    process.exit(1);
  }
}

module.exports = { extractGithubLogin, extractDisplayName, validateAuthorizationIssue, upsertContributor };
