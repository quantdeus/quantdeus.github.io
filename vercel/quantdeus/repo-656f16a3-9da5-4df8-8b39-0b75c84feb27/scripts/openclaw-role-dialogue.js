'use strict';

const office = require('./openclaw-office-client');
const {turnBudget,turnEvidence} = require('./dialogue-state');

function parseJson(text) {
  const raw = String(text || '').trim();
  // Check if the raw text matches the expected protocol format
  const lines = raw.split(/\r?\n/).map(x => x.trim()).filter(Boolean);

  const summary = lines.find(line => line.startsWith('SUMMARY:'))?.replace('SUMMARY:', '').trim();
  const findings = lines
    .filter(line => line.startsWith('FINDING:'))
    .map(line => line.replace('FINDING:', '').trim());

  const nextStep = lines.find(line => line.startsWith('NEXT_STEP:'))?.replace('NEXT_STEP:', '').trim();

  if (summary && findings.length >= 1 && findings.length <= 5 && nextStep) {
    return { summary, findings, next_step: nextStep };
  }

  // Fallback to JSON parsing if structured text is not detected
  try {
    return JSON.parse(raw);
  } catch (jsonError) {
    jsonError.code = 'ROLE_DIALOGUE_MALFORMED_OUTPUT';
    throw jsonError;
  }
}