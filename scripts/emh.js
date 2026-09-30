const fs = require('fs');
const { execFileSync } = require('child_process');
const crypto = require('crypto');

const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
const hubIssue = Number(process.env.QUANTDEUS_COORDINATION_HUB_ISSUE || 9);
if (!repo || !token) process.exit(1);
const env = { ...process.env, GH_TOKEN: token };

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function j(args) {
  const s = gh(args);
  return s ? JSON.parse(s) : null;
}
function labels(issue) {
  return (issue.labels || []).map(x => typeof x === 'string' ? x : x.name);
}
function ageHours(value, now) {
  const t = Date.parse(value || '');
  return Number.isFinite(t) ? Math.max(0, (now - t) / 3600000) : 0;
}
function normalizeBody(body) {
  return String(body || '')
    .replace(/<!--\s*qd-emh-digest:[^>]+-->/gi, '')
    .replace(/https:\/\/github\.com\/[^\s)]+/gi, '<github-url>')
    .replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\b/g, '<timestamp>')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
function band(value, busy, hot) {
  return value >= hot ? 'hot' : value >= busy ? 'elevated' : 'normal';
}

const now = Date.now();
const issues = j(['issue', 'list', '--state', 'open', '--limit', '200', '--json', 'number,title,labels,updatedAt']) || [];
const prs = j(['pr', 'list', '--state', 'open', '--limit', '100', '--json', 'number,title,isDraft,reviewDecision,updatedAt']) || [];
const blocked = issues.filter(i => labels(i).includes('coord:blocked'));
const staleBlocked = blocked.filter(i => ageHours(i.updatedAt, now) >= 24);
const active = issues.filter(i => labels(i).includes('coord:active') || labels(i).includes('coord:ready'));
const staleActive = active.filter(i => ageHours(i.updatedAt, now) >= 48);
const changesRequested = prs.filter(p => !p.isDraft && p.reviewDecision === 'CHANGES_REQUESTED');

let hub = { comments: [] };
try {
  hub = j(['issue', 'view', String(hubIssue), '--json', 'comments']) || hub;
} catch (error) {
  console.warn('EMH could not read Coordination Hub comments:', String(error.message || error).slice(0, 300));
}
const comments = Array.isArray(hub.comments) ? hub.comments : [];
const recent6h = comments.filter(c => ageHours(c.createdAt, now) <= 6);
const recent24h = comments.filter(c => ageHours(c.createdAt, now) <= 24);
const degradedPattern = /TRANSIENT_OPENCLAW|LIVE_RESEARCH_UNAVAILABLE|LLM[- ]канал|fatal failure|timed?\s*out|degraded|provider failure/i;
const degradedSignals = recent24h.filter(c => degradedPattern.test(String(c.body || ''))).length;

const duplicateGroups = new Map();
for (const comment of recent24h) {
  const normalized = normalizeBody(comment.body);
  if (normalized.length < 80 || normalized.includes('emh — swarm mediation')) continue;
  const digest = crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
  duplicateGroups.set(digest, (duplicateGroups.get(digest) || 0) + 1);
}
const duplicateOutputs = [...duplicateGroups.values()].filter(n => n >= 3).reduce((sum, n) => sum + (n - 1), 0);

let synapticHeat = 0;
synapticHeat += Math.min(20, changesRequested.length * 5);
synapticHeat += Math.min(20, staleBlocked.length * 6);
synapticHeat += Math.min(15, staleActive.length * 3);
synapticHeat += Math.min(15, duplicateOutputs * 5);
synapticHeat += Math.min(15, degradedSignals * 4);
if (recent6h.length >= 20) synapticHeat += 10;
if (recent6h.length >= 40) synapticHeat += 5;
synapticHeat = Math.min(100, synapticHeat);

const status = synapticHeat >= 70 ? 'critical' : synapticHeat >= 45 ? 'strained' : synapticHeat >= 20 ? 'elevated' : 'nominal';
const flags = {
  review_contention: changesRequested.length > 0,
  stale_blockers: staleBlocked.length > 0,
  stale_handoffs: staleActive.length > 0,
  duplicate_output_loop: duplicateOutputs > 0,
  degraded_runtime_chatter: degradedSignals > 0,
  chatter_band: band(recent6h.length, 20, 40)
};

