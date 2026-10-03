import crypto from 'node:crypto';
import { QUANTDEUS_SHIELD_VERSION, shieldInput } from './prompt-shield.js';

const ALERT_TTL_MS = 15 * 60 * 1000;
const recentAlerts = new Map();

function severityFromScore(score, blocked) {
  if (score >= 7) return 'critical';
  if (blocked || score >= 3) return 'high';
  if (score > 0) return 'medium';
  return 'none';
}

function fingerprint(value, reasons) {
  return crypto.createHash('sha256')
    .update(String(value || '').slice(0, 4000) + '|' + (reasons || []).join(','))
    .digest('hex')
    .slice(0, 16);
}

function safePreview(value) {
  return String(value || '')
    .replace(/\u0000/g, '')
    .replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{12,})\b/g, '[REDACTED_TOKEN]')
    .replace(/\b\d{6,12}:[A-Za-z0-9_-]{20,}\b/g, '[REDACTED_BOT_TOKEN]')
    .replace(/authorization:\s*bearer\s+[^\s]+/ig, 'authorization: Bearer [REDACTED]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);
}

export function promptInjectionFinding(value, metadata = {}) {
  const shield = shieldInput(value);
  const severity = severityFromScore(shield.score, shield.blocked);
  return {
    type: 'prompt_injection',
    shield_version: QUANTDEUS_SHIELD_VERSION,
    source: String(metadata.source || 'unknown').slice(0, 60),
    score: shield.score,
    severity,
    suspicious: shield.score > 0,
    alert: shield.blocked,
    quarantine: shield.blocked,
    reasons: [...shield.reasons],
    fingerprint: fingerprint(shield.normalized, shield.reasons),
    preview: safePreview(shield.normalized)
  };
}

export function findingFromShieldResult(shield, originalValue, metadata = {}) {
  const normalized = String(shield?.normalized || originalValue || '');
  const reasons = Array.isArray(shield?.reasons) ? shield.reasons : [];
  const score = Number(shield?.score || 0);
  const blocked = shield?.blocked === true;
  return {
    type: 'prompt_injection',
    shield_version: QUANTDEUS_SHIELD_VERSION,
    source: String(metadata.source || 'unknown').slice(0, 60),
    score,
    severity: severityFromScore(score, blocked),
    suspicious: score > 0,
    alert: blocked,
    quarantine: blocked,
    reasons,
    fingerprint: fingerprint(normalized, reasons),
    preview: safePreview(normalized)
  };
}

function adminIds() {
  const raw = [
    process.env.TELEGRAM_ADMIN_USER_IDS,
    process.env.QUANTDEUS_ADMIN_TELEGRAM_IDS,
    process.env.QUANTDEUS_OWNER_TELEGRAM_IDS
  ].filter(Boolean).join(',');
  return [...new Set(
    raw.split(/[\s,;]+/)
      .map(value => value.trim())
      .filter(value => /^-?\d{4,20}$/.test(value))
  )].slice(0, 12);
}

function botToken() {
  return String(
    process.env.TELEGRAM_BOT_TOKEN ||
    process.env.QUANTDEUS_TELEGRAM_BOT_TOKEN ||
    process.env.TELEGRAM ||
    ''
  ).trim();
}

function allowAlert(finding) {
  const key = String(finding?.type || 'security') + ':' + String(finding?.fingerprint || 'unknown');
  const now = Date.now();
  const previous = recentAlerts.get(key) || 0;
  if (now - previous < ALERT_TTL_MS) return false;
  recentAlerts.set(key, now);
  if (recentAlerts.size > 200) {
    for (const [candidate, at] of recentAlerts) {
      if (now - at > ALERT_TTL_MS) recentAlerts.delete(candidate);
    }
  }
  return true;
}

export async function notifySecurityAdmins(finding, context = {}) {
  if (!finding?.alert || !allowAlert(finding)) return { sent: 0, skipped: true };

  const token = botToken();
  const ids = adminIds();
  if (!token || !ids.length) {
    return { sent: 0, skipped: true, reason: 'telegram_security_alert_channel_unconfigured' };
  }

  const lines = [
    '🛡️ QuantDeus Security Sentinel',
    'Severity: ' + String(finding.severity || 'unknown').toUpperCase(),
    'Signal: ' + String(finding.type || 'security'),
    finding.shield_version ? 'Shield: ' + String(finding.shield_version) : '',
    'Source: ' + String(context.source || finding.source || 'unknown').slice(0, 80),
    context.user_ref ? 'User ref: ' + String(context.user_ref).slice(0, 100) : '',
    context.surface ? 'Surface: ' + String(context.surface).slice(0, 100) : '',
    finding.reasons?.length ? 'Reasons: ' + finding.reasons.join(', ') : '',
    'Fingerprint: ' + String(finding.fingerprint || 'none'),
    finding.preview ? 'Preview: ' + finding.preview : '',
    'Action: blocked/quarantined or read-only escalation; no automatic destructive remediation.'
  ].filter(Boolean);

  let sent = 0;
  for (const chatId of ids) {
    try {
      const response = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: lines.join('\n').slice(0, 3500),
          disable_web_page_preview: true
        })
      });
      if (response.ok) sent += 1;
      else console.warn('[security-sentinel] Telegram alert failed status=' + response.status);
    } catch (error) {
      console.warn('[security-sentinel] Telegram alert error=' + String(error?.message || error).slice(0, 240));
    }
  }
  return { sent, skipped: false };
}
