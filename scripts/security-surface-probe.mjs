import crypto from 'node:crypto';
import fs from 'node:fs';
import { notifySecurityAdmins } from '../vercel-dispatcher/lib/security-sentinel.js';

const TARGET = 'https://quantdeus.whf.bz';
const CONTROL = 'https://quantdeus.vercel.app';
const TIMEOUT_MS = 12000;

async function request(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = Date.now();
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      ...options,
      headers: {
        'user-agent': 'QuantDeus-Security-Sentinel/1.0',
        accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
        ...(options.headers || {})
      },
      signal: controller.signal
    });
    const text = await response.text();
    return {
      ok: true,
      status: response.status,
      url: response.url,
      contentType: response.headers.get('content-type') || '',
      headers: {
        hsts: response.headers.get('strict-transport-security') || '',
        xcto: response.headers.get('x-content-type-options') || '',
        xfo: response.headers.get('x-frame-options') || '',
        csp: response.headers.get('content-security-policy') || '',
        referrer: response.headers.get('referrer-policy') || ''
      },
      elapsed_ms: Date.now() - started,
      text: text.slice(0, 120000)
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      url,
      elapsed_ms: Date.now() - started,
      error: String(error?.message || error).slice(0, 240),
      text: '',
      headers: {}
    };
  } finally {
    clearTimeout(timer);
  }
}

function hostOk(url, allowedHost) {
  try { return new URL(url).hostname === allowedHost; } catch { return false; }
}

function add(findings, severity, id, detail) {
  findings.push({ severity, id, detail: String(detail || '').slice(0, 300) });
}

function rank(severity) {
  return { none: 0, low: 1, medium: 2, high: 3, critical: 4 }[severity] || 0;
}

function maxSeverity(findings) {
  return findings.reduce((best, item) => rank(item.severity) > rank(best) ? item.severity : best, 'none');
}

function fingerprint(findings) {
  return crypto.createHash('sha256')
    .update(findings.map(item => item.severity + ':' + item.id).sort().join('|'))
    .digest('hex')
    .slice(0, 16);
}

const [home, rest, users, control] = await Promise.all([
  request(TARGET + '/'),
  request(TARGET + '/wp-json/', { headers: { accept: 'application/json' } }),
  request(TARGET + '/wp-json/wp/v2/users?per_page=1&_fields=id,slug', { headers: { accept: 'application/json' } }),
  request(CONTROL + '/')
]);

const findings = [];

if (!home.ok || home.status >= 500) {
  add(findings, 'high', 'wordpress_origin_unavailable', 'canonical WordPress origin did not return a healthy response');
} else {
  if (!hostOk(home.url, 'quantdeus.whf.bz')) {
    add(findings, 'critical', 'wordpress_origin_redirected_off_domain', 'canonical origin ended on an unexpected hostname');
  }
  if (!/quantdeus/i.test(home.text)) {
    add(findings, 'high', 'wordpress_identity_marker_missing', 'homepage response did not contain the QuantDeus identity marker');
  }
  if (!/nosniff/i.test(home.headers.xcto || '')) {
    add(findings, 'medium', 'header_x_content_type_options_missing', 'X-Content-Type-Options: nosniff is absent');
  }
  if (!(home.headers.xfo || /frame-ancestors/i.test(home.headers.csp || ''))) {
    add(findings, 'medium', 'frame_protection_missing', 'neither X-Frame-Options nor CSP frame-ancestors was observed');
  }
  if (!home.headers.referrer) {
    add(findings, 'medium', 'referrer_policy_missing', 'Referrer-Policy header is absent');
  }
  if (!home.headers.hsts) {
    add(findings, 'medium', 'hsts_missing', 'Strict-Transport-Security header is absent');
  }
}

if (!rest.ok || rest.status >= 500) {
  add(findings, 'high', 'wordpress_rest_unavailable', 'WordPress REST index is unavailable');
} else {
  if (!hostOk(rest.url, 'quantdeus.whf.bz')) {
    add(findings, 'critical', 'wordpress_rest_redirected_off_domain', 'REST index ended on an unexpected hostname');
  }
  try {
    JSON.parse(rest.text);
  } catch {
    add(findings, 'high', 'wordpress_rest_non_json', 'WordPress REST index returned non-JSON content');
  }
}

if (users.ok && users.status >= 200 && users.status < 300) {
  try {
    const parsed = JSON.parse(users.text);
    if (Array.isArray(parsed) && parsed.length) {
      add(findings, 'medium', 'public_user_enumeration', 'WordPress REST exposes public user records');
    }
  } catch {}
}

if (!control.ok || control.status >= 500) {
  add(findings, 'medium', 'vercel_control_plane_unavailable', 'Vercel mirror/control plane did not return a healthy response');
} else if (!hostOk(control.url, 'quantdeus.vercel.app') && !hostOk(control.url, 'quantdeus.whf.bz')) {
  add(findings, 'high', 'vercel_control_redirected_unexpectedly', 'control plane ended on an unexpected hostname');
}

const severity = maxSeverity(findings);
const report = {
  schema_version: 1,
  observed_at: new Date().toISOString(),
  source: String(process.env.QD_SECURITY_SOURCE || 'security-surface-probe').slice(0, 80),
  severity,
  attack_signal: rank(severity) >= rank('high'),
  posture_findings: findings,
  surfaces: {
    wordpress_home: { status: home.status, final_host_ok: home.ok ? hostOk(home.url, 'quantdeus.whf.bz') : false, elapsed_ms: home.elapsed_ms },
    wordpress_rest: { status: rest.status, elapsed_ms: rest.elapsed_ms },
    wordpress_users: { status: users.status, elapsed_ms: users.elapsed_ms },
    vercel_control: { status: control.status, elapsed_ms: control.elapsed_ms }
  }
};

const output = String(process.env.QD_SECURITY_OUTPUT || '').trim();
if (output) fs.writeFileSync(output, JSON.stringify(report, null, 2));

console.log(JSON.stringify(report, null, 2));

const notify = !/^(?:0|false|no)$/i.test(String(process.env.QD_SECURITY_NOTIFY || '1'));
if (notify && report.attack_signal) {
  const urgent = findings.filter(item => rank(item.severity) >= rank('high'));
  await notifySecurityAdmins({
    type: 'infrastructure_anomaly',
    severity,
    alert: true,
    fingerprint: fingerprint(urgent),
    reasons: urgent.map(item => item.id),
    preview: urgent.map(item => item.detail).join('; ').slice(0, 220)
  }, {
    source: report.source,
    surface: 'quantdeus.whf.bz + quantdeus.vercel.app'
  });
}
