const fs = require('fs');
const { execFileSync } = require('child_process');
const crypto = require('crypto');

const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
const BOARD_TITLE = '🧭 QuantDeus Six-Pillar Execution Board';

if (!repo || !token) {
  console.error('GITHUB_REPOSITORY and GITHUB_TOKEN are required');
  process.exit(1);
}

const ghEnv = { ...process.env, GH_TOKEN: token };

function gh(args) {
  return execFileSync('gh', args, {
    encoding: 'utf-8',
    env: ghEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
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

function ensureLabel(name, color, description) {
  try {
    gh(['label', 'create', name, '--color', color, '--description', description, '--force']);
  } catch (err) {
    console.error(`label ${name}: ${err.stderr?.toString() || err.message}`);
  }
}

const PILLARS = [
  {
    id: '01',
    key: 'energy-evidence-register-v1',
    slug: 'energy',
    label: 'pillar-01-energy',
    emoji: '⚡',
    name: 'Energy Future',
    title: '[TASK][Energy] Build evidence-first energy opportunity register',
    body: `## Outcome
Create a small evidence-first register of future-energy opportunities that QuantDeus can actually act on.

## Deliverable
Add \`coordination/pillars/energy.md\` with **3 concrete opportunities**. Each item must include:
- claim;
- primary or high-quality source URL + date;
- evidence grade A/B/C;
- what would falsify or weaken the claim;
- one next executable action for QuantDeus.

## Acceptance
- [ ] File exists in GitHub.
- [ ] Exactly 3 opportunities are evaluated.
- [ ] Every opportunity has source, evidence grade, falsifier and next action.
- [ ] No "breakthrough" language without evidence.

## Execution
Preferred executor: **GitHub connector / Control Tower**.
Safe scope: research + repository docs only; no spending, outreach or production deployment.

<!-- qd-task-key:energy-evidence-register-v1 -->`
  },
  {
    id: '02',
    key: 'justice-autonomy-audit-v1',
    slug: 'justice',
    label: 'pillar-02-justice',
    emoji: '⚖️',
    name: 'Algorithmic Justice',
    title: '[TASK][Justice] Add audit contract for autonomous actions',
    body: `## Outcome
Turn "algorithmic justice" into an operational rule for QuantDeus agents instead of a slogan.

## Deliverable
Add \`coordination/pillars/justice.md\` containing a reusable decision record with:
- goal and affected people;
- evidence/provenance;
- privacy impact;
- reversibility;
- money/credit cost;
- required human approval;
- red-team/failure condition;
- final verified outcome.

Use the template on **one real QuantDeus action**.

## Acceptance
- [ ] Reusable decision template exists.
- [ ] One real action is logged end-to-end.
- [ ] Human override and rollback are explicit.
- [ ] Proxy metrics are not presented as outcomes.

## Execution
Preferred executor: **GitHub connector / Control Tower**.

<!-- qd-task-key:justice-autonomy-audit-v1 -->`
  },
  {
    id: '03',
    key: 'unity-collaboration-intake-v1',
    slug: 'unity',
    label: 'pillar-03-unity',
    emoji: '🌍',
    name: 'Planetary Unity',
    title: '[TASK][Unity] Build opt-in collaboration intake',
    body: `## Outcome
Create a concrete collaboration path for researchers, builders and creators.

## Deliverable
Add a GitHub Issue template for collaboration proposals with fields for:
- contribution / need;
- relevant pillar(s);
- public evidence or portfolio;
- expected deliverable;
- dependencies;
- privacy/safety constraints;
- opt-in contact method.

## Acceptance
- [ ] Collaboration issue template is committed.
- [ ] Template avoids requesting secrets or private personal data.
- [ ] A contributor can understand the next step without private chat.
- [ ] Coordination Hub can classify the resulting issue.

## Execution
Preferred executor: **GitHub connector / Control Tower**.

<!-- qd-task-key:unity-collaboration-intake-v1 -->`
  },
  {
    id: '04',
    key: 'space-warp-gates-v1',
    slug: 'space',
    label: 'pillar-04-space',
    emoji: '🚀',
    name: 'Space Expansion',
    title: '[TASK][Space] Connect Warp-buble to evidence gates',
    body: `## Outcome
Make the Warp track actionable and falsifiable from the central coordination layer.

## Deliverable
Add \`coordination/pillars/space.md\` with the current \`quantdeus/Warp-buble\` checkpoint and explicit status for:
geometry, EOM, residual, NEC, energy, curvature/tidal, horizon, causality, stability and EFT.

Each gate must be **PASS / FAIL / UNKNOWN** with a repository evidence link.

## Acceptance
- [ ] Latest checked Warp SHA is recorded.
- [ ] All ten gates have explicit status and evidence.
- [ ] UNKNOWN is used when evidence is absent.
- [ ] No physical-breakthrough claim unless all required gates justify it.

## Execution
Preferred executor: **GitHub connector / Control Tower**.

<!-- qd-task-key:space-warp-gates-v1 -->`
  },
  {
    id: '05',
    key: 'potential-miniapp-feedback-v1',
    slug: 'potential',
    label: 'pillar-05-potential',
    emoji: '🧬',
    name: 'Human Potential',
    title: '[TASK][Potential] Add measurable Mini App feedback loop',
    body: `## Outcome
Turn the Telegram Mini App into a measurable user loop rather than a static surface.

## Deliverable
Add a small, privacy-preserving feedback action to the Mini App (for example "useful / not useful" plus optional short note), stored locally unless a separate backend is explicitly approved.

## Acceptance
- [ ] User can submit feedback from the Mini App.
- [ ] No health diagnosis or medical inference is made.
- [ ] No private data is transmitted by default.
- [ ] One observable completion event can be verified locally.
- [ ] README documents how to test it.

## Execution
Preferred executor: **GitHub connector / Control Tower**.
Production publication requires separate approval.

<!-- qd-task-key:potential-miniapp-feedback-v1 -->`
  },
  {
    id: '06',
    key: 'synthesis-design-tokens-v1',
    slug: 'synthesis',
    label: 'pillar-06-synthesis',
    emoji: '✨',
    name: 'Synthesis Aesthetics',
    title: '[TASK][Synthesis] Encode Synthwave × Frutiger Aero design tokens',
    body: `## Outcome
Convert the culture pillar into reusable implementation assets.

## Deliverable
Add \`docs/design-system.md\` and a small set of reusable CSS variables/tokens for the Telegram Mini App:
- typography hierarchy;
- spacing/radius;
- neon/night tokens;
- light/water/green Frutiger Aero tokens;
- accessibility/contrast rule.

## Acceptance
- [ ] Tokens are documented.
- [ ] Tokens are implemented in code or a dedicated stylesheet.
- [ ] Existing UI can adopt them without a full rewrite.
- [ ] Culture language is kept separate from scientific claims.

## Execution
Preferred executor: **GitHub connector / Control Tower**.
Production publication requires separate approval.

<!-- qd-task-key:synthesis-design-tokens-v1 -->`
  },
];

function ensureLabels() {
  const common = [
    ['coord:task', '1f6feb', 'QuantDeus coordination task'],
    ['coord:ready', '2da44e', 'Ready for execution'],
    ['coord:active', 'bf8700', 'Execution in progress'],
    ['coord:blocked', 'd1242f', 'Blocked and needs intervention'],
    ['coord:done', '8250df', 'Completed and verified'],
    ['exec:connector', '5319e7', 'Preferred executor: GitHub connector / Control Tower'],
    ['priority:p1', 'b60205', 'Highest current execution priority'],
  ];
  const pillarLabels = [
    ['pillar-01-energy', 'f9d71c', 'Future energy'],
    ['pillar-02-justice', '6f42c1', 'Algorithmic justice'],
    ['pillar-03-unity', '0e8a16', 'Planetary cooperation'],
    ['pillar-04-space', '1d76db', 'Space expansion'],
    ['pillar-05-potential', 'd93f0b', 'Human potential'],
    ['pillar-06-synthesis', 'c5def5', 'Aesthetic synthesis'],
  ];
  for (const args of [...common, ...pillarLabels]) ensureLabel(...args);
}

function taskState(issue) {
  if (hasLabel(issue, 'coord:blocked')) return '🚧 BLOCKED';
  if (hasLabel(issue, 'coord:active')) return '🟡 ACTIVE';
  if (hasLabel(issue, 'coord:done')) return '✅ DONE';
  return '🟢 READY';
}

function seedTasks() {
  const all = ghJson(['issue', 'list', '--state', 'all', '--limit', '200', '--json', 'number,title,body,url,state,labels']) || [];

  for (const pillar of PILLARS) {
    const marker = `<!-- qd-task-key:${pillar.key} -->`;
    const existing = all.find(i => (i.body || '').includes(marker));
    if (existing) {
      if (String(existing.state).toLowerCase() === 'open') {
        const wanted = ['coord:task', 'exec:connector', 'priority:p1', pillar.label];
        const existingLabels = labelNames(existing);
        const args = ['issue', 'edit', String(existing.number)];
        let changed = false;
        for (const label of wanted) {
          if (!existingLabels.includes(label)) {
            args.push('--add-label', label);
            changed = true;
          }
        }
        const hasState = ['coord:ready', 'coord:active', 'coord:blocked', 'coord:done']
          .some(label => existingLabels.includes(label));
        if (!hasState) {
          args.push('--add-label', 'coord:ready');
          changed = true;
        }
        if (changed) gh(args);
      }
      continue;
    }

    fs.writeFileSync('/tmp/qd-task.md', pillar.body + '\n');
    gh([
      'issue', 'create',
      '--title', pillar.title,
      '--body-file', '/tmp/qd-task.md',
      '--label', 'coord:task',
      '--label', 'coord:ready',
      '--label', 'exec:connector',
      '--label', 'priority:p1',
      '--label', pillar.label,
    ]);
    console.log(`seeded ${pillar.slug}`);
  }
}

function refreshBoard() {
  const open = ghJson(['issue', 'list', '--state', 'open', '--limit', '200', '--json', 'number,title,body,url,labels,updatedAt']) || [];
  const tasks = open.filter(i => hasLabel(i, 'coord:task'));

  const rows = PILLARS.map(pillar => {
    const items = tasks
      .filter(i => hasLabel(i, pillar.label))
      .sort((a, b) => {
        const rank = x => hasLabel(x, 'coord:active') ? 0 : hasLabel(x, 'coord:blocked') ? 2 : 1;
        return rank(a) - rank(b) || a.number - b.number;
      });
    const current = items[0];
    return current
      ? `| ${pillar.emoji} ${pillar.name} | ${taskState(current)} | [#${current.number} ${current.title}](${current.url}) | connector | `
      : `| ${pillar.emoji} ${pillar.name} | ⚪ EMPTY | Create next executable task | — |`;
  });

  const digestSource = rows.join('\n');
  const digest = crypto.createHash('sha256').update(digestSource).digest('hex').slice(0, 16);

  const allBoards = ghJson(['issue', 'list', '--state', 'all', '--search', `${BOARD_TITLE} in:title`, '--limit', '10', '--json', 'number,title,body,state,url']) || [];
  let board = allBoards.find(i => i.title === BOARD_TITLE);
  const oldDigest = board?.body?.match(/<!--\s*pillar-exec-digest:([a-f0-9]+)\s*-->/i)?.[1];

  const body = `# 🧭 QuantDeus Six-Pillar Execution Board

This board is an **execution queue**, not a news digest.

Rules:
1. Every pillar must point to a concrete task with an observable artifact.
2. Prefer one P1 task at a time per pillar.
3. GitHub connector / Control Tower may execute safe reversible repository work directly.
4. Human approval is still required for production publication, spending, secrets, irreversible actions or sensitive outreach.
5. A task is DONE only after its acceptance checklist is verified.
6. No periodic Pulse issue is created just to say that a scan happened.

| Pillar | State | Current executable task | Preferred executor |
|---|---|---|---|
${rows.join('\n')}

## Execution protocol

- `coord:ready` — executable now.
- `coord:active` — work is actually in progress.
- `coord:blocked` — a concrete blocker exists.
- `coord:done` — acceptance criteria verified.
- `exec:connector` — suitable for execution through the GitHub connector / Control Tower.

The coordinator may summarize this board, but **the board exists to drive file changes, issues, reviews, tests and verified artifacts — not to generate six-pillar reports**.

<!-- pillar-exec-digest:${digest} -->
`;

  fs.writeFileSync('/tmp/qd-board.md', body);

  if (!board) {
    gh(['issue', 'create', '--title', BOARD_TITLE, '--body-file', '/tmp/qd-board.md']);
    console.log('execution board created');
  } else if (oldDigest !== digest) {
    if (String(board.state).toLowerCase() !== 'open') gh(['issue', 'reopen', String(board.number)]);
    gh(['issue', 'edit', String(board.number), '--body-file', '/tmp/qd-board.md']);
    console.log('execution board updated');
  } else {
    console.log('execution board unchanged');
  }
}

function main() {
  ensureLabels();
  seedTasks();
  refreshBoard();
}

main();
