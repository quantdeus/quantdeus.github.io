'use strict';

const office = require('./openclaw-office-client');

function parseJson(text) {
  const raw = String(text || '').trim().replace(/^\`\`\`(?:json)?\s*/i, '').replace(/\s*\`\`\`$/, '');
  return JSON.parse(raw);
}

async function reasonRole({ profile, role, context, protocol, repository, trusted = false, timeoutMs = 90000 }) {
  if (!office.configured()) {
    return { status: 'DEGRADED', runtime: null, model: null, error_code: 'OPENCLAW_OFFICE_CREDENTIALS_UNAVAILABLE' };
  }
  try {
    const result = await office.ask({
      profile,
      trusted,
      timeoutMs,
      retryTransient: true,
      messages: [{
        role: 'user',
        content: [
          'You are ' + role + ' inside the QuantDeus OpenClaw Office.',
          'Reason over the supplied evidence. Do not imitate a canned persona or use fixed dialogue templates.',
          'Separate observed facts, inference, hypotheses and uncertainty. Never invent tool use or live evidence.',
          protocol,
          'Return ONLY strict JSON {"summary":"concise evidence-grounded assessment","findings":["1-5 findings"],"next_step":"one falsifiable bounded next step"}.',
          'Evidence snapshot:',
          JSON.stringify(context)
        ].join('\n')
      }],
      metadata: { source: 'quantdeus-role-dialogue', role: profile, repository }
    });
    const d = parseJson(result.text);
    if (typeof d.summary !== 'string' || !d.summary.trim()) throw new Error('ROLE_DIALOGUE_INVALID_SUMMARY');
    if (!Array.isArray(d.findings) || d.findings.length < 1 || d.findings.length > 5) throw new Error('ROLE_DIALOGUE_INVALID_FINDINGS');
    if (d.findings.some(x => typeof x !== 'string' || !x.trim())) throw new Error('ROLE_DIALOGUE_INVALID_FINDING');
    if (typeof d.next_step !== 'string' || !d.next_step.trim()) throw new Error('ROLE_DIALOGUE_INVALID_NEXT_STEP');
    return {
      status: 'LLM',
      runtime: result.runtime,
      model: result.model,
      summary: d.summary.trim(),
      findings: d.findings.map(x => x.trim()),
      next_step: d.next_step.trim(),
      tool_summary: result.raw?.tool_summary || null
    };
  } catch (error) {
    if (!office.isTransientError(error)) throw error;
    return { status: 'DEGRADED', runtime: null, model: null, error_code: error.code || 'OPENCLAW_TRANSIENT' };
  }
}

function renderRole({ heading, result, marker, metrics = [] }) {
  const lines = [heading, '', 'Runtime status: **' + result.status + '**'];
  if (metrics.length) lines.push(...metrics, '');
  if (result.status === 'LLM') {
    lines.push('Runtime: \`' + result.runtime + '\` · model: \`' + result.model + '\`', '', result.summary, '', '**Findings:**', ...result.findings.map(x => '- ' + x), '', '**Next falsifiable step:** ' + result.next_step);
  } else {
    lines.push('', 'OpenClaw reasoning unavailable; deterministic telemetry was preserved, but no character dialogue or strategic judgment was synthesized.', 'Error code: \`' + result.error_code + '\`');
  }
  lines.push('', marker);
  return lines.join('\n');
}

module.exports = { reasonRole, renderRole };
