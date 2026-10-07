'use strict';

const fs = require('fs');
const { spawnSync, execFileSync } = require('child_process');

const registry = JSON.parse(fs.readFileSync('coordination/agents.json', 'utf8'));
const byId = new Map(registry.agents.map(a => [a.id, a]));
const rotation = {0:'unity',4:'synthesis',8:'archivist',12:'herald',16:'tasksmith',20:'control-tower'};
const allowed = new Set(Object.values(rotation));
const manual = String(process.env.INPUT_AGENT_ID || '').trim();
const now = new Date();
const hour = now.getUTCHours();
const minute = now.getUTCMinutes();
const slots = Object.keys(rotation).map(Number).sort((a,b)=>a-b);
const nowMinutes = hour * 60 + minute;
const dueSlots = slots.filter(h => h * 60 + 53 <= nowMinutes);
const scheduledHour = dueSlots.length ? dueSlots[dueSlots.length - 1] : slots[slots.length - 1];
const requestedAgentId = manual || rotation[scheduledHour];

if (manual && !allowed.has(requestedAgentId)) throw new Error('Invalid growth/site agent');
if (!requestedAgentId || !allowed.has(requestedAgentId)) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, 'action=none\n');
  console.log(JSON.stringify({ok:true,action:'none',reason:'no valid growth/site slot',hour_utc:hour,minute_utc:minute}));
  process.exit(0);
}

const requestedAgent = byId.get(requestedAgentId);
const delegatedFrom = requestedAgent?.operational_status === 'medbay' ? requestedAgentId : null;
const agentId = delegatedFrom ? String(requestedAgent?.temporary_delegate || '') : requestedAgentId;
if (!agentId || !allowed.has(agentId) || !byId.has(agentId)) throw new Error('Invalid medbay delegate for ' + requestedAgentId);
const agent = byId.get(agentId);

function parse(text) {
  const raw = String(text || '').trim();
  try { return JSON.parse(raw); } catch {}
  const fence = new RegExp('\\x60\\x60\\x60(?:json)?\\s*([\\s\\S]*?)\\x60\\x60\\x60', 'i');
  const m = raw.match(fence);
  if (m) return JSON.parse(m[1].trim());
  throw new Error('GitHub-native growth response must be strict JSON');
}

const prompt = [
  'QuantDeus GitHub-native growth + site cycle.',
  'Repository: ' + process.env.GITHUB_REPOSITORY + '. Base branch: main.',
  'Requested slot: ' + requestedAgentId + '. Active profile: ' + agentId + ' — ' + agent.role,
  delegatedFrom ? 'EMH medbay delegation: ' + delegatedFrom + ' is temporarily inactive; preserve its requested mission while using the active delegate profile.' : '',
  '',
  'Read coordination/manifesto-living.md, coordination/growth/marketing-operating-system.md, coordination/growth/marketing-stack.json, coordination/growth/marketing-scorecard.json, coordination/growth/platform-playbook.json, coordination/growth/contributor-recruitment.md and coordination/agents.json, plus relevant current Issues, PRs and Actions through the built-in GitHub MCP server.',
  'This temporary GitHub-native lane is deliberately ISSUE-ONLY. Do not edit repository files, create branches, create PRs, merge, close issues, dispatch workflows, publish externally, spend money, change secrets, auth, payments, governance or production.',
  'Do not claim live-site/browser inspection in this lane; use repository and GitHub evidence only.',
  '',
  'Goal: improve truthful discovery, qualified demand and measurable movement through ATTRACT → CAPTURE → NURTURE → CONVERT → RETAIN → REFER.',
  'Every proposed task must name audience, funnel stage, CTA, hypothesis and primary metric. Generated copy alone is not success.',
  'Programmatic SEO is allowed only when every indexed page has distinct user intent and substantive unique value. Classic doorway pages, thin city/keyword permutations and scaled low-value content are forbidden.',
  'Unknown metrics remain unknown. Do not fabricate traffic, CTR, conversion, users, revenue, engagement or campaign results.',
  'Never mass-DM strangers, fake likes/followers/contributors, impersonate people, scrape private contacts, or manufacture engagement.',
  'Political/civic topics must remain neutral/informational and must not be used for voter targeting, party/candidate promotion or outrage bait.',
  '',
  'Use search_issues/list_issues before writing. Prefer updating one existing open matching Growth task instead of creating a duplicate. If a material bounded growth task exists, create or update at most ONE open Issue via issue_write.',
  'The Issue title must begin [TASK][Growth][GitHub Native].',
  'The body must include exactly these markers: <!-- quantdeus-growth-github-native --> and <!-- quantdeus-target-agent:' + agentId + ' -->.',
  'The body must contain sections: Evidence, Audience, Funnel stage, CTA, Hypothesis, Primary metric, Acceptance, Safety/guardrails.',
  'Use labels only when they already exist or can be safely created. Do not close any issue.',
  '',
  'After verifying the Issue exists, return ONLY strict JSON:',
  '{"action":"none","reason":"..."}',
  'or {"action":"issue","issue_number":123,"summary":"..."}'
].filter(Boolean).join('\n');

