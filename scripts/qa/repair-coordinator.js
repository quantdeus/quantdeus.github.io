const fs = require('fs');
const { execFileSync } = require('child_process');

const syntaxOutcome = process.env.SYNTAX_OUTCOME || 'unknown';
const contractOutcome = process.env.CONTRACT_OUTCOME || 'unknown';
const failed = syntaxOutcome !== 'success' || contractOutcome !== 'success';

function readReport(p) {
  try { return JSON.parse(fs.readFileSync(p,'utf8')); } catch { return null; }
}
const syntax = readReport('/tmp/quantdeus-qa-syntax.json');
const contract = readReport('/tmp/quantdeus-qa-contract.json');
const failures = [...(syntax?.failures||[]), ...(contract?.failures||[])];

const report = {
  agent:'qa-repair',
  timestamp:new Date().toISOString(),
  status: failed ? 'repair-required' : 'clean',
  syntax_outcome:syntaxOutcome,
  contract_outcome:contractOutcome,
  failures
};
fs.writeFileSync('/tmp/quantdeus-qa-repair.json', JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));

if (!failed) {
  console.log('Координатор QA-исправлений: исправление не требуется.');
  process.exit(0);
}

const lines = failures.length
  ? failures.slice(0,50).map(x=>'- **'+x.target+'** — '+x.message)
  : ['- Валидатор завершился ошибкой; точную команду смотрите в журнале workflow.'];

const body = [
  '## Задача на QA-исправление QuantDeus',
  '',
  'QA-триада заблокировала текущее состояние кода. Слияние и релиз должны оставаться заблокированными до зелёных валидаторов.',
  '',
  ...lines,
  '',
  '### Правила исправления',
  '- Исправлять минимальную коренную причину, а не симптом.',
  '- После каждого исправления запускать оба QA-валидатора.',
  '- Не ослаблять и не обходить валидатор ради зелёного статуса.',
  '- Если детерминированного исправления нет, использовать Squad B / Task Smith с ревью.',
  '',
  '<!-- qd-qa-repair-ticket -->'
].join('\n');

if (process.env.QA_CREATE_ISSUE === '1' && process.env.GH_TOKEN) {
  try {
    const existing = execFileSync('gh', ['issue','list','--state','open','--search','"[QA] Требуется исправление" in:title','--json','number','--jq','.[0].number // empty'], {encoding:'utf8'}).trim();
    if (existing) {
      execFileSync('gh', ['issue','comment',existing,'--body',body], {stdio:'inherit'});
      console.log('Обновлён существующий QA Issue #' + existing);
    } else {
      execFileSync('gh', ['issue','create','--title','[QA] Требуется исправление','--body',body,'--label','qa:repair','--label','agent:qa-repair'], {stdio:'inherit'});
      console.log('Создан QA Issue на исправление.');
    }
  } catch (err) {
    console.error('Не удалось создать/обновить QA-задачу:', err.message);
  }
}
process.exit(1);
