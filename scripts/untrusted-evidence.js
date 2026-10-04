'use strict';

const { shieldInput } = require('./prompt-shield');

function freshStats() {
  return { quarantined: 0, reasons: {} };
}

function recordReasons(stats, reasons) {
  stats.quarantined += 1;
  for (const reason of reasons || []) {
    stats.reasons[reason] = Number(stats.reasons[reason] || 0) + 1;
  }
}

function sanitizeEvidence(value, stats = freshStats(), depth = 0) {
  if (depth > 16) return '[QSHIELD_QUARANTINED_EVIDENCE reasons=max_depth]';

  if (typeof value === 'string') {
    const shield = shieldInput(value);
    if (shield.blocked) {
      recordReasons(stats, shield.reasons);
      return '[QSHIELD_QUARANTINED_EVIDENCE]';
    }
    return shield.normalized;
  }

  if (Array.isArray(value)) {
    return value.map(item => sanitizeEvidence(item, stats, depth + 1));
  }

  if (value && typeof value === 'object') {
    const output = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] = sanitizeEvidence(item, stats, depth + 1);
    }
    return output;
  }

  return value;
}

function sanitizeEvidenceJson(value) {
  const stats = freshStats();
  return { value: sanitizeEvidence(value, stats), stats };
}

module.exports = { sanitizeEvidence, sanitizeEvidenceJson };
