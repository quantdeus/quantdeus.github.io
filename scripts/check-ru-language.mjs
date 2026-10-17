#!/usr/bin/env node
// Проверяем только новые видимые строки. Технические команды остаются без изменений.
import { execFileSync } from 'node:child_process';

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 20000000 }).trim();
}
let base = process.env.BASE_SHA || '';
if (!/^[0-9a-f]{40}$/i.test(base) || /^0+$/.test(base)) {
  try { base = git('rev-parse', 'HEAD^'); } catch { base = git('rev-parse', 'HEAD'); }
}
const head = process.env.HEAD_SHA || 'HEAD';
let patch;
try { patch = git('diff', '--unified=0', '--diff-filter=ACMR', base, head); }
catch (err) { console.error('Не удалось проверить изменения: ' + err.message); process.exit(1); }

const forbidden = /\b(Home|About|Community|Research|Projects|Services|Forum|Knowledge|Federation|Horizons|Login|Sign in|Sign up|Learn more|Read more|Contact|Dashboard|Coordination|Settings|Profile|Welcome)\b/i;
const brand = /^(QuantDeus|GitHub|WordPress|Telegram|YouTube|VK|Vercel|OpenClaw|BingX|Star Trek|Pro|Free|API|QA|Node\.js)$/i;
const errors = [];
let file = '';
let checked = 0;
function examine(value, kind) {
  const label = value.trim().replace(/^["']|["']$/g, '');
  if (!label || /[А-Яа-яЁё]/u.test(label) || brand.test(label)) return;
  if (kind === 'workflow' && /[A-Za-z]{4}/.test(label)) {
    errors.push(file + ': этап без русского названия: ' + label.slice(0, 120));
  } else if (kind !== 'workflow' && forbidden.test(label)) {
    errors.push(file + ': видимая английская надпись: ' + label.slice(0, 120));
  }
}
for (const line of patch.split('\n')) {
  const head = line.match(/^diff --git a\/(.+) b\/(.+)$/);
  if (head) { file = head[2]; continue; }
  if (!line.startsWith('+') || line.startsWith('+++')) continue;
  const content = line.slice(1);
  if (file.startsWith('.github/workflows/') && /\.ya?ml$/.test(file)) {
    const label = content.match(/^(?:name:|run-name:|\s+-\s+name:|\s{4}name:)\s*(.+)$/);
    if (label) { checked++; examine(label[1], 'workflow'); }
  } else if (/\.html$/.test(file)) {
    for (const match of content.matchAll(/>([^<>]{2,180})</g)) {
      checked++; examine(match[1].replace(/&amp;/g, '&'), 'html');
    }
  } else if (/\.md$/.test(file)) {
    const title = content.match(/^#{1,6}\s+(.+)$/);
    if (title) { checked++; examine(title[1], 'heading'); }
  }
}
console.log('Проверено видимых надписей: ' + checked);
if (errors.length) {
  console.error('Обнаружены английские надписи. Исправьте видимый текст, не затрагивая технические имена:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('Новые надписи соответствуют правилам русского языка.');
