const fs = require('fs');
const { execFileSync } = require('child_process');
const crypto = require('crypto');
const { doctrineSummary } = require('./doctrine');
const doctrine = doctrineSummary();

const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
const repoOwner = (repo || '').split('/')[0];
const HUB_TITLE = '🧭 QuantDeus Coordination Hub';
const OWNER_RE = /<!--\s*quantdeus-owner:@([A-Za-z0-9-]+)\s*-->/i;

if (!repo || !token) {
  console.error('GITHUB_REPOSITORY and GITHUB_TOKEN are required');
  process.exit(1);
}

const ghEnv = { ...process.env, GH_TOKEN: token };

function gh(args, options = {}) {
  return execFileSync('gh', args, {
    encoding: 'utf-8',
    env: ghEnv,
    stdio: options.stdio || ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function ghJson(args) {
  const out = gh(args);
  return out ? JSON.parse(out) : null;
}

function hasLabel(issue, name) {
  return (issue.labels || []).some(l => (typeof l === 'string' ? l : l.name) === name);
}

function getOwner(body = '') {
  const m = body.match(OWNER_RE);
  return m ? m[1] : null;
}

function setOwner(body = '', username = null) {
  const clean = body.replace(OWNER_RE, '').trimEnd();
  return username ? `${clean}\n\n<!-- quantdeus-owner:@${username} -->\n` : `${clean}\n`;
}

function hasAcceptanceEvidence(issue) {
  const body = String(issue?.body || '');
  const marker = /<!--\s*quantdeus-acceptance:evidence\s*-->/i.test(body);
  const checked = /- \[[xX]\]/.test(body);
  const linked = /https:\/\/github\.com\/[^\s]+\/(?:commit|pull|actions\/runs)\//i.test(body);
  const explicit = /(?:acceptance evidence|доказательства приёмки|acceptance criteria)[\s\S]{0,1200}(?:✅|PASS|https:\/\/github\.com\/|commit|PR|workflow|test)/i.test(body);
  return marker || (checked && linked) || explicit;
}

function ensureLabels() {
  const labels = [
    ['coord:task', '1f6feb', 'QuantDeus coordination task'],
    ['coord:ready', '2da44e', 'Ready for a human contributor'],
    ['coord:active', 'bf8700', 'Claimed and in progress'],
    ['coord:blocked', 'd1242f', 'Blocked and needs help'],
    ['coord:stale', '8c959f', 'No update for 72+ hours'],
    ['coord:done', '8250df', 'Completed coordination task'],
    ['coord:human', '0969da', 'Human action requested'],
  ];

  for (const [name, color, description] of labels) {
    try {
      gh(['label', 'create', name, '--color', color, '--description', description, '--force']);
    } catch (e) {
      console.error(`Label ${name}: ${e.stderr?.toString() || e.message}`);
    }
  }
}

function taskIssue(issue) {
  return issue.title.startsWith('[TASK]') || hasLabel(issue, 'coord:task');
}

function normalizeTask(issue) {
  if (!hasLabel(issue, 'coord:task')) {
    gh(['issue', 'edit', String(issue.number), '--add-label', 'coord:task']);
  }
  const hasState = ['coord:ready', 'coord:active', 'coord:blocked', 'coord:done']
    .some(l => hasLabel(issue, l));
  if (!hasState) {
    gh(['issue', 'edit', String(issue.number), '--add-label', 'coord:ready']);
  }
}

function stateOf(issue) {
  if (hasLabel(issue, 'coord:blocked')) return '🚧 blocked';
  if (hasLabel(issue, 'coord:active')) return '🟡 active';
  if (hasLabel(issue, 'coord:done')) return '✅ done';
  return '🟢 ready';
}

function pillarOf(issue) {
  const label = (issue.labels || []).map(l => typeof l === 'string' ? l : l.name)
    .find(n => n.startsWith('pillar-') || n.startsWith('pillar:'));
  if (label) return label.replace(/^pillar[:-]?/i, '');

  const text = `${issue.title} ${issue.body || ''}`.toLowerCase();
  if (/warp|space|moon|mars|orbit|косм|варп/.test(text)) return 'space';
  if (/energy|fusion|энерг|термояд/.test(text)) return 'energy';
  if (/human|longevity|biohack|человек|долголет/.test(text)) return 'potential';
  if (/justice|ubi|algorithm|справедлив/.test(text)) return 'justice';
  if (/climate|unity|planet|эколог|планет/.test(text)) return 'unity';
  if (/art|culture|music|эстет|культур|музык/.test(text)) return 'synthesis';
  return 'general';
}

function isPrivileged(actor) {
  return actor && actor.toLowerCase() === repoOwner.toLowerCase();
}

function editLabels(number, add = [], remove = []) {
  const args = ['issue', 'edit', String(number)];
  for (const l of add) args.push('--add-label', l);
  for (const l of remove) args.push('--remove-label', l);
  gh(args);
}

function comment(number, body) {
  gh(['issue', 'comment', String(number), '--body', body]);
}

function handleIssueEvent(event) {
  const issue = event.issue;
  if (!issue || issue.pull_request || !issue.title?.startsWith('[TASK]')) return false;
  normalizeTask({
    number: issue.number,
    title: issue.title,
    body: issue.body || '',
    labels: issue.labels || [],
  });
  return true;
}

function handleCommentEvent(event) {
  if (!event.issue || event.issue.pull_request || !event.comment) return false;
  const cmd = (event.comment.body || '').trim();
  if (!/^\/(take|release|block|ready|done)(\s|$)/i.test(cmd)) return false;

  const number = event.issue.number;
  const actor = event.comment.user?.login;
  const issue = ghJson(['issue', 'view', String(number), '--json', 'number,title,body,labels,state,url']);
  if (!taskIssue(issue)) return false;

  normalizeTask(issue);
  const currentOwner = getOwner(issue.body || '');
  const commandMatch = cmd.match(/^\/(take|release|block|ready|done)(?:\s+([\s\S]*))?$/i);
  const command = commandMatch[1].toLowerCase();
  const argument = String(commandMatch[2] || '').trim();

  if (command === 'take') {
    if (currentOwner && currentOwner.toLowerCase() !== actor.toLowerCase()) {
      comment(number, `🧭 Задачу уже взял @${currentOwner}. Если нужно передать её — владелец может написать \`/release\`.`);
      return true;
    }
    gh(['issue', 'edit', String(number), '--body', setOwner(issue.body || '', actor)]);
    editLabels(number, ['coord:task', 'coord:active'], ['coord:ready', 'coord:blocked', 'coord:stale']);
    comment(number, `🧭 @${actor} взял задачу. Когда закончишь — \`/done\`; если упёрся в препятствие — \`/block причина\`.`);
    return true;
  }

  const authorized = isPrivileged(actor) || (currentOwner && currentOwner.toLowerCase() === actor.toLowerCase());
  if (!authorized) {
    comment(number, `🧭 Команда \`/${command}\` доступна владельцу задачи${currentOwner ? ` (@${currentOwner})` : ''} или владельцу репозитория.`);
    return true;
  }

  if (command === 'release') {
    gh(['issue', 'edit', String(number), '--body', setOwner(issue.body || '', null)]);
    editLabels(number, ['coord:ready'], ['coord:active', 'coord:blocked', 'coord:stale']);
    comment(number, '🧭 Задача снова свободна и готова к захвату через `/take`.');
  } else if (command === 'block') {
    if (!argument) {
      comment(number, '🧭 Команда `/block` требует конкретную проверяемую причину: `/block причина`.');
      return true;
    }
    editLabels(number, ['coord:blocked', 'coord:human'], ['coord:ready', 'coord:active', 'coord:stale']);
    comment(number, `🚧 @${actor} заблокировал задачу: ${argument.slice(0, 1000)}`);
  } else if (command === 'ready') {
    gh(['issue', 'edit', String(number), '--body', setOwner(issue.body || '', null)]);
    editLabels(number, ['coord:ready'], ['coord:blocked', 'coord:active', 'coord:stale']);
    comment(number, '🧭 Блокер снят. Владелец очищен; задача снова доступна через `/take`.');
  } else if (command === 'done') {
    if (!hasAcceptanceEvidence(issue)) {
      comment(number, '🧭 `/done` отклонён: добавь acceptance evidence (checked acceptance criteria + linked commit/PR/workflow/test, явный Acceptance evidence block или marker `<!-- quantdeus-acceptance:evidence -->`).');
      return true;
    }
    editLabels(number, ['coord:done'], ['coord:ready', 'coord:active', 'coord:blocked', 'coord:stale']);
    gh(['issue', 'close', String(number), '--reason', 'completed']);
    comment(number, `✅ Принято. @${actor} завершил задачу с acceptance evidence.`);
  }
  return true;
}

async function postJson(url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
}

async function notifyExternal(text) {
  const jobs = [];
  if (process.env.QUANTDEUS_DISCORD_WEBHOOK) {
    jobs.push(postJson(process.env.QUANTDEUS_DISCORD_WEBHOOK, { content: text.slice(0, 1900) }));
  }
  if (process.env.QUANTDEUS_SLACK_WEBHOOK) {
    jobs.push(postJson(process.env.QUANTDEUS_SLACK_WEBHOOK, { text }));
  }
  if (process.env.QUANTDEUS_GENERIC_WEBHOOK) {
    jobs.push(postJson(process.env.QUANTDEUS_GENERIC_WEBHOOK, { text, source: 'quantdeus-swarm-secretary', repository: repo }));
  }
  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN || process.env.QUANTDEUS_TELEGRAM_BOT_TOKEN;
  const telegramChatId = process.env.TELEGRAM_CHAT_ID || process.env.QUANTDEUS_TELEGRAM_CHAT_ID;
  if (telegramBotToken && telegramChatId) {
    const url = `https://api.telegram.org/bot${telegramBotToken}/sendMessage`;
    jobs.push(postJson(url, { chat_id: telegramChatId, text, disable_web_page_preview: true }));
  }
  if (!jobs.length) return;
  const results = await Promise.allSettled(jobs);
  for (const r of results) if (r.status === 'rejected') console.error(`External notify: ${r.reason}`);
}

async function refreshHub() {
  ensureLabels();

  let issues = ghJson(['issue', 'list', '--state', 'open', '--limit', '100', '--json', 'number,title,body,url,labels,assignees,updatedAt']) || [];
  const tasks = issues.filter(taskIssue);

  for (const task of tasks) normalizeTask(task);

  // Re-read so labels added above are reflected in the hub.
  issues = ghJson(['issue', 'list', '--state', 'open', '--limit', '100', '--json', 'number,title,body,url,labels,assignees,updatedAt']) || [];
  const freshTasks = issues.filter(taskIssue);

  const now = Date.now();
  for (const task of freshTasks) {
    const ageHours = (now - new Date(task.updatedAt).getTime()) / 36e5;
    if (hasLabel(task, 'coord:active') && ageHours >= 72 && !hasLabel(task, 'coord:stale')) {
      editLabels(task.number, ['coord:stale', 'coord:human'], []);
    }
  }

  const finalTasks = ghJson(['issue', 'list', '--state', 'open', '--limit', '100', '--json', 'number,title,body,url,labels,assignees,updatedAt'])
    .filter(taskIssue);

  const stats = { ready: 0, active: 0, blocked: 0, stale: 0 };
  for (const task of finalTasks) {
    if (hasLabel(task, 'coord:blocked')) stats.blocked++;
    else if (hasLabel(task, 'coord:active')) stats.active++;
    else stats.ready++;
    if (hasLabel(task, 'coord:stale')) stats.stale++;
  }

  const digestData = {
    doctrine: {
      version: doctrine.version,
      objective: doctrine.objective,
      operating_rule: doctrine.operating_rule,
      source_streams: doctrine.source_streams || [],
    },
    tasks: finalTasks.map(t => ({
      n: t.number,
      title: t.title,
      state: stateOf(t),
      owner: getOwner(t.body || '') || '',
      pillar: pillarOf(t),
      labels: (t.labels || []).map(l => typeof l === 'string' ? l : l.name).sort(),
    })).sort((a, b) => a.n - b.n),
  };
  const hash = crypto.createHash('sha256').update(JSON.stringify(digestData)).digest('hex').slice(0, 16);

  const hubs = ghJson(['issue', 'list', '--state', 'all', '--search', `${HUB_TITLE} in:title`, '--limit', '10', '--json', 'number,title,body,url,state']) || [];
  let hub = hubs.find(i => i.title === HUB_TITLE);
  const oldHash = hub?.body?.match(/<!--\s*coord-digest:([a-f0-9]+)\s*-->/i)?.[1];

  const rows = finalTasks.map(t => {
    const owner = getOwner(t.body || '');
    return `| #${t.number} | ${stateOf(t)} | ${pillarOf(t)} | ${owner ? `@${owner}` : '—'} | [${t.title}](${t.url}) |`;
  }).join('\n') || '| — | — | — | — | Нет активных задач |';

  const body = `# 🧭 QuantDeus Coordination Hub\n\nАвтоматический диспетчер задач и человеческого участия. Плановый refresh — раз в сутки, плюс событийные триггеры Issues.

## Civilization doctrine

- Version: **${doctrine.version}**
- Objective: ${doctrine.objective}
- Rule: ${doctrine.operating_rule}\n\n## Состояние\n\n- 🟢 Ready: **${stats.ready}**\n- 🟡 Active: **${stats.active}**\n- 🚧 Blocked: **${stats.blocked}**\n- 🕸️ Stale (72h+): **${stats.stale}**\n\n## Команды участника\n\n- \`/take\` — взять свободную задачу\n- \`/release\` — освободить её\n- \`/block причина\` — отметить препятствие и запросить помощь\n- \`/ready\` — вернуть в очередь\n- \`/done\` — завершить задачу\n\nНовая координационная задача создаётся с префиксом **[TASK]**. Система никому не назначает работу без явного \`/take\`.\n\n## Активные задачи\n\n| Issue | Статус | Направление | Владелец | Задача |\n|---|---|---|---|---|\n${rows}\n\n## Внешние каналы\n\nПри наличии секретов репозитория диспетчер может отправлять изменившийся digest в Discord, Slack, Telegram или generic webhook. Без настроенного секрета наружу ничего не отправляется.\n\n_Last swarm secretary update: ${new Date().toISOString()}_\n\n<!-- coord-digest:${hash} -->\n`;

  fs.writeFileSync('/tmp/quantdeus-coordination-hub.md', body);
  if (hub) {
    if (hub.state !== 'OPEN' && hub.state !== 'open') gh(['issue', 'reopen', String(hub.number)]);
    if (oldHash !== hash) gh(['issue', 'edit', String(hub.number), '--body-file', '/tmp/quantdeus-coordination-hub.md']);
  } else {
    gh(['issue', 'create', '--title', HUB_TITLE, '--body-file', '/tmp/quantdeus-coordination-hub.md']);
    hub = (ghJson(['issue', 'list', '--state', 'open', '--search', `${HUB_TITLE} in:title`, '--limit', '10', '--json', 'number,title,url']) || [])
      .find(i => i.title === HUB_TITLE);
  }

  if (oldHash !== hash) {
    const hubUrl = hub?.url || `https://github.com/${repo}/issues`;
    await notifyExternal(`🧭 QuantDeus coordination update\nReady: ${stats.ready} | Active: ${stats.active} | Blocked: ${stats.blocked} | Stale: ${stats.stale}\n${hubUrl}`);
  }
}

async function main() {
  ensureLabels();

  if (process.env.GITHUB_EVENT_PATH && fs.existsSync(process.env.GITHUB_EVENT_PATH)) {
    const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf-8'));
    if (process.env.GITHUB_EVENT_NAME === 'issue_comment') handleCommentEvent(event);
    if (process.env.GITHUB_EVENT_NAME === 'issues') handleIssueEvent(event);
  }

  await refreshHub();
}

main().catch(err => {
  console.error(err.stderr?.toString() || err.stack || err.message);
  process.exit(1);
});