let focus = 'stable';
const actions = [];
if (degradedSignals > 0) {
  focus = 'runtime-degradation';
  actions.push('Route repeated runtime/provider degradation to Control Tower + QA Repair; do not let multiple agents retry the same failing path independently.');
}
if (duplicateOutputs > 0) {
  if (focus === 'stable') focus = 'duplicate-loop';
  actions.push('Collapse duplicate responses to one owner and one evidence-producing next step; suppress copy-equivalent retries.');
}
if (changesRequested.length > 0) {
  if (focus === 'stable') focus = 'review-contention';
  actions.push('Convert review disagreement into FACTS → OPTIONS → OWNER → closure criterion before another implementation attempt.');
}
if (staleBlocked.length > 0) {
  if (focus === 'stable') focus = 'stale-blocker';
  actions.push('Classify each stale blocker as technical dependency or human decision and escalate only the smallest unresolved question.');
}
if (staleActive.length > 0) {
  if (focus === 'stable') focus = 'stale-handoff';
  actions.push('Reassign or close stale active/ready work instead of keeping zombie WIP in the swarm.');
}
if (recent6h.length >= 20) {
  if (focus === 'stable') focus = 'chatter-burst';
  actions.push('Seven should reduce concurrent discussion/WIP until the hub returns to bounded evidence-bearing updates.');
}
if (!actions.length) {
  actions.push('No intervention: keep bounded dissent, one owner per next step, and evidence before narrative.');
}

const assessment = status === 'nominal'
  ? 'Рой работает без признаков поведенческого перегрева: можно сохранять текущий WIP и обычный цикл проверки.'
  : status === 'elevated'
    ? 'Есть ранние признаки перегрева автоматики; EMH рекомендует локально убрать дубли и неоднозначные handoff до роста очереди.'
    : status === 'strained'
      ? 'Поведенческая нагрузка роя заметно повышена: нужен жёсткий one-owner/one-next-step режим и сокращение повторных попыток.'
      : 'Рой близок к runaway-поведению: приоритет — остановить дублирующие циклы, локализовать деградацию и вернуть выполнение к проверяемым артефактам.';

const report = {
  timestamp: new Date(now).toISOString(),
  scope: 'software-agent cognitive hygiene; not human clinical diagnosis',
  status,
  synaptic_heat: synapticHeat,
  focus,
  metrics: {
    open_issues: issues.length,
    active_or_ready: active.length,
    blocked: blocked.length,
    stale_blocked_24h: staleBlocked.length,
    stale_active_48h: staleActive.length,
    changes_requested: changesRequested.length,
    hub_comments_6h: recent6h.length,
    degraded_signals_24h: degradedSignals,
    duplicate_outputs_24h: duplicateOutputs
  },
  flags,
  actions
};
fs.writeFileSync('/tmp/quantdeus-emh-cognitive-health.json', JSON.stringify(report, null, 2));

const digestState = { status, focus, flags, actionKinds: actions.map(a => a.split(';')[0]) };
const digest = crypto.createHash('sha256').update(JSON.stringify(digestState)).digest('hex').slice(0, 12);
const marker = '<!-- qd-emh-digest:' + digest + ' -->';
const prev = [...comments].reverse().find(c => String(c.body || '').includes('<!-- qd-emh-digest:'));

if (!(prev?.body || '').includes(marker)) {
  const body = [
    '🩺 **EMH — Swarm Cognitive Hygiene + Mediation**',
    '',
    '**Скан программного поведения роя**',
    '- status: **' + status + '**',
    '- synaptic heat: **' + synapticHeat + '/100**',
    '- blocked / stale blocked: **' + blocked.length + ' / ' + staleBlocked.length + '**',
    '- stale active/ready: **' + staleActive.length + '**',
    '- reviews with changes requested: **' + changesRequested.length + '**',
    '- hub comments (6h): **' + recent6h.length + '**',
    '- degraded signals (24h): **' + degradedSignals + '**',
    '- duplicate-output pressure (24h): **' + duplicateOutputs + '**',
    '',
    '**Assessment:** ' + assessment,
    '',
    '**EMH actions:**',
    ...actions.map(x => '- ' + x),
    '',
    '_Protocol: OBSERVE → LOAD → LOOP CHECK → FACTS → OWNER → NEXT STEP. This evaluates software-agent behavior only; EMH does not diagnose people or override human decisions._',
    '',
    marker
  ].join('\n');
  gh(['issue', 'comment', String(hubIssue), '--body', body]);
}

console.log(JSON.stringify(report, null, 2));
