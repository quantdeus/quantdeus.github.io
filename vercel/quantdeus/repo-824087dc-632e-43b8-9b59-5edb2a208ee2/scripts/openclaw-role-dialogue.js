use strict;

const office = require('./openclaw-office-client');
const {turnBudget, turnEvidence} = require('./dialogue-state');

function parseJson(text) {
  const raw = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(raw);
  } catch (jsonError) {
    const lines = raw.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    const field = name => {
      const re = new RegExp('^' + name + '\s*:\s*(.+)', 'i');
      const line = lines.find(x => re.test(x));
      return line ? line.match(re)[1].trim() : '';
    };
    const findings = lines.map(x => {
      const m = x.match(/^FINDING(?:\s*\d+)?\s*:\s*(.+)/i);
      return m ? m[1].trim() : '';
    }).filter(Boolean);

    const summary = field('SUMMARY') || 'No summary found';
    const nextStep = field('NEXT(?:_|\s*)STEP') || 'No next step found';
    const formattedFindings = findings.map(finding => {
      if (typeof finding === 'string') return finding;
      return finding;
    }).filter(Boolean);

    return {
      summary: summary,
      findings: formattedFindings,
      next_step: nextStep
    };
  }
}

async function reasonRole({ profile, role, context, protocol, repository, trusted = false, timeoutMs = 100000, client = office }) {
  if (!client.configured()) {
    return { status: 'DEGRADED', runtime: null, model: null, error_code: 'OPENCLAW_OFFICE_CREDENTIALS_UNAVAILABLE' };
  }
  const budget = turnBudget(timeoutMs);
  if (budget.timeoutMs < 1000) return {status:'DEGRADED', runtime:null, model:null, error_code:'DIALOGUE_BUDGET_EXHAUSTED'};