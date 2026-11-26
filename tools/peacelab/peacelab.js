#!/usr/bin/env node
'use strict';
// QuantDeus QDCM PeaceLab: OFFLINE, FICTIONAL, READ-ONLY prototype.
const fs = require('node:fs');
const path = require('node:path');
const RELATIONS = new Set(['depends_on', 'supports', 'conflicts_with', 'causes_hypothetically', 'mitigates', 'owned_by', 'measures']);
const EPISTEMIC = new Set(['observed', 'sourced', 'hypothesis', 'unknown', 'disproven']);
const REQUIRED_RIGHTS = ['civilian_safety', 'voluntary_consent', 'non_discrimination', 'no_forced_displacement', 'access_to_essentials'];
const NAME = /^[a-z][a-z0-9_-]*$/i;

function requireValid(ok, message) {
  if (!ok) throw new Error('PeaceLab validation: ' + message);
}
function list(value) { return Array.isArray(value) ? value : []; }
function text(value) { return typeof value === 'string' && value.trim().length > 0; }
function uniqueIds(rows, kind) {
  const ids = new Set();
  for (const row of rows) {
    requireValid(row && text(row.id) && NAME.test(row.id), kind + ': invalid id');
    requireValid(!ids.has(row.id), kind + ': duplicate id ' + row.id);
    ids.add(row.id);
  }
  return ids;
}
function validate(s) {
  requireValid(s && typeof s === 'object' && !Array.isArray(s), 'scenario must be an object');
  requireValid(s.schema_version === 'qdcm-peacelab-v0.1', 'unsupported schema');
  requireValid(s.fictional === true, 'prototype accepts only explicitly fictional scenarios');
  requireValid(text(s.decision_owner) && text(s.objective), 'decision owner and objective are required');
  requireValid(list(s.facts).length > 0 && s.facts.every(f => text(f.text) && f.source === 'synthetic-fixture'), 'fictional facts require synthetic-fixture attribution');
  requireValid(list(s.stakeholders).length >= 2, 'at least two stakeholders are required');
  const actors = uniqueIds(s.stakeholders, 'stakeholders');
  requireValid(s.stakeholders.every(x => text(x.name) && list(x.needs).length > 0), 'stakeholder needs are required');
  const nodes = uniqueIds(list(s.nodes), 'nodes');
  requireValid(nodes.size >= 3, 'at least three nodes required');
  const domains = new Set();
  for (const n of s.nodes) {
    requireValid(text(n.label) && list(n.domains).length > 0 && EPISTEMIC.has(n.epistemic_status), 'node missing label/domains/status');
    n.domains.forEach(d => domains.add(d));
    requireValid(list(n.evidence).length > 0 || n.epistemic_status !== 'sourced', 'sourced nodes must name their source');
    requireValid(n.epistemic_status !== 'observed', 'fictional scenario must not claim real-world observation');
  }
  requireValid(domains.size >= 2, 'at least two disciplines required');
  requireValid(list(s.edges).length > 0, 'edges required');
  for (const e of s.edges) {
    requireValid(nodes.has(e.from) && nodes.has(e.to), 'orphan edge');
    requireValid(RELATIONS.has(e.relation) && EPISTEMIC.has(e.epistemic_status), 'invalid edge relation/status');
    requireValid(e.relation !== 'causes_hypothetically' || e.epistemic_status === 'hypothesis', 'causal conjecture must be a hypothesis');
  }
  requireValid(list(s.hypotheses).length >= 2 && s.hypotheses.every(h => text(h.claim) && text(h.falsifier)), 'two falsifiable alternatives required');
  uniqueIds(s.hypotheses, 'hypotheses');
  requireValid(list(s.rights_guards).length === REQUIRED_RIGHTS.length && REQUIRED_RIGHTS.every(k => s.rights_guards.includes(k)), 'required rights guards missing');
  requireValid(list(s.options).length >= 3, 'at least three proposals required');
  uniqueIds(s.options, 'options');
  for (const o of s.options) {
    requireValid(text(o.title) && text(o.summary) && list(o.risks).length && list(o.metrics).length, 'option missing title/risks/metrics');
    requireValid(Array.isArray(o.stakeholders) && o.stakeholders.every(a => actors.has(a)), 'unknown stakeholder');
    requireValid(o.rights && typeof o.rights === 'object', 'rights checklist missing');
    requireValid(['not_obtained','explicitly_obtained','withdrawn'].includes(o.consent_status), 'explicit consent status required');
  }
  return true;
}
function graph(s) {
  const safe = value => String(value).replace(/["\\\n\r]/g, ' ').replace(/[<>]/g, '').slice(0, 130);
  const lines = ['flowchart LR'];
  for (const n of s.nodes) lines.push('  n_' + n.id.replace(/-/g,'_') + '["' + safe(n.label) + '"]');
  for (const e of s.edges) {
    const from = 'n_' + e.from.replace(/-/g,'_');
    const to = 'n_' + e.to.replace(/-/g,'_');
    lines.push('  ' + from + ' -->|' + e.relation + '| ' + to);
  }
  return lines.join('\n');
}
function assess(s) {
  validate(s);
  const requiredActors = s.stakeholders.map(x => x.id);
  const options = s.options.map(o => {
    const blocked = REQUIRED_RIGHTS.filter(k => o.rights[k] === false);
    const unresolved = REQUIRED_RIGHTS.filter(k => o.rights[k] !== true && o.rights[k] !== false);
    const missing = requiredActors.filter(id => !o.stakeholders.includes(id));
    const consentPending = o.consent_status !== 'explicitly_obtained';
    const decision = blocked.length ? 'blocked_rights' : (unresolved.length || missing.length || !o.reversible ? 'needs_review' : 'candidate_for_dialogue');
    return {
      id:o.id, title:o.title, summary:o.summary, decision,
      blocked_rights:blocked, unresolved_rights:unresolved, missing_stakeholders:missing,
      consent_status:o.consent_status, consent_pending:consentPending,
      consent_note:'Listed stakeholder participation is a proposal, not proof of agreement.',
      risks:o.risks, safeguards:list(o.safeguards), metrics:o.metrics, reversible:o.reversible
    };
  });
  return {
    schema_version:'qdcm-peacelab-report-v0.1',
    case_id:s.id, title:s.title, objective:s.objective,
    scope:'fictional_training_only', decision_owner:s.decision_owner,
    disclaimer:'Scenario data are invented. A candidate is NOT an approved agreement or evidence of real-world feasibility.',
    facts:s.facts, stakeholders:s.stakeholders,
    domains:[...new Set(s.nodes.flatMap(x=>x.domains))].sort(),
    node_count:s.nodes.length, edge_count:s.edges.length,
    hypotheses:s.hypotheses, uncertainties:list(s.uncertainties),
    mermaid:graph(s),
    edge_list:s.edges.map(e=>e.from+' —'+e.relation+'→ '+e.to+' ('+e.epistemic_status+')'),
    options,
    next_step:'Human facilitators should first verify assumptions and obtain informed consent before any real-world use.'
  };
}
function renderMarkdown(r) {
  const fence = String.fromCharCode(96).repeat(3);
  const lines = [
    '# PeaceLab: ' + r.title,
    '',
    '**Scope:** ' + r.scope + '  ',
    '**Decision owner:** ' + r.decision_owner,
    '',
    '> ' + r.disclaimer,
    '',
    '## Ментальная карта (Mermaid)',
    '',fence + 'mermaid',r.mermaid,fence,
    '',
    '## Доступный текстовый граф',
    ...r.edge_list.map(x=>'- '+x),
    '',
    '## Дисциплины',
    r.domains.join(' · '),
    '',
    '## Конкурирующие гипотезы',
    ...r.hypotheses.map(h=>'- **'+h.id+'** '+h.claim+'; опровергающее наблюдение: '+h.falsifier),
    '',
    '## Варианты (аналитика, не согласованные решения)'
  ];
  for (const o of r.options) {
    lines.push('','### '+o.title,'**Статус:** '+o.decision,
      o.summary, '',
      '- Возможные риски: '+o.risks.join('; '),
      '- Контроль: '+(o.safeguards.join('; ')||'не предусмотрен'),
      '- Показатели: '+o.metrics.join('; '),
      '- Согласие: '+o.consent_status+' (статус включения участников не доказывает согласие)');
    if (o.blocked_rights.length) lines.push('- **Нарушенные ограничения:** '+o.blocked_rights.join(', '));
    if (o.unresolved_rights.length) lines.push('- **Не проверено:** '+o.unresolved_rights.join(', '));
    if (o.missing_stakeholders.length) lines.push('- **Не представлены:** '+o.missing_stakeholders.join(', '));
  }
  lines.push('','## Неопределённости',...r.uncertainties.map(x=>'- '+x),'', '**Следующий шаг:** '+r.next_step);
  return lines.join('\n')+'\n';
}
if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    if (args.includes('--help')) {
      process.stdout.write('node tools/peacelab/peacelab.js [scenario.json] [--json]\n');
    } else {
      const file = args.find(x=>!x.startsWith('--')) || path.join(__dirname, 'scenarios', 'two-shores.json');
      const report = assess(JSON.parse(fs.readFileSync(file, 'utf8')));
      process.stdout.write(args.includes('--json') ? JSON.stringify(report, null, 2)+'\n' : renderMarkdown(report));
    }
  } catch (err) {
    process.stderr.write(String(err.message)+'\n');
    process.exitCode = 1;
  }
}
module.exports = {assess, validate, graph, renderMarkdown, REQUIRED_RIGHTS};
