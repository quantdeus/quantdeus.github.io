#!/usr/bin/env node
const fs = require('fs');

const REQUIRED_GATES = [
  'geometry',
  'eom',
  'residual',
  'nec',
  'energy',
  'curvature_tidal',
  'horizon',
  'causality',
  'stability',
  'eft',
];
const ALLOWED = new Set(['PASS', 'FAIL', 'UNKNOWN']);

const inputPath = process.argv[2] || 'coordination/pillars/warp-evidence-gates.json';
if (!fs.existsSync(inputPath)) {
  console.error(JSON.stringify({ error: 'warp_evidence_bundle_not_found', input: inputPath }, null, 2));
  process.exit(2);
}

let source;
try {
  source = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
} catch (error) {
  console.error(JSON.stringify({ error: 'invalid_json', input: inputPath, detail: error.message }, null, 2));
  process.exit(2);
}

const gateMap = source.gates && typeof source.gates === 'object' ? source.gates : {};
const report = {
  schema_version: 1,
  checked_commit_sha: source.checked_commit_sha || 'UNKNOWN',
  source: inputPath,
  gates: {},
};

for (const gate of REQUIRED_GATES) {
  const entry = gateMap[gate] && typeof gateMap[gate] === 'object' ? gateMap[gate] : {};
  const claimed = String(entry.status || 'UNKNOWN').toUpperCase();
  const hasEvidence = Array.isArray(entry.evidence) && entry.evidence.some(Boolean);
  let status = ALLOWED.has(claimed) ? claimed : 'UNKNOWN';

  // Missing candidate-specific evidence may never silently become PASS.
  if (status === 'PASS' && !hasEvidence) status = 'UNKNOWN';

  report.gates[gate] = {
    status,
    evidence: hasEvidence ? entry.evidence : [],
    note: entry.note || (hasEvidence ? '' : 'No candidate-specific evidence supplied.'),
  };
}

report.summary = REQUIRED_GATES.reduce((acc, gate) => {
  const status = report.gates[gate].status;
  acc[status] = (acc[status] || 0) + 1;
  return acc;
}, { PASS: 0, FAIL: 0, UNKNOWN: 0 });

console.log(JSON.stringify(report, null, 2));

const malformed = Object.values(report.gates).some(g => !ALLOWED.has(g.status));
process.exitCode = malformed ? 2 : 0;
