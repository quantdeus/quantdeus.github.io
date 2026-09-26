const { execFileSync } = require('child_process');

const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
const repoOwner = (repo || '').split('/')[0];
const adminUsers = new Set(
  (process.env.QUANTDEUS_ADMIN_GITHUB_USERS || '')
    .split(',')
    .map(x => x.trim().toLowerCase())
    .filter(Boolean)
);

if (!repo || !token) {
  console.error('GITHUB_REPOSITORY and GITHUB_TOKEN are required');
  process.exit(1);
}

const ghEnv = { ...process.env, GH_TOKEN: token };
const TASK_STATES = ['coord:task','coord:ready','coord:active','coord:blocked','coord:stale','coord:done'];

function gh(args) {
  return execFileSync('gh', args, {
    encoding: 'utf-8',
    env: ghEnv,
    stdio: ['ignore','pipe','pipe'],
  }).trim();
}

function ghJson(args) {
  const out = gh(args);
  return out ? JSON.parse(out) : null;
}

function labelNames(issue) {
  return (issue.labels || []).map(l => typeof l === 'string' ? l : l.name);
}

function hasLabel(issue, label) {
  return labelNames(issue).includes(label);
}

function privileged(login) {
  const user = String(login || '').toLowerCase();
  return Boolean(user && (user === repoOwner.toLowerCase() || adminUsers.has(user)));
}

function targetAgent(body = '') {
  return body.match(/<!--\s*qd-target-agent:([a-z0-9_-]+)\s*-->/i)?.[1]?.toLowerCase() || null;
}

function ensureLabel(name, color, description) {
  try {
    gh(['label','create',name,'--color',color,'--description',description,'--force']);
  } catch (err) {
    console.error('label ' + name + ': ' + (err.stderr?.toString() || err.message));
  }
}

function ensureLabels() {
  const labels = [
    ['governance:proposal','fbca04','Community proposal awaiting governance'],
    ['governance:voting','0e8a16','Community voting is open'],
    ['governance:passed','8250df','Proposal passed vote and admin promotion'],
    ['governance:rejected','d1242f','Proposal rejected or closed by governance'],
    ['agent:coordinator','55d8ff','Target: QuantDeus Coordinator'],
    ['agent:pillar-executor','55d8ff','Target: Six-Pillar Executor'],
    ['agent:strategic-hub','55d8ff','Target: Strategic Navigation Hub'],
    ['agent:orchestrator','55d8ff','Target: Research Orchestrator'],
    ['agent:energy','55d8ff','Target: Energy Agent'],
    ['agent:justice','55d8ff','Target: Justice Agent'],
    ['agent:unity','55d8ff','Target: Unity Agent'],
    ['agent:space','55d8ff','Target: Space / Warp Agent'],
    ['agent:potential','55d8ff','Target: Human Potential Agent'],
    ['agent:synthesis','55d8ff','Target: Synthesis Agent'],
    ['agent:control-tower','55d8ff','Target: Control Tower'],
    ['agent:scout','55d8ff','Target: Repo Scout / Squad B'],
    ['agent:verifier','55d8ff','Target: Task Verifier / Squad B'],
    ['agent:analyst','55d8ff','Target: Change Analyst / Squad B'],
    ['agent:strategist','55d8ff','Target: Execution Strategist / Squad B'],
    ['agent:guardian','55d8ff','Target: Guardian / Squad B'],
    ['agent:tasksmith','55d8ff','Target: Task Smith / Squad B'],
    ['agent:archivist','55d8ff','Target: Execution Archivist / Squad B'],
    ['agent:herald','55d8ff','Target: PR Herald / Squad B'],
    ['agent:qa-syntax','0e8a16','Target: QA Syntax Validator'],
    ['agent:qa-contract','0e8a16','Target: QA Contract Validator'],
    ['agent:qa-repair','d93f0b','Target: QA Repair Coordinator'],
    ['qa:repair','d93f0b','QA detected a repair requirement'],
    ['squad-b:ready','2da44e','Ready for Octet Squad B execution'],
    ['squad-b:active','bf8700','Octet Squad B is executing'],
    ['squad-b:review','1f6feb','Octet Squad B opened a PR for review'],
    ['squad-b:blocked','d1242f','Octet Squad B execution is blocked'],
    ['squad-b:done','8250df','Octet Squad B execution merged/finished'],
    ['squad-b:privileged','b60205','Allows approved changes to sensitive repository surfaces'],
    ['team:octet-b','5319e7','QuantDeus second execution crew'],
  ];
  for (const args of labels) ensureLabel(...args);
}

function editLabels(number, add = [], remove = []) {
  const args = ['issue','edit',String(number)];
  for (const label of add) args.push('--add-label',label);
  for (const label of remove) args.push('--remove-label',label);
  if (args.length > 3) gh(args);
}

function normalizeProposal(issue) {
  const add = ['governance:proposal','governance:voting'];
  const agent = targetAgent(issue.body || '');
  if (agent) add.push('agent:' + agent);
  const remove = TASK_STATES.filter(x => hasLabel(issue,x));
  editLabels(issue.number, add.filter(x => !hasLabel(issue,x)), remove);
}

function taskAuthorized(issue) {
  if (hasLabel(issue,'governance:passed')) return true;
  return privileged(issue.author?.login || issue.user?.login);
}

function normalizeAuthorizedTask(issue) {
  const agent = targetAgent(issue.body || '');
  if (agent && !hasLabel(issue,'agent:' + agent)) {
    editLabels(issue.number,['agent:' + agent],[]);
  }
}

function downgradeTask(issue) {
  const oldBody = String(issue.body || '');
  const already = oldBody.includes('<!-- qd-governance-downgraded -->');
  const title = String(issue.title || '').startsWith('[TASK]')
    ? String(issue.title).replace(/^\[TASK\]/,'[PROPOSAL]')
    : '[PROPOSAL] ' + String(issue.title || '');
  const body = already
    ? oldBody
    : oldBody.trimEnd() + '\n\n<!-- qd-governance-downgraded -->\n';
  gh(['issue','edit',String(issue.number),'--title',title,'--body',body]);
  const add = ['governance:proposal','governance:voting'];
  const agent = targetAgent(body);
  if (agent) add.push('agent:' + agent);
  editLabels(issue.number,add,TASK_STATES);
  if (!already) {
    gh([
      'issue','comment',String(issue.number),
      '--body',
      '🗳️ Governance gate: direct task creation is restricted to QuantDeus admins. This Issue was converted to a community proposal. After voting, an admin may promote it into the real coord:task queue.'
    ]);
  }
}

function main() {
  ensureLabels();
  const issues = ghJson([
    'issue','list','--state','open','--limit','200',
    '--json','number,title,body,labels,author,url'
  ]) || [];

  for (const issue of issues) {
    const title = String(issue.title || '');
    const isProposal = title.startsWith('[PROPOSAL]') || hasLabel(issue,'governance:proposal');
    const isTask = title.startsWith('[TASK]') || hasLabel(issue,'coord:task');

    if (isProposal) {
      normalizeProposal(issue);
      continue;
    }
    if (!isTask) continue;

    if (taskAuthorized(issue)) normalizeAuthorizedTask(issue);
    else downgradeTask(issue);
  }
}

main();
