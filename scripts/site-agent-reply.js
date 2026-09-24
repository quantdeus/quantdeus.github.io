const fs = require('fs');

const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
const eventPath = process.env.GITHUB_EVENT_PATH;

if (!repo || !token || !eventPath || !fs.existsSync(eventPath)) {
  console.error('Missing GitHub runtime context');
  process.exit(1);
}

const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
const issue = event.issue;
const comment = event.comment;

if (!issue || !comment || issue.pull_request) process.exit(0);

const roomMap = {
  112: { key: 'general', defaultAgent: 'coordinator' },
  113: { key: 'agents', defaultAgent: 'coordinator' },
  114: { key: 'warp', defaultAgent: 'space' },
  115: { key: 'build', defaultAgent: 'control-tower' },
};

const room = roomMap[issue.number];
if (!room) process.exit(0);

const body = String(comment.body || '').trim();
if (!body || body.includes('<!-- qd-agent-reply -->')) process.exit(0);

const registry = JSON.parse(fs.readFileSync('coordination/agents.json', 'utf8'));
const agents = registry.agents || [];
const byId = new Map(agents.map(a => [a.id, a]));

function escMd(s='') {
  return String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function pickAgent(text) {
  const slash = text.match(/^\/agent\s+([a-z0-9_-]+)/i);
  if (slash) return slash[1].toLowerCase();
  const mention = text.match(/^@([a-z0-9_-]+)/i);
  if (mention) return mention[1].toLowerCase();
  return room.defaultAgent;
}

function stripAgentPrefix(text) {
  return text
    .replace(/^\/agent\s+[a-z0-9_-]+\s*/i, '')
    .replace(/^@[a-z0-9_-]+\s*/i, '')
    .trim();
}

async function gh(path) {
  const r = await fetch('https://api.github.com/repos/' + repo + path, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: 'Bearer ' + token,
      'x-github-api-version': '2022-11-28',
    },
  });
  if (!r.ok) throw new Error('GitHub ' + r.status + ' ' + await r.text());
  return r.json();
}

function labelsOf(i) {
  return (i.labels || []).map(l => typeof l === 'string' ? l : l.name);
}

function stateOf(i) {
  const l = labelsOf(i);
  if (l.includes('coord:blocked')) return '🚧 BLOCKED';
  if (l.includes('coord:active')) return '🟡 ACTIVE';
  if (l.includes('coord:done')) return '✅ DONE';
  if (l.includes('coord:ready')) return '🟢 READY';
  return '⚪ OPEN';
}

function pillarLabel(id) {
  const map = {
    energy:'pillar-01-energy', justice:'pillar-02-justice', unity:'pillar-03-unity',
    space:'pillar-04-space', potential:'pillar-05-potential', synthesis:'pillar-06-synthesis'
  };
  return map[id] || null;
}

function localContext(agentId) {
  const path = ['energy','justice','unity','space','potential','synthesis'].includes(agentId)
    ? 'coordination/pillars/' + agentId + '.md'
    : null;
  if (!path || !fs.existsSync(path)) return null;
  const src = fs.readFileSync(path, 'utf8')
    .split('\n')
    .filter(line => line.trim() && !line.startsWith('<!--'))
    .slice(0, 14)
    .join('\n');
  return { path, text: src.slice(0, 1800) };
}

async function buildReply(agentId, query) {
  const agent = byId.get(agentId) || byId.get(room.defaultAgent);
  const issues = await gh('/issues?state=open&per_page=100');

  if (/^\/start\b/i.test(body)) {
    return [
      '🖖 **QuantDeus web agents online**',
      '',
      'Команды:',
      '- `/agents` — реальные агенты репозитория',
      '- `/agent <id> <вопрос>` — обратиться к агенту',
      '- идеи для работы агентов проходят через proposal/vote governance',
      '',
      'Комнаты: #general / #agents / #warp / #build'
    ].join('\n');
  }

  if (/^\/agents\b/i.test(body)) {
    return agents.map(a => a.emoji + ' **' + a.id + '** — ' + a.role).join('\n');
  }

  const relevant = issues
    .filter(i => !i.pull_request)
    .filter(i => {
      const labels = labelsOf(i);
      if (labels.includes('agent:' + agent.id)) return true;
      const pillar = pillarLabel(agent.id);
      if (pillar && labels.includes(pillar)) return true;
      if (agent.id === 'coordinator' && labels.includes('coord:task')) return true;
      return false;
    })
    .slice(0, 5);

  const proposals = issues.filter(i => !i.pull_request && String(i.title || '').startsWith('[PROPOSAL]'));
  const context = localContext(agent.id);

  if (agent.id === 'coordinator') {
    const tasks = issues.filter(i => !i.pull_request && labelsOf(i).includes('coord:task'));
    const ready = tasks.filter(i => labelsOf(i).includes('coord:ready')).length;
    const active = tasks.filter(i => labelsOf(i).includes('coord:active')).length;
    const blocked = tasks.filter(i => labelsOf(i).includes('coord:blocked')).length;
    return [
      agent.emoji + ' **' + agent.name + '**',
      '',
      query ? 'Запрос: ' + escMd(query) : 'Текущий статус координации.',
      '',
      'Очередь: 🟢 ' + ready + ' ready · 🟡 ' + active + ' active · 🚧 ' + blocked + ' blocked · 🗳️ ' + proposals.length + ' proposals.',
      'Источник: `' + agent.source + '`.',
      '',
      'Для изменения очереди обычный участник использует proposal/vote; прямой task-control остаётся у owner/admin.',
    ].join('\n');
  }

  const lines = [
    agent.emoji + ' **' + agent.name + '**',
    '',
    agent.role + '.',
    query ? 'Запрос: ' + escMd(query) : '',
    'Источник агента: `' + agent.source + '`.',
  ].filter(Boolean);

  if (relevant.length) {
    lines.push('', '**Текущие связанные Issues:**');
    for (const i of relevant) lines.push('- ' + stateOf(i) + ' [#' + i.number + ' ' + i.title + '](' + i.html_url + ')');
  } else {
    lines.push('', 'Сейчас открытых Issues, явно привязанных к этому агенту, не найдено.');
  }

  if (context) {
    lines.push('', '**Контекст из репозитория:**', context.text, '', '_Файл: ' + context.path + '_');
  }

  lines.push('', 'Это repo-grounded ответ: сообщение само по себе не изменяет очередь задач.');
  return lines.join('\n');
}

async function postReply(text) {
  const r = await fetch('https://api.github.com/repos/' + repo + '/issues/' + issue.number + '/comments', {
    method: 'POST',
    headers: {
      accept: 'application/vnd.github+json',
      authorization: 'Bearer ' + token,
      'x-github-api-version': '2022-11-28',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ body: text + '\n\n<!-- qd-agent-reply -->' }),
  });
  if (!r.ok) throw new Error('Comment failed: ' + r.status + ' ' + await r.text());
}

(async () => {
  const agentId = pickAgent(body);
  const query = stripAgentPrefix(body);
  const reply = await buildReply(agentId, query);
  await postReply(reply);
  console.log('Replied as', agentId, 'to issue', issue.number);
})().catch(err => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});
