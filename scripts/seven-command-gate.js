'use strict';

function adminUsers(csv = '') {
  return new Set(String(csv || '')
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean));
}

function privileged(login, repoOwner, adminsCsv = '') {
  const user = String(login || '').trim().toLowerCase();
  const owner = String(repoOwner || '').trim().toLowerCase();
  return Boolean(user && (user === owner || adminUsers(adminsCsv).has(user)));
}

function stripSevenPrefix(body = '') {
  const text = String(body || '').trim();
  const match = text.match(/^(?:\/(?:seven|coord|coordinate)|@(?:seven-of-nine|seven|coordinator))\b\s*/i);
  return match ? text.slice(match[0].length).trim() : '';
}

function containsSensitiveMaterial(text = '') {
  const value = String(text || '');
  return [
    /\bghp_[A-Za-z0-9]{20,}\b/,
    /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
    /\bsk-[A-Za-z0-9_-]{20,}\b/,
    /\b\d{7,12}:[A-Za-z0-9_-]{25,}\b/,
    /(?:password|passwd|secret|token|api[_-]?key)\s*[:=]\s*\S{8,}/i,
    /https?:\/\/[^\s/@:]+:[^\s/@]+@/i
  ].some(pattern => pattern.test(value));
}

function parseIssueCreateCommand(body = '') {
  const rest = stripSevenPrefix(body);
  if (!rest) return null;

  const command = rest.match(
    /^(?:(?:(?:create|open)\s+(?:(?:a|new)\s+)?(?:issue|task|ticket))|(?:(?:создай|создать|открой|открыть)\s+(?:нов(?:ый|ую)\s+)?(?:issue|задач[ау]|тикет))|(?:issue|task|задача))\s*:?[ \t]*([\s\S]+)$/i
  );
  if (!command) return null;

  const raw = command[1].trim();
  if (!raw) return null;
  const lines = raw.split(/\r?\n/).map(line => line.trimEnd());
  let title = String(lines.shift() || '').trim();
  if (!title) return null;
  if (!/^\[TASK\]/i.test(title)) title = '[TASK][COORD] ' + title;
  title = title.replace(/\s+/g, ' ').trim();

  let targetAgent = '';
  const bodyLines = [];
  for (const line of lines) {
    const target = line.trim().match(/^(?:agent|target_agent)\s*[:=]\s*([a-z0-9-]+)$/i);
    if (target) {
      targetAgent = target[1].toLowerCase();
      continue;
    }
    bodyLines.push(line);
  }

  const issueBody = bodyLines.join('\n').trim() ||
    'Direct owner/admin directive for Seven of Nine.\n\nGoal: ' +
    title.replace(/^\[TASK\](?:\[COORD\])?\s*/i, '');

  return {
    title,
    body: issueBody,
    labels: ['coord:task', 'coord:ready'],
    target_agent: targetAgent
  };
}

module.exports = {
  adminUsers,
  privileged,
  stripSevenPrefix,
  containsSensitiveMaterial,
  parseIssueCreateCommand
};