const args = [
  '-p', prompt, '-s', '--no-ask-user',
  '--disable-mcp-server=playwright',
  '--disable-mcp-server=fetch',
  '--disable-mcp-server=time',
  '--add-github-mcp-tool=get_file_contents',
  '--add-github-mcp-tool=search_code',
  '--add-github-mcp-tool=list_issues',
  '--add-github-mcp-tool=issue_read',
  '--add-github-mcp-tool=search_issues',
  '--add-github-mcp-tool=list_pull_requests',
  '--add-github-mcp-tool=get_pull_request',
  '--add-github-mcp-tool=get_pull_request_files',
  '--add-github-mcp-tool=actions_list',
  '--add-github-mcp-tool=actions_get',
  '--add-github-mcp-tool=issue_write',
  '--add-github-mcp-tool=label_write',
  '--allow-tool=read',
  '--allow-tool=github-mcp-server(get_file_contents)',
  '--allow-tool=github-mcp-server(search_code)',
  '--allow-tool=github-mcp-server(list_issues)',
  '--allow-tool=github-mcp-server(issue_read)',
  '--allow-tool=github-mcp-server(search_issues)',
  '--allow-tool=github-mcp-server(list_pull_requests)',
  '--allow-tool=github-mcp-server(get_pull_request)',
  '--allow-tool=github-mcp-server(get_pull_request_files)',
  '--allow-tool=github-mcp-server(actions_list)',
  '--allow-tool=github-mcp-server(actions_get)',
  '--allow-tool=github-mcp-server(issue_write)',
  '--allow-tool=github-mcp-server(label_write)',
  '--deny-tool=shell',
  '--deny-tool=write',
  '--deny-tool=url',
  '--deny-tool=github-mcp-server(merge_pull_request)',
  '--deny-tool=github-mcp-server(delete_file)',
  '--deny-tool=github-mcp-server(create_or_update_file)',
  '--deny-tool=github-mcp-server(push_files)',
  '--deny-tool=github-mcp-server(create_branch)',
  '--deny-tool=github-mcp-server(create_pull_request)',
  '--deny-tool=github-mcp-server(actions_run_trigger)'
];

const result = spawnSync('copilot', args, {
  encoding: 'utf8',
  env: {...process.env},
  maxBuffer: 20 * 1024 * 1024,
  timeout: 12 * 60 * 1000
});
if (result.error) throw result.error;
if (result.status !== 0) {
  throw new Error('GitHub-native Copilot failed: ' + String(result.stderr || result.stdout || ('exit ' + result.status)).slice(0,1200));
}

const decision = parse(result.stdout);
if (!['none','issue'].includes(decision.action)) throw new Error('Unsupported GitHub-native growth action');

if (decision.action === 'issue') {
  const issueNumber = Number(decision.issue_number);
  if (!Number.isInteger(issueNumber) || issueNumber < 1) throw new Error('Invalid GitHub-native issue number');
  const raw = execFileSync('gh', ['issue','view',String(issueNumber),'--repo',process.env.GITHUB_REPOSITORY,'--json','number,title,body,state'], {
    encoding: 'utf8',
    env: {...process.env, GH_TOKEN: process.env.GITHUB_TOKEN}
  });
  const issue = JSON.parse(raw);
  if (issue.state !== 'OPEN') throw new Error('GitHub-native growth issue is not open');
  if (!String(issue.title || '').startsWith('[TASK][Growth][GitHub Native]')) throw new Error('GitHub-native growth issue title marker missing');
  if (!String(issue.body || '').includes('<!-- quantdeus-growth-github-native -->')) throw new Error('GitHub-native growth issue body marker missing');
  if (!String(issue.body || '').includes('<!-- quantdeus-target-agent:' + agentId + ' -->')) throw new Error('GitHub-native target-agent marker missing');
  fs.appendFileSync(process.env.GITHUB_OUTPUT, 'issue_number=' + issueNumber + '\n');
}

fs.appendFileSync(process.env.GITHUB_OUTPUT, 'action=' + decision.action + '\n');
fs.appendFileSync(process.env.GITHUB_OUTPUT, 'autopublish=false\n');
console.log(JSON.stringify({
  execution_path:'github-native-copilot',
  requested_agent:requestedAgentId,
  active_agent:agentId,
  delegated_from:delegatedFrom,
  decision
}, null, 2));
