const fs = require('fs');
const { execFileSync } = require('child_process');

const missionOutcome = process.env.MISSION_OUTCOME || 'unknown';
const monitorOutcome = process.env.MONITOR_OUTCOME || 'unknown';
const syntaxOutcome = process.env.SYNTAX_OUTCOME || 'unknown';
const contractOutcome = process.env.CONTRACT_OUTCOME || 'unknown';
const failed = missionOutcome !== 'success' || monitorOutcome !== 'success' || syntaxOutcome !== 'success' || contractOutcome !== 'success';

function readReport(p) {
  try { return JSON.parse(fs.readFileSync(p,'utf8')); } catch { return null; }
}
const mission = readReport('/tmp/quantdeus-mission-alignment.json');
const monitor = readReport('/tmp/quantdeus-agent-health.json');
const syntax = readReport('/tmp/quantdeus-qa-syntax.json');
const contract = readReport('/tmp/quantdeus-qa-contract.json');
const failures = [...(mission?.failures||[]), ...(monitor?.failures||[]), ...(syntax?.failures||[]), ...(contract?.failures||[])];

const report = {
  agent:'qa-repair',
  timestamp:new Date().toISOString(),
  status: failed ? 'repair-required' : 'clean',
  mission_outcome:missionOutcome,
  monitor_outcome:monitorOutcome,
  syntax_outcome:syntaxOutcome,
  contract_outcome:contractOutcome,
  failures
};
fs.writeFileSync('/tmp/quantdeus-qa-repair.json', JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));

if (!failed) {
  console.log('QA Repair Coordinator: no repair required.');
  process.exit(0);
}

const lines = failures.length
  ? failures.slice(0,50).map(x=>'- **'+x.target+'** — '+x.message)
  : ['- Validator failed; inspect workflow logs for the exact command.'];

const body = [
  '## QuantDeus QA Repair Ticket',
  '',
  'The QA triad blocked the current code state. Merge/release must stay blocked until validators are green.',
  '',
  ...lines,
  '',
  '### Repair policy',
  '- Fix the smallest root cause, not the symptom.',
  '- Run both QA validators after every repair.',
  '- Do not weaken or bypass a validator to make the check green.',
  '- Use Squad B / Task Smith for reviewed repository repairs when a deterministic fix is not available.',
  '',
  '<!-- qd-qa-repair-ticket -->'
].join('\n');

if (process.env.QA_CREATE_ISSUE === '1' && process.env.GH_TOKEN) {
  try {
    const existing = execFileSync('gh', ['issue','list','--state','open','--search','"[QA] Repair required" in:title','--json','number','--jq','.[0].number // empty'], {encoding:'utf8'}).trim();
    if (existing) {
      execFileSync('gh', ['issue','comment',existing,'--body',body], {stdio:'inherit'});
      console.log('Updated existing QA repair issue #' + existing);
    } else {
      execFileSync('gh', ['issue','create','--title','[QA] Repair required','--body',body,'--label','qa:repair','--label','agent:qa-repair'], {stdio:'inherit'});
      console.log('Created QA repair issue.');
    }
  } catch (err) {
    console.error('Could not create/update QA repair ticket:', err.message);
  }
}
process.exit(1);